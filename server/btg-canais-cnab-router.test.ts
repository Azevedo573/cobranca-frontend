import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { TrpcContext } from "./_core/context";
import { criarDbCanaisEmMemoria } from "./btg-canais-test-db";
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), bank: vi.fn(), extra: vi.fn(), gerar: vi.fn(), fila: vi.fn(), permitidos: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./btg-service", async original => ({ ...await original<typeof import("./btg-service")>(), criarCobrancaBtg: mocks.bank, getBtgExtraConfig: mocks.extra }));
// O helper foi exercitado integralmente no teste de serviço; aqui verificamos também
// delegação pública/middleware. Reserva legada continua real para provar POST posterior.
vi.mock("./btg-canais-cnab", async original => ({ ...await original<typeof import("./btg-canais-cnab")>(), gerarRemessaAcordosCnab: mocks.gerar, enriquecerFilaCnab: mocks.fila, condominiosPermitidosFilaCnab: mocks.permitidos }));
import { btgRouter } from "./routers/btg";
import { appRouter } from "./routers";
const ctx = (role = "admin", condominioId: number | null = null) => ({ req: { headers: {} }, res: {}, user: { id: 10, role, name: "Testes", condominioId } } as unknown as TrpcContext);
let fixture: ReturnType<typeof criarDbCanaisEmMemoria>;
const parcela = () => fixture.state.tables.parcelasAcordo[0];
beforeEach(() => {
  vi.clearAllMocks();
  fixture = criarDbCanaisEmMemoria({ parcelasAcordo: [{ id: 19, acordoId: 5, amount: 12599, dueDate: new Date("2026-12-01T12:00:00Z"), installmentNumber: 1, status: "pendente", nossoNumero: "1000000018", nossoNumeroOrigem: "reserva_local", canalBancario: null, statusRemessa: "nao_enviado", remessaId: null }], acordos: [{ id: 5, condominioId: 1, devedorId: 6, status: "ativo" }], devedores: [{ id: 6, condominioId: 1, name: "Sacado", cpfCnpj: "52998224725", unitNumber: "1" }], condominios: [{ id: 1, name: "Condomínio", statusCadastro: "ativo" }], btgCobrancasEmitidas: [], auditLogs: [], userCondominios: [] });
  mocks.getDb.mockResolvedValue(fixture.db); mocks.extra.mockResolvedValue({ diasLimitePagamento: 60 });
  mocks.gerar.mockResolvedValue({ nomeArquivo: "fixture.rem", conteudo: "fixture", totalParcelas: 1, remessaId: 100 });
  mocks.fila.mockImplementation(async (_db, rows) => rows.map((r: any) => ({ ...r, elegivelCnab: false, motivoBloqueioCnab: "API", codigoBloqueioCnab: "api_vinculada" })));
  mocks.permitidos.mockResolvedValue(undefined);
  mocks.bank.mockImplementation(async () => { expect(parcela().canalBancario).toBe("legado"); expect(fixture.state.tables.auditLogs).toHaveLength(1); return { collectionId: "fixture-bank", status: "CREATED" }; });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network forbidden")));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("routers CNAB e legado — contratos existentes", () => {
  it("condomínio e global delegam ao mesmo serviço preservando retorno", async () => {
    const caller = appRouter.createCaller(ctx());
    expect(await caller.cnab.gerarRemessaAcordos({ condominioId: 1, parcelaIds: [19] })).toMatchObject({ remessaId: 100 });
    expect(mocks.gerar.mock.calls[0].slice(1)).toEqual([[19], 1]);
    expect(await caller.cnab.gerarRemessaAcordosGlobal({ parcelaIds: [19] })).toMatchObject({ totalParcelas: 1 });
    expect(mocks.gerar.mock.calls[1].slice(1)).toEqual([[19]]);
    expect(mocks.bank).not.toHaveBeenCalled();
  });
  it("CNAB protegido não concede operação a anônimo e mantém input positivo", async () => {
    await expect(appRouter.createCaller({ ...ctx(), user: null }).cnab.gerarRemessaAcordosGlobal({ parcelaIds: [19] })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(appRouter.createCaller(ctx()).cnab.gerarRemessaAcordos({ condominioId: 1, parcelaIds: [0] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.gerar).not.toHaveBeenCalled();
  });
  it("condomínio local resolve carteira e não aceita role advogado como acesso global", async () => {
    fixture.state.tables.userCondominios.push({ userId: 10, condominioId: 1, isActive: 1 });
    await appRouter.createCaller(ctx("sindico", 99)).cnab.gerarRemessaAcordos({ condominioId: 1, parcelaIds: [19] });
    expect(mocks.gerar.mock.calls[0][2]).toBe(1);
    await expect(appRouter.createCaller(ctx("advogado", 1)).cnab.gerarRemessaAcordos({ condominioId: 2, parcelaIds: [19] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.gerar).toHaveBeenCalledTimes(1);
  });
  it("filas públicas aplicam carteira e chamam enriquecimento comum incluindo bloqueios", async () => {
    // O retorno read-only é preparado; inspecionamos SQL real de filtros dos handlers.
    const conditions: string[] = [];
    const select = fixture.db.select;
    fixture.db.select = vi.fn((selection: any) => {
      if (!selection?.parcelaId) return select(selection);
      const chain: any = { from: () => chain, innerJoin: () => chain, orderBy: () => chain,
        where: (sql: any) => { conditions.push(new MySqlDialect().sqlToQuery(sql).sql); return chain; },
        then: (resolve: any, reject: any) => Promise.resolve([{ parcelaId: 19, condominioId: 1 }]).then(resolve, reject) };
      return chain;
    });
    mocks.permitidos.mockResolvedValue([1, 3]);
    const rows = await appRouter.createCaller(ctx("advogado", 99)).cnab.listarParcelasParaRemessaGlobal({});
    expect(rows[0]).toMatchObject({ parcelaId: 19, elegivelCnab: false, codigoBloqueioCnab: "api_vinculada" });
    expect(conditions[0]).toContain("`acordos`.`condominioId` in (?, ?)");
    expect(conditions[0]).toContain(" or "); expect(conditions[0]).not.toContain("`statusRemessa`");
    fixture.state.tables.userCondominios.push({ userId: 10, condominioId: 1, isActive: 1 });
    await appRouter.createCaller(ctx("sindico", 99)).cnab.listarParcelasParaRemessa({ condominioId: 1, diasAVencer: 365 });
    expect(mocks.fila).toHaveBeenCalledTimes(2);
    expect(conditions[1]).toContain("`acordos`.`condominioId` = ?");
    expect(conditions[1]).toContain(" or "); expect(fixture.state.writes).toEqual([]);
  });
  it("fila global de ator sem carteira não lê parcelas", async () => {
    mocks.permitidos.mockResolvedValue([]);
    expect(await appRouter.createCaller(ctx("advogado", 1)).cnab.listarParcelasParaRemessaGlobal({})).toEqual([]);
    expect(fixture.db.select).not.toHaveBeenCalled(); expect(mocks.fila).not.toHaveBeenCalled();
  });
  it("legado POST mockado só ocorre após lock/reserva/auditoria e preserva OAuth/payload", async () => {
    const result = await btgRouter.createCaller(ctx()).emitirBoletoParcela({ parcelaId: 19 });
    expect(result).toMatchObject({ success: true, collectionId: "fixture-bank" });
    expect(parcela()).toMatchObject({ canalBancario: "legado", nossoNumeroOrigem: "legado", nossoNumero: "1000000018", amount: 12599, btgCollectionId: "fixture-bank" });
    expect(fixture.state.locks).toContain("parcelasAcordo:update");
    expect(mocks.bank.mock.calls[0][0]).toMatchObject({ amount: 12599, externalId: "parcela-19" });
  });
  it.each(["api_btg_v2", "cnab240", "legado"])("canal %s impede POST legado", async canal => {
    parcela().canalBancario = canal;
    await expect(btgRouter.createCaller(ctx()).emitirBoletoParcela({ parcelaId: 19 })).rejects.toBeDefined(); expect(mocks.bank).not.toHaveBeenCalled();
  });
  it("origem antiga e emissão incerta de integração alheia impedem POST legado", async () => {
    parcela().nossoNumeroOrigem = null;
    await expect(btgRouter.createCaller(ctx()).emitirBoletoParcela({ parcelaId: 19 })).rejects.toThrow("origem");
    parcela().nossoNumeroOrigem = "reserva_local";
    fixture.state.tables.btgCobrancasEmitidas.push({ origemTipo: "parcela_acordo", origemId: 19, status: "incerta", btgIntegracaoId: 999 });
    await expect(btgRouter.createCaller(ctx()).emitirBoletoParcela({ parcelaId: 19 })).rejects.toThrow("API"); expect(mocks.bank).not.toHaveBeenCalled();
  });
  it("timeout legado conserva canal para revisão sem apagar número", async () => {
    mocks.bank.mockRejectedValue(new Error("timeout fixture"));
    await expect(btgRouter.createCaller(ctx()).emitirBoletoParcela({ parcelaId: 19 })).rejects.toThrow("timeout");
    expect(parcela()).toMatchObject({ canalBancario: "legado", nossoNumero: "1000000018", nossoNumeroOrigem: "reserva_local" });
    await expect(btgRouter.createCaller(ctx()).emitirBoletoParcela({ parcelaId: 19 })).rejects.toThrow("legado"); expect(mocks.bank).toHaveBeenCalledTimes(1);
  });
  it("dois emissores legados simultâneos só executam um POST mockado", async () => {
    const caller = btgRouter.createCaller(ctx());
    const result = await Promise.allSettled([caller.emitirBoletoParcela({ parcelaId: 19 }), caller.emitirBoletoParcela({ parcelaId: 19 })]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(mocks.bank).toHaveBeenCalledTimes(1);
  });
  it("legado respeita carteira inclusive advogado e não emite parcela alheia", async () => {
    await expect(btgRouter.createCaller(ctx("advogado", 1)).emitirBoletoParcela({ parcelaId: 19 })).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(mocks.bank).not.toHaveBeenCalled();
    fixture.state.tables.userCondominios.push({ userId: 10, condominioId: 1, isActive: 1 });
    await btgRouter.createCaller(ctx("advogado", 99)).emitirBoletoParcela({ parcelaId: 19 }); expect(mocks.bank).toHaveBeenCalledTimes(1);
  });
  it("emissor avulso não contorna a dívida já formalizada em acordo", async () => {
    fixture.state.tables.cobrancas = [{ id: 8, condominioId: 1, status: "em_acordo" }];
    await expect(btgRouter.createCaller(ctx()).emitirBoleto({ cobrancaId: 8 })).rejects.toThrow("formalizada em acordo");
    expect(mocks.bank).not.toHaveBeenCalled(); expect(fixture.state.writes).toEqual([]);
  });
  it("criação não emite/seleciona canal; PDFs locais exigem reapresentação CNAB", () => {
    const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf-8");
    const create = source.slice(source.indexOf("const parcelasData = input.parcelas.map"), source.indexOf("getParcelas: requirePermission"));
    expect(create).toContain("'reserva_local'"); expect(create).toContain("canalBancario: null"); expect(create).not.toMatch(/criarCobrancaBtg|emitirBolePixV2|emitirBoletoParcela/);
    const pdfs = source.slice(source.indexOf("gerarBoletoPDFParcela:"), source.indexOf("quebrarAcordo:"));
    expect(pdfs.match(/await validarReapresentacaoBoletoCnab/g)).toHaveLength(2);
    expect(source).toContain("btgCanais: btgCanaisRouter");
  });
});

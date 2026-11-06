import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { TrpcContext } from "./_core/context";
import { criarDbCanaisEmMemoria } from "./btg-canais-test-db";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), boleto: vi.fn(), arquivo: vi.fn(), storage: vi.fn(), oauthConfig: vi.fn(), oauthStatus: vi.fn(), apiBank: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./db-configuracao-boleto", () => ({ getConfiguracaoBoleto: mocks.boleto }));
vi.mock("./storage", () => ({ storagePut: mocks.storage }));
vi.mock("./db-cnab", async original => ({ ...await original<typeof import("./db-cnab")>(), gerarArquivoRemessaCNAB240: mocks.arquivo }));
vi.mock("./btg-oauth", () => ({ getBtgOAuthConfig: mocks.oauthConfig, getStatusOAuthBtg: mocks.oauthStatus }));
vi.mock("./btg-v2/client", () => ({ criarBolePixBtgV2: mocks.apiBank }));

import { bloquearParcelasParaCanal, exigirParcelaLivreParaCanal } from "./btg-canais";
import { emitirBolePixV2 } from "./btg-v2/issuance";
import { gerarRemessaAcordosCnab, enriquecerFilaCnab, reservarParcelaParaEmissorLegado, validarReapresentacaoBoletoCnab, condominiosPermitidosFilaCnab } from "./btg-canais-cnab";
import { createParcelas } from "./db-acordos";
import { auditLogs, parcelasAcordo } from "../drizzle/schema";
const ctx = (role = "admin", condominioId: number | null = null) => ({ req: { headers: {} }, res: {}, user: { id: 10, role, name: "Teste", condominioId } } as unknown as TrpcContext);
const config = { id: 1, banco: "208", agencia: "0050", digitoAgencia: "0", conta: "3081850", digitoConta: "0", convenio: "1", nossoNumeroAtual: 1000000090, numeroSequencialArquivo: 4, taxaJurosDia: "0.03330", taxaMulta: "2.00", instrucoesCaixa: "MULTA #MULTA# JUROS #JUROS#", localPagamento: "PAGAVEL", carteira: "1", especieDocumento: "01", aceite: "N", enviarInstrucoesProtesto: 0, padraoNomeArquivo: "REMESSA_ddmmyyyy.rem" };
const parcela = (id = 19, acordoId = 5) => ({ id, acordoId, amount: 12599, dueDate: new Date("2026-12-01T12:00:00Z"), installmentNumber: 1, status: "pendente", nossoNumero: "1000000018", nossoNumeroOrigem: "reserva_local", canalBancario: null, statusRemessa: "nao_enviado", remessaId: null, snapshotPrincipal: 10000, snapshotJuros: 2599 });
let fixture: ReturnType<typeof criarDbCanaisEmMemoria>;
function setup(extra: Record<string, any[]> = {}) {
  fixture = criarDbCanaisEmMemoria({ parcelasAcordo: [parcela()], acordos: [{ id: 5, condominioId: 1, devedorId: 6, status: "ativo" }], condominios: [{ id: 1, name: "Condomínio", statusCadastro: "ativo" }], devedores: [{ id: 6, condominioId: 1, name: "Sacado", cpfCnpj: "52998224725", address: "Rua Teste", addressNumber: "1", neighborhood: "Centro", city: "São Paulo", state: "SP", zipCode: "01001000" }], cnabConfigGlobal: [config], remessasCNAB: [], btgCobrancasEmitidas: [], auditLogs: [], userCondominios: [], ...extra });
  mocks.getDb.mockResolvedValue(fixture.db);
  return fixture;
}
beforeEach(() => {
  vi.clearAllMocks(); setup();
  mocks.boleto.mockResolvedValue({ nomeBeneficiario: "Condomínio", cnpjBeneficiario: "30306294000145" });
  mocks.arquivo.mockReturnValue("arquivo-fixture"); mocks.storage.mockResolvedValue({ url: "https://fixture.invalid/remessa" });
  mocks.oauthConfig.mockReturnValue({ ambiente: "sandbox", companyId: "30306294000145" });
  mocks.oauthStatus.mockResolvedValue({ status: "conectado" });
  mocks.apiBank.mockResolvedValue({ collectionId: "api-fixture", status: "CREATED", bankSlipUrl: null, pixQrCode: null, pixCopiaECola: null, codigoBarras: null, linhaDigitavel: null, nossoNumero: "bank-fixture" });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network forbidden")));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const gerar = (ids = [19], condId: number | undefined = 1, context = ctx()) => gerarRemessaAcordosCnab(context, ids, condId);
const livre = () => fixture.state.tables.parcelasAcordo[0];
function semEfeitos() { expect(fixture.state.writes).toEqual([]); expect(mocks.arquivo).not.toHaveBeenCalled(); expect(mocks.storage).not.toHaveBeenCalled(); }

// Representa a mesma seção de reserva usada pela API: lock/check/write no helper comum.
async function reservarApi() {
  return fixture.db.transaction(async (tx: any) => {
    const [row] = await bloquearParcelasParaCanal(tx, [19], 1);
    exigirParcelaLivreParaCanal(row, "api_btg_v2");
    await tx.update(parcelasAcordo).set({ canalBancario: "api_btg_v2" }).where(eq(parcelasAcordo.id, 19));
  });
}

function habilitarApiFixture() {
  fixture.state.tables.btgIntegracoes = [{ id: 7, ambiente: "sandbox", companyId: "30306294000145", ativo: 1, emissaoHabilitada: 1, diasLimitePagamento: 60 }];
  fixture.state.tables.btgContasRecebedoras = [{ id: 15, btgIntegracaoId: 7, accountId: "official-fixture", agencia: "0050", numero: "3081850", documentoBeneficiario: "30306294000145", nomeBeneficiario: "Fixture", ativo: 1, origemCadastro: "api" }];
  fixture.state.tables.btgContaRecebedoraCondominios = [{ id: 3, btgIntegracaoId: 7, btgContaRecebedoraId: 15, condominioId: 1, ativo: 1 }];
}

describe("CNAB de parcelas — reserva transacional", () => {
  it.each([1, undefined])("reserva local preserva número/snapshot e vincula lote real após geração (condomínio %s)", async condId => {
    mocks.arquivo.mockImplementation(() => {
      expect(livre()).toMatchObject({ canalBancario: "cnab240", nossoNumeroOrigem: "reserva_local", remessaId: null });
      return "arquivo-fixture";
    });
    const result = await gerarRemessaAcordosCnab(ctx(), [19], condId);
    expect(result).toMatchObject({ totalParcelas: 1, remessaId: 100 });
    expect(livre()).toMatchObject({ canalBancario: "cnab240", nossoNumeroOrigem: "legado", nossoNumero: "1000000018", amount: 12599, snapshotPrincipal: 10000, snapshotJuros: 2599, statusRemessa: "remessa_gerada", remessaId: 100 });
    expect(fixture.state.tables.remessasCNAB[0]).toMatchObject({ condominioId: 1, totalTitulos: 1, status: "gerado" });
    expect(fixture.state.tables.cnabConfigGlobal[0]).toMatchObject({ numeroSequencialArquivo: 5, nossoNumeroAtual: 1000000090 });
    expect(fixture.state.locks[0]).toBe("parcelasAcordo:update");
    expect(fixture.state.tables.auditLogs).toHaveLength(3);
    expect(JSON.parse(fixture.state.tables.auditLogs[1].metadata)).toMatchObject({ evento: "cnab_arquivo_gerado", arquivoSha256: expect.any(String), enviadoAoBanco: false });
  });
  it("numeração nova fica local na reserva e histórica somente após geração", async () => {
    Object.assign(livre(), { nossoNumero: null, nossoNumeroOrigem: null });
    mocks.arquivo.mockImplementation(() => { expect(livre()).toMatchObject({ nossoNumero: "1000000090", nossoNumeroOrigem: "reserva_local", canalBancario: "cnab240" }); return "arquivo"; });
    await gerar();
    expect(livre()).toMatchObject({ nossoNumero: "1000000090", nossoNumeroOrigem: "legado" });
    expect(fixture.state.tables.cnabConfigGlobal[0].nossoNumeroAtual).toBe(1000000091);
  });
  it("parcela atrasada livre utiliza a mesma política e preserva vencimento", async () => {
    livre().status = "atrasado";
    const vencimento = livre().dueDate;
    await gerar();
    expect(livre()).toMatchObject({ status: "atrasado", dueDate: vencimento, canalBancario: "cnab240" });
  });
  it.each([[19, 999], [999], [19, 19], [0], [1.5]])("recusa seleção inválida/partial %j antes de escrita", async ids => {
    await expect(gerar(ids)).rejects.toBeDefined(); semEfeitos();
  });
  it("global recusa mistura de condomínios sem selecionar silenciosamente beneficiário", async () => {
    fixture.state.tables.parcelasAcordo.push(parcela(20, 7)); fixture.state.tables.acordos.push({ id: 7, condominioId: 2, devedorId: 8, status: "ativo" });
    await expect(gerarRemessaAcordosCnab(ctx(), [19, 20])).rejects.toThrow("único condomínio"); semEfeitos();
  });
  it("condomínio explícito não aceita parcela alheia", async () => { await expect(gerar([19], 2)).rejects.toBeDefined(); semEfeitos(); });
  it.each([{ canalBancario: "api_btg_v2" }, { canalBancario: "legado" }, { canalBancario: "cnab240" }, { nossoNumeroOrigem: null }, { btgCollectionId: "legacy" }, { btgBankSlipUrl: "url" }, { btgPixCopiaECola: "pix" }, { btgPixQrCode: "qr" }, { btgStatus: "CANCELED" }, { btgEmitidoEm: new Date() }, { remessaId: 9 }, { statusRemessa: "remessa_gerada" }, { pixCopiaCola: "pix" }, { status: "pago" }, { status: "cancelado" }])("bloqueia evidência/estado %j", async patch => {
    Object.assign(livre(), patch); await expect(gerar()).rejects.toBeDefined(); semEfeitos();
  });
  it.each(["reservada", "incerta", "falha", "emitida", "cancelada"])("emissão v2 %s em outra integração bloqueia CNAB", async status => {
    fixture.state.tables.btgCobrancasEmitidas.push({ origemTipo: "parcela_acordo", origemId: 19, btgIntegracaoId: 999, status });
    await expect(gerar()).rejects.toThrow("API BTG"); semEfeitos();
  });
  it("parcela válida e parcela bloqueada falham como uma seleção inteira", async () => {
    fixture.state.tables.parcelasAcordo.push({ ...parcela(20), canalBancario: "api_btg_v2" });
    await expect(gerar([19, 20])).rejects.toBeDefined(); expect(livre().canalBancario).toBeNull(); semEfeitos();
  });
  it("acordo cancelado bloqueia", async () => { fixture.state.tables.acordos[0].status = "cancelado"; await expect(gerar()).rejects.toThrow("ativo"); semEfeitos(); });
  it("endereço inválido e config inexistente são recusados antes de escrita", async () => {
    fixture.state.tables.devedores[0].zipCode = null; await expect(gerar()).rejects.toThrow("CEP"); semEfeitos();
    fixture.state.tables.cnabConfigGlobal = []; await expect(gerar()).rejects.toThrow("Configure"); semEfeitos();
  });
  it("falha na auditoria desfaz número/canal/seq da reserva inteira", async () => {
    Object.assign(livre(), { nossoNumero: null, nossoNumeroOrigem: null }); fixture.state.failAudit = true;
    await expect(gerar()).rejects.toThrow("audit"); semEfeitos();
    expect(livre()).toMatchObject({ canalBancario: null, nossoNumero: null }); expect(fixture.state.tables.cnabConfigGlobal[0]).toEqual(config);
  });
  it("gerador falha: canal continua bloqueado sem fallback API", async () => {
    mocks.arquivo.mockImplementation(() => { throw new Error("gerador falhou"); });
    await expect(gerar()).rejects.toThrow("gerador"); expect(livre().canalBancario).toBe("cnab240");
    await expect(reservarApi()).rejects.toThrow("CNAB"); expect(fixture.state.tables.remessasCNAB).toHaveLength(0);
  });
  it("falha na vinculação final preserva reserva anterior e evidência do arquivo", async () => {
    const insert = fixture.db.insert;
    let auditorias = 0;
    fixture.db.insert = vi.fn((table: any) => {
      if (table === auditLogs && ++auditorias === 3) fixture.state.failAudit = true;
      return insert(table);
    });
    await expect(gerar()).rejects.toThrow("audit");
    expect(livre()).toMatchObject({ canalBancario: "cnab240", statusRemessa: "nao_enviado", remessaId: null });
    expect(fixture.state.tables.remessasCNAB).toHaveLength(0); expect(fixture.state.tables.auditLogs).toHaveLength(2);
    expect(JSON.parse(fixture.state.tables.auditLogs[1].metadata)).toMatchObject({ evento: "cnab_arquivo_gerado", arquivoSha256: expect.any(String) });
    await expect(reservarApi()).rejects.toThrow("CNAB");
  });
  it.each([
    { amount: 999 }, { dueDate: new Date("2027-01-01") }, { status: "pago" },
    { btgCollectionId: "vinculo-surgido" }, { pixCopiaCola: "retorno-surgido" }, { nossoNumeroOrigem: null },
  ])("mudança após geração mantém reserva em revisão e não vincula lote: %j", async patch => {
    mocks.storage.mockImplementation(async () => { Object.assign(livre(), patch); return { url: "https://fixture.invalid/remessa" }; });
    await expect(gerar()).rejects.toThrow("mudou");
    expect(livre().canalBancario).toBe("cnab240");
    expect(fixture.state.tables.remessasCNAB).toHaveLength(0);
    expect(fixture.state.tables.auditLogs).toHaveLength(2);
  });
  it("acordo cancelado após geração impede vínculo final", async () => {
    mocks.storage.mockImplementation(async () => { fixture.state.tables.acordos[0].status = "cancelado"; return { url: "https://fixture.invalid/remessa" }; });
    await expect(gerar()).rejects.toThrow("mudou");
    expect(fixture.state.tables.remessasCNAB).toHaveLength(0);
    expect(livre().canalBancario).toBe("cnab240");
  });
  it("concorrência CNAB → API: só CNAB reserva e gera", async () => {
    let chegou!: () => void;
    let continuar!: () => void;
    const entrou = new Promise<void>(resolve => { chegou = resolve; });
    const aguarda = new Promise<void>(resolve => { continuar = resolve; });
    mocks.boleto.mockImplementation(async () => { chegou(); await aguarda; return { nomeBeneficiario: "Condomínio", cnpjBeneficiario: "30306294000145" }; });
    const cnab = gerar();
    await entrou; // CNAB detém o lock, enquanto API está concorrendo pela mesma parcela.
    const api = reservarApi();
    continuar();
    const result = await Promise.allSettled([cnab, api]);
    expect(result[0].status).toBe("fulfilled"); expect(result[1].status).toBe("rejected"); expect(livre().canalBancario).toBe("cnab240"); expect(mocks.arquivo).toHaveBeenCalledTimes(1);
  });
  it("concorrência API → CNAB: só API reserva e nenhum arquivo é gerado", async () => {
    const result = await Promise.allSettled([reservarApi(), gerar()]);
    expect(result[0].status).toBe("fulfilled"); expect(result[1].status).toBe("rejected"); expect(livre().canalBancario).toBe("api_btg_v2"); expect(mocks.arquivo).not.toHaveBeenCalled();
  });
  it("emissor API completo concorre com CNAB que já detém lock: nenhum POST mockado", async () => {
    habilitarApiFixture();
    let chegou!: () => void; let continuar!: () => void;
    const entrou = new Promise<void>(resolve => { chegou = resolve; });
    const aguarda = new Promise<void>(resolve => { continuar = resolve; });
    mocks.boleto.mockImplementation(async () => { chegou(); await aguarda; return { nomeBeneficiario: "Condomínio", cnpjBeneficiario: "30306294000145" }; });
    const cnab = gerar(); await entrou;
    const api = emitirBolePixV2({ db: fixture.db, parcelaId: 19 });
    continuar();
    const result = await Promise.allSettled([cnab, api]);
    expect(result[0].status).toBe("fulfilled"); expect(result[1].status).toBe("rejected");
    expect(mocks.apiBank).not.toHaveBeenCalled(); expect(mocks.arquivo).toHaveBeenCalledTimes(1);
  });
  it("CNAB concorre enquanto POST API completo está pendente: reserva API impede arquivo", async () => {
    habilitarApiFixture();
    let chegou!: () => void; let continuar!: () => void;
    const entrou = new Promise<void>(resolve => { chegou = resolve; });
    const aguarda = new Promise<void>(resolve => { continuar = resolve; });
    mocks.apiBank.mockImplementation(async () => { chegou(); await aguarda; return { collectionId: "api-fixture", status: "CREATED", nossoNumero: "bank-fixture" }; });
    const api = emitirBolePixV2({ db: fixture.db, parcelaId: 19 }); await entrou;
    expect(livre().canalBancario).toBe("api_btg_v2");
    await expect(gerar()).rejects.toThrow("API"); continuar();
    await expect(api).resolves.toMatchObject({ status: "emitida" });
    expect(mocks.arquivo).not.toHaveBeenCalled(); expect(mocks.apiBank).toHaveBeenCalledTimes(1);
  });
  it("dois geradores simultâneos não duplicam lote", async () => {
    const result = await Promise.allSettled([gerar(), gerar()]); expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(fixture.state.tables.remessasCNAB).toHaveLength(1);
  });
  it("carteira multi-condomínio tem autoridade sobre condomínio principal/role", async () => {
    fixture.state.tables.userCondominios.push({ userId: 10, condominioId: 1, isActive: 1 });
    await gerar([19], 1, ctx("advogado", 99));
    setup(); mocks.arquivo.mockClear(); mocks.storage.mockClear();
    await expect(gerar([19], 1, ctx("advogado", 1))).rejects.toThrow("vínculo"); semEfeitos();
  });
});

describe("filas e legado usam a mesma política", () => {
  it("fila mostra reserva local elegível e número antigo em revisão", async () => {
    fixture.state.tables.parcelasAcordo.push({ ...parcela(20), nossoNumeroOrigem: null });
    const rows = await enriquecerFilaCnab(fixture.db, [{ parcelaId: 19 }, { parcelaId: 20 }]);
    expect(rows[0]).toMatchObject({ elegivelCnab: true, canalBancario: null });
    expect(rows[1]).toMatchObject({ elegivelCnab: false, confirmarReservaDisponivel: true, codigoBloqueioCnab: "numero_origem_desconhecida" });
    expect(fixture.state.writes).toEqual([]);
  });
  it("fila consulta emissões de todas as integrações e não confunde outra origem/parcela", async () => {
    fixture.state.tables.btgCobrancasEmitidas.push({ origemTipo: "parcela_acordo", origemId: 19, btgIntegracaoId: 999, status: "incerta" }, { origemTipo: "cobranca", origemId: 20 });
    fixture.state.tables.parcelasAcordo.push(parcela(20));
    const rows = await enriquecerFilaCnab(fixture.db, [{ parcelaId: 19 }, { parcelaId: 20 }]);
    expect(rows[0]).toMatchObject({ elegivelCnab: false, codigoBloqueioCnab: "api_vinculada" }); expect(rows[1].elegivelCnab).toBe(true);
  });
  it("fila global só libera admin; locais consultam vínculos ativos", async () => {
    fixture.state.tables.userCondominios.push({ userId: 10, condominioId: 1, isActive: 1 }, { userId: 10, condominioId: 2, isActive: 0 });
    expect(await condominiosPermitidosFilaCnab(ctx().user!)).toBeUndefined();
    expect(await condominiosPermitidosFilaCnab(ctx("advogado", 99).user!)).toEqual([1]);
  });
  it("emissor legado reserva antes de efeito e bloqueia API/CNAB", async () => {
    await reservarParcelaParaEmissorLegado(ctx(), livre(), 1); expect(livre().canalBancario).toBe("legado");
    await expect(gerar()).rejects.toThrow("legado"); await expect(reservarApi()).rejects.toThrow("legado");
  });
  it("API ou CNAB reservado impede emissão legada", async () => {
    await reservarApi(); await expect(reservarParcelaParaEmissorLegado(ctx(), livre(), 1)).rejects.toThrow("API");
    setup(); await gerar(); await expect(reservarParcelaParaEmissorLegado(ctx(), livre(), 1)).rejects.toThrow("CNAB");
  });
  it("revisão legada stale não envia valor/vencimento diferente", async () => {
    await expect(reservarParcelaParaEmissorLegado(ctx(), { ...livre(), amount: 1 }, 1)).rejects.toThrow("mudou"); semEfeitos();
  });
  it("PDF local não fabrica boleto de reserva livre/API; reapresenta CNAB existente", async () => {
    await expect(validarReapresentacaoBoletoCnab(ctx(), [19], 1)).rejects.toThrow("exige remessa");
    await gerar(); await expect(validarReapresentacaoBoletoCnab(ctx(), [19], 1)).resolves.toBeUndefined();
    fixture.state.tables.btgCobrancasEmitidas.push({ origemTipo: "parcela_acordo", origemId: 19 });
    await expect(validarReapresentacaoBoletoCnab(ctx(), [19], 1)).rejects.toThrow("canônico");
  });
  it("boleto CNAB histórico com Pix retornado é reapresentado sem reclassificação", async () => {
    Object.assign(livre(), { pixCopiaCola: "PIX-DO-RETORNO", nossoNumeroOrigem: null });
    const antes = structuredClone(livre());
    await expect(validarReapresentacaoBoletoCnab(ctx(), [19], 1)).resolves.toBeUndefined();
    expect(livre()).toEqual(antes); expect(fixture.state.writes).toEqual([]);
  });
  it("createParcelas persiste origem e mantém snapshots/número sem escolher canal", async () => {
    await createParcelas([{ ...parcela(22), id: undefined } as any]);
    expect(fixture.state.tables.parcelasAcordo[1]).toMatchObject({ nossoNumero: "1000000018", nossoNumeroOrigem: "reserva_local", canalBancario: null, amount: 12599, snapshotPrincipal: 10000, snapshotJuros: 2599 });
  });
});

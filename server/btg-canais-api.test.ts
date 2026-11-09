import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const mocks = vi.hoisted(() => ({ config: vi.fn(), oauth: vi.fn(), bank: vi.fn() }));
vi.mock("./btg-oauth", () => ({ getBtgOAuthConfig: mocks.config, getStatusOAuthBtg: mocks.oauth }));
vi.mock("./btg-v2/client", () => ({ criarBolePixBtgV2: mocks.bank }));
vi.mock("./db", () => ({ getDb: vi.fn(() => { throw new Error("DB real proibido"); }) }));
vi.mock("./btg-v2/diagnosticos", async () => ({ criarCapturaHttpBtg: (await import("./btg-v2-http-captura-test-helper")).criarCapturaMock }));

import { avaliarElegibilidadeParcelaAcordoBtgV2, emitirBolePixV2, emitirParcelasAcordoBtgV2, prepararEmissaoParcelasAcordoBtgV2 } from "./btg-v2/issuance";
import { executarRemessaBtgV2, listarFilaRemessaBtgV2 } from "./btg-v2/remessas";
import { bloquearParcelasParaCanal, exigirParcelaLivreParaCanal } from "./btg-canais";
import { eq } from "drizzle-orm";
import { parcelasAcordo } from "../drizzle/schema";
import { BtgV2HttpError } from "./btg-v2/errors";

/** Fixture local: interpreta somente eq/and/inArray usados nesta frente e serializa commits. */
function criarDbApiEmMemoria(initial: Record<string, any[]>) {
  const dialect = new MySqlDialect();
  const state = { tables: structuredClone(initial), writes: [] as { table: string; values: any }[], locks: [] as string[], transactions: 0, failCanal: false };
  function matches(joined: any, condition: any) {
    if (!condition) return true;
    const { sql, params } = dialect.sqlToQuery(condition);
    let index = 0;
    let ok = true;
    const predicates = /`([^`]+)`\.`([^`]+)`\s*(?:=\s*(\?|`([^`]+)`\.`([^`]+)`)|in\s*\(([^)]+)\))/g;
    for (const match of sql.matchAll(predicates)) {
      const actual = joined[match[1]]?.[match[2]];
      if (match[6]) {
        const count = (match[6].match(/\?/g) ?? []).length;
        const expected = params.slice(index, index + count); index += count;
        if (!expected.includes(actual)) ok = false;
      } else if (match[3] === "?") {
        if (actual !== params[index++]) ok = false;
      } else if (actual !== joined[match[4]]?.[match[5]]) ok = false;
    }
    return ok;
  }
  function project(selection: any, joined: any, base: string): any {
    if (!selection) return structuredClone(joined[base]);
    const result: any = {};
    for (const [key, value] of Object.entries(selection) as [string, any][]) {
      if (value?.table && value?.name) result[key] = joined[getTableName(value.table)]?.[value.name];
      else if (value && Object.getOwnPropertySymbols(value).some(s => String(s).includes("Columns"))) result[key] = structuredClone(joined[getTableName(value)]);
      else if (value && typeof value === "object") result[key] = project(value, joined, base);
    }
    return result;
  }
  let queue = Promise.resolve();
  const db: any = {
    select: vi.fn((selection?: any) => {
      let base = "", condition: any, limit = Infinity;
      const joins: { table: string; on: any }[] = [];
      const run = () => {
        let rows = (state.tables[base] ?? []).map(row => ({ [base]: row }));
        for (const join of joins) rows = rows.flatMap(row => (state.tables[join.table] ?? []).map(other => ({ ...row, [join.table]: other })).filter(all => matches(all, join.on)));
        return rows.filter(row => matches(row, condition)).slice(0, limit).map(row => project(selection, row, base));
      };
      const chain: any = {
        from: (table: any) => { base = getTableName(table); return chain; },
        where: (where: any) => { condition = where; return chain; },
        limit: (n: number) => { limit = n; return chain; },
        innerJoin: (table: any, on: any) => { joins.push({ table: getTableName(table), on }); return chain; },
        orderBy: () => chain,
        for: (mode: string) => { state.locks.push(`${base}:${mode}`); return chain; },
        then: (resolve: any, reject: any) => Promise.resolve().then(run).then(resolve, reject),
      };
      return chain;
    }),
    insert: vi.fn((table: any) => ({ values: async (values: any) => {
      const name = getTableName(table), rows = state.tables[name] ??= [];
      for (const data of Array.isArray(values) ? values : [values]) {
        if (name === "btgCobrancasEmitidas" && rows.some(row => row.btgIntegracaoId === data.btgIntegracaoId && row.origemId === data.origemId && row.origemTipo === data.origemTipo && row.revisao === data.revisao)) throw new Error("duplicate 1062");
        const defaults: any = {};
        for (const [key, col] of Object.entries(getTableColumns(table)) as [string, any][]) {
          if (col.default !== undefined && typeof col.default !== "object") defaults[key] = col.default;
          else if (!col.notNull) defaults[key] = null;
        }
        rows.push({ ...defaults, id: rows.length + 100, ...structuredClone(data) });
        state.writes.push({ table: name, values: structuredClone(data) });
      }
      return [{ insertId: rows.at(-1)?.id }];
    } })),
    update: vi.fn((table: any) => ({ set: (values: any) => ({ where: async (condition: any) => {
      const name = getTableName(table);
      if (name === "parcelasAcordo" && values.canalBancario && state.failCanal) throw new Error("canal unavailable");
      for (const row of state.tables[name] ?? []) if (matches({ [name]: row }, condition)) Object.assign(row, structuredClone(values));
      state.writes.push({ table: name, values: structuredClone(values) });
    } }) })),
    transaction: vi.fn((run: any) => {
      const current = queue.then(async () => {
        state.transactions++;
        const before = structuredClone(state.tables), writes = state.writes.length;
        try { return await run(db); }
        catch (error) { state.tables = before; state.writes.splice(writes); throw error; }
      });
      queue = current.then(() => undefined, () => undefined);
      return current;
    }),
  };
  return { db, state };
}

const config = { ambiente: "sandbox" as const, companyId: "30306294000145" };
const parcela = { id: 19, acordoId: 5, installmentNumber: 1, amount: 12599, dueDate: new Date("2026-12-01T12:00:00Z"), status: "pendente", nossoNumero: "1000000018", nossoNumeroOrigem: "reserva_local", canalBancario: null, remessaId: null, statusRemessa: "nao_enviado", snapshotPrincipal: 9000, snapshotJuros: 3599 };
const conta = { id: 15, btgIntegracaoId: 7, accountId: "official-fixture", agencia: "0050", numero: "0003081850", documentoBeneficiario: config.companyId, nomeBeneficiario: "Beneficiário Teste", ativo: 1, origemCadastro: "api" };
function setup(extra: Record<string, any[]> = {}) {
  return criarDbApiEmMemoria({
    btgIntegracoes: [{ id: 7, ...config, ativo: 1, emissaoHabilitada: 1, diasLimitePagamento: 60, instrucoes: null }],
    btgContasRecebedoras: [conta],
    btgContaRecebedoraCondominios: [{ id: 3, btgIntegracaoId: 7, btgContaRecebedoraId: 15, condominioId: 2, ativo: 1 }],
    acordos: [{ id: 5, condominioId: 2, devedorId: 21, status: "ativo" }],
    parcelasAcordo: [parcela],
    devedores: [{ id: 21, condominioId: 2, name: "Pagador Teste", cpfCnpj: "52998224725", address: "Rua Teste", addressNumber: "1", neighborhood: "Centro", city: "São Paulo", state: "SP", zipCode: "01001000" }],
    btgCobrancasEmitidas: [], btgRemessas: [], btgRemessaItens: [], ...extra,
  });
}
function canonica(patch: Record<string, any> = {}) {
  return { id: 100, btgIntegracaoId: 7, btgContaRecebedoraId: 15, condominioId: 2, origemTipo: "parcela_acordo", origemId: 19, revisao: 1, status: "incerta", amount: 12599, dueDate: parcela.dueDate, btgCollectionId: "canonical-collection", nossoNumero: "bank-number", ...patch };
}
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue(config);
  mocks.oauth.mockResolvedValue({ status: "conectado" });
  mocks.bank.mockResolvedValue({ collectionId: "collection-fixture", status: "CREATED", bankSlipUrl: "https://example.invalid/slip", pixQrCode: null, pixCopiaECola: null, codigoBarras: null, linhaDigitavel: null, nossoNumero: "bank-number" });
  fetchMock = vi.fn(() => { throw new Error("fetch real proibido"); });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { expect(fetchMock).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("API BTG — origem local, canal e reserva canônica", () => {
  it("reserva local não bloqueia API; canal e reserva commitam juntos preservando número/snapshots/payload", async () => {
    const { db, state } = setup();
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })).resolves.toMatchObject({ status: "emitida", jaExistia: false, nossoNumero: "bank-number" });
    expect(state.tables.parcelasAcordo[0]).toMatchObject({ ...parcela, canalBancario: "api_btg_v2" });
    expect(state.tables.btgCobrancasEmitidas[0]).toMatchObject({ amount: 12599, dueDate: parcela.dueDate, status: "emitida" });
    expect(state.locks).toContain("parcelasAcordo:update");
    expect(state.locks.indexOf("btgIntegracoes:update")).toBeLessThan(state.locks.indexOf("parcelasAcordo:update"));
    expect(state.locks.indexOf("btgContaRecebedoraCondominios:update")).toBeLessThan(state.locks.indexOf("parcelasAcordo:update"));
    expect(mocks.bank).toHaveBeenCalledTimes(1);
    expect(mocks.bank.mock.calls[0][0].account).toEqual({ branch: "0050", number: "0003081850" });
    expect(mocks.bank.mock.calls[0][0].detail).toEqual({
      documentNumber: "PA19R1", externalId: "v2:sbx:parcela_acordo:19:r1", correlationId: "btgv2-100",
    });
    expect(JSON.stringify(mocks.bank.mock.calls[0][0])).not.toMatch(/reserva_local|api_btg_v2|1000000018|nossoNumeroOrigem|canalBancario/);
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })).resolves.toMatchObject({ jaExistia: true, collectionId: "collection-fixture" });
    expect(mocks.bank).toHaveBeenCalledTimes(1);
  });

  it.each([
    { nossoNumeroOrigem: null }, { nossoNumeroOrigem: "legado" }, { remessaId: 0 }, { remessaId: 98 },
    { statusRemessa: "remessa_gerada" }, { statusRemessa: "enviado" }, { statusRemessa: "retorno_recebido" },
    { pixCopiaCola: "legacy-emv" }, { btgCollectionId: "old" }, { btgBankSlipUrl: "old" }, { btgPixQrCode: "old" },
    { btgPixCopiaECola: "old" }, { btgStatus: "CREATED" }, { btgEmitidoEm: new Date() },
    { canalBancario: "cnab240" }, { canalBancario: "legado" }, { canalBancario: "api_btg_v2" },
    { status: "pago" }, { status: "cancelado" },
  ])("nenhuma evidência/estado legado é neutralizado pela origem local: %j", async patch => {
    const { db, state } = setup({ parcelasAcordo: [{ ...parcela, ...patch }] });
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })).rejects.toBeDefined();
    expect(state.writes).toEqual([]);
    expect(mocks.bank).not.toHaveBeenCalled();
  });

  it.each(["reservada", "enviando", "incerta", "falha", "emitida", "paga", "cancelada", "expirada"])("reutiliza canônica %s apesar do próprio canal, sem POST", async status => {
    const { db, state } = setup({ parcelasAcordo: [{ ...parcela, canalBancario: "api_btg_v2" }], btgCobrancasEmitidas: [canonica({ status })] });
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })).resolves.toMatchObject({ id: 100, status, jaExistia: true, collectionId: "canonical-collection" });
    expect(state.writes).toEqual([]);
    expect(mocks.bank).not.toHaveBeenCalled();
  });

  it("correção documental não altera nem reenvia a canônica #1 incerta sem Collection ID", async () => {
    const registro = canonica({ id: 1, btgCollectionId: null, erroCodigo: "EMISSAO_SEM_CONFIRMACAO" });
    const { db, state } = setup({ parcelasAcordo: [{ ...parcela, canalBancario: "api_btg_v2" }], btgCobrancasEmitidas: [registro] });
    const antes = structuredClone(state.tables);
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })).resolves.toMatchObject({ id: 1, status: "incerta", jaExistia: true, collectionId: null });
    expect(state.tables).toEqual(antes);
    expect(state.writes).toEqual([]);
    expect(mocks.bank).not.toHaveBeenCalled();
  });

  it.each([{ condominioId: 3 }, { btgContaRecebedoraId: 16 }])("não devolve canônica de contexto divergente: %j", async patch => {
    const { db } = setup({ btgCobrancasEmitidas: [canonica(patch)] });
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })).rejects.toThrow("registro canônico");
    expect(mocks.bank).not.toHaveBeenCalled();
  });

  it("emissão em outra integração bloqueia novo POST, sem expor o registro", async () => {
    const { db, state } = setup({ btgCobrancasEmitidas: [canonica({ btgIntegracaoId: 99, revisao: 3, status: "cancelada" })] });
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })).rejects.toThrow(/api btg/i);
    expect(state.writes).toEqual([]);
    expect(mocks.bank).not.toHaveBeenCalled();
  });

  it("commit do canal falhando faz rollback da própria reserva", async () => {
    const { db, state } = setup(); state.failCanal = true;
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })).rejects.toThrow("canal unavailable");
    expect(state.tables.btgCobrancasEmitidas).toEqual([]);
    expect(state.tables.parcelasAcordo[0].canalBancario).toBeNull();
    expect(state.writes).toEqual([]);
    expect(mocks.bank).not.toHaveBeenCalled();
  });

  it("falha de POST conserva reserva/canal incertos, sem release nem retry/fallback", async () => {
    const { db, state } = setup(); mocks.bank.mockRejectedValue(new Error("timeout fixture"));
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })).rejects.toThrow("sem confirmação local");
    expect(state.tables.parcelasAcordo[0].canalBancario).toBe("api_btg_v2");
    expect(state.tables.btgCobrancasEmitidas[0]).toMatchObject({ status: "incerta", erroCodigo: "EMISSAO_SEM_CONFIRMACAO" });
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })).resolves.toMatchObject({ status: "incerta", jaExistia: true });
    expect(mocks.bank).toHaveBeenCalledTimes(1);
  });

  it("retorna diagnóstico HTTP sanitizado por parcela e conserva reserva/canal incertos", async () => {
    const { db, state } = setup();
    mocks.bank.mockRejectedValue(new BtgV2HttpError({
      httpStatus: 400, camposInvalidos: ["detail.documentNumber"],
      motivos: ["O número do documento excede o limite permitido"],
    }));
    const resultado = await emitirParcelasAcordoBtgV2({ usuarioId: 10, db, acordoId: 5, parcelaIds: [19] });
    expect(resultado.resultados[0]).toMatchObject({
      parcelaId: 19, resultado: "falha", diagnosticoHttp: {
        httpStatus: 400, camposInvalidos: ["detail.documentNumber"],
        motivos: ["O número do documento excede o limite permitido"],
      },
    });
    expect(resultado.resultados[0].mensagem).toContain("HTTP 400");
    expect(state.tables.btgCobrancasEmitidas[0]).toMatchObject({ status: "incerta", erroCodigo: "EMISSAO_SEM_CONFIRMACAO" });
    expect(state.tables.parcelasAcordo[0].canalBancario).toBe("api_btg_v2");
    expect(mocks.bank).toHaveBeenCalledTimes(1);
    await emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 });
    expect(mocks.bank).toHaveBeenCalledTimes(1);
  });

  it.each([
    { table: "parcelasAcordo", patch: { amount: 15000 } },
    { table: "parcelasAcordo", patch: { dueDate: new Date("2027-01-01T12:00:00Z") } },
    { table: "parcelasAcordo", patch: { canalBancario: "cnab240", remessaId: 88 } },
    { table: "parcelasAcordo", patch: { nossoNumeroOrigem: null } },
    { table: "acordos", patch: { status: "cancelado" } },
    { table: "acordos", patch: { condominioId: 3 } },
    { table: "acordos", patch: { devedorId: 22 } },
  ])("revalida estado fresco dentro do lock antes da reserva: %j", async ({ table, patch }) => {
    const { db, state } = setup();
    const original = db.transaction.getMockImplementation(); let first = true;
    db.transaction.mockImplementation((run: any) => { if (first) { first = false; Object.assign(state.tables[table][0], patch); } return original(run); });
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })).rejects.toBeDefined();
    expect(state.tables.btgCobrancasEmitidas).toEqual([]);
    expect(mocks.bank).not.toHaveBeenCalled();
  });

  it.each([
    { table: "parcelasAcordo", patch: { amount: 15000 } },
    { table: "parcelasAcordo", patch: { dueDate: new Date("2027-01-01T12:00:00Z") } },
    { table: "parcelasAcordo", patch: { remessaId: 88 } },
    { table: "parcelasAcordo", patch: { btgPixCopiaECola: "legacy-emv" } },
    { table: "acordos", patch: { status: "cancelado" } },
    { table: "acordos", patch: { condominioId: 3 } },
    { table: "devedores", patch: { cpfCnpj: "11111111111" } },
    { table: "btgContasRecebedoras", patch: { numero: "0003081851" } },
    { table: "btgCobrancasEmitidas", patch: { amount: 15000 } },
    { table: "btgCobrancasEmitidas", patch: { dueDate: new Date("2027-01-01T12:00:00Z") } },
    { table: "btgCobrancasEmitidas", patch: { contaRecebedora: "changed" } },
  ])("alteração após commit bloqueia POST e conserva reserva/canal: %j", async ({ table, patch }) => {
    const { db, state } = setup(); const original = db.transaction.getMockImplementation(); let first = true;
    db.transaction.mockImplementation(async (run: any) => { const result = await original(run); if (first) { first = false; Object.assign(state.tables[table][0], patch); } return result; });
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })).rejects.toBeDefined();
    expect(state.tables.btgCobrancasEmitidas[0].status).toBe("reservada");
    expect(state.tables.parcelasAcordo[0].canalBancario).toBe("api_btg_v2");
    expect(mocks.bank).not.toHaveBeenCalled();
  });

  it("duas tentativas concorrentes API convergem para uma reserva e no máximo um POST", async () => {
    const { db, state } = setup();
    const results = await Promise.all([emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 }), emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })]);
    expect(state.tables.btgCobrancasEmitidas).toHaveLength(1);
    expect(results.map(result => result.jaExistia).sort()).toEqual([false, true]);
    expect(new Set(results.map(result => result.id)).size).toBe(1);
    expect(mocks.bank).toHaveBeenCalledTimes(1);
  });

  it("nova emissão externa após reserva impede POST, preservando o bloqueio", async () => {
    const { db, state } = setup(); const original = db.transaction.getMockImplementation(); let first = true;
    db.transaction.mockImplementation(async (run: any) => {
      const result = await original(run);
      if (first) { first = false; state.tables.btgCobrancasEmitidas.push(canonica({ id: 101, btgIntegracaoId: 99 })); }
      return result;
    });
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })).rejects.toThrow("Outra emissão");
    expect(state.tables.btgCobrancasEmitidas[0].status).toBe("reservada");
    expect(state.tables.parcelasAcordo[0].canalBancario).toBe("api_btg_v2");
    expect(mocks.bank).not.toHaveBeenCalled();
  });

  it.each(["cnab_primeiro", "api_primeiro"])("disputa %s compartilha lock/política e impede segunda aquisição de canal", async ordem => {
    const { db, state } = setup();
    const reservarCnab = () => db.transaction(async (tx: any) => {
      const [row] = await bloquearParcelasParaCanal(tx, [19], 2);
      exigirParcelaLivreParaCanal(row, "cnab240");
      await tx.update(parcelasAcordo).set({ canalBancario: "cnab240", remessaId: 88, statusRemessa: "remessa_gerada" }).where(eq(parcelasAcordo.id, 19));
    });
    if (ordem === "cnab_primeiro") {
      const results = await Promise.allSettled([reservarCnab(), emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })]);
      expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
      expect(state.tables.parcelasAcordo[0].canalBancario).toBe("cnab240");
      expect(state.tables.btgCobrancasEmitidas).toHaveLength(0);
      expect(mocks.bank).not.toHaveBeenCalled();
    } else {
      const original = db.transaction.getMockImplementation(); let first = true;
      db.transaction.mockImplementation(async (run: any) => {
        const result = await original(run);
        if (first) {
          first = false;
          await expect(reservarCnab()).rejects.toThrow("API BTG");
        }
        return result;
      });
      await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19 })).resolves.toMatchObject({ jaExistia: false });
      expect(state.tables.parcelasAcordo[0].canalBancario).toBe("api_btg_v2");
      expect(state.tables.btgCobrancasEmitidas).toHaveLength(1);
      expect(mocks.bank).toHaveBeenCalledTimes(1);
    }
  });

  it("emissão por acordo aceita consulta idempotente mas recusa contexto de outro acordo", async () => {
    const { db } = setup({ parcelasAcordo: [{ ...parcela, canalBancario: "api_btg_v2" }], btgCobrancasEmitidas: [canonica()] });
    await expect(emitirParcelasAcordoBtgV2({ usuarioId: 10, db, acordoId: 5, parcelaIds: [19] })).resolves.toMatchObject({ resultados: [{ resultado: "falha", mensagem: "Emissão existente sem sucesso confirmado; revisar situação, sem reenviar.", emissao: { id: 100, status: "incerta", jaExistia: true } }] });
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19, acordoIdEsperado: 6 })).rejects.toThrow("selecionados");
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19, condominioIdEsperado: 3 })).rejects.toThrow("selecionados");
    expect(mocks.bank).not.toHaveBeenCalled();
  });
});

describe("API BTG — prévias e fila segura", () => {
  it("acordo e fila consultam todas integrações/revisões sem duplicar nem expor meios bancários", async () => {
    const { db } = setup({ parcelasAcordo: [parcela, { ...parcela, id: 20, installmentNumber: 2, nossoNumeroOrigem: null }],
      btgCobrancasEmitidas: [canonica({ btgIntegracaoId: 99, revisao: 3, pixCopiaECola: "secret-pix" }), canonica({ id: 101, revisao: 4 })] });
    const previa = await prepararEmissaoParcelasAcordoBtgV2({ db, acordoId: 5 });
    const fila = await listarFilaRemessaBtgV2({ db, condominioId: 2, btgIntegracaoId: 7 });
    expect(fila).toHaveLength(2);
    for (const list of [previa.parcelas, fila]) {
      expect(list.find(row => row.id === 19)).toMatchObject({ elegivel: false, codigo: "api_vinculada", btgEmissaoV2Existente: true, podeConfirmarReserva: false, nossoNumeroOrigem: "reserva_local", canalBancario: null });
      expect(list.find(row => row.id === 20)).toMatchObject({ elegivel: false, codigo: "numero_origem_desconhecida", podeConfirmarReserva: true, btgEmissaoV2Existente: false, nossoNumero: "1000000018" });
      expect(JSON.stringify(list)).not.toMatch(/canonical-collection|secret-pix|bank-number/);
    }
  });

  it("não vaza nome/documento de pagador de outro condomínio na fila", async () => {
    const { db } = setup({ devedores: [{ id: 21, condominioId: 3, name: "Dado restrito", cpfCnpj: "secret" }] });
    await expect(listarFilaRemessaBtgV2({ db, condominioId: 2, btgIntegracaoId: 7 })).resolves.toEqual([]);
    expect(mocks.bank).not.toHaveBeenCalled();
  });

  it("fila inativa não habilita confirmação administrativa de reserva", async () => {
    const { db } = setup({ acordos: [{ id: 5, condominioId: 2, devedorId: 21, status: "cancelado" }], parcelasAcordo: [{ ...parcela, nossoNumeroOrigem: null }] });
    await expect(listarFilaRemessaBtgV2({ db, condominioId: 2, btgIntegracaoId: 7 })).resolves.toMatchObject([{ elegivel: false, codigo: "acordo_inativo", podeConfirmarReserva: false }]);
  });

  it("prévia retém motivo legado sem expor Pix; seleção não ignora bloqueio", async () => {
    const { db } = setup({ parcelasAcordo: [{ ...parcela, btgPixQrCode: "secret-legacy-pix" }] });
    const previa = await prepararEmissaoParcelasAcordoBtgV2({ db, acordoId: 5 });
    expect(previa.parcelas[0]).toMatchObject({ elegivel: false, codigo: "legado_vinculado" });
    expect(JSON.stringify(previa)).not.toContain("secret-legacy-pix");
    await expect(emitirParcelasAcordoBtgV2({ usuarioId: 10, db, acordoId: 5, parcelaIds: [19] })).rejects.toThrow("legado");
    expect(mocks.bank).not.toHaveBeenCalled();
  });
});

describe("API BTG — contexto de remessa", () => {
  function lote(patch: Record<string, any> = {}) { return { id: 50, btgIntegracaoId: 7, btgContaRecebedoraId: 15, condominioId: 2, status: "rascunho", ...patch }; }
  function item() { return { id: 1, btgRemessaId: 50, parcelaAcordoId: 19, installmentNumber: 1, valorCentavos: 12599 }; }
  it("envia lote de contexto correto usando o mesmo emissor canônico", async () => {
    const { db, state } = setup({ btgRemessas: [lote()], btgRemessaItens: [item()] });
    await expect(executarRemessaBtgV2({ usuarioId: 10, db, remessaId: 50, parcelas: [parcela] })).resolves.toMatchObject({ status: "processada", totalEmitido: 1 });
    expect(state.tables.btgCobrancasEmitidas[0]).toMatchObject({ btgRemessaId: 50, condominioId: 2 });
    expect(mocks.bank).toHaveBeenCalledTimes(1);
  });
  it("persiste mensagem protegida de HTTP400 no item e resumo sem liberar o canal", async () => {
    const { db, state } = setup({ btgRemessas: [lote()], btgRemessaItens: [item()] });
    mocks.bank.mockRejectedValue(new BtgV2HttpError({
      httpStatus: 400, camposInvalidos: ["detail.documentNumber", "CPF-NAO-EXIBIR"],
      motivos: ["O número do documento excede o limite permitido", "TOKEN-NAO-EXIBIR"],
    }));
    await expect(executarRemessaBtgV2({ usuarioId: 10, db, remessaId: 50, parcelas: [parcela] })).resolves.toMatchObject({ status: "falha", totalFalha: 1 });
    const mensagem = state.tables.btgRemessaItens[0].mensagem;
    expect(mensagem).toContain("HTTP 400");
    expect(mensagem).toContain("detail.documentNumber");
    expect(mensagem.length).toBeLessThanOrEqual(500);
    expect(state.tables.btgRemessas[0].erroResumo).toContain("HTTP 400");
    expect(JSON.stringify(state.tables)).not.toMatch(/CPF-NAO-EXIBIR|TOKEN-NAO-EXIBIR/);
    expect(state.tables.parcelasAcordo[0].canalBancario).toBe("api_btg_v2");
    expect(state.tables.btgCobrancasEmitidas[0].status).toBe("incerta");
    expect(mocks.bank).toHaveBeenCalledTimes(1);
  });
  it.each([{ condominioId: 3 }, { btgIntegracaoId: 99 }, { btgContaRecebedoraId: 16 }])("não usa lote de contexto divergente para obter/emissão de parcela: %j", async patch => {
    const { db, state } = setup({ btgRemessas: [lote(patch)], btgRemessaItens: [item()] });
    await expect(emitirBolePixV2({ usuarioId: 10, db, parcelaId: 19, btgRemessaId: 50 })).rejects.toThrow("contexto");
    expect(state.tables.btgCobrancasEmitidas).toEqual([]);
    expect(mocks.bank).not.toHaveBeenCalled();
  });
  it("lote não permite valor diferente da seleção nem reexecução processada", async () => {
    const { db, state } = setup({ btgRemessas: [lote()], btgRemessaItens: [item()] });
    await expect(executarRemessaBtgV2({ usuarioId: 10, db, remessaId: 50, parcelas: [{ ...parcela, amount: 15000 }] })).resolves.toMatchObject({ status: "falha", totalFalha: 1 });
    expect(state.tables.btgCobrancasEmitidas).toEqual([]);
    await expect(executarRemessaBtgV2({ usuarioId: 10, db, remessaId: 50, parcelas: [parcela] })).rejects.toThrow("novo envio");
    expect(mocks.bank).not.toHaveBeenCalled();
  });
});

it("wrapper API usa o mesmo resultado rico da política comum", () => {
  expect(avaliarElegibilidadeParcelaAcordoBtgV2(parcela)).toEqual({ elegivel: true, motivo: null, codigo: null, confirmarReservaDisponivel: false });
});

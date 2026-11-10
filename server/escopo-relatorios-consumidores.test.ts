import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({
  pessoa: { id: 901, role: "advogado", condominioId: null as number | null, isActive: 1, isDeleted: 0, escopoCondominios: "todos" as string | null },
  ativos: [1, 2], vinculos: [1], queries: [] as any[], dados: [] as any[],
  pdfAcordos: vi.fn(), pdfExtrato: vi.fn(), pdfRecuperacao: vi.fn(), pdfCobranca: vi.fn(), storage: vi.fn(),
  exportDevedores: vi.fn(), exportCobrancas: vi.fn(), exportAcordos: vi.fn(), exportTentativas: vi.fn(), exportVencimentos: vi.fn(),
  loadDevedores: vi.fn(), loadCobrancas: vi.fn(), loadAcordos: vi.fn(), loadTentativas: vi.fn(), loadDevedor: vi.fn(),
}));
// Predicados reais dos consumidores executados sobre fixtures; nenhum banco ou serviço externo.
vi.mock("drizzle-orm", async original => {
  const real = await original<typeof import("drizzle-orm")>();
  const op = (name: string) => (...args: any[]) => ({ op: name, args });
  return { ...real, eq: op("eq"), and: op("and"), gte: op("gte"), lte: op("lte"), inArray: op("in"), like: op("like"), desc: op("desc") };
});
vi.mock("./db", async original => ({
  ...await original<typeof import("./db")>(),
  getDb: async () => ({ select: (fields?: any) => query(fields), selectDistinct: (fields: any) => query(fields, true) }),
}));
vi.mock("./relatorio-acordos-pdf", () => ({ gerarRelatorioAcordosPDF: state.pdfAcordos }));
vi.mock("./relatorio-extrato-pdf", () => ({ gerarRelatorioExtratoPDF: state.pdfExtrato }));
vi.mock("./relatorio-recuperacao-pdf", () => ({ gerarRelatorioRecuperacaoPDF: state.pdfRecuperacao }));
vi.mock("./relatorio-cobranca-pdf", () => ({ gerarRelatorioCobrancaPDF: state.pdfCobranca }));
vi.mock("./storage", () => ({ storagePut: state.storage }));
vi.mock("./excel-export", () => ({ exportDevedores: state.exportDevedores, exportCobrancas: state.exportCobrancas, exportAcordos: state.exportAcordos, exportTentativas: state.exportTentativas, exportVencimentos: state.exportVencimentos }));
vi.mock("./db-devedores", async original => ({ ...await original<typeof import("./db-devedores")>(), getDevedoresByCondominio: state.loadDevedores, getDevedorById: state.loadDevedor }));
vi.mock("./db-cobrancas", async original => ({ ...await original<typeof import("./db-cobrancas")>(), getCobrancasByCondominio: state.loadCobrancas }));
vi.mock("./db-acordos", async original => ({ ...await original<typeof import("./db-acordos")>(), getAcordosByCondominio: state.loadAcordos }));
vi.mock("./db-tentativas", async original => ({ ...await original<typeof import("./db-tentativas")>(), getTentativasByCondominio: state.loadTentativas }));

import { appRouter } from "./routers";
import { users, condominios, userCondominios, devedores, cobrancas, acordos, tentativasCobranca, parcelasAcordo } from "../drizzle/schema";
const tableName = (table: any) => String(table[Symbol.for("drizzle:Name")]);
function record(table: any, data: Record<string, any>) {
  return { [tableName(table)]: Object.fromEntries(Object.entries(data).map(([key, value]) => [table[key]?.name ?? key, value])) };
}
function value(column: any, row: any) { return row[tableName(column.table)]?.[column.name]; }
function matches(node: any, row: any): boolean {
  if (!node) return true;
  const [column, operand] = node.args;
  if (node.op === "and") return node.args.every((item: any) => matches(item, row));
  const found = value(column, row);
  if (node.op === "eq") return found === operand;
  if (node.op === "in") return operand.includes(found);
  if (node.op === "gte") return found >= operand;
  if (node.op === "lte") return found <= operand;
  if (node.op === "like") return String(found).startsWith(operand.replace(/%$/, ""));
  throw new Error(`Predicado não suportado: ${node.op}`);
}
function query(fields?: any, distinct = false) {
  const log: any = { table: "", fields, distinct, where: undefined, limit: undefined };
  function execute() {
    state.queries.push(log);
    let rows: any[];
    if (log.table === tableName(users)) rows = [record(users, state.pessoa)];
    else if (log.table === tableName(condominios)) rows = [1, 2, 3, 8].map(id => record(condominios, { id, name: `Condomínio sintético ${id}`, statusCadastro: state.ativos.includes(id) ? "ativo" : "inativo" }));
    else if (log.table === tableName(userCondominios)) rows = state.vinculos.map(id => ({ ...record(userCondominios, { userId: 901, condominioId: id, isActive: 1 }), ...record(condominios, { id, statusCadastro: state.ativos.includes(id) ? "ativo" : "inativo" }) }));
    else if ([tableName(devedores), tableName(cobrancas), tableName(acordos), tableName(tentativasCobranca), tableName(parcelasAcordo)].includes(log.table)) rows = state.dados;
    else rows = [];
    rows = rows.filter(row => matches(log.where, row));
    if (log.limit != null) rows = rows.slice(0, log.limit);
    let projected = rows.map(row => fields ? Object.fromEntries(Object.entries(fields).map(([key, col]) => [key, value(col, row)])) : row[log.table]);
    if (distinct) projected = [...new Map(projected.map(row => [JSON.stringify(row), row])).values()];
    return projected;
  }
  const q: any = {
    from: (table: any) => { log.table = tableName(table); return q; }, innerJoin: () => q,
    where: (condition: any) => { log.where = condition; return q; }, orderBy: () => q,
    limit: (limit: number) => { log.limit = limit; return q; },
    then: (resolve: any, reject: any) => Promise.resolve().then(execute).then(resolve, reject),
  };
  return q;
}
function fixture(id: number, condominioId: number, amount: number, status = "pendente", unitNumber = `U${id}`) {
  const date = new Date("2026-11-12T12:00:00Z");
  return {
    ...record(devedores, { id, condominioId, name: `Pessoa sintética ${id}`, unitNumber, cpfCnpj: null }),
    ...record(condominios, { id: condominioId, name: `Condomínio sintético ${condominioId}`, taxaJurosMensal: 0, taxaMulta: 0, taxaHonorarios: 0, correcaoMonetaria: 0 }),
    ...record(cobrancas, { id, devedorId: id, condominioId, amount, status, dueDate: date, paidAt: status === "pago" ? date : null }),
    ...record(acordos, { id, devedorId: id, condominioId, agreedAmount: amount, totalAmount: amount, installments: 1, valorPago: 0, status: "ativo", createdAt: date }),
    ...record(tentativasCobranca, { id, devedorId: id, condominioId, userId: 901, result: "recusa", contactType: "telefone", attemptDate: date }),
    ...record(users, { id: 901, name: "Operador sintético", email: "teste@example.invalid" }),
    ...record(parcelasAcordo, { id, acordoId: id, amount, installmentNumber: 1, dueDate: date, status: "pendente" }),
  };
}
const contexto = (overrides: Record<string, any> = {}): TrpcContext => ({
  user: { ...state.pessoa, escopoCondominios: undefined, openId: "teste", name: "Teste", ...overrides } as any,
  req: { headers: {}, protocol: "https" } as any, res: {} as any,
});
const reportQueries = () => state.queries.filter(q => [tableName(cobrancas), tableName(acordos), tableName(tentativasCobranca), tableName(parcelasAcordo)].includes(q.table));
const reportNames = ["cobranca", "inadimplencia", "acordosPeriodo", "extrato", "recuperacao", "acordosDetalhado"] as const;
const pdfNames = ["gerarPDFAcordos", "gerarPDFExtrato", "gerarPDFRecuperacao"] as const;
const exports = ["devedores", "cobrancas", "acordos", "tentativas"] as const;
beforeEach(() => {
  vi.clearAllMocks(); state.queries = [];
  state.pessoa = { id: 901, role: "advogado", condominioId: null, isActive: 1, isDeleted: 0, escopoCondominios: "todos" };
  state.ativos = [1, 2]; state.vinculos = [1];
  state.dados = [fixture(11, 1, 100), fixture(22, 2, 200), fixture(88, 8, 800)];
  for (const fn of [state.pdfAcordos, state.pdfExtrato, state.pdfRecuperacao, state.pdfCobranca, state.exportDevedores, state.exportCobrancas, state.exportAcordos, state.exportTentativas, state.exportVencimentos]) fn.mockResolvedValue(Buffer.from("fixture"));
  state.storage.mockResolvedValue({ url: "https://example.invalid/fixture.pdf" });
  for (const fn of [state.loadDevedores, state.loadCobrancas, state.loadAcordos, state.loadTentativas]) fn.mockResolvedValue([]);
});

describe("relatórios — carteira explícita com guard e caller reais", () => {
  it.each(reportNames)("%s restringe selecionados antes do LIMIT e totais", async name => {
    state.pessoa.escopoCondominios = "selecionados";
    const result: any = await appRouter.createCaller(contexto()).relatorios[name]({});
    const rows = result.rows ?? result.acordos;
    if (name !== "recuperacao") expect(rows).toHaveLength(1);
    expect(reportQueries()[0].where).toBeDefined();
    if (name === "cobranca") expect(result.totais.total).toBe(1);
    if (name === "inadimplencia") expect(result.totais.totalValorOriginal).toBe(100);
    if (name === "acordosPeriodo") expect(result.totais.valorTotal).toBe(100);
    if (name === "extrato") expect(result.totais.totalCobrado).toBe(100);
    if (name === "recuperacao") expect(result.totais.totalEmAberto).toBe(100);
    if (name === "acordosDetalhado") expect(result.totais.valorTotal).toBe(100);
  });
  it.each(reportNames)("%s rejeita filtro estrangeiro antes da consulta nominal", async name => {
    state.pessoa.escopoCondominios = "selecionados";
    await expect(appRouter.createCaller(contexto()).relatorios[name]({ condominioId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(reportQueries()).toHaveLength(0);
  });
  it.each(reportNames)("%s mantém NULL com o filtro antigo sem limitar à carteira", async name => {
    state.pessoa.escopoCondominios = null;
    const result: any = await appRouter.createCaller(contexto()).relatorios[name]({ condominioId: 8 });
    const rows = result.rows ?? result.acordos;
    if (name !== "recuperacao") expect(rows).toHaveLength(1);
  });
  it.each(["advogado", "colaborador"])("%s global sem principal inclui futuros ativos, não inativos", async role => {
    state.pessoa.role = role;
    const caller = appRouter.createCaller(contexto());
    expect((await caller.relatorios.extrato({})).totais.totalCobrado).toBe(300);
    state.ativos.push(3); state.dados.push(fixture(33, 3, 300));
    expect((await caller.relatorios.extrato({})).totais.totalCobrado).toBe(600);
  });
  it.each(["cobranca", "inadimplencia", "extrato"] as const)("%s valida devedor por ID e consistência do filtro", async name => {
    state.pessoa.escopoCondominios = "selecionados";
    const caller = appRouter.createCaller(contexto());
    await expect(caller.relatorios[name]({ devedorId: 22 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(reportQueries()).toHaveLength(0);
    state.pessoa.escopoCondominios = "todos";
    await expect(caller.relatorios[name]({ devedorId: 22, condominioId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(reportQueries()).toHaveLength(0);
    const result: any = await caller.relatorios[name]({ devedorId: 11, condominioId: 1 });
    expect(result.rows).toHaveLength(1);
  });
  it("sessão antiga perde alcance na próxima chamada, zero carteira falha fechado", async () => {
    const caller = appRouter.createCaller(contexto({ escopoCondominios: "todos" }));
    expect((await caller.relatorios.extrato({})).totais.totalCobrado).toBe(300);
    state.pessoa.escopoCondominios = "selecionados";
    expect((await caller.relatorios.extrato({})).totais.totalCobrado).toBe(100);
    state.vinculos = [];
    await expect(caller.relatorios.extrato({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each(["sindico", "cobrador"])("%s não herda todos indevido", async role => {
    state.pessoa.role = role;
    await expect(appRouter.createCaller(contexto()).relatorios.extrato({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(reportQueries()).toHaveLength(0);
  });
  it("admin mantém consulta histórica, mas identidade admin inativa é rejeitada", async () => {
    state.pessoa.role = "admin"; state.pessoa.escopoCondominios = null;
    expect((await appRouter.createCaller(contexto()).relatorios.extrato({})).totais.totalCobrado).toBe(1100);
    state.pessoa.isActive = 0;
    await expect(appRouter.createCaller(contexto()).relatorios.extrato({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("listarUnidades aplica IN antes de DISTINCT e preserva NULL", async () => {
    state.pessoa.escopoCondominios = "selecionados";
    state.dados.push(fixture(12, 1, 100, "pendente", "U11"));
    const caller = appRouter.createCaller(contexto());
    expect(await caller.relatorios.listarUnidades({})).toEqual(["U11"]);
    await expect(caller.relatorios.listarUnidades({ condominioId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    state.pessoa.escopoCondominios = null;
    expect(await caller.relatorios.listarUnidades({})).toEqual(["U11", "U22", "U88"]);
  });
  it.each(pdfNames)("%s não consulta nome, renderiza ou armazena fora da carteira", async name => {
    state.pessoa.escopoCondominios = "selecionados";
    await expect(appRouter.createCaller(contexto()).relatorios[name]({ condominioId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(reportQueries()).toHaveLength(0);
    expect(state.queries.some(q => q.fields?.name)).toBe(false);
    for (const fn of [state.pdfAcordos, state.pdfExtrato, state.pdfRecuperacao, state.storage]) expect(fn).not.toHaveBeenCalled();
  });
  it.each(pdfNames)("%s usa dados filtrados e label autorizado, NULL mantém label antigo", async name => {
    state.pessoa.escopoCondominios = "selecionados";
    const caller = appRouter.createCaller(contexto());
    const pdf = name === "gerarPDFAcordos" ? state.pdfAcordos : name === "gerarPDFExtrato" ? state.pdfExtrato : state.pdfRecuperacao;
    await caller.relatorios[name]({});
    expect(pdf.mock.calls[0][0].nomeCondominio).toBe("Condomínios ativos autorizados");
    if (name === "gerarPDFAcordos") expect(pdf.mock.calls[0][0].acordos).toHaveLength(1);
    if (name === "gerarPDFExtrato") expect(pdf.mock.calls[0][0].totais.totalCobrado).toBe(100);
    if (name === "gerarPDFRecuperacao") expect(pdf.mock.calls[0][0].totais.totalEmAberto).toBe(100);
    expect(state.storage).toHaveBeenCalledTimes(1);
    state.pessoa.escopoCondominios = null;
    await caller.relatorios[name]({});
    expect(pdf.mock.calls[1][0].nomeCondominio).toBe("Todos os condomínios");
  });
  it("global profissional não ganha ação administrativa de PDF ou relatório de produtividade", async () => {
    const caller = appRouter.createCaller(contexto());
    await expect(caller.relatorios.gerarPDFCobranca({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.relatorios.relatorioCobranca({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.pdfCobranca).not.toHaveBeenCalled();
  });
});

describe("exportações — explícito ativo e contraste NULL", () => {
  it.each(exports)("%s permite colaborador global sem principal e ID ativo", async name => {
    state.pessoa.role = "colaborador";
    await expect(appRouter.createCaller(contexto()).exportacao[name]({ condominioId: 2 })).resolves.toMatchObject({ success: true });
    const loader = name === "devedores" ? state.loadDevedores : name === "cobrancas" ? state.loadCobrancas : name === "acordos" ? state.loadAcordos : state.loadTentativas;
    expect(loader).toHaveBeenCalledWith(2);
  });
  it.each(exports)("%s recusa estrangeiro/inativo antes dos loaders e export", async name => {
    state.pessoa.escopoCondominios = "selecionados";
    const caller = appRouter.createCaller(contexto());
    await expect(caller.exportacao[name]({ condominioId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    state.pessoa.escopoCondominios = "todos";
    await expect(caller.exportacao[name]({ condominioId: 8 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const fn of [state.loadDevedores, state.loadCobrancas, state.loadAcordos, state.loadTentativas, state.exportDevedores, state.exportCobrancas, state.exportAcordos, state.exportTentativas]) expect(fn).not.toHaveBeenCalled();
  });
  it.each(exports)("%s conserva advogado NULL arbitrário e colaborador NULL principal", async name => {
    state.pessoa.escopoCondominios = null;
    await expect(appRouter.createCaller(contexto()).exportacao[name]({ condominioId: 8 })).resolves.toMatchObject({ success: true });
    state.pessoa.role = "colaborador"; state.pessoa.condominioId = 1;
    await expect(appRouter.createCaller(contexto()).exportacao[name]({ condominioId: 2 })).resolves.toMatchObject({ success: true });
    const loader = name === "devedores" ? state.loadDevedores : name === "cobrancas" ? state.loadCobrancas : name === "acordos" ? state.loadAcordos : state.loadTentativas;
    expect(loader).toHaveBeenLastCalledWith(1);
    state.pessoa.condominioId = null;
    await expect(appRouter.createCaller(contexto()).exportacao[name]({ condominioId: 2 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("exportação sem input resolve contexto ativo e não transforma vazio em global", async () => {
    state.pessoa.role = "colaborador"; state.pessoa.condominioId = 8;
    await appRouter.createCaller(contexto()).exportacao.devedores({});
    expect(state.loadDevedores).toHaveBeenCalledWith(1);
    state.ativos = [];
    await expect(appRouter.createCaller(contexto()).exportacao.devedores({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("vencimentos usa toda carteira ativa explícita sem input e filtro solicitado autorizado", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
    try {
      const caller = appRouter.createCaller(contexto());
      await caller.exportacao.vencimentos({ dias: 7 });
      expect(state.exportVencimentos.mock.calls[0][0].map((row: any) => row.id)).toEqual([11, 22]);
      await caller.exportacao.vencimentos({ dias: 7, condominioId: 2 });
      expect(state.exportVencimentos.mock.calls[1][0].map((row: any) => row.id)).toEqual([22]);
      state.pessoa.escopoCondominios = "selecionados";
      await caller.exportacao.vencimentos({ dias: 7 });
      expect(state.exportVencimentos.mock.calls[2][0].map((row: any) => row.id)).toEqual([11]);
      await expect(caller.exportacao.vencimentos({ dias: 7, condominioId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(state.exportVencimentos).toHaveBeenCalledTimes(3);
    } finally { vi.useRealTimers(); }
  });
  it("vencimentos NULL preserva if truthy antigo inclusive advogado sem input", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
    try {
      state.pessoa.escopoCondominios = null;
      const caller = appRouter.createCaller(contexto());
      await caller.exportacao.vencimentos({ dias: 7 });
      expect(state.exportVencimentos.mock.calls[0][0].map((row: any) => row.id)).toEqual([11, 22, 88]);
      await caller.exportacao.vencimentos({ dias: 7, condominioId: 0 });
      expect(state.exportVencimentos.mock.calls[1][0]).toHaveLength(3);
      state.pessoa.role = "colaborador"; state.pessoa.condominioId = 1;
      await appRouter.createCaller(contexto()).exportacao.vencimentos({ dias: 7, condominioId: 2 });
      expect(state.exportVencimentos.mock.calls[2][0].map((row: any) => row.id)).toEqual([11]);
    } finally { vi.useRealTimers(); }
  });
});

describe("ordem do filtro e identidade", () => {
  it("IN é aplicado no banco antes do LIMIT: volume estrangeiro não consome a janela", async () => {
    state.pessoa.escopoCondominios = "selecionados";
    state.dados = [...Array.from({ length: 2100 }, (_, index) => fixture(1000 + index, 8, 800)), fixture(11, 1, 100)];
    const result = await appRouter.createCaller(contexto()).relatorios.extrato({});
    expect(result.rows).toHaveLength(1);
    expect(result.totais.totalCobrado).toBe(100);
    expect(reportQueries()[0].limit).toBe(2000);
  });
  it.each(["role", "id", "inativo", "excluido"])("identidade %s alterada bloqueia relatórios e exports antes de conteúdo", async motivo => {
    const caller = appRouter.createCaller(contexto());
    if (motivo === "role") state.pessoa.role = "cobrador";
    if (motivo === "id") state.pessoa.id = 902;
    if (motivo === "inativo") state.pessoa.isActive = 0;
    if (motivo === "excluido") state.pessoa.isDeleted = 1;
    await expect(caller.relatorios.extrato({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.exportacao.devedores({ condominioId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(reportQueries()).toHaveLength(0);
    expect(state.loadDevedores).not.toHaveBeenCalled();
    expect(state.exportDevedores).not.toHaveBeenCalled();
  });
  it("PDF com filtro ativo autorizado consulta somente o nome solicitado e mantém URL mockada", async () => {
    const result = await appRouter.createCaller(contexto()).relatorios.gerarPDFExtrato({ condominioId: 2 });
    expect(state.pdfExtrato.mock.calls[0][0]).toMatchObject({ nomeCondominio: "Condomínio sintético 2", totais: { totalCobrado: 200 } });
    expect(result).toEqual({ url: "https://example.invalid/fixture.pdf" });
    expect(state.queries.filter(q => q.fields?.name)).toHaveLength(1);
  });
});

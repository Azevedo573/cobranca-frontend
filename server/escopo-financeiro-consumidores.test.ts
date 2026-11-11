import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import * as schema from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const f = vi.hoisted(() => ({
  db: vi.fn(), storage: vi.fn(), audit: vi.fn(), list: vi.fn(), byDevedor: vi.fn(), calculos: vi.fn(), comParcelas: vi.fn(), emAcordo: vi.fn(), byId: vi.fn(),
  createDevedor: vi.fn(), createCobranca: vi.fn(), updateCobranca: vi.fn(), deleteCobranca: vi.fn(), importar: vi.fn(),
  createAcordo: vi.fn(), createParcelas: vi.fn(), createLinks: vi.fn(), ativos: vi.fn(), updateAcordo: vi.fn(), parcelas: vi.fn(), updateParcela: vi.fn(), historico: vi.fn(), sequencial: vi.fn(), custas: vi.fn(),
  bloquearRecebimento: vi.fn(), receber: vi.fn(), transaction: vi.fn(),
}));
vi.mock("./db", async original => ({ ...await original<typeof import("./db")>(), getDb: f.db }));
vi.mock("./db-cobrancas", async original => ({ ...await original<typeof import("./db-cobrancas")>(), getCobrancasByCondominio: f.list, getCobrancasByDevedor: f.byDevedor, getCobrancasComCalculos: f.calculos, getParcelasAcordoAtivasByDevedor: f.comParcelas, getCobrancasEmAcordoByDevedor: f.emAcordo, getCobrancaById: f.byId, createCobranca: f.createCobranca, updateCobranca: f.updateCobranca, deleteCobranca: f.deleteCobranca, importarCobrancasPlanilha: f.importar }));
vi.mock("./db-devedores", async original => ({ ...await original<typeof import("./db-devedores")>(), createDevedor: f.createDevedor }));
vi.mock("./db-acordos", async original => ({ ...await original<typeof import("./db-acordos")>(), createAcordo: f.createAcordo, createParcelas: f.createParcelas, createAcordoCobrancas: f.createLinks, getAcordosAtivosComParcelas: f.ativos, updateAcordo: f.updateAcordo, getParcelasByAcordo: f.parcelas, updateParcela: f.updateParcela, getHistoricoConsolidacoes: f.historico }));
vi.mock("./db-configuracao-boleto", async original => ({ ...await original<typeof import("./db-configuracao-boleto")>(), getConfiguracaoBoleto: vi.fn(async () => null), incrementarSequencialArquivo: f.sequencial }));
vi.mock("./db-custas", async original => ({ ...await original<typeof import("./db-custas")>(), vincularCustasAoAcordo: f.custas, liberarCustasDoAcordo: f.custas }));
vi.mock("./storage", () => ({ storagePut: f.storage }));
vi.mock("./audit", async original => ({ ...await original<typeof import("./audit")>(), logAudit: f.audit }));
// Este arquivo testa consumidores/permissões; aplicação/rollback real do serviço
// são cobertos por recebimento-acordo e pelos testes integrados do webhook.
vi.mock("./recebimento-acordo", () => ({ bloquearContextoRecebimentoAcordo: f.bloquearRecebimento, aplicarRecebimentoAcordo: f.receber }));
import { appRouter } from "./routers";
import { invalidatePermCache } from "./rbac";

const dialect = new MySqlDialect();
let tables: Record<string, any[]>;
let mutations: any[];
let selects: Array<{ table: string; sql: string; params: unknown[] }>;
const now = new Date("2026-11-12T12:00:00Z");
function context(role = "colaborador", scope: "todos" | "selecionados" | null = "selecionados", principal: number | null = 1): TrpcContext {
  tables.users[0] = { ...tables.users[0], role, escopoCondominios: scope, condominioId: principal };
  return { user: { id: 901, role, condominioId: principal, openId: "synthetic-fin", name: "Pessoa fictícia", createdAt: now, updatedAt: now, lastSignedIn: now } as TrpcContext["user"], req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}
function matches(row: any, statement: string, params: unknown[]) {
  const terms = [...statement.matchAll(/`(\w+)`\.`(\w+)`\s*(=|in|>=|<=|<|>)\s*(\?|\([^)]*\))/gi)];
  return terms.every(m => {
    const index = (statement.slice(0, m.index).match(/\?/g) ?? []).length;
    const value = row[m[1]]?.[m[2]] ?? row[m[2]];
    const expected: any = params[index];
    if (m[3].toLowerCase() === "in") return params.slice(index, index + (m[4].match(/\?/g) ?? []).length).includes(value);
    if (m[3] === "=") return value === expected;
    const comparable = value instanceof Date ? new Date(expected) : expected;
    if (m[3] === ">=") return value >= comparable;
    if (m[3] === "<=") return value <= comparable;
    if (m[3] === "<") return value < comparable;
    return value > comparable;
  }) && (!statement.includes("`acordoId` is null") || row.acordoId == null);
}
function memoryDb() {
  return {
    select(projection?: any) {
      let name: string, condition: any, limit: number | undefined;
      const joins: string[] = [];
      const execute = () => {
        const query = condition ? dialect.sqlToQuery(condition) : { sql: "", params: [] };
        selects.push({ table: name, ...query });
        let rows = (tables[name] ?? []).map(row => ({ ...row }));
        if (name === "userCondominios") rows = rows.map(row => ({ ...row, userCondominios: row, condominios: tables.condominios.find(c => c.id === row.condominioId) }));
        if (name === "parcelasAcordo" && joins.includes("acordos")) rows = rows.map(row => { const acordo = tables.acordos.find(a => a.id === row.acordoId); return { ...row, parcelasAcordo: row, acordos: acordo, devedores: tables.devedores.find(d => d.id === acordo?.devedorId) }; });
        if (name === "acordos" && joins.includes("acordoCobrancas")) rows = rows.flatMap(row => tables.acordoCobrancas.filter(l => l.acordoId === row.id).map(link => ({ ...row, acordos: row, acordoCobrancas: link })));
        rows = rows.filter(row => matches(row, query.sql, query.params));
        if (limit !== undefined) rows = rows.slice(0, limit);
        if (projection) rows = rows.map(row => Object.fromEntries(Object.entries(projection).map(([key, column]: [string, any]) => [key, column?.table ? row[getTableName(column.table)]?.[column.name] ?? row[column.name] : row[key]])));
        return Promise.resolve(rows);
      };
      const q: any = { from(table: any) { name = getTableName(table); return q; }, where(c: any) { condition = c; return q; }, innerJoin(t: any) { joins.push(getTableName(t)); return q; }, leftJoin(t: any) { joins.push(getTableName(t)); return q; }, limit(n: number) { limit = n; return q; }, orderBy() { return q; }, then(resolve: any, reject: any) { return execute().then(resolve, reject); } };
      return q;
    },
    update(table: any) { let data: any; return { set(value: any) { data = value; return { where(condition: any) { mutations.push({ table: getTableName(table), data, condition }); return Promise.resolve([]); } }; } }; },
  };
}
beforeEach(() => {
  vi.clearAllMocks(); invalidatePermCache(901); mutations = []; selects = [];
  tables = {
    users: [{ id: 901, role: "colaborador", condominioId: 1, escopoCondominios: "selecionados", isActive: 1, isDeleted: 0, profileId: 1 }],
    profile_permissions: [], profilePermissions: [],
    condominios: [1, 2, 3].map(id => ({ id, statusCadastro: "ativo" })),
    userCondominios: [1, 2].map(condominioId => ({ userId: 901, condominioId, isActive: 1 })),
    devedores: [1, 2, 3].map(id => ({ id: id * 10, condominioId: id })),
    cobrancas: [1, 2, 3].map(id => ({ id: id * 100, devedorId: id * 10, condominioId: id, amount: 10000, status: "pendente" })),
    acordos: [1, 2, 3].map(id => ({ id: id * 1000, devedorId: id * 10, condominioId: id, acordoOrigemId: null, status: "ativo" })),
    acordoCobrancas: [1, 2, 3].map(id => ({ acordoId: id * 1000, cobrancaId: id * 100 })),
    parcelasAcordo: [1, 2, 3].map(id => ({ id, acordoId: id * 1000, amount: 10000, status: "pendente", dueDate: now })), custasJudiciais: [],
  };
  const permissions = ["devedores", "cobrancas", "acordos"].flatMap(modulo => ["visualizar", "criar", "editar", "excluir", "aprovar", "exportar"].map(acao => ({ profileId: 1, modulo, acao, permitido: 1 })));
  tables[getTableName(schema.profilePermissions)] = permissions;
  f.db.mockResolvedValue(memoryDb());
  for (const mock of [f.list, f.byDevedor, f.calculos, f.comParcelas, f.emAcordo, f.ativos, f.parcelas, f.historico]) mock.mockResolvedValue([]);
  const orm = memoryDb();
  f.transaction.mockImplementation(async run => run(orm));
  f.db.mockResolvedValue({ ...orm, transaction: f.transaction });
  f.bloquearRecebimento.mockImplementation(async (_tx, parcelaId) => {
    const parcela = tables.parcelasAcordo.find(p => p.id === parcelaId);
    const acordo = tables.acordos.find(a => a.id === parcela?.acordoId);
    return { parcela, acordo, parcelas: tables.parcelasAcordo.filter(p => p.acordoId === acordo?.id),
      devedor: tables.devedores.find(d => d.id === acordo?.devedorId),
      origens: tables.acordoCobrancas.filter(v => v.acordoId === acordo?.id).map(vinculo => ({ vinculo, cobranca: tables.cobrancas.find(c => c.id === vinculo.cobrancaId) })) };
  });
  f.receber.mockResolvedValue({ codigo: null, aplicado: true, valorPagoTotal: 10000, statusAcordo: "pago", cobrancasQuitadas: true, cobrancasIds: [100] });
  f.createDevedor.mockResolvedValue({ insertId: 99 }); f.createCobranca.mockResolvedValue({ insertId: 99 }); f.createAcordo.mockResolvedValue({ insertId: 99 });
});
const createInput = () => ({ condominioId: 1, devedorId: 10, cobrancaIds: [100], acordoOrigemId: 1000, totalAmount: 10000, agreedAmount: 10000, installments: 1, firstPaymentDate: now, parcelas: [{ installmentNumber: 1, amount: 10000, dueDate: now, snapshotPrincipal: 10000, snapshotDescricao: "Dívida fictícia" }] });
function noWrites() { expect(mutations).toEqual([]); for (const m of [f.createDevedor, f.createCobranca, f.updateCobranca, f.deleteCobranca, f.importar, f.createAcordo, f.createParcelas, f.createLinks, f.updateAcordo, f.updateParcela, f.sequencial, f.custas, f.storage]) expect(m).not.toHaveBeenCalled(); }

describe("escopo financeiro — consumidores reais com ORM mockado", () => {
  it.each(["colaborador", "advogado"])("%s selecionado usa condomínio explicitamente autorizado, não principal", async role => { await appRouter.createCaller(context(role)).cobrancas.list({ condominioId: 2 }); expect(f.list).toHaveBeenCalledWith(2); });
  it("NULL colaborador mantém ternário histórico por principal", async () => { await appRouter.createCaller(context("colaborador", null)).cobrancas.list({ condominioId: 3 }); expect(f.list).toHaveBeenCalledWith(1); });
  it("NULL advogado mantém seletor histórico", async () => { await appRouter.createCaller(context("advogado", null)).cobrancas.list({ condominioId: 3 }); expect(f.list).toHaveBeenCalledWith(3); });
  it("global sem principal inclui futuro ativo sem vínculo", async () => { tables.condominios.push({ id: 4, statusCadastro: "ativo" }); await appRouter.createCaller(context("advogado", "todos", null)).cobrancas.list({ condominioId: 4 }); expect(f.list).toHaveBeenCalledWith(4); });
  it.each(["selecionados", "todos"] as const)("%s recusa condomínio proibido/inativo antes da consulta", async scope => { tables.condominios[2].statusCadastro = "inativo"; await expect(appRouter.createCaller(context("colaborador", scope)).cobrancas.list({ condominioId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(f.list).not.toHaveBeenCalled(); });
  it("zero carteira nega sem leitura financeira", async () => { tables.userCondominios = []; await expect(appRouter.createCaller(context()).cobrancas.list({ condominioId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(f.list).not.toHaveBeenCalled(); });
  it.each(["getByDevedor", "getComCalculos", "getComAcordos", "getEmAcordo"] as const)("cobranças.%s nega devedor C antes do serviço", async action => { await expect(appRouter.createCaller(context()).cobrancas[action]({ devedorId: 30 })).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(f.byDevedor).not.toHaveBeenCalled(); expect(f.calculos).not.toHaveBeenCalled(); expect(f.comParcelas).not.toHaveBeenCalled(); expect(f.emAcordo).not.toHaveBeenCalled(); });
  it("consulta ID da cobrança nega antes do serviço", async () => { await expect(appRouter.createCaller(context()).cobrancas.getById({ id: 300 })).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(f.byId).not.toHaveBeenCalled(); });
  it("NULL preserva consulta antiga sem guard de devedor", async () => { await appRouter.createCaller(context("colaborador", null)).cobrancas.getByDevedor({ devedorId: 30 }); expect(f.byDevedor).toHaveBeenCalledWith(30); });
  it("createDevedor nega condomínio C antes de write", async () => { await expect(appRouter.createCaller(context()).devedores.create({ condominioId: 3, name: "Fictício", unitNumber: "T" })).rejects.toMatchObject({ code: "FORBIDDEN" }); noWrites(); });
  it.each(["create", "importarPlanilha"] as const)("cobranças.%s impede mistura mesmo em global multiativo", async action => { const caller = appRouter.createCaller(context("colaborador", "todos", null)); await expect(caller.cobrancas[action]({ condominioId: 1, devedorId: 20, amount: 10000, fileBase64: "mock" } as any)).rejects.toMatchObject({ code: "NOT_FOUND" }); noWrites(); });
  it.each(["update", "delete"] as const)("cobranças.%s nega ID externo sem writes", async action => { await expect(appRouter.createCaller(context()).cobrancas[action]({ id: 300 })).rejects.toMatchObject({ code: "NOT_FOUND" }); noWrites(); });
  it.each(["getAtivosComParcelas", "listByDevedor"] as const)("acordos.%s nega devedor externo antes das leituras", async action => { await expect(appRouter.createCaller(context()).acordos[action]({ devedorId: 30 })).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(f.ativos).not.toHaveBeenCalled(); expect(selects.some(q => q.table === "acordos")).toBe(false); });
  it("getByCobranca nega ID externo antes de join", async () => { await expect(appRouter.createCaller(context()).acordos.getByCobranca({ cobrancaId: 300 })).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(selects.some(q => q.table === "acordos")).toBe(false); });
  it.each(["getParcelas", "getHistorico", "gerarRelatorioAdministradora"] as const)("acordos.%s nega antes de parcelas/PDF/storage", async action => { await expect(appRouter.createCaller(context()).acordos[action]({ acordoId: 3000 })).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(f.parcelas).not.toHaveBeenCalled(); expect(f.historico).not.toHaveBeenCalled(); expect(f.storage).not.toHaveBeenCalled(); expect(selects.some(q => q.table === "parcelasAcordo")).toBe(false); });
  it("histórico valida também origem de outro devedor autorizado", async () => { tables.acordos[0].acordoOrigemId = 2000; await expect(appRouter.createCaller(context("advogado", "todos")).acordos.getHistorico({ acordoId: 1000 })).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(f.historico).not.toHaveBeenCalled(); });
  it.each(["devedor", "cobranca", "origem", "ativo", "custa"])("create preflight inteiro recusa %s incoerente antes de cancelamento/sequencial/write", async target => { const input = createInput(); if (target === "devedor") input.devedorId = 20; if (target === "cobranca") input.cobrancaIds = [100, 200]; if (target === "origem") input.acordoOrigemId = 2000; if (target === "ativo") tables.acordos.push({ id: 4000, condominioId: 2, devedorId: 10, status: "ativo" }); if (target === "custa") tables.custasJudiciais.push({ condominioId: 2, devedorId: 10, acordoId: null }); await expect(appRouter.createCaller(context("advogado", "todos", null)).acordos.create(input)).rejects.toMatchObject({ code: "NOT_FOUND" }); noWrites(); expect(f.ativos).not.toHaveBeenCalled(); });
  it("create válido mantém payload/snapshot/estados sem transformar ator em admin", async () => { f.ativos.mockResolvedValue([{ id: 1000 }]); const input = createInput(); await appRouter.createCaller(context("colaborador", "todos", null)).acordos.create(input); expect(f.updateAcordo).toHaveBeenCalledWith(1000, { status: "cancelado" }); expect(f.createParcelas.mock.calls[0][0][0]).toMatchObject({ amount: 10000, snapshotPrincipal: 10000, snapshotDescricao: "Dívida fictícia", canalBancario: null, statusRemessa: "nao_enviado" }); expect(f.updateCobranca).toHaveBeenCalledWith(100, { status: "em_acordo" }); });
  it.each(["updateParcela", "darBaixaParcela", "gerarBoletoPDFParcela"] as const)("%s valida parent antes de writes/storage", async action => { await expect(appRouter.createCaller(context()).acordos[action]({ id: 3, parcelaId: 3 } as any)).rejects.toMatchObject({ code: "NOT_FOUND" }); noWrites(); });
  it.each(["darBaixaParcela", "quebrarAcordo"] as const)("%s valida TODAS cobranças relacionadas antes do primeiro write", async action => { tables.acordoCobrancas.push({ acordoId: 1000, cobrancaId: 200 }); await expect(appRouter.createCaller(context("colaborador", "todos")).acordos[action]({ parcelaId: 1, acordoId: 1000 } as any)).rejects.toMatchObject({ code: "NOT_FOUND" }); noWrites(); });
  it("quebrarAcordo valida custas a liberar antes de qualquer write", async () => { tables.custasJudiciais.push({ acordoId: 1000, condominioId: 2, devedorId: 20 }); await expect(appRouter.createCaller(context("advogado", "todos")).acordos.quebrarAcordo({ acordoId: 1000 })).rejects.toMatchObject({ code: "NOT_FOUND" }); noWrites(); });
  it("updateParcela permitido mantém nominal/data e usa recebimento comum sem promover ator", async () => {
    await appRouter.createCaller(context()).acordos.updateParcela({ id: 2, status: "pago", paymentDate: now });
    expect(f.transaction).toHaveBeenCalledTimes(1);
    expect(f.receber).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ parcela: tables.parcelasAcordo[1] }), expect.objectContaining({ valorPagoCentavos: 10000, dataPagamento: now, condominioId: 2, canal: "manual", ator: { userId: 901, userRole: "colaborador" } }));
    expect(f.updateParcela).not.toHaveBeenCalled();
  });
  it("NULL não permite bypass do recebimento para condomínio sem acesso", async () => {
    await expect(appRouter.createCaller(context("colaborador", null)).acordos.updateParcela({ id: 3, status: "pago" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.receber).not.toHaveBeenCalled();
    noWrites();
  });
  it.each(["getVencimentosProximos", "getParcelasVencidas"] as const)("%s sem filtro usa IN da carteira, não principal", async action => { tables.parcelasAcordo.forEach(p => p.dueDate = new Date("2020-01-01")); await appRouter.createCaller(context()).acordos[action]({}); const query = selects.find(q => q.table === "parcelasAcordo")!; expect(query.sql).toContain("`acordos`.`condominioId` in"); expect(query.params.slice(-2)).toEqual([1, 2]); });
  it("agregado NULL mantém contexto antigo eq principal", async () => { await appRouter.createCaller(context("colaborador", null)).acordos.getParcelasVencidas({}); const query = selects.find(q => q.table === "parcelasAcordo")!; expect(query.sql).toContain("`acordos`.`condominioId` ="); expect(query.params.at(-1)).toBe(1); });
  it("escopo global não concede ação RBAC negada", async () => { tables[getTableName(schema.profilePermissions)].find(p => p.modulo === "acordos" && p.acao === "aprovar").permitido = 0; await expect(appRouter.createCaller(context("advogado", "todos")).acordos.darBaixaParcela({ parcelaId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" }); noWrites(); expect(selects.some(q => q.table === "parcelasAcordo")).toBe(false); });
  it("revogação na identidade fresca impede próxima consulta da sessão antiga", async () => { const caller = appRouter.createCaller(context("advogado", "todos", null)); tables.users[0].escopoCondominios = "selecionados"; tables.userCondominios = [{ userId: 901, condominioId: 1, isActive: 1 }]; await expect(caller.cobrancas.list({ condominioId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(f.list).not.toHaveBeenCalled(); });
  it("agregado restrito devolve A/B e nunca C", async () => {
    tables.parcelasAcordo.forEach(p => p.dueDate = new Date("2020-01-01T12:00:00Z"));
    const result = await appRouter.createCaller(context()).acordos.getParcelasVencidas({});
    expect(result.map(p => p.condominioId)).toEqual([1, 2]);
  });
  it("agregado global devolve futuro ativo e exclui inativo", async () => {
    tables.condominios[1].statusCadastro = "inativo";
    tables.condominios.push({ id: 4, statusCadastro: "ativo" });
    tables.acordos.push({ id: 4000, devedorId: 40, condominioId: 4, status: "ativo" });
    tables.devedores.push({ id: 40, condominioId: 4 });
    tables.parcelasAcordo.push({ id: 4, acordoId: 4000, amount: 10000, status: "pendente" });
    tables.parcelasAcordo.forEach(p => p.dueDate = new Date("2020-01-01T12:00:00Z"));
    const result = await appRouter.createCaller(context("advogado", "todos", null)).acordos.getParcelasVencidas({});
    expect(result.map(p => p.condominioId)).toEqual([1, 3, 4]);
  });
  it("agregado com filtro explícito usa apenas B autorizado", async () => {
    tables.parcelasAcordo.forEach(p => p.dueDate = new Date("2020-01-01T12:00:00Z"));
    const result = await appRouter.createCaller(context()).acordos.getParcelasVencidas({ condominioId: 2 });
    expect(result.map(p => p.condominioId)).toEqual([2]);
  });
  it("baixa autorizada mantém valores/status e quitação das cobranças", async () => {
    const result = await appRouter.createCaller(context()).acordos.darBaixaParcela({ parcelaId: 1, dataPagamento: now });
    expect(result).toEqual({ success: true, valorPagoTotal: 10000, statusAcordo: "pago", cobrancasQuitadas: true });
    expect(f.transaction).toHaveBeenCalledTimes(1);
    expect(f.receber).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ acordo: tables.acordos[0], origens: [{ vinculo: tables.acordoCobrancas[0], cobranca: tables.cobrancas[0] }] }), expect.objectContaining({ valorPagoCentavos: 10000, dataPagamento: now, condominioId: 1, canal: "manual", ator: { userId: 901, userRole: "colaborador" } }));
    expect(f.updateCobranca).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });
  it("quebra autorizada sem pagamento mantém reativação e cancelamento", async () => {
    const result = await appRouter.createCaller(context()).acordos.quebrarAcordo({ acordoId: 1000 });
    expect(result).toMatchObject({ caso: 1, novoStatus: "cancelado", valorJaPago: 0, cobrancasReativadas: 1, parcelasCanceladas: 1 });
    expect(mutations[0]).toMatchObject({ table: "cobrancas", data: { status: "em_cobranca" } });
    expect(mutations[1]).toMatchObject({ table: "parcelasAcordo", data: { status: "cancelado" } });
    expect(f.custas).toHaveBeenCalledWith(1000);
  });
  it("quebra parcial mantém algoritmo de abatimento e status original", async () => {
    tables.parcelasAcordo[0].status = "pago"; tables.parcelasAcordo[0].amount = 3000;
    tables.parcelasAcordo.push({ id: 4, acordoId: 1000, amount: 7000, status: "pendente", dueDate: now });
    const result = await appRouter.createCaller(context()).acordos.quebrarAcordo({ acordoId: 1000 });
    expect(result).toMatchObject({ caso: 2, novoStatus: "inadimplente", valorJaPago: 3000, parcelasCanceladas: 1 });
    expect(mutations[0]).toMatchObject({ table: "cobrancas", data: { status: "em_cobranca", amount: 7000 } });
  });
  it.each(["criar", "editar", "excluir"])("carteira todos não libera ação %s negada nas cobranças", async acao => {
    tables[getTableName(schema.profilePermissions)].find(p => p.modulo === "cobrancas" && p.acao === acao).permitido = 0;
    const caller = appRouter.createCaller(context("colaborador", "todos", null));
    const call = acao === "criar" ? caller.cobrancas.create({ devedorId: 10, condominioId: 1, amount: 10000 }) : acao === "editar" ? caller.cobrancas.update({ id: 100, amount: 10000 }) : caller.cobrancas.delete({ id: 100 });
    await expect(call).rejects.toMatchObject({ code: "FORBIDDEN" }); noWrites();
    expect(selects.some(q => q.table === "cobrancas")).toBe(false);
  });
  it.each(["sindico", "cobrador"])("%s não recebe escopo todos indevido", async role => {
    await expect(appRouter.createCaller(context(role, "todos")).cobrancas.list({ condominioId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.list).not.toHaveBeenCalled();
  });
  it("admin fresco mantém seletor administrativo", async () => {
    await appRouter.createCaller(context("admin", null, null)).cobrancas.list({ condominioId: 3 }); expect(f.list).toHaveBeenCalledWith(3);
  });
  it("ator desativado é negado antes de createDevedor", async () => {
    const caller = appRouter.createCaller(context()); tables.users[0].isActive = 0;
    await expect(caller.devedores.create({ condominioId: 1, name: "Fictício", unitNumber: "T" })).rejects.toMatchObject({ code: "FORBIDDEN" }); noWrites();
  });
  it("NULL createCobranca conserva write histórico sem correção de relação", async () => {
    const input = { condominioId: 1, devedorId: 20, amount: 10000 };
    await appRouter.createCaller(context("colaborador", null)).cobrancas.create(input);
    expect(f.createCobranca).toHaveBeenCalledWith(input);
  });
  it("getByCobranca recusa acordo relacionado de outro devedor/tenant global", async () => {
    tables.acordoCobrancas.push({ acordoId: 2000, cobrancaId: 100 });
    await expect(appRouter.createCaller(context("advogado", "todos", null)).acordos.getByCobranca({ cobrancaId: 100 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(selects.some(q => q.table === "acordos" && q.sql.includes("cobrancaId") && q.sql.includes("status"))).toBe(true);
    noWrites();
  });
  it("getByCobranca permite relação íntegra B", async () => {
    const result = await appRouter.createCaller(context()).acordos.getByCobranca({ cobrancaId: 200 });
    expect(result).toMatchObject({ id: 2000, condominioId: 2, devedorId: 20 });
  });
  it("condominios.list restrito usa carteira A/B ativa", async () => {
    const result = await appRouter.createCaller(context()).condominios.list();
    expect(result.map(c => c.id)).toEqual([1, 2]);
  });
  it("condominios.list global inclui futuro e exclui inativo", async () => {
    tables.condominios[1].statusCadastro = "inativo"; tables.condominios.push({ id: 4, statusCadastro: "ativo" });
    const result = await appRouter.createCaller(context("advogado", "todos", null)).condominios.list();
    expect(result.map(c => c.id)).toEqual([1, 3, 4]);
  });
  it("condominios.list reconfirma admin antes de leitura abrangente", async () => {
    const caller = appRouter.createCaller(context("admin", null, null)); tables.users[0].isActive = 0;
    await expect(caller.condominios.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(selects.some(q => q.table === "condominios")).toBe(false);
  });
});

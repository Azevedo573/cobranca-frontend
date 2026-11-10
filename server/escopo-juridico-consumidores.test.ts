import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  carteira: vi.fn(), assert: vi.fn(), resolve: vi.fn(), vinculos: vi.fn(), scope: vi.fn(),
  ticketList: vi.fn(), ticketAll: vi.fn(), ticketGet: vi.fn(), ticketCreate: vi.fn(), ticketUpdate: vi.fn(),
  mensagens: vi.fn(), mensagemCreate: vi.fn(), assembleias: vi.fn(), assembleiaGet: vi.fn(),
  assembleiaCreate: vi.fn(), assembleiaUpdate: vi.fn(), assembleiaDelete: vi.fn(),
  processoCreate: vi.fn(), processoGet: vi.fn(), prazoGet: vi.fn(), db: vi.fn(),
  queries: [] as { table: string; condition: any }[], datasets: {} as Record<string, any[]>,
}));
vi.mock("./db", async original => ({ ...await original<typeof import("./db")>(), getDb: mocks.db }));
vi.mock("./tenant-guard", async original => ({ ...await original<typeof import("./tenant-guard")>(),
  getCarteiraCondominialAtual: mocks.carteira, assertCondominioAccess: mocks.assert,
  resolveCondominioEfetivo: mocks.resolve, getCondominiosAtivosDoUsuario: mocks.vinculos,
}));
// A permissão funcional é isolada; o teste exercita apenas o consumidor de tenancy.
vi.mock("./rbac", async () => {
  const { protectedProcedure } = await import("./_core/trpc");
  return { requirePermission: () => protectedProcedure };
});
vi.mock("./db-processos", async original => ({ ...await original<typeof import("./db-processos")>(),
  createProcesso: mocks.processoCreate, getProcessoById: mocks.processoGet,
}));
vi.mock("./db-prazos", async original => ({ ...await original<typeof import("./db-prazos")>(), getPrazoById: mocks.prazoGet }));
vi.mock("./db-juridico", () => ({ getTicketsByCondominio: mocks.ticketList, getAllTickets: mocks.ticketAll,
  getTicketById: mocks.ticketGet, createTicket: mocks.ticketCreate, updateTicket: mocks.ticketUpdate,
  getMensagensByTicket: mocks.mensagens, createMensagem: mocks.mensagemCreate }));
vi.mock("./db-demandas", () => ({ getAssembleias: mocks.assembleias, getAssembleiaById: mocks.assembleiaGet,
  createAssembleia: mocks.assembleiaCreate, updateAssembleia: mocks.assembleiaUpdate, deleteAssembleia: mocks.assembleiaDelete }));
vi.mock("./juridico-access", async original => ({ ...await original<typeof import("./juridico-access")>(), getJuridicoScope: mocks.scope }));

import { appRouter } from "./routers";
import { getProcessos, getResumoProcessos } from "./db-processos";
import { getPrazos, getResumoPrazos } from "./db-prazos";
import { listarCondominiosComJuridico } from "./db-juridico-condominio";
import { demandaScopeCondition, resolverScopeJuridico } from "./juridico-access";
import { getTableName } from "drizzle-orm";

const actor = (role = "advogado", condominioId: number | null = null) => ({ id: 10, role, condominioId });
const carteira = (escopo: "todos" | "selecionados" | null = "todos", ids = [1, 2], role = "advogado") => ({ actor: actor(role), escopo, ids });
const ctx = (role = "advogado", condominioId: number | null = null) => ({ user: { ...actor(role, condominioId), name: "Pessoa fictícia" }, req: { headers: {} }, res: {} } as any);
const caller = (role = "advogado", condominioId: number | null = null) => appRouter.createCaller(ctx(role, condominioId));
const dialect = new MySqlDialect();

// ORM fictício: avalia filtros simples em fixtures e registra todos os predicados de SQL.
function matches(row: any, condition: any): boolean {
  if (!condition) return true;
  const query = dialect.sqlToQuery(condition);
  let index = 0;
  let expression = query.sql.replace(/\?/g, () => JSON.stringify(query.params[index++]));
  expression = expression.replace(/`[^`]+`\.`([^`]+)`/g, (_all, column) => `row.${({ statusPrazo: "status", statusProcesso: "status", tipoPrazo: "tipo", tipoProcesso: "tipo" } as Record<string, string>)[column] ?? column}`)
    .replace(/(row\.\w+) in \(([^)]*)\)/gi, (_all, col, values) => `[${values}].includes(${col})`)
    .replace(/(row\.\w+) like ("[^"]*")/gi, (_all, col, value) => `String(${col} ?? "").includes(${JSON.stringify(JSON.parse(value).replace(/%/g, ""))})`)
    .replace(/\band\b/gi, "&&").replace(/\bor\b/gi, "||").replace(/\s=\s/g, " === ");
  return new Function("row", `return (${expression})`)(row);
}
function fakeDb() {
  return { select: (projection?: any) => {
    let tableName = ""; let condition: any;
    const run = () => {
      mocks.queries.push({ table: tableName, condition });
      const rows = (mocks.datasets[tableName] ?? []).filter(row => matches(row, condition));
      if (projection?.total) return [{ total: rows.length }];
      return rows;
    };
    const q: any = { from: (table: any) => { tableName = getTableName(table); return q; },
      where: (c: any) => { condition = c; return q; }, leftJoin: () => q, orderBy: () => q, groupBy: () => q,
      limit: () => q, then: (resolve: any, reject: any) => Promise.resolve().then(run).then(resolve, reject) };
    return q;
  } };
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.queries.length = 0;
  mocks.carteira.mockResolvedValue(carteira());
  mocks.assert.mockImplementation(async (_actor, id) => { const current = await mocks.carteira(); if (!Number.isInteger(id) || !current.ids.includes(id)) throw new TRPCError({ code: "FORBIDDEN" }); });
  mocks.resolve.mockImplementation(async (_actor, id) => {
    const current = await mocks.carteira();
    if (current.escopo === null) return id ?? _actor.condominioId ?? undefined;
    const resolved = id ?? current.ids[0]; await mocks.assert(_actor, resolved); return resolved;
  });
  mocks.vinculos.mockResolvedValue([1]);
  mocks.scope.mockResolvedValue(resolverScopeJuridico(actor(), [1, 2], [], []));
  mocks.ticketList.mockImplementation(async id => [{ id: String(id * 10), condominioId: id }]);
  mocks.ticketAll.mockResolvedValue([{ id: "99", condominioId: 99 }]);
  mocks.ticketGet.mockResolvedValue({ id: 20, condominioId: 2, status: "aberto" });
  mocks.ticketCreate.mockResolvedValue({ id: 40 }); mocks.ticketUpdate.mockResolvedValue({ success: true });
  mocks.mensagens.mockResolvedValue([]); mocks.mensagemCreate.mockResolvedValue({ id: 50 });
  mocks.assembleias.mockImplementation(async input => [{ id: input?.condominioId ?? 99, condominioId: input?.condominioId ?? 99, data: new Date() }]);
  mocks.assembleiaGet.mockResolvedValue({ id: 20, condominioId: 2 });
  mocks.processoCreate.mockImplementation(async input => ({ ...input, id: 30 }));
  mocks.processoGet.mockResolvedValue({ id: 30, condominioId: null }); mocks.prazoGet.mockResolvedValue({ id: 30, condominioId: null });
  mocks.datasets = {
    processosJudiciais: [1, 2, 3].map(id => ({ id, condominioId: id, numeroCNJ: "1234567-89.2026.8.19.0001", status: "ativo", tipo: "civel", faseProcessual: "distribuicao" })),
    prazosJuridicos: [1, 2, 3].map(id => ({ id, condominioId: id, dataLimite: new Date(), status: "pendente" })),
  };
  mocks.db.mockResolvedValue(fakeDb());
});

describe("processos/prazos: filtro interno antes da consulta", () => {
  it.each([getProcessos, getPrazos])("carteira vazia não consulta o ORM", async get => {
    expect(await get({ condominioIds: [] })).toEqual([]); expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each([getProcessos, getPrazos])("IN restringe resultados no ORM, não por pós-filtro", async get => {
    expect((await get({ condominioIds: [1, 2] })).map(p => p.condominioId)).toEqual([1, 2]);
    expect(dialect.sqlToQuery(mocks.queries[0].condition).params).toEqual([1, 2]);
  });
  it("resumos usam somente a carteira e retornam zeros para vazio", async () => {
    expect(await getResumoProcessos(undefined, { condominioIds: [2] })).toMatchObject({ total: 1 });
    expect(await getResumoPrazos(undefined, { condominioIds: [2] })).toMatchObject({ total: 1 });
    expect(await getResumoProcessos(undefined, { condominioIds: [] })).toMatchObject({ total: 0 });
    expect(await getResumoPrazos(undefined, { condominioIds: [] })).toMatchObject({ total: 0 });
  });
  it.each(["todos", "selecionados"] as const)("rotas %s usam carteira sem principal", async mode => {
    mocks.carteira.mockResolvedValue(carteira(mode));
    expect((await caller().processos.listar()).map(p => p.condominioId)).toEqual([1, 2]);
    expect((await caller().prazos.listar()).map(p => p.condominioId)).toEqual([1, 2]);
    expect(await caller().processos.resumo()).toMatchObject({ total: 2 });
    expect(await caller().prazos.resumo()).toMatchObject({ total: 2 });
  });
  it("carteira fresca aplica novo ativo e revogação na chamada seguinte", async () => {
    const session = caller();
    expect((await session.processos.listar()).map(p => p.condominioId)).toEqual([1, 2]);
    mocks.carteira.mockResolvedValue(carteira("todos", [1, 2, 3]));
    expect((await session.processos.listar()).map(p => p.condominioId)).toEqual([1, 2, 3]);
    mocks.carteira.mockResolvedValue(carteira("selecionados", [2]));
    expect((await session.processos.listar()).map(p => p.condominioId)).toEqual([2]);
  });
  it("filtro de condomínio alheio falha antes do ORM", async () => {
    await expect(caller().processos.listar({ condominioId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().prazos.resumo({ condominioId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("NULL usa o contexto único antigo", async () => {
    mocks.carteira.mockResolvedValue(carteira(null));
    expect((await caller("advogado", 2).processos.listar()).map(p => p.condominioId)).toEqual([2]);
    expect((await caller("advogado", 2).prazos.listar()).map(p => p.condominioId)).toEqual([2]);
  });
  it("CNJ não localiza registro alheio e cria com contexto real", async () => {
    mocks.datasets.processosJudiciais = [{ id: 99, condominioId: 3, numeroCNJ: "1234567-89.2026.8.19.0001" }];
    const result = await caller().processos.criarOuLocalizarPorCNJ({ numeroCNJ: "1234567-89.2026.8.19.0001", tribunal: "TJRJ" });
    expect(result.criado).toBe(true); expect(mocks.processoCreate).toHaveBeenCalledWith(expect.objectContaining({ condominioId: 1 }));
  });
  it("CNJ autorizado localiza sem criar; contexto inexistente nunca cria NULL/zero", async () => {
    const input = { numeroCNJ: "1234567-89.2026.8.19.0001", tribunal: "TJRJ" };
    expect(await caller().processos.criarOuLocalizarPorCNJ(input)).toMatchObject({ criado: false, processo: { condominioId: 1 } });
    expect(mocks.processoCreate).not.toHaveBeenCalled();
    mocks.datasets.processosJudiciais = []; mocks.resolve.mockResolvedValueOnce(undefined);
    await expect(caller().processos.criarOuLocalizarPorCNJ(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.processoCreate).not.toHaveBeenCalled();
  });
  it("CNJ vazio nega antes de busca/criação; NULL mantém criação sem condomínio", async () => {
    mocks.carteira.mockResolvedValue(carteira("todos", []));
    await expect(caller().processos.criarOuLocalizarPorCNJ({ numeroCNJ: "9999999-89.2026.8.19.0001", tribunal: "TJRJ" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.processoCreate).not.toHaveBeenCalled();
    mocks.carteira.mockResolvedValue(carteira(null)); mocks.datasets.processosJudiciais = [];
    await caller().processos.criarOuLocalizarPorCNJ({ numeroCNJ: "9999999-89.2026.8.19.0001", tribunal: "TJRJ" });
    expect(mocks.processoCreate.mock.calls[0][0]).not.toHaveProperty("condominioId");
  });
  it.each(["processos", "prazos"] as const)("objeto %s sem condomínio continua admin-only", async route => {
    await expect(caller()[route].getById({ id: 30 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("tickets: carteira não altera o perfil", () => {
  it("listagem usa IDs permitidos e aceita filtro validado", async () => {
    expect((await caller().juridico.listTickets({})).map(t => t.condominioId)).toEqual([1, 2]);
    expect(mocks.ticketAll).not.toHaveBeenCalled(); mocks.ticketList.mockClear();
    expect((await caller().juridico.listTickets({ condominioId: 2 })).map(t => t.condominioId)).toEqual([2]);
    expect(mocks.ticketList).toHaveBeenCalledTimes(1);
    await expect(caller().juridico.listTickets({ condominioId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("carteira vazia retorna vazio sem buscar todos", async () => {
    mocks.carteira.mockResolvedValue(carteira("selecionados", []));
    expect(await caller().juridico.listTickets({})).toEqual([]); expect(mocks.ticketList).not.toHaveBeenCalled(); expect(mocks.ticketAll).not.toHaveBeenCalled();
  });
  it("NULL ignora input e mantém principal antigo; admin mantém todos", async () => {
    mocks.carteira.mockResolvedValue(carteira(null));
    expect((await caller("advogado", 1).juridico.listTickets({ condominioId: 3 })).map(t => t.condominioId)).toEqual([1]);
    expect((await caller("admin").juridico.listTickets({ condominioId: 3 })).map(t => t.condominioId)).toEqual([99]);
  });
  it.each([
    ["getTicket", { id: 20 }], ["updateTicket", { id: 20, prioridade: "alta" }],
    ["getMensagens", { ticketId: 20 }], ["sendMensagem", { ticketId: 20, conteudo: "Texto" }],
  ])("nega condomínio do ticket atual antes de conteúdo/escrita em %s", async (route, input) => {
    mocks.ticketGet.mockResolvedValue({ id: 20, condominioId: 3, status: "aberto" });
    await expect((caller().juridico as any)[route](input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.mensagens).not.toHaveBeenCalled(); expect(mocks.ticketUpdate).not.toHaveBeenCalled(); expect(mocks.mensagemCreate).not.toHaveBeenCalled();
  });
  it("global colaborador responde como cliente, sem status automático administrativo", async () => {
    mocks.carteira.mockResolvedValue(carteira("todos", [1, 2], "colaborador"));
    await caller("colaborador").juridico.sendMensagem({ ticketId: 20, conteudo: "Texto fictício" });
    expect(mocks.mensagemCreate).toHaveBeenCalledWith(expect.objectContaining({ tipoAutor: "cliente" }));
    expect(mocks.ticketUpdate).not.toHaveBeenCalled();
  });
  it("criação explícita recebe contexto ativo e nunca zero; legado ignora input", async () => {
    const input = { titulo: "Título", descricao: "Descrição fictícia", categoria: "outro" as const, prioridade: "baixa" as const, condominioId: 2 };
    await caller().juridico.createTicket(input);
    expect(mocks.ticketCreate).toHaveBeenLastCalledWith(expect.objectContaining({ condominioId: 2 }));
    mocks.carteira.mockResolvedValue(carteira("todos", []));
    await expect(caller().juridico.createTicket(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    mocks.carteira.mockResolvedValue(carteira(null));
    await caller("advogado", 1).juridico.createTicket(input);
    expect(mocks.ticketCreate).toHaveBeenLastCalledWith(expect.objectContaining({ condominioId: 1 }));
  });
});

describe("assembleias: apenas novos escopos recebem guardas", () => {
  it("lista a carteira e não consulta em vazio", async () => {
    expect((await caller().juridicoDemandas.listarAssembleias()).map(a => a.condominioId)).toEqual([1, 2]);
    mocks.assembleias.mockClear(); mocks.carteira.mockResolvedValue(carteira("todos", []));
    expect(await caller().juridicoDemandas.listarAssembleias()).toEqual([]); expect(mocks.assembleias).not.toHaveBeenCalled();
  });
  it.each([["getAssembleiaById", { id: 20 }], ["updateAssembleia", { id: 20, ata: "Texto" }], ["deleteAssembleia", { id: 20 }]])("nega ID alheio em %s sem escrita", async (route, input) => {
    mocks.assembleiaGet.mockResolvedValue({ id: 20, condominioId: 3 });
    await expect((caller().juridicoDemandas as any)[route](input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.assembleiaUpdate).not.toHaveBeenCalled(); expect(mocks.assembleiaDelete).not.toHaveBeenCalled();
  });
  it("impede remover condomínio ou mudar para alheio", async () => {
    await expect(caller().juridicoDemandas.updateAssembleia({ id: 20, condominioId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().juridicoDemandas.updateAssembleia({ id: 20, condominioId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.assembleiaUpdate).not.toHaveBeenCalled();
  });
  it("criação sem input usa contexto real e NULL legado preserva bypass", async () => {
    const input = { tipo: "ordinaria" as const, data: "2026-11-10", hora: "10:00" };
    await caller().juridicoDemandas.createAssembleia(input);
    expect(mocks.assembleiaCreate).toHaveBeenLastCalledWith(expect.objectContaining({ condominioId: 1 }));
    mocks.carteira.mockResolvedValue(carteira(null)); mocks.assembleiaGet.mockResolvedValue({ id: 20, condominioId: 3 });
    expect(await caller().juridicoDemandas.getAssembleiaById({ id: 20 })).toMatchObject({ condominioId: 3 });
    await caller().juridicoDemandas.updateAssembleia({ id: 20, condominioId: null });
    expect(mocks.assembleiaUpdate).toHaveBeenCalledWith(20, expect.objectContaining({ condominioId: null }));
  });
});

describe("métricas: carteira não permite contar demandas alheias", () => {
  it("resumo e movimentações negam condomínio solicitado alheio antes de queries", async () => {
    await expect(caller().juridicoCondominios.resumo({ condominioId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().juridicoCondominios.movimentacoesRecentes({ condominioId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("carteira vazia não consulta indicadores", async () => {
    expect(await listarCondominiosComJuridico({ condominioIds: [] })).toEqual([]); expect(mocks.db).not.toHaveBeenCalled();
  });
  it("cada consulta agregada recebe IN e condição pessoal nas demandas", async () => {
    mocks.datasets = {}; await listarCondominiosComJuridico({ condominioIds: [1, 2] }, sql`1 = 0`);
    expect(mocks.queries).toHaveLength(5);
    for (const q of mocks.queries) expect(dialect.sqlToQuery(q.condition).params).toEqual(expect.arrayContaining([1, 2]));
    const demandQuery = mocks.queries.find(q => q.table === "demandas")!;
    expect(matches({ condominioId: 1 }, demandQuery.condition)).toBe(false);
  });
  it("global sem gestão mantém predicado pessoal e nunca vira administrador", async () => {
    const scope = resolverScopeJuridico(actor(), [1, 2], [], []);
    expect(scope).toMatchObject({ admin: false, canManage: false, gestorEquipeIds: [] });
    const q = dialect.sqlToQuery(demandaScopeCondition(scope, true));
    expect(q.params).toContain(10); expect(q.sql).toContain("responsavelId"); expect(q.sql).toContain("criadoPorId");
  });
});

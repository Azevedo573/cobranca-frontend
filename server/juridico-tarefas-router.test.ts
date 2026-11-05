import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, locks: [] as string[], writes: [] as string[],
  denied: false, noProfile: false, freshChanges: false, accessCalls: 0, failEvents: false, casFail: false }));
vi.mock("drizzle-orm", async original => {
  const actual = await original<typeof import("drizzle-orm")>();
  return { ...actual,
    eq: (col: any, value: any) => ({ op: "eq", col, value }),
    ne: (col: any, value: any) => ({ op: "ne", col, value }),
    inArray: (col: any, value: any) => ({ op: "in", col, value }),
    and: (...parts: any[]) => ({ op: "and", parts: parts.filter(Boolean) }),
    or: (...parts: any[]) => ({ op: "or", parts: parts.filter(Boolean) }),
    sql: (strings: TemplateStringsArray, ...values: any[]) => ({ op: "sql", strings: strings.join(""), values }),
    asc: (col: any) => col, desc: (col: any) => col,
  };
});
vi.mock("./db", () => ({ getDb: async () => fakeDb }));
vi.mock("./juridico-access", () => ({
  getJuridicoScope: async (actor: any) => scope(actor),
  assertTarefaAccess: async (actor: any, taskId: number) => {
    const s = scope(actor); const tarefa = state.tables.tarefasDemanda.find(t => t.id === taskId);
    const demanda = tarefa && state.tables.demandas.find(d => d.id === tarefa.demandaId);
    const gerencia = !!demanda && managed(s, demanda);
    if (state.denied || !tarefa || !demanda || (!s.admin && !s.condominioIds.includes(demanda.condominioId)) || (!gerencia && tarefa.responsavelId !== actor.id))
      throw new TRPCError({ code: "NOT_FOUND" });
    state.accessCalls++;
    const output = { tarefa: { ...tarefa }, demanda: { ...demanda }, scope: s, gerencia };
    if (state.freshChanges && state.accessCalls > 1) output.demanda.equipeId = 999;
    return output;
  },
  assertDemandaAccess: async (actor: any, demandaId: number, _acao: any, context: boolean) => {
    const s = scope(actor); const demanda = state.tables.demandas.find(d => d.id === demandaId);
    if (!demanda || state.denied || (!s.admin && !s.condominioIds.includes(demanda.condominioId)) ||
      !(managed(s, demanda) || demanda.responsavelId === actor.id || (context && state.tables.tarefasDemanda.some(t => t.demandaId === demandaId && t.responsavelId === actor.id))))
      throw new TRPCError({ code: "NOT_FOUND" });
    return { demanda: { ...demanda }, scope: s, gerencia: managed(s, demanda), acessoCompleto: managed(s, demanda) };
  },
  assertResponsavelElegivel: async (_actor: any, demanda: any, destino: number) => {
    if (![10, 11, 20].includes(destino) || demanda.equipeId !== 7) throw new TRPCError({ code: "BAD_REQUEST", message: "Destino não elegível" });
    return { id: destino, name: "Nome servidor" };
  },
  tarefaScopeCondition: (s: any, somenteMinhas = false) => ({ op: "scope", scope: s, somenteMinhas }),
}));

import { getTableName } from "drizzle-orm";
import { tarefasDemandaRouter } from "./routers/tarefas-demanda";
import { tarefasDemanda, demandas, users } from "../drizzle/schema";

function scope(actor: any) {
  if (state.noProfile) throw new TRPCError({ code: "FORBIDDEN", message: "Perfil jurídico não configurado" });
  const admin = actor.role === "admin";
  const manager = actor.id === 20;
  return { actor, admin, condominioIds: [1], equipeIds: [7], gestorEquipeIds: manager ? [7] : [],
    canManage: manager || admin, canCreate: manager || admin, canEdit: manager || admin, canApprove: manager || admin };
}
function managed(s: any, demanda: any) { return s.admin || (s.canManage && s.gestorEquipeIds.includes(demanda.equipeId)); }
function field(row: any, col: any) {
  const name = col?.name;
  if (["equipeId", "condominioId"].includes(name) && row.demandaId !== undefined) {
    return state.tables.demandas.find(d => d.id === row.demandaId)?.[name];
  }
  return row[name === "statusTarefa" ? "status" : name === "prioridadeTarefa" ? "prioridade" : name];
}
function matches(row: any, condition: any): boolean {
  if (!condition) return true;
  if (row.tarefaId !== undefined && condition.op === "scope") {
    return matches(state.tables.tarefasDemanda.find(t => t.id === row.tarefaId) ?? {}, condition);
  }
  if (condition.op === "and") return condition.parts.every((c: any) => matches(row, c));
  if (condition.op === "or") return condition.parts.some((c: any) => matches(row, c));
  if (condition.op === "eq") return field(row, condition.col) === condition.value;
  if (condition.op === "ne") return field(row, condition.col) !== condition.value;
  if (condition.op === "in") return condition.value.includes(field(row, condition.col));
  if (condition.op === "scope") {
    const d = state.tables.demandas.find(d => d.id === row.demandaId);
    return !!d && (condition.scope.admin || condition.scope.condominioIds.includes(d.condominioId)) &&
      (condition.somenteMinhas ? row.responsavelId === condition.scope.actor.id : managed(condition.scope, d) || row.responsavelId === condition.scope.actor.id);
  }
  if (condition.op === "sql") return condition.strings.trim() !== "1 = 0";
  return true;
}
const fakeDb: any = {
  select(selection?: any) {
    let tableName = ""; let condition: any; let limit = Infinity; let offset = 0; let grouped = false;
    const builder: any = {
      from(table: any) { tableName = getTableName(table); return builder; },
      where(c: any) { condition = c; return builder; }, orderBy() { return builder; },
      innerJoin() { return builder; }, leftJoin() { return builder; },
      groupBy() { grouped = true; return builder; }, limit(n: number) { limit = n; return builder; },
      offset(n: number) { offset = n; return builder; },
      for() { state.locks.push(tableName); return builder; },
      then(resolve: any, reject: any) {
        try {
          let rows = (state.tables[tableName] ?? []).map(r => {
            if (tableName === "users" && selection?.user) {
              const membro = state.tables.juridicoEquipeMembros.find(m => m.userId === r.id);
              return { ...r, equipeId: membro?.equipeId, gestor: membro?.gestor };
            }
            return r;
          }).filter(r => matches(r, condition));
          if (selection?.total) {
            const aggregate = (data: any[]) => ({ total: data.length,
              concluidas: data.filter(r => r.status === "concluida").length,
              emRevisao: data.filter(r => r.status === "em_revisao").length,
              bloqueadas: data.filter(r => r.bloqueada && r.status !== "concluida").length });
            rows = grouped ? Array.from(new Set(rows.map(r => r.demandaId))).map(demandaId => ({ demandaId, ...aggregate(rows.filter(r => r.demandaId === demandaId)) })) : [aggregate(rows)];
          } else if (selection?.user) rows = rows.map(user => ({ user }));
          return resolve(rows.slice(offset, offset + limit));
        } catch (e) { return reject(e); }
      },
    };
    return builder;
  },
  insert(table: any) { return { async values(value: any) {
    const name = getTableName(table); if (state.failEvents && name === "tarefaEventos") throw new Error("Falha evento");
    state.writes.push(name); const rows = Array.isArray(value) ? value : [value];
    const data = state.tables[name] ??= []; let insertId = data.length + 1;
    for (const r of rows) data.push({ id: insertId++, ...r });
    return [{ insertId: insertId - rows.length }];
  } }; },
  update(table: any) { return { set(patch: any) { return { async where(c: any) {
    const name = getTableName(table); if (state.casFail && name === "tarefasDemanda") return [{ affectedRows: 0 }];
    state.writes.push(name); let affectedRows = 0;
    for (const row of state.tables[name] ?? []) if (matches(row, c)) { Object.assign(row, patch); affectedRows++; }
    return [{ affectedRows }];
  } }; } }; },
  async transaction(run: any) {
    const before = structuredClone(state.tables);
    try { return await run(fakeDb); } catch (error) { state.tables = before; throw error; }
  },
};
const caller = (id = 10, role = "advogado") => tarefasDemandaRouter.createCaller({ user: { id, role, name: "Nome forjado sessão", email: "sessao@test", condominioId: 1 } } as any);

beforeEach(() => {
  state.tables = { tarefasDemanda: [{ id: 1, demandaId: 8, titulo: "Parecer", status: "pendente", responsavelId: 10,
    responsavelNome: "Executor", prioridade: "media", exigeRevisao: 0, bloqueada: 0, entrega: null, versao: 1, criadoPorId: 11 }],
    demandas: [{ id: 8, equipeId: 7, condominioId: 1, numero: "#8", assunto: "Caso", responsavelId: 20 }],
    users: [{ id: 10, name: "Executor real", email: "exec@test", isActive: 1, isDeleted: 0, role: "advogado" },
      { id: 20, name: "Gestora real", isActive: 1, isDeleted: 0, role: "advogado" }],
    tarefaComentarios: [{ id: 4, tarefaId: 1, texto: "Comentário", autorId: 11, oculto: 0 }],
    tarefaEventos: [], tarefaNotificacoes: [], juridicoEquipeMembros: [] };
  state.locks = []; state.writes = []; state.denied = state.noProfile = state.freshChanges = state.failEvents = state.casFail = false; state.accessCalls = 0;
});

describe("caller real de tarefas", () => {
  it("executor inicia com lock demanda→tarefa, versão e evento atômico", async () => {
    expect(await caller().comando({ id: 1, acao: "iniciar", versao: 1 })).toEqual({ ok: true, versao: 2 });
    expect(state.locks.slice(0, 2)).toEqual([getTableName(demandas), getTableName(tarefasDemanda)]);
    expect(state.tables.tarefasDemanda[0].status).toBe("em_andamento");
    expect(state.tables.tarefaEventos[0]).toMatchObject({ tipo: "iniciar", usuarioId: 10, usuarioNome: "Executor real" });
  });
  it("executor não muda responsável, prioridade, prazo ou revisão", async () => {
    for (const patch of [{ responsavelId: 11 }, { prioridade: "alta" }, { prazo: "2026-11-07" }, { exigeRevisao: true }])
      await expect(caller().update({ id: 1, ...patch } as any)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.tables.tarefaEventos).toHaveLength(0);
  });
  it("outro executor e antigo criador não alteram, comentam nem leem contadores", async () => {
    await expect(caller(11).comando({ id: 1, acao: "iniciar" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller(11).getComentarios({ tarefaId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller(11).addComentario({ tarefaId: 1, texto: "Indevido" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller(11).deleteComentario({ id: 4 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller(11).contadores({ demandaId: 8 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await caller(11).contadoresLote({ demandaIds: [8] })).toEqual([]);
    expect(state.writes).toHaveLength(0);
  });
  it("sem perfil falha inclusive em listas e lote vazio", async () => {
    state.noProfile = true;
    await expect(caller().minhasTarefas()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().contadoresLote({ demandaIds: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().getById({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("gestora de outra equipe não ganha direitos por carteira em comum", async () => {
    state.tables.demandas[0].equipeId = 9;
    await expect(caller(20).update({ id: 1, responsavelId: 11 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller(20).getComentarios({ tarefaId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("versão antiga e CAS perdido impedem gravação", async () => {
    await expect(caller().comando({ id: 1, acao: "iniciar", versao: 2 })).rejects.toMatchObject({ code: "CONFLICT" });
    state.casFail = true;
    await expect(caller().comando({ id: 1, acao: "iniciar", versao: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.tables.tarefasDemanda[0].status).toBe("pendente"); expect(state.tables.tarefaEventos).toHaveLength(0);
  });
  it("contexto retornado pela guarda deve coincidir com demanda travada", async () => {
    state.freshChanges = true;
    await expect(caller().comando({ id: 1, acao: "iniciar" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.writes).toHaveLength(0);
  });
  it("falha no evento faz rollback do estado", async () => {
    state.failEvents = true;
    await expect(caller().comando({ id: 1, acao: "iniciar" })).rejects.toThrow("Falha evento");
    expect(state.tables.tarefasDemanda[0]).toMatchObject({ status: "pendente", versao: 1 });
  });
  it("gestora reatribui somente alvo elegível e nome deriva do banco", async () => {
    expect(await caller(20).update({ id: 1, responsavelId: 20, responsavelNome: "FORJADO", versao: 1 })).toEqual({ ok: true, versao: 2 });
    expect(state.tables.tarefasDemanda[0].responsavelNome).toBe("Gestora real");
    expect(state.tables.tarefaNotificacoes[0]).toMatchObject({ tarefaId: 1, userId: 20, tipo: "atribuicao" });
    await expect(caller().getById({ id: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller(20).update({ id: 1, responsavelId: 999 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("admin não autoaprova via comando nem update/moverStatus", async () => {
    Object.assign(state.tables.tarefasDemanda[0], { responsavelId: 20, status: "em_revisao", exigeRevisao: 1, entrega: "Entrega" });
    const admin = caller(20, "admin");
    await expect(admin.comando({ id: 1, acao: "aprovar" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.update({ id: 1, status: "concluida" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.moverStatus({ id: 1, status: "concluida" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("delete cancela com motivo e preserva comentários", async () => {
    await expect(caller(20).delete({ id: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await caller(20).delete({ id: 1, texto: "Duplicada" })).toEqual({ ok: true, versao: 2 });
    expect(state.tables.tarefasDemanda[0].status).toBe("cancelada"); expect(state.tables.tarefaComentarios).toHaveLength(1);
  });
  it("comentário usa identidade real e ocultação é auditável", async () => {
    const result = await caller().addComentario({ tarefaId: 1, texto: " Texto ", versao: 1 });
    expect(result).toMatchObject({ versao: 2 });
    const comentario = state.tables.tarefaComentarios.at(-1);
    expect(comentario).toMatchObject({ texto: "Texto", autorId: 10, autorNome: "Executor real" });
    expect(await caller().deleteComentario({ id: comentario.id, versao: 2 })).toEqual({ ok: true, versao: 3 });
    expect(state.tables.tarefaComentarios.at(-1).oculto).toBe(1);
    expect(state.tables.tarefaEventos.at(-1).tipo).toBe("comentario_oculto");
  });
  it("API central preserva array de minhas tarefas e pagina equipe", async () => {
    expect(await caller().minhasTarefas()).toHaveLength(1);
    expect(await caller(20).listarEquipe({ limit: 1, offset: 0 })).toMatchObject({ total: 1, limit: 1, offset: 0 });
    await expect(caller().listarEquipe()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(20).listarEquipe({ limit: 201 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("criação delegada gera evento e aviso juntos sem confiar no nome fornecido", async () => {
    const result = await caller(20).create({ demandaId: 8, titulo: " Nova atividade ", responsavelId: 10,
      responsavelNome: "FORJADO", exigeRevisao: true });
    expect(result).toEqual({ id: 2 });
    expect(state.tables.tarefasDemanda.at(-1)).toMatchObject({ titulo: "Nova atividade", responsavelId: 10,
      responsavelNome: "Executor real", criadoPorNome: "Gestora real", exigeRevisao: 1, versao: 1 });
    expect(state.tables.tarefaEventos.at(-1)).toMatchObject({ tarefaId: 2, tipo: "criacao", usuarioNome: "Gestora real" });
    expect(state.tables.tarefaNotificacoes.at(-1)).toMatchObject({ tarefaId: 2, userId: 10, tipo: "atribuicao" });
    expect(state.locks[0]).toBe("demandas");
  });
  it("falha em evento da criação não deixa tarefa nem notificação órfãs", async () => {
    state.failEvents = true;
    await expect(caller(20).create({ demandaId: 8, titulo: "Tarefa", responsavelId: 10 })).rejects.toThrow("Falha evento");
    expect(state.tables.tarefasDemanda).toHaveLength(1);
    expect(state.tables.tarefaNotificacoes).toHaveLength(0);
  });
  it("entrega e devolução registram aviso interno e não alteram a demanda", async () => {
    state.tables.juridicoEquipeMembros = [{ id: 1, equipeId: 7, userId: 20, gestor: 1, isActive: 1 }];
    Object.assign(state.tables.tarefasDemanda[0], { status: "em_andamento", exigeRevisao: 1 });
    const before = structuredClone(state.tables.demandas);
    expect(await caller().comando({ id: 1, acao: "entregar", texto: "Minuta completa", versao: 1 })).toMatchObject({ versao: 2 });
    expect(state.tables.tarefasDemanda[0]).toMatchObject({ status: "em_revisao", entrega: "Minuta completa" });
    expect(state.tables.tarefaNotificacoes.at(-1)).toMatchObject({ userId: 20, tipo: "entrega" });
    expect(await caller(20).comando({ id: 1, acao: "devolver", texto: "Ajustar fundamento", versao: 2 })).toMatchObject({ versao: 3 });
    expect(state.tables.tarefaNotificacoes.at(-1)).toMatchObject({ userId: 10, tipo: "devolucao" });
    expect(state.tables.demandas).toEqual(before);
  });
  it("destinatário antigo perde notificação e leitura após reatribuição", async () => {
    state.tables.tarefaNotificacoes = [{ id: 1, tarefaId: 1, userId: 10, tipo: "atribuicao", lida: 0 }];
    expect(await caller().notificacoes()).toMatchObject({ total: 1 });
    expect(await caller().marcarNotificacaoLida({ id: 1 })).toEqual({ ok: true });
    expect(state.tables.tarefaNotificacoes[0].lida).toBe(1);
    await caller(20).update({ id: 1, responsavelId: 20 });
    expect(await caller().notificacoes()).toMatchObject({ total: 0, notificacoes: [] });
    await expect(caller().marcarNotificacaoLida({ id: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller(11).marcarNotificacaoLida({ id: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("histórico só pode ser consultado por acesso atual e pagina corretamente", async () => {
    await caller().comando({ id: 1, acao: "iniciar" });
    expect(await caller().getHistorico({ tarefaId: 1, limit: 1 })).toMatchObject({ total: 1, limit: 1, offset: 0 });
    await expect(caller(11).getHistorico({ tarefaId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await caller().getById({ id: 1 })).toMatchObject({ canManage: false, canApprove: false,
      demanda: { id: 8, equipeId: 7, acessoCompleto: false } });
  });
  it("data inválida é rejeitada; texto da entrega é obrigatório somente na revisão", async () => {
    await expect(caller(20).create({ demandaId: 8, titulo: "Tarefa", prazo: "invalida" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    Object.assign(state.tables.tarefasDemanda[0], { status: "em_andamento", exigeRevisao: 1 });
    await expect(caller().comando({ id: 1, acao: "entregar" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    state.tables.tarefasDemanda[0].exigeRevisao = 0;
    expect(await caller().moverStatus({ id: 1, status: "concluida" })).toEqual({ ok: true, versao: 2 });
    expect(state.tables.tarefasDemanda[0]).toMatchObject({ status: "concluida", entrega: null, aprovadaEm: null });
  });
});

import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, getTableColumns, gte, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import { condominios, demandas, tarefaEventos, tarefaNotificacoes, tarefasDemanda, type User } from "../drizzle/schema";
import type { TarefaPrazoFiltro, TarefaPrioridade, TarefaStatus } from "../shared/juridico-tarefas";
import { assertDemandaAccess, assertTarefaAccess, getJuridicoScope, tarefaScopeCondition } from "./juridico-access";
import { tarefasDb } from "./juridico-tarefas";

export type TarefaFiltros = {
  status?: TarefaStatus | "todas"; prioridade?: TarefaPrioridade | "todas";
  condominioId?: number; demandaId?: number; responsavelId?: number; prazo?: TarefaPrazoFiltro;
};
export function filtrosTarefa(input: TarefaFiltros, agora = new Date()): SQL[] {
  const conditions: SQL[] = [];
  if (input.status && input.status !== "todas") conditions.push(eq(tarefasDemanda.status, input.status));
  else conditions.push(ne(tarefasDemanda.status, "cancelada"));
  if (input.prioridade && input.prioridade !== "todas") conditions.push(eq(tarefasDemanda.prioridade, input.prioridade));
  if (input.condominioId !== undefined) conditions.push(eq(demandas.condominioId, input.condominioId));
  if (input.demandaId !== undefined) conditions.push(eq(tarefasDemanda.demandaId, input.demandaId));
  if (input.responsavelId !== undefined) conditions.push(eq(tarefasDemanda.responsavelId, input.responsavelId));
  if (input.prazo && input.prazo !== "todas") {
    const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0);
    const fim = new Date(hoje); fim.setDate(fim.getDate() + (input.prazo === "7dias" ? 7 : 1));
    if (input.prazo === "atrasadas") conditions.push(lt(tarefasDemanda.prazo, hoje));
    else conditions.push(gte(tarefasDemanda.prazo, hoje), lt(tarefasDemanda.prazo, fim));
    conditions.push(ne(tarefasDemanda.status, "concluida"), ne(tarefasDemanda.status, "cancelada"));
  }
  return conditions;
}

const centralColumns = {
  ...getTableColumns(tarefasDemanda), demandaNumero: demandas.numero, demandaAssunto: demandas.assunto,
  demandaCondominioId: demandas.condominioId, demandaCondominioNome: condominios.name, demandaEquipeId: demandas.equipeId,
};
export async function consultarCentral(actor: User, input: TarefaFiltros & { limit?: number; offset?: number }, equipe: boolean) {
  const scope = await getJuridicoScope(actor, "visualizar");
  if (equipe && !scope.canManage) throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para visualizar a equipe jurídica." });
  const conditions = [tarefaScopeCondition(scope, !equipe), ...filtrosTarefa(input)];
  if (equipe && !scope.admin) conditions.push(scope.gestorEquipeIds.length ? inArray(demandas.equipeId, scope.gestorEquipeIds) : sql`1 = 0`);
  const where = and(...conditions);
  const db = await tarefasDb();
  const query = db.select(centralColumns).from(tarefasDemanda)
    .innerJoin(demandas, eq(tarefasDemanda.demandaId, demandas.id))
    .leftJoin(condominios, eq(demandas.condominioId, condominios.id)).where(where)
    .orderBy(asc(tarefasDemanda.prazo), desc(tarefasDemanda.createdAt), asc(tarefasDemanda.id));
  if (!equipe) return query;
  return query.limit(input.limit ?? 100).offset(input.offset ?? 0);
}
export async function totalCentral(actor: User, input: TarefaFiltros) {
  const scope = await getJuridicoScope(actor, "visualizar");
  if (!scope.canManage) throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para visualizar a equipe jurídica." });
  const conditions = [tarefaScopeCondition(scope), ...filtrosTarefa(input)];
  if (!scope.admin) conditions.push(scope.gestorEquipeIds.length ? inArray(demandas.equipeId, scope.gestorEquipeIds) : sql`1 = 0`);
  const db = await tarefasDb();
  const [row] = await db.select({ total: sql<number>`count(*)` }).from(tarefasDemanda)
    .innerJoin(demandas, eq(tarefasDemanda.demandaId, demandas.id)).where(and(...conditions));
  return Number(row?.total ?? 0);
}
export async function listarDaDemanda(actor: User, demandaId: number) {
  const access = await assertDemandaAccess(actor, demandaId, "visualizar", true);
  const db = await tarefasDb();
  return db.select(getTableColumns(tarefasDemanda)).from(tarefasDemanda)
    .innerJoin(demandas, eq(tarefasDemanda.demandaId, demandas.id))
    .where(and(eq(tarefasDemanda.demandaId, demandaId), tarefaScopeCondition(access.scope), ne(tarefasDemanda.status, "cancelada")))
    .orderBy(asc(tarefasDemanda.createdAt), asc(tarefasDemanda.id));
}
export async function contarDemandas(actor: User, demandaIds: number[]) {
  const scope = await getJuridicoScope(actor, "visualizar");
  if (!demandaIds.length) return [];
  const db = await tarefasDb();
  const rows = await db.select({ demandaId: tarefasDemanda.demandaId, total: sql<number>`count(*)`,
    concluidas: sql<number>`sum(case when ${tarefasDemanda.status} = 'concluida' then 1 else 0 end)`,
    emRevisao: sql<number>`sum(case when ${tarefasDemanda.status} = 'em_revisao' then 1 else 0 end)`,
    bloqueadas: sql<number>`sum(case when ${tarefasDemanda.bloqueada} = 1 and ${tarefasDemanda.status} <> 'concluida' then 1 else 0 end)`,
  }).from(tarefasDemanda).innerJoin(demandas, eq(tarefasDemanda.demandaId, demandas.id))
    .where(and(inArray(tarefasDemanda.demandaId, demandaIds), tarefaScopeCondition(scope), ne(tarefasDemanda.status, "cancelada")))
    .groupBy(tarefasDemanda.demandaId);
  return rows.map(row => ({ demandaId: row.demandaId, total: Number(row.total), concluidas: Number(row.concluidas),
    pendentes: Number(row.total) - Number(row.concluidas), emRevisao: Number(row.emRevisao), bloqueadas: Number(row.bloqueadas) }));
}
export async function detalheTarefa(actor: User, id: number) {
  const access = await assertTarefaAccess(actor, id, "visualizar");
  const db = await tarefasDb();
  const [condominio] = access.demanda.condominioId == null ? [] : await db.select({ name: condominios.name })
    .from(condominios).where(eq(condominios.id, access.demanda.condominioId)).limit(1);
  return { tarefa: access.tarefa, demanda: { id: access.demanda.id, numero: access.demanda.numero,
    assunto: access.demanda.assunto, condominioId: access.demanda.condominioId, condominioNome: condominio?.name ?? null,
    equipeId: access.demanda.equipeId, acessoCompleto: access.gerencia || access.demanda.responsavelId === access.scope.actor.id ||
      access.demanda.criadoPorId === access.scope.actor.id }, canManage: access.gerencia && access.scope.canManage && access.scope.canEdit,
    canApprove: access.gerencia && access.scope.canManage && access.scope.canApprove && access.tarefa.responsavelId !== access.scope.actor.id };
}
export async function historicoTarefa(actor: User, tarefaId: number, limit: number, offset: number) {
  await assertTarefaAccess(actor, tarefaId, "visualizar");
  const db = await tarefasDb();
  const where = eq(tarefaEventos.tarefaId, tarefaId);
  const eventos = await db.select().from(tarefaEventos).where(where)
    .orderBy(desc(tarefaEventos.createdAt), desc(tarefaEventos.id)).limit(limit).offset(offset);
  const [row] = await db.select({ total: sql<number>`count(*)` }).from(tarefaEventos).where(where);
  return { eventos, total: Number(row?.total ?? 0), limit, offset };
}
export async function consultarNotificacoes(actor: User, input: { somenteNaoLidas: boolean; limit: number; offset: number }) {
  const scope = await getJuridicoScope(actor, "visualizar");
  const db = await tarefasDb();
  const where = and(eq(tarefaNotificacoes.userId, scope.actor.id), tarefaScopeCondition(scope),
    input.somenteNaoLidas ? eq(tarefaNotificacoes.lida, 0) : undefined);
  const notificacoes = await db.select({ ...getTableColumns(tarefaNotificacoes), tarefaTitulo: tarefasDemanda.titulo,
    demandaId: tarefasDemanda.demandaId }).from(tarefaNotificacoes)
    .innerJoin(tarefasDemanda, eq(tarefaNotificacoes.tarefaId, tarefasDemanda.id))
    .innerJoin(demandas, eq(tarefasDemanda.demandaId, demandas.id)).where(where)
    .orderBy(desc(tarefaNotificacoes.createdAt), desc(tarefaNotificacoes.id)).limit(input.limit).offset(input.offset);
  const [row] = await db.select({ total: sql<number>`count(*)` }).from(tarefaNotificacoes)
    .innerJoin(tarefasDemanda, eq(tarefaNotificacoes.tarefaId, tarefasDemanda.id))
    .innerJoin(demandas, eq(tarefasDemanda.demandaId, demandas.id)).where(where);
  return { notificacoes, total: Number(row?.total ?? 0), limit: input.limit, offset: input.offset };
}
export async function lerNotificacao(actor: User, id: number) {
  const scope = await getJuridicoScope(actor, "visualizar");
  const db = await tarefasDb();
  const where = and(eq(tarefaNotificacoes.id, id), eq(tarefaNotificacoes.userId, scope.actor.id));
  const [notificacao] = await db.select().from(tarefaNotificacoes).where(where).limit(1);
  if (!notificacao) throw new TRPCError({ code: "NOT_FOUND", message: "Notificação não encontrada." });
  await assertTarefaAccess(actor, notificacao.tarefaId, "visualizar");
  return db.transaction(async tx => {
    await tx.select({ id: tarefasDemanda.id }).from(tarefasDemanda)
      .where(eq(tarefasDemanda.id, notificacao.tarefaId)).limit(1).for("update");
    await assertTarefaAccess(actor, notificacao.tarefaId, "visualizar");
    await tx.update(tarefaNotificacoes).set({ lida: 1 }).where(where);
    return { ok: true as const };
  });
}

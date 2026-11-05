import { TRPCError } from "@trpc/server";
import { and, eq, inArray, or } from "drizzle-orm";
import { demandas, juridicoEquipeMembros, tarefaEventos, tarefaNotificacoes, tarefasDemanda, users,
  type TarefaDemanda, type User } from "../drizzle/schema";
import { getDb } from "./db";
import { assertDemandaAccess, assertResponsavelElegivel, assertTarefaAccess, getJuridicoScope } from "./juridico-access";
import { validarVersao, type TarefaCapacidades } from "./juridico-tarefas-transicoes";
import type { TenantActor } from "./tenant-guard";

export async function tarefasDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
  return db;
}
export type TarefasTx = Parameters<Parameters<Awaited<ReturnType<typeof tarefasDb>>["transaction"]>[0]>[0];
export type TarefaAccess = Awaited<ReturnType<typeof assertTarefaAccess>>;
export function tarefaCapacidades(access: TarefaAccess): TarefaCapacidades {
  return { actorId: access.scope.actor.id, gerencia: access.gerencia && access.scope.canManage,
    canEdit: access.scope.canEdit, canApprove: access.scope.canApprove,
    canExecute: access.tarefa.responsavelId === access.scope.actor.id };
}
export const nomeUsuario = (actor: Pick<User, "name" | "email">) => (actor.name || actor.email || "Usuário").slice(0, 255);

export async function registrarEvento(tx: TarefasTx, actor: { id: number }, tarefaId: number, tipo: string,
  descricao: string, antes: unknown, depois: unknown) {
  const [identidade] = await tx.select().from(users).where(eq(users.id, actor.id)).limit(1);
  await tx.insert(tarefaEventos).values({ tarefaId, tipo, descricao, usuarioId: actor.id,
    usuarioNome: identidade ? nomeUsuario(identidade) : "Usuário", antesJson: antes == null ? null : JSON.stringify(antes),
    depoisJson: depois == null ? null : JSON.stringify(depois) });
}

export async function notificar(tx: TarefasTx, tarefaId: number, destinatarios: number[], tipo: string) {
  const ids = Array.from(new Set(destinatarios));
  if (ids.length) await tx.insert(tarefaNotificacoes).values(ids.map(userId => ({ tarefaId, userId, tipo, lida: 0 })));
}

/** Notificações não ampliam direitos; candidatos são revalidados por RBAC e carteira. */
export async function revisoresNotificaveis(demanda: { equipeId: number | null; condominioId: number | null }) {
  const db = await tarefasDb();
  const rows = await db.select({ user: users }).from(users)
    .leftJoin(juridicoEquipeMembros, and(eq(juridicoEquipeMembros.userId, users.id),
      eq(juridicoEquipeMembros.isActive, 1), eq(juridicoEquipeMembros.gestor, 1)))
    .where(and(eq(users.isActive, 1), eq(users.isDeleted, 0),
      demanda.equipeId == null ? eq(users.role, "admin") :
        or(eq(users.role, "admin"), eq(juridicoEquipeMembros.equipeId, demanda.equipeId))));
  const ids: number[] = [];
  for (const { user } of rows) {
    try {
      const scope = await getJuridicoScope(user, "aprovar");
      if (scope.canManage && scope.canApprove && (scope.admin ||
        (demanda.condominioId != null && scope.condominioIds.includes(demanda.condominioId) &&
          demanda.equipeId != null && scope.gestorEquipeIds.includes(demanda.equipeId)))) ids.push(scope.actor.id);
    } catch (error) {
      if (!(error instanceof TRPCError) || !["FORBIDDEN", "NOT_FOUND", "UNAUTHORIZED"].includes(error.code)) throw error;
    }
  }
  return Array.from(new Set(ids));
}

/** Lock curto + autorização atual + CAS inclusive para clientes legados sem versão enviada. */
export async function alterarTarefa<T>(actor: User, id: number, versao: number | undefined,
  run: (tx: TarefasTx, tarefa: TarefaDemanda, access: TarefaAccess) => Promise<{
    patch?: Partial<TarefaDemanda>; tipo: string; descricao: string; resultado: T;
    destinatarios?: number[]; notificacaoTipo?: string; eventoAntes?: unknown; eventoDepois?: unknown;
  }>, acao: "editar" | "aprovar" = "editar") {
  const anterior = await assertTarefaAccess(actor, id, acao);
  const db = await tarefasDb();
  return db.transaction(async tx => {
    const [demanda] = await tx.select().from(demandas).where(eq(demandas.id, anterior.tarefa.demandaId)).limit(1).for("update");
    if (!demanda) throw new TRPCError({ code: "NOT_FOUND", message: "Demanda não encontrada." });
    if (demanda.equipeId !== anterior.demanda.equipeId || demanda.condominioId !== anterior.demanda.condominioId) {
      throw new TRPCError({ code: "CONFLICT", message: "A equipe ou a carteira da demanda mudou. Atualize os dados." });
    }
    const [tarefa] = await tx.select().from(tarefasDemanda).where(eq(tarefasDemanda.id, id)).limit(1).for("update");
    if (!tarefa) throw new TRPCError({ code: "NOT_FOUND", message: "Tarefa não encontrada." });
    validarVersao(tarefa.versao, versao ?? anterior.tarefa.versao);
    if (demanda.id !== tarefa.demandaId) throw new TRPCError({ code: "CONFLICT", message: "O contexto da tarefa mudou." });
    // A guarda usa o banco atual e não o cache RBAC; se atribuição/contexto mudou, não confiar no snapshot anterior.
    const access = await assertTarefaAccess(actor, id, acao);
    if (access.tarefa.responsavelId !== tarefa.responsavelId || access.tarefa.demandaId !== tarefa.demandaId ||
      access.tarefa.versao !== tarefa.versao || access.demanda.equipeId !== demanda.equipeId ||
      access.demanda.condominioId !== demanda.condominioId) {
      throw new TRPCError({ code: "CONFLICT", message: "O acesso ou a atribuição da tarefa mudou. Atualize os dados." });
    }
    const change = await run(tx, tarefa, access);
    const novaVersao = tarefa.versao + 1;
    const patch = { ...change.patch, versao: novaVersao, updatedAt: new Date() };
    const [result] = await tx.update(tarefasDemanda).set(patch)
      .where(and(eq(tarefasDemanda.id, id), eq(tarefasDemanda.versao, tarefa.versao)));
    if (result.affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "A tarefa mudou em outra sessão." });
    const depois = { ...tarefa, ...patch };
    await registrarEvento(tx, access.scope.actor, id, change.tipo, change.descricao,
      change.eventoAntes === undefined ? tarefa : change.eventoAntes,
      change.eventoDepois === undefined ? depois : change.eventoDepois);
    if (change.notificacaoTipo) await notificar(tx, id, change.destinatarios ?? [], change.notificacaoTipo);
    return { ...change.resultado, versao: novaVersao };
  });
}

export async function responsavelServidor(actor: TenantActor, demanda: Awaited<ReturnType<typeof assertDemandaAccess>>["demanda"], id: number) {
  await assertResponsavelElegivel(actor, demanda, id);
  const db = await tarefasDb();
  const [user] = await db.select().from(users).where(and(eq(users.id, id), eq(users.isActive, 1), eq(users.isDeleted, 0))).limit(1);
  if (!user) throw new TRPCError({ code: "BAD_REQUEST", message: "Responsável indisponível." });
  return { responsavelId: user.id, responsavelNome: nomeUsuario(user) };
}

export async function criarTarefa(actor: User, input: {
  demandaId: number; titulo: string; descricao?: string; responsavelId?: number;
  prioridade: "baixa" | "media" | "alta"; prazo?: string; exigeRevisao: number;
}) {
  const access = await assertDemandaAccess(actor, input.demandaId, "criar");
  const gerencia = access.gerencia && access.scope.canManage;
  if (gerencia && !access.scope.canCreate) throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão gerencial para criar tarefas." });
  if (!gerencia && (input.responsavelId !== undefined && input.responsavelId !== actor.id || input.exigeRevisao !== 0)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Somente a gestão pode delegar tarefas ou configurar revisão." });
  }
  const responsavelId = input.responsavelId ?? (gerencia ? null : actor.id);
  const responsavel = responsavelId == null ? { responsavelId: null, responsavelNome: null } :
    await responsavelServidor(access.scope.actor, access.demanda, responsavelId);
  const db = await tarefasDb();
  return db.transaction(async tx => {
    const [demanda] = await tx.select().from(demandas).where(eq(demandas.id, input.demandaId)).limit(1).for("update");
    if (!demanda) throw new TRPCError({ code: "NOT_FOUND", message: "Demanda não encontrada." });
    const fresh = await assertDemandaAccess(actor, input.demandaId, "criar");
    if (demanda.equipeId !== access.demanda.equipeId || demanda.condominioId !== access.demanda.condominioId ||
      (gerencia && !(fresh.scope.canCreate && fresh.gerencia && fresh.scope.canManage))) {
      throw new TRPCError({ code: "CONFLICT", message: "A equipe ou o acesso à demanda mudou. Atualize os dados." });
    }
    if (responsavelId != null) await assertResponsavelElegivel(fresh.scope.actor, demanda, responsavelId);
    const [identidade] = await tx.select().from(users).where(eq(users.id, fresh.scope.actor.id)).limit(1);
    const values = { demandaId: input.demandaId, titulo: input.titulo, descricao: input.descricao ?? null,
      ...responsavel, prioridade: input.prioridade, prazo: input.prazo ? new Date(input.prazo) : null,
      exigeRevisao: input.exigeRevisao, status: "pendente" as const, versao: 1,
      criadoPorId: fresh.scope.actor.id, criadoPorNome: identidade ? nomeUsuario(identidade) : "Usuário" };
    const [result] = await tx.insert(tarefasDemanda).values(values);
    const id = result.insertId;
    await registrarEvento(tx, fresh.scope.actor, id, "criacao", "Tarefa criada.", null, values);
    if (responsavelId != null) await notificar(tx, id, [responsavelId], "atribuicao");
    return { id };
  });
}

export async function listarResponsaveis(actor: User, demandaId: number) {
  const access = await assertDemandaAccess(actor, demandaId, "visualizar");
  if (!(access.gerencia && access.scope.canManage && (access.scope.canCreate || access.scope.canEdit))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para delegar tarefas nesta demanda." });
  }
  const db = await tarefasDb();
  let candidatos: User[];
  if (access.demanda.equipeId == null) {
    candidatos = await db.select().from(users).where(and(eq(users.id, access.scope.actor.id), eq(users.isActive, 1), eq(users.isDeleted, 0)));
  } else {
    const membros = await db.select({ userId: juridicoEquipeMembros.userId }).from(juridicoEquipeMembros)
      .where(and(eq(juridicoEquipeMembros.equipeId, access.demanda.equipeId), eq(juridicoEquipeMembros.isActive, 1)));
    if (!membros.length) return [];
    candidatos = await db.select().from(users).where(and(inArray(users.id, membros.map(m => m.userId)),
      eq(users.isActive, 1), eq(users.isDeleted, 0)));
  }
  const elegiveis: { id: number; name: string; email: string | null; role: User["role"] }[] = [];
  for (const user of candidatos) {
    try {
      await assertResponsavelElegivel(access.scope.actor, access.demanda, user.id);
      elegiveis.push({ id: user.id, name: nomeUsuario(user), email: user.email, role: user.role });
    } catch (error) {
      if (!(error instanceof TRPCError) || !["FORBIDDEN", "BAD_REQUEST", "NOT_FOUND"].includes(error.code)) throw error;
    }
  }
  return elegiveis.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

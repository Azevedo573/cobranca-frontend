import { TRPCError } from "@trpc/server";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { demandas, juridicoEquipes, juridicoEquipeMembros, profilePermissions, tarefasDemanda, users } from "../drizzle/schema";
import { getDb } from "./db";
import { getCondominiosAtivosDoUsuario, type TenantActor } from "./tenant-guard";
import type { AcaoId } from "./db-profiles";

export type JuridicoScope = {
  actor: TenantActor;
  admin: boolean;
  condominioIds: number[];
  equipeIds: number[];
  gestorEquipeIds: number[];
  canManage: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
};

export function resolverScopeJuridico(
  actor: TenantActor,
  condominioIds: number[],
  memberships: { equipeId: number; gestor: number }[],
  permissions: { modulo: string; acao: string; permitido: number }[],
): JuridicoScope {
  const admin = actor.role === "admin";
  const permitido = (acao: string) => admin || permissions.some(p => p.modulo === "juridico_equipe" && p.acao === acao && p.permitido === 1);
  const equipeIds = Array.from(new Set(memberships.map(m => Number(m.equipeId))));
  const gestores = Array.from(new Set(memberships.filter(m => m.gestor === 1).map(m => Number(m.equipeId))));
  const canManage = admin || (gestores.length > 0 && permitido("visualizar"));
  return {
    actor, admin, condominioIds: Array.from(new Set(condominioIds)), equipeIds,
    gestorEquipeIds: canManage ? gestores : [], canManage,
    canCreate: canManage && permitido("criar"),
    canEdit: canManage && permitido("editar"),
    canApprove: canManage && permitido("aprovar"),
  };
}

export function casoDentroDaCarteira(scope: JuridicoScope, condominioId: number | null): boolean {
  return scope.admin || (condominioId !== null && scope.condominioIds.includes(condominioId));
}

export function gerenciaCaso(scope: JuridicoScope, equipeId: number | null): boolean {
  return scope.admin || (equipeId !== null && scope.canManage && scope.gestorEquipeIds.includes(equipeId));
}

/** Não usa o cache RBAC de cinco minutos: revogação vale na próxima requisição. */
export async function getJuridicoScope(actor: TenantActor, acao: AcaoId = "visualizar"): Promise<JuridicoScope> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
  const [atual] = await db.select({ id: users.id, role: users.role, condominioId: users.condominioId, isActive: users.isActive, isDeleted: users.isDeleted, profileId: users.profileId })
    .from(users).where(eq(users.id, actor.id)).limit(1);
  if (!atual || atual.isActive !== 1 || atual.isDeleted === 1) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inativa. Entre novamente." });
  const identidade: TenantActor = { id: atual.id, role: atual.role, condominioId: atual.condominioId };
  let permissions: { modulo: string; acao: string; permitido: number }[] = [];
  if (atual.role === "advogado" || atual.role === "colaborador") {
    if (!atual.profileId) throw new TRPCError({ code: "FORBIDDEN", message: "Perfil jurídico não configurado." });
    permissions = await db.select({ modulo: profilePermissions.modulo, acao: profilePermissions.acao, permitido: profilePermissions.permitido })
      .from(profilePermissions).where(eq(profilePermissions.profileId, atual.profileId));
    if (!permissions.some(p => p.modulo === "juridico_demandas" && p.acao === acao && p.permitido === 1)) {
      throw new TRPCError({ code: "FORBIDDEN", message: `Sem permissão para ${acao} em demandas jurídicas.` });
    }
  } else if (atual.role !== "admin" && !(["visualizar", "criar"].includes(acao))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Ação exclusiva da equipe jurídica." });
  }
  const condominioIds = await getCondominiosAtivosDoUsuario(identidade);
  const memberships = await db.select({ equipeId: juridicoEquipeMembros.equipeId, gestor: juridicoEquipeMembros.gestor })
    .from(juridicoEquipeMembros).innerJoin(juridicoEquipes, eq(juridicoEquipes.id, juridicoEquipeMembros.equipeId))
    .where(and(eq(juridicoEquipeMembros.userId, atual.id), eq(juridicoEquipeMembros.isActive, 1), eq(juridicoEquipes.isActive, 1)));
  return resolverScopeJuridico(identidade, condominioIds, memberships, permissions);
}

function carteiraCondition(scope: JuridicoScope): SQL {
  return scope.admin ? sql`1 = 1` : scope.condominioIds.length ? inArray(demandas.condominioId, scope.condominioIds) : sql`1 = 0`;
}

export function tarefaScopeCondition(scope: JuridicoScope, somenteMinhas = false): SQL {
  const propria = eq(tarefasDemanda.responsavelId, scope.actor.id);
  if (scope.admin) return somenteMinhas ? propria : sql`1 = 1`;
  if (!["advogado", "colaborador"].includes(scope.actor.role)) return sql`1 = 0`;
  const equipe = !somenteMinhas && scope.canManage && scope.gestorEquipeIds.length
    ? inArray(demandas.equipeId, scope.gestorEquipeIds) : sql`1 = 0`;
  return and(carteiraCondition(scope), or(propria, equipe))!;
}

export function demandaScopeCondition(scope: JuridicoScope, incluirContextoTarefa = false): SQL {
  if (scope.admin) return sql`1 = 1`;
  const pessoal = or(eq(demandas.responsavelId, scope.actor.id), eq(demandas.criadoPorId, scope.actor.id))!;
  const equipe = scope.canManage && scope.gestorEquipeIds.length ? inArray(demandas.equipeId, scope.gestorEquipeIds) : sql`1 = 0`;
  const tarefa = incluirContextoTarefa && ["advogado", "colaborador"].includes(scope.actor.role)
    ? sql`EXISTS (SELECT 1 FROM ${tarefasDemanda} WHERE ${tarefasDemanda.demandaId} = ${demandas.id} AND ${tarefasDemanda.responsavelId} = ${scope.actor.id} AND ${tarefasDemanda.status} <> 'cancelada')`
    : sql`1 = 0`;
  return and(carteiraCondition(scope), or(pessoal, equipe, tarefa))!;
}

export async function assertDemandaAccess(actor: TenantActor, demandaId: number, acao: AcaoId = "visualizar", contextoTarefa = false) {
  const scope = await getJuridicoScope(actor, acao);
  const db = (await getDb())!;
  const [demanda] = await db.select().from(demandas).where(eq(demandas.id, demandaId)).limit(1);
  const naoEncontrada = () => new TRPCError({ code: "NOT_FOUND", message: "Demanda não encontrada." });
  if (!demanda || !casoDentroDaCarteira(scope, demanda.condominioId)) throw naoEncontrada();
  const gerencia = gerenciaCaso(scope, demanda.equipeId);
  const pessoal = demanda.responsavelId === scope.actor.id || demanda.criadoPorId === scope.actor.id;
  let acessoCompleto = gerencia || pessoal;
  if (!acessoCompleto) {
    if (!contextoTarefa || acao !== "visualizar") throw naoEncontrada();
    const [atividade] = await db.select({ id: tarefasDemanda.id }).from(tarefasDemanda)
      .where(and(eq(tarefasDemanda.demandaId, demandaId), eq(tarefasDemanda.responsavelId, scope.actor.id), sql`${tarefasDemanda.status} <> 'cancelada'`)).limit(1);
    if (!atividade || !["advogado", "colaborador"].includes(scope.actor.role)) throw naoEncontrada();
  }
  if (acao !== "visualizar" && gerencia && !scope.admin && !(acao === "criar" ? scope.canCreate : acao === "aprovar" ? scope.canApprove : scope.canEdit)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "A gestão da equipe não possui esta ação." });
  }
  return { demanda, scope, acessoCompleto, gerencia };
}

export async function assertTarefaAccess(actor: TenantActor, tarefaId: number, acao: AcaoId = "visualizar") {
  const scope = await getJuridicoScope(actor, acao);
  if (!scope.admin && !["advogado", "colaborador"].includes(scope.actor.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso exclusivo da equipe jurídica." });
  const db = (await getDb())!;
  const [row] = await db.select({ tarefa: tarefasDemanda, demanda: demandas }).from(tarefasDemanda)
    .innerJoin(demandas, eq(demandas.id, tarefasDemanda.demandaId)).where(eq(tarefasDemanda.id, tarefaId)).limit(1);
  if (!row || !casoDentroDaCarteira(scope, row.demanda.condominioId)) throw new TRPCError({ code: "NOT_FOUND", message: "Tarefa não encontrada." });
  const gerencia = gerenciaCaso(scope, row.demanda.equipeId);
  if (!gerencia && row.tarefa.responsavelId !== scope.actor.id) throw new TRPCError({ code: "NOT_FOUND", message: "Tarefa não encontrada." });
  if (acao !== "visualizar" && gerencia && !scope.admin && !(acao === "criar" ? scope.canCreate : acao === "aprovar" ? scope.canApprove : scope.canEdit)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão gerencial para esta ação." });
  }
  return { ...row, scope, gerencia };
}

/** Nomes e elegibilidade vêm do usuário atual, nunca do texto enviado pelo navegador. */
export async function assertResponsavelElegivel(actor: TenantActor, demanda: typeof demandas.$inferSelect, responsavelId: number) {
  const scope = await getJuridicoScope(actor, "visualizar");
  if (!casoDentroDaCarteira(scope, demanda.condominioId)) throw new TRPCError({ code: "NOT_FOUND", message: "Demanda não encontrada." });
  const db = (await getDb())!;
  const [destino] = await db.select({ id: users.id, name: users.name, role: users.role, condominioId: users.condominioId, isActive: users.isActive, isDeleted: users.isDeleted, profileId: users.profileId }).from(users).where(eq(users.id, responsavelId)).limit(1);
  if (!destino || destino.isActive !== 1 || destino.isDeleted === 1 || !["advogado", "colaborador", "admin"].includes(destino.role)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Responsável inativo ou fora da equipe jurídica." });
  }
  // Atribuição para terceiros é gerencial; manter atividade pessoal legada não cria uma equipe fictícia.
  if (destino.id !== scope.actor.id && !gerenciaCaso(scope, demanda.equipeId)) throw new TRPCError({ code: "FORBIDDEN", message: "Atribuição de tarefas é uma ação da gestão." });
  if (demanda.equipeId !== null) {
    const [membro] = await db.select({ id: juridicoEquipeMembros.id }).from(juridicoEquipeMembros)
      .innerJoin(juridicoEquipes, eq(juridicoEquipes.id, juridicoEquipeMembros.equipeId))
      .where(and(eq(juridicoEquipeMembros.equipeId, demanda.equipeId), eq(juridicoEquipeMembros.userId, destino.id), eq(juridicoEquipeMembros.isActive, 1), eq(juridicoEquipes.isActive, 1))).limit(1);
    if (!membro) throw new TRPCError({ code: "BAD_REQUEST", message: "O responsável não pertence à equipe deste caso." });
  } else if (destino.id !== scope.actor.id) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Vincule uma equipe à demanda antes de delegar a outro profissional." });
  }
  if (destino.role !== "admin") {
    const carteiras = await getCondominiosAtivosDoUsuario(destino);
    if (demanda.condominioId === null || !carteiras.includes(demanda.condominioId)) throw new TRPCError({ code: "BAD_REQUEST", message: "O responsável não possui vínculo ativo com este condomínio." });
    if (!destino.profileId) throw new TRPCError({ code: "BAD_REQUEST", message: "O responsável não possui perfil jurídico." });
    const [permissao] = await db.select({ id: profilePermissions.id }).from(profilePermissions)
      .where(and(eq(profilePermissions.profileId, destino.profileId), eq(profilePermissions.modulo, "juridico_demandas"), eq(profilePermissions.acao, "visualizar"), eq(profilePermissions.permitido, 1))).limit(1);
    if (!permissao) throw new TRPCError({ code: "BAD_REQUEST", message: "O perfil do responsável não permite visualizar demandas jurídicas." });
  }
  return { id: destino.id, name: destino.name ?? `Usuário #${destino.id}`, role: destino.role };
}

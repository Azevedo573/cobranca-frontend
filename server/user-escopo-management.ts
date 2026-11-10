import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { auditLogs, condominios, userCondominios, users } from "../drizzle/schema";
import type { getDb } from "./db";
import { motivoBloqueioDesativacao, validarSenhaDeUsuario } from "./user-management-security";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Role = "admin" | "sindico" | "cobrador" | "colaborador" | "advogado";
type Escopo = "selecionados" | "todos" | null;
type CarteiraInput = { role?: Role; escopoCondominios?: Exclude<Escopo, null>; condominioId?: number | null; condominioIds?: number[] };
type CreateInput = CarteiraInput & { name: string; email: string; password: string; role: Role; isActive?: number };
type UpdateInput = CarteiraInput & { id: number; name?: string; email?: string; password?: string; isActive?: number };
type UserScope = { id: number; role: string; escopoCondominios?: Escopo; condominioId: number | null };
type ScopeState = { role: string; escopoCondominios: Escopo; condominioId: number | null; condominioIds: number[] };
const elegivel = (role: string) => role === "advogado" || role === "colaborador";
const invalid = (message: string): never => { throw new TRPCError({ code: "BAD_REQUEST", message }); };

/** Serializa as mudanças administrativas e reconfirma o ator atual, nunca headers/JWT. */
export async function transacaoUsuarioAdmin<T>(db: Db, actorId: number, work: (tx: Tx, totalAdminsAtivos: number) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    // Ordem única antes de alvo/ator impede duas remoções concorrentes do último admin.
    const admins = await tx.select({ id: users.id, isActive: users.isActive, isDeleted: users.isDeleted })
      .from(users).where(eq(users.role, "admin")).orderBy(users.id).for("update");
    const [actor] = await tx.select({ id: users.id, role: users.role, isActive: users.isActive, isDeleted: users.isDeleted })
      .from(users).where(eq(users.id, actorId)).limit(1).for("update");
    if (!actor || actor.role !== "admin" || actor.isActive !== 1 || actor.isDeleted !== 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Administrador ativo necessário para gerenciar usuários." });
    }
    return work(tx, admins.filter(admin => admin.isActive === 1 && admin.isDeleted === 0).length);
  });
}

/** Segue auditLogs transacional estrito (não logAudit best-effort). Sem nomes/email/headers/senhas/hashes. */
export async function auditarGestaoUsuario(tx: Tx, actorId: number, userId: number, action: "create" | "update" | "delete", before: Record<string, unknown> | null, after: Record<string, unknown>) {
  await tx.insert(auditLogs).values({
    userId: actorId, userRole: "admin", action, entity: "user", entityId: String(userId),
    beforeData: before ? JSON.stringify(before) : null, afterData: JSON.stringify(after),
    metadata: JSON.stringify({ evento: "gestao_usuario", usuarioId: userId }),
    ipAddress: "unknown", severity: action === "delete" ? "warning" : "info", success: 1,
  });
}

async function idsAtivos(tx: Tx, ids: number[]) {
  if (ids.some(id => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    invalid("Informe condomínios válidos e sem duplicidade.");
  }
  if (!ids.length) return;
  const rows = await tx.select({ id: condominios.id }).from(condominios)
    .where(and(inArray(condominios.id, ids), eq(condominios.statusCadastro, "ativo"))).for("share");
  if (rows.length !== ids.length) invalid("Um ou mais condomínios informados não existem ou estão inativos.");
}

async function vinculos(tx: Tx, userId: number) {
  const rows = await tx.select({ condominioId: userCondominios.condominioId }).from(userCondominios)
    .where(and(eq(userCondominios.userId, userId), eq(userCondominios.isActive, 1))).for("update");
  return rows.map(row => row.condominioId);
}

async function planejarCarteira(tx: Tx, input: CarteiraInput, previous: UserScope | null, previousIds: number[]): Promise<{ state: ScopeState; changed: boolean }> {
  const role = input.role ?? previous!.role;
  const oldScope = previous?.escopoCondominios ?? null;
  const roleChanged = previous !== null && role !== previous.role;
  const incompatibleChange = roleChanged && !elegivel(role) && oldScope !== null;
  if (input.escopoCondominios !== undefined && !elegivel(role)) invalid("Escopo incompatível com o perfil.");
  const explicit = input.escopoCondominios !== undefined || input.condominioIds !== undefined || input.condominioId !== undefined;
  const changed = !previous || explicit || roleChanged;
  // Nome/senha/status/no-op não reclassificam NULL nem revalidam carteira histórica.
  if (previous && !explicit && (!roleChanged || (elegivel(previous.role) && elegivel(role)))) return {
    state: { role, escopoCondominios: oldScope, condominioId: previous.condominioId, condominioIds: previousIds }, changed: false,
  };
  let scope: Escopo = input.escopoCondominios ?? oldScope;
  if (!elegivel(role)) scope = null;
  else if (input.escopoCondominios === undefined && (!previous || (scope === null && (input.condominioIds !== undefined || input.condominioId !== undefined)))) scope = "selecionados";
  if (oldScope === "todos" && !elegivel(role) && !roleChanged) invalid("Escopo incompatível com o perfil.");

  if (scope === "todos") {
    const ids = input.condominioIds ?? (input.escopoCondominios === "todos" ? [] : previousIds);
    if (ids.length) invalid("Acesso a todos exige lista de condomínios vazia.");
    const principal = input.condominioId !== undefined ? input.condominioId : previous?.condominioId ?? null;
    if (principal !== null) await idsAtivos(tx, [principal]);
    return { state: { role, escopoCondominios: scope, condominioId: principal, condominioIds: [] }, changed };
  }
  let ids = input.condominioIds;
  if (ids === undefined) {
    if (!previous) ids = input.condominioId ? [input.condominioId] : [];
    else if (oldScope === "todos" && incompatibleChange) ids = previousIds;
    else ids = previousIds.length ? previousIds : oldScope === null && previous.condominioId ? [previous.condominioId] : [];
  }
  await idsAtivos(tx, ids);
  if (role !== "admin" && !ids.length) invalid("Informe ao menos um condomínio para este usuário.");
  const principal = input.condominioId !== undefined ? input.condominioId : ids[0] ?? null;
  if (principal !== null && !ids.includes(principal)) invalid("O condomínio principal deve constar entre os vínculos autorizados.");
  if (role !== "admin" && principal === null) invalid("O condomínio principal deve constar entre os vínculos autorizados.");
  return { state: { role, escopoCondominios: scope, condominioId: principal, condominioIds: ids }, changed };
}

async function substituirVinculos(tx: Tx, userId: number, ids: number[]) {
  await tx.update(userCondominios).set({ isActive: 0 }).where(eq(userCondominios.userId, userId));
  if (ids.length) await tx.insert(userCondominios).values(ids.map(condominioId => ({ userId, condominioId, isActive: 1 })))
    .onDuplicateKeyUpdate({ set: { isActive: 1 } });
}

function validarSenha(password: string) {
  const error = validarSenhaDeUsuario(password);
  if (error) invalid(error);
}
function traduzirDuplicidade(error: unknown): never {
  const code = (error as { code?: string; errno?: number } | null);
  if (code?.code === "ER_DUP_ENTRY" || code?.errno === 1062) {
    throw new TRPCError({ code: "CONFLICT", message: "Já existe um usuário com este e-mail" });
  }
  throw error;
}

export async function criarUsuarioComEscopo(db: Db, actorId: number, input: CreateInput) {
  try {
    return await transacaoUsuarioAdmin(db, actorId, async tx => {
      validarSenha(input.password);
      const email = input.email.toLowerCase();
      const existing = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "Já existe um usuário com este e-mail" });
      const { state } = await planejarCarteira(tx, input, null, []);
      const passwordHash = await bcrypt.hash(input.password, 10);
      const result = await tx.insert(users).values({
        openId: `user_${randomUUID()}`, name: input.name, email, passwordHash, loginMethod: "custom",
        role: input.role, escopoCondominios: state.escopoCondominios, condominioId: state.condominioId,
        isPrimaryAdmin: 0, isActive: input.isActive ?? 1,
      });
      const userId = Number(result[0].insertId);
      if (!Number.isInteger(userId) || userId <= 0) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao identificar usuário criado." });
      await substituirVinculos(tx, userId, state.condominioIds);
      await auditarGestaoUsuario(tx, actorId, userId, "create", null, { ...state, isActive: input.isActive ?? 1, isPrimaryAdmin: 0 });
      return result;
    });
  } catch (error) { traduzirDuplicidade(error); }
}

export async function atualizarUsuarioComEscopo(db: Db, actorId: number, input: UpdateInput) {
  try {
    return await transacaoUsuarioAdmin(db, actorId, async (tx, totalAdminsAtivos) => {
      const [target] = await tx.select().from(users).where(eq(users.id, input.id)).limit(1).for("update");
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
      if (target.isDeleted === 1) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Restaure o usuário antes de editá-lo" });
      if (input.password !== undefined) validarSenha(input.password);
      const removendoAdminOuDesativando = (target.role === "admin" && input.role !== undefined && input.role !== "admin") || input.isActive === 0;
      if (removendoAdminOuDesativando) {
        const bloqueio = motivoBloqueioDesativacao({ actorId, targetId: target.id, targetIsPrimary: target.isPrimaryAdmin === 1,
          targetRole: target.role, targetIsActive: target.isActive === 1, totalAdminsAtivos });
        if (bloqueio) throw new TRPCError({ code: "PRECONDITION_FAILED", message: bloqueio });
      }
      const beforeIds = await vinculos(tx, input.id);
      const { state, changed } = await planejarCarteira(tx, input, target, beforeIds);
      const updateData: Partial<typeof users.$inferInsert> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.role !== undefined) updateData.role = input.role;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;
      if (input.email !== undefined) {
        const email = input.email.toLowerCase();
        if (email !== (target.email ?? "").toLowerCase()) {
          const existing = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
          if (existing.some(user => user.id !== target.id)) throw new TRPCError({ code: "CONFLICT", message: "Já existe um usuário com este e-mail" });
        }
        updateData.email = email;
      }
      if (input.password !== undefined) updateData.passwordHash = await bcrypt.hash(input.password, 10);
      if (changed) { updateData.escopoCondominios = state.escopoCondominios; updateData.condominioId = state.condominioId; }
      if (Object.keys(updateData).length) await tx.update(users).set(updateData).where(eq(users.id, input.id));
      if (changed) await substituirVinculos(tx, input.id, state.condominioIds);
      await auditarGestaoUsuario(tx, actorId, input.id, "update", {
        role: target.role, escopoCondominios: target.escopoCondominios ?? null, condominioId: target.condominioId,
        condominioIds: beforeIds, isActive: target.isActive, isPrimaryAdmin: target.isPrimaryAdmin,
      }, { ...state, isActive: input.isActive ?? target.isActive, isPrimaryAdmin: target.isPrimaryAdmin });
      return { success: true };
    });
  } catch (error) { traduzirDuplicidade(error); }
}

/** Legado segue principal; explícitos seguem escopo + carteira ativa, nunca preferência. */
export function usuarioVisivelNoCondominio(user: { role: string; escopoCondominios?: Escopo; condominioId: number | null }, condominioId: number, ativo: boolean, membershipIds: number[]) {
  if (user.escopoCondominios == null) return user.condominioId === condominioId;
  if (!elegivel(user.role) || !ativo) return false;
  return user.escopoCondominios === "todos" || membershipIds.includes(condominioId);
}

export async function listarUsuariosPorCondominio(db: Db, condominioId: number, includeDeleted: boolean) {
  const [tenant] = await db.select({ id: condominios.id, statusCadastro: condominios.statusCadastro }).from(condominios)
    .where(eq(condominios.id, condominioId)).limit(1);
  const rows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role,
    escopoCondominios: users.escopoCondominios, condominioId: users.condominioId, isPrimaryAdmin: users.isPrimaryAdmin,
    isActive: users.isActive, isDeleted: users.isDeleted, profileId: users.profileId, createdAt: users.createdAt,
    updatedAt: users.updatedAt, lastSignedIn: users.lastSignedIn }).from(users).where(includeDeleted ? undefined : eq(users.isDeleted, 0));
  const memberships = await db.select({ userId: userCondominios.userId }).from(userCondominios)
    .where(and(eq(userCondominios.condominioId, condominioId), eq(userCondominios.isActive, 1)));
  const members = new Set(memberships.map(row => row.userId));
  return rows.filter(user => usuarioVisivelNoCondominio(user, condominioId, tenant?.statusCadastro === "ativo", members.has(user.id) ? [condominioId] : []));
}

export async function excluirUsuarioComEscopo(db: Db, actorId: number, userId: number) {
  return transacaoUsuarioAdmin(db, actorId, async (tx, totalAdminsAtivos) => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).limit(1).for("update");
    if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
    if (target.isDeleted === 1) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Este usuário já está excluído logicamente" });
    const bloqueio = motivoBloqueioDesativacao({ actorId, targetId: target.id, targetIsPrimary: target.isPrimaryAdmin === 1,
      targetRole: target.role, targetIsActive: target.isActive === 1, totalAdminsAtivos });
    if (bloqueio) throw new TRPCError({ code: "PRECONDITION_FAILED", message: bloqueio });
    await tx.update(users).set({ isActive: 0, isDeleted: 1, isPrimaryAdmin: 0 }).where(eq(users.id, userId));
    await auditarGestaoUsuario(tx, actorId, userId, "delete", { role: target.role, isActive: target.isActive, isDeleted: target.isDeleted },
      { isActive: 0, isDeleted: 1, isPrimaryAdmin: 0, motivo: "exclusao_logica" });
    return { success: true, softDeleted: true };
  });
}

export async function restaurarUsuarioComEscopo(db: Db, actorId: number, userId: number) {
  return transacaoUsuarioAdmin(db, actorId, async tx => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).limit(1).for("update");
    if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
    if (target.isDeleted !== 1) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Este usuário não está excluído" });
    await tx.update(users).set({ isDeleted: 0, isActive: 0, isPrimaryAdmin: 0 }).where(eq(users.id, userId));
    await auditarGestaoUsuario(tx, actorId, userId, "update", { isDeleted: 1, isActive: target.isActive },
      { isDeleted: 0, isActive: 0, isPrimaryAdmin: 0, motivo: "restaurado_inativo" });
    return { success: true, restored: true, isActive: 0 };
  });
}

export async function definirAdminPrincipalComEscopo(db: Db, actorId: number, userId: number, condominioId: number) {
  return transacaoUsuarioAdmin(db, actorId, async tx => {
    const [target] = await tx.select().from(users)
      .where(and(eq(users.id, userId), eq(users.condominioId, condominioId))).limit(1).for("update");
    if (!target || target.isActive !== 1 || target.isDeleted === 1) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Usuário ativo não encontrado neste condomínio" });
    }
    await tx.update(users).set({ isPrimaryAdmin: 0 }).where(eq(users.condominioId, condominioId));
    await tx.update(users).set({ isPrimaryAdmin: 1 }).where(eq(users.id, userId));
    await auditarGestaoUsuario(tx, actorId, userId, "update", { isPrimaryAdmin: target.isPrimaryAdmin, condominioId },
      { isPrimaryAdmin: 1, condominioId, motivo: "admin_principal_definido" });
    return { success: true };
  });
}

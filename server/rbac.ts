/**
 * rbac.ts
 * Middleware RBAC para tRPC.
 *
 * Uso:
 *   import { requirePermission } from "./rbac";
 *
 *   // Procedure que exige permissão de visualizar cobranças:
 *   const myProc = requirePermission("cobrancas", "visualizar");
 *   myProc.query(async ({ ctx }) => { ... });
 *
 * Regras:
 *   - role === "admin"       → sempre permitido (bypass total)
 *   - role === "colaborador" → verificado contra profile_permissions do perfil atribuído
 *   - outros roles           → sempre permitido (sindico, cobrador têm controle próprio por role)
 *   - colaborador sem perfil → FORBIDDEN
 *   - permissão não encontrada no perfil → FORBIDDEN
 */

import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "./_core/trpc";
import type { ModuloId, AcaoId } from "./db-profiles";

// ─── Cache em memória por request ────────────────────────────────────────────
// Mapa: userId → Map<"modulo:acao", boolean>
// Limpo a cada 5 minutos para evitar dados stale.
const permCache = new Map<number, { perms: Map<string, boolean>; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

async function getUserPermissions(userId: number): Promise<Map<string, boolean>> {
  const cached = permCache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.perms;
  }

  const { getDb } = await import("./db");
  const { users, profilePermissions } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");

  const db = await getDb();
  if (!db) return new Map();

  // Buscar o profileId do usuário
  const userRows = await db
    .select({ profileId: users.profileId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const profileId = userRows[0]?.profileId;
  if (!profileId) return new Map(); // sem perfil → sem permissões

  // Buscar permissões do perfil
  const permRows = await db
    .select()
    .from(profilePermissions)
    .where(eq(profilePermissions.profileId, Number(profileId)));

  const perms = new Map<string, boolean>();
  for (const row of permRows) {
    perms.set(`${row.modulo}:${row.acao}`, row.permitido === 1);
  }

  permCache.set(userId, { perms, ts: Date.now() });
  return perms;
}

/**
 * Invalida o cache de permissões de um usuário específico.
 * Chamar após atribuir/alterar perfil.
 */
export function invalidatePermCache(userId: number) {
  permCache.delete(userId);
}

/**
 * Invalida o cache de todos os usuários com um determinado perfil.
 * Chamar após salvar permissões de um perfil.
 */
export async function invalidatePermCacheForProfile(profileId: number) {
  const { getDb } = await import("./db");
  const { users } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) return;
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.profileId, profileId));
  for (const row of rows) {
    permCache.delete(Number(row.id));
  }
}

/**
 * Verifica se um usuário tem uma permissão específica.
 * Admin sempre retorna true. Colaborador sem perfil retorna false.
 */
export async function hasPermission(
  userId: number,
  role: string,
  modulo: ModuloId,
  acao: AcaoId
): Promise<boolean> {
  // Admin tem acesso total
  if (role === "admin") return true;
  // Outros roles não-colaborador têm acesso livre (sindico, cobrador controlados por role)
  if (role !== "colaborador") return true;

  const perms = await getUserPermissions(userId);
  if (perms.size === 0) return false; // sem perfil atribuído
  return perms.get(`${modulo}:${acao}`) === true;
}

/**
 * Factory que retorna uma procedure tRPC protegida por permissão RBAC.
 *
 * @param modulo  ID do módulo (ex: "cobrancas", "juridico")
 * @param acao    Ação requerida (ex: "visualizar", "criar", "editar", "excluir")
 *
 * @example
 *   requirePermission("cobrancas", "criar").mutation(async ({ ctx }) => { ... })
 */
export function requirePermission(modulo: ModuloId, acao: AcaoId) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const { user } = ctx;

    // Admin: bypass total
    if (user.role === "admin") return next({ ctx });

    // Outros roles não-colaborador: bypass (controle por role já existe)
    if (user.role !== "colaborador") return next({ ctx });

    // Colaborador: verificar permissão no perfil
    const allowed = await hasPermission(user.id, user.role, modulo, acao);
    if (!allowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Sem permissão para ${acao} em ${modulo}. Contate o administrador para ajustar seu perfil de acesso.`,
      });
    }

    return next({ ctx });
  });
}

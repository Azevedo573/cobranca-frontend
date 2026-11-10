import { jwtVerify } from "jose";
import { ENV } from "./env";
import type { User } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { condominios, users } from "../../drizzle/schema";
import { getDb } from "../db";

/** Prefixos de autorização também recusam um contexto antigo após revogação. */
export async function getCurrentAuthorizationUser(actor: User): Promise<User | null> {
  const db = await getDb();
  if (!db) return null;
  const [current] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  if (!current || current.id !== actor.id || current.isActive !== 1 || current.isDeleted !== 0 || current.role !== actor.role) return null;
  return current;
}

export async function verifyCustomToken(token: string | undefined | null): Promise<User | null> {
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });

    if (payload.authType === "admin") {
      const { userId } = payload as Record<string, unknown>;
      if (typeof userId !== "number") return null;
      const db = await getDb();
      if (!db) return null;
      const [user] = await db.select().from(users)
        .where(and(eq(users.id, userId), eq(users.isDeleted, 0)))
        .limit(1);
      if (!user || user.isActive !== 1 || user.role !== "admin") return null;
      return user;
    }

    if (payload.authType === "colaborador") {
      const { userId } = payload as Record<string, unknown>;
      if (typeof userId !== "number") return null;
      const db = await getDb();
      if (!db) return null;
      const [user] = await db.select().from(users)
        .where(and(eq(users.id, userId), eq(users.isDeleted, 0)))
        .limit(1);
      if (!user || user.isActive !== 1) return null;
      return user;
    }

    if (payload.authType !== "custom") return null;
    const { condominioId, userId } = payload as Record<string, unknown>;
    if (typeof userId !== "number") return null;

    const db = await getDb();
    if (!db) return null;
    const [user] = await db.select().from(users)
      .where(and(eq(users.id, userId), eq(users.isDeleted, 0)))
      .limit(1);
    if (!user || user.isActive !== 1) return null;

    // Escopo explícito persistido separa identidade da antiga preferência do JWT.
    // Carteira/perfil continuam sendo autorizados pelos guards, não por este token.
    if ((user.role === "advogado" || user.role === "colaborador") &&
        (user.escopoCondominios === "todos" || user.escopoCondominios === "selecionados")) {
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
      return user;
    }
    if (typeof condominioId !== "number") return null;
    const [condominio] = await db.select().from(condominios).where(eq(condominios.id, condominioId)).limit(1);
    if (!condominio || condominio.statusCadastro !== "ativo") return null;

    const { getCondominiosAtivosDoUsuario } = await import("../tenant-guard");
    const vinculados = await getCondominiosAtivosDoUsuario(user);
    if (!vinculados.includes(condominioId)) return null;

    await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
    return user;
  } catch (error) {
    console.warn("[Custom Auth] Token verification failed:", error);
    return null;
  }
}

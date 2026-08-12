import { jwtVerify } from "jose";
import { ENV } from "./env";
import type { User } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { condominios, users } from "../../drizzle/schema";
import { getDb } from "../db";

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
    const { condominioId, username } = payload as Record<string, unknown>;
    if (typeof condominioId !== "number" || typeof username !== "string") return null;

    const db = await getDb();
    if (!db) return null;
    const [condominio] = await db.select().from(condominios).where(eq(condominios.id, condominioId)).limit(1);
    if (!condominio) return null;

    const openId = `condominio_${condominioId}`;
    let [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    if (!user) {
      await db.insert(users).values({
        openId,
        name: condominio.name || "Condomínio",
        email: condominio.email || null,
        loginMethod: "custom",
        role: "sindico",
        condominioId: condominio.id,
        lastSignedIn: new Date(),
      });
      [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    } else if (user.isDeleted === 1 || user.isActive !== 1) {
      return null;
    } else {
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
    }
    return user || null;
  } catch (error) {
    console.warn("[Custom Auth] Token verification failed:", error);
    return null;
  }
}

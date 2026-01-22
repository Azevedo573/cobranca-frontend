import { jwtVerify } from "jose";
import { ENV } from "./env";
import type { User } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { condominios, users } from "../../drizzle/schema";
import { getDb } from "../db";

export async function verifyCustomToken(token: string | undefined | null): Promise<User | null> {
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });

    // Verificar se é um token de colaborador
    if (payload.authType === "colaborador") {
      const { userId } = payload as Record<string, unknown>;
      
      if (typeof userId !== "number") {
        console.warn("[Custom Auth] Invalid colaborador token: missing userId");
        return null;
      }

      // Buscar usuário colaborador no banco
      const db = await getDb();
      if (!db) return null;

      const userResult = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const user = userResult[0];
      if (!user || user.isActive !== 1) {
        console.warn("[Custom Auth] Colaborador user not found or inactive");
        return null;
      }

      return user;
    }

    // Verificar se é um token customizado de condomínio
    if (payload.authType !== "custom") {
      return null;
    }

    const { condominioId, username } = payload as Record<string, unknown>;

    if (typeof condominioId !== "number" || typeof username !== "string") {
      return null;
    }

    // Buscar condomínio no banco
    const db = await getDb();
    if (!db) return null;

    const condominioResult = await db
      .select()
      .from(condominios)
      .where(eq(condominios.id, condominioId))
      .limit(1);

    const condominio = condominioResult[0];
    if (!condominio) return null;

    // Buscar ou criar usuário "virtual" para o condomínio
    // Usamos o username do condomínio como openId para identificação única
    const openId = `condominio_${condominioId}`;
    
    let userResult = await db
      .select()
      .from(users)
      .where(eq(users.openId, openId))
      .limit(1);

    let user = userResult[0];

    // Se não existe, criar usuário virtual para o condomínio
    if (!user) {
      await db.insert(users).values({
        openId,
        name: condominio.name || "Condomínio",
        email: condominio.email || null,
        loginMethod: "custom",
        role: "sindico", // Condomínios logam como síndico por padrão
        condominioId: condominio.id,
        lastSignedIn: new Date(),
      });

      userResult = await db
        .select()
        .from(users)
        .where(eq(users.openId, openId))
        .limit(1);

      user = userResult[0];
    } else {
      // Atualizar último login
      await db
        .update(users)
        .set({ lastSignedIn: new Date() })
        .where(eq(users.id, user.id));
    }

    return user || null;
  } catch (error) {
    console.warn("[Custom Auth] Token verification failed:", error);
    return null;
  }
}

import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { condominios, users } from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";

export interface CustomAuthResult {
  success: boolean;
  token?: string;
  user?: {
    condominioId: number;
    condominioName: string;
    username: string;
    userId?: number;
    isPrimaryAdmin?: boolean;
  };
  error?: string;
}

/**
 * Autentica um usuário do condomínio.
 *
 * Estratégia de fallback para compatibilidade durante a transição:
 * 1. Primeiro tenta autenticar via tabela `users` (nova lógica)
 * 2. Se não encontrar, tenta via tabela `condominios` (legado)
 */
export async function authenticateCondominio(
  username: string,
  password: string
): Promise<CustomAuthResult> {
  try {
    const db = await getDb();
    if (!db) {
      return { success: false, error: "Database not available" };
    }

    // ── 1. Buscar na tabela users (nova lógica) ──────────────────────────────
    const email = username.includes("@") ? username : `${username}@condominio.local`;

    const userRows = await db
      .select({
        user: users,
        condominio: condominios,
      })
      .from(users)
      .innerJoin(condominios, eq(users.condominioId, condominios.id))
      .where(
        or(
          eq(users.email, username),
          eq(users.email, email)
        )
      )
      .limit(1);

    if (userRows.length > 0) {
      const { user: u, condominio } = userRows[0];

      if (!u.isActive || u.isDeleted === 1) {
        return { success: false, error: "Usuário inativo" };
      }

      if (!u.passwordHash) {
        return { success: false, error: "Usuário sem senha cadastrada" };
      }

      const isPasswordValid = await bcrypt.compare(password, u.passwordHash);
      if (!isPasswordValid) {
        return { success: false, error: "Usuário ou senha inválidos" };
      }

      // Atualizar lastSignedIn
      const { eq: eqUpdate } = await import("drizzle-orm");
      await db.update(users).set({ lastSignedIn: new Date() }).where(eqUpdate(users.id, u.id));

      const secret = new TextEncoder().encode(ENV.cookieSecret);
      const token = await new SignJWT({
        condominioId: condominio.id,
        condominioName: condominio.name,
        username: u.email || username,
        userId: u.id,
        isPrimaryAdmin: u.isPrimaryAdmin === 1,
        authType: "custom",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(secret);

      return {
        success: true,
        token,
        user: {
          condominioId: condominio.id,
          condominioName: condominio.name || "",
          username: u.email || username,
          userId: u.id,
          isPrimaryAdmin: u.isPrimaryAdmin === 1,
        },
      };
    }

    // ── 2. Fallback: buscar na tabela condominios (legado) ───────────────────
    const condResult = await db
      .select()
      .from(condominios)
      .where(eq(condominios.username, username))
      .limit(1);

    const condominio = condResult[0];

    if (!condominio) {
      return { success: false, error: "Usuário ou senha inválidos" };
    }

    if (!condominio.password) {
      return { success: false, error: "Condomínio sem senha cadastrada" };
    }

    const isPasswordValid = await bcrypt.compare(password, condominio.password);
    if (!isPasswordValid) {
      return { success: false, error: "Usuário ou senha inválidos" };
    }

    const secret = new TextEncoder().encode(ENV.cookieSecret);
    const token = await new SignJWT({
      condominioId: condominio.id,
      condominioName: condominio.name,
      username: condominio.username,
      authType: "custom",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    return {
      success: true,
      token,
      user: {
        condominioId: condominio.id,
        condominioName: condominio.name || "",
        username: condominio.username || "",
      },
    };
  } catch (error) {
    console.error("[Custom Auth] Error:", error);
    return { success: false, error: "Erro ao autenticar" };
  }
}

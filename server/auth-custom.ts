import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { condominios } from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";

export interface CustomAuthResult {
  success: boolean;
  token?: string;
  user?: {
    condominioId: number;
    condominioName: string;
    username: string;
  };
  error?: string;
}

export async function authenticateCondominio(
  username: string,
  password: string
): Promise<CustomAuthResult> {
  try {
    const db = await getDb();
    if (!db) {
      return { success: false, error: "Database not available" };
    }

    // Buscar condomínio por username
    const result = await db
      .select()
      .from(condominios)
      .where(eq(condominios.username, username))
      .limit(1);

    const condominio = result[0];

    if (!condominio) {
      return { success: false, error: "Usuário ou senha inválidos" };
    }

    if (!condominio.password) {
      return { success: false, error: "Condomínio sem senha cadastrada" };
    }

    // Verificar senha
    const isPasswordValid = await bcrypt.compare(password, condominio.password);

    if (!isPasswordValid) {
      return { success: false, error: "Usuário ou senha inválidos" };
    }

    // Gerar token JWT
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

import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { ENV } from "./_core/env";

export async function authenticateAdmin(email: string, password: string) {
  const db = await getDb();
  if (!db) {
    return {
      success: false,
      message: "Erro ao conectar ao banco de dados",
    };
  }

  // Buscar usuário por email e role admin
  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.role, "admin")))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    return {
      success: false,
      message: "Usuário não encontrado ou não é administrador",
    };
  }

  // Verificar se o usuário está ativo
  if (user.isActive !== 1) {
    return {
      success: false,
      message: "Usuário inativo",
    };
  }

  // Verificar senha
  if (!user.passwordHash) {
    return {
      success: false,
      message: "Senha não configurada para este usuário",
    };
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatch) {
    return {
      success: false,
      message: "Senha incorreta",
    };
  }

  // Gerar token JWT
  const secret = new TextEncoder().encode(ENV.cookieSecret);
  const token = await new SignJWT({
    userId: user.id,
    email: user.email,
    role: user.role,
    authType: "admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret);

  return {
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

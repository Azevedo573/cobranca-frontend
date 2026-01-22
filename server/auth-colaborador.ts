import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { users } from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";

export interface ColaboradorAuthResult {
  success: boolean;
  token?: string;
  user?: {
    id: number;
    name: string | null;
    email: string | null;
    role: string;
    condominioId: number | null;
  };
  message?: string;
}

export async function authenticateColaborador(
  username: string,
  password: string
): Promise<ColaboradorAuthResult> {
  try {
    const db = await getDb();
    if (!db) {
      return { success: false, message: "Database not available" };
    }

    // Buscar usuário por email (usamos email como username para colaboradores)
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, username))
      .limit(1);

    const user = result[0];

    if (!user) {
      return { success: false, message: "Usuário ou senha inválidos" };
    }

    // Verificar se é colaborador
    if (user.role !== "cobrador") {
      return { success: false, message: "Acesso negado. Este login é apenas para colaboradores." };
    }

    // Verificar se usuário está ativo
    if (user.isActive !== 1) {
      return { success: false, message: "Usuário inativo. Entre em contato com o administrador." };
    }

    // Verificar senha (usamos openId como hash da senha por enquanto)
    // Nota: Idealmente deveria ter um campo password na tabela users
    const isPasswordValid = await bcrypt.compare(password, user.openId);

    if (!isPasswordValid) {
      return { success: false, message: "Usuário ou senha inválidos" };
    }

    // Atualizar último login
    await db
      .update(users)
      .set({ lastSignedIn: new Date() })
      .where(eq(users.id, user.id));

    // Gerar token JWT
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    const token = await new SignJWT({
      userId: user.id,
      openId: user.openId,
      name: user.name,
      email: user.email,
      role: user.role,
      condominioId: user.condominioId,
      authType: "colaborador",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    return {
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        condominioId: user.condominioId,
      },
    };
  } catch (error) {
    console.error("[Colaborador Auth] Error:", error);
    return { success: false, message: "Erro ao processar login" };
  }
}

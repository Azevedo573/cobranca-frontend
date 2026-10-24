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

export type UsuarioCondominialParaSessao = {
  id: number;
  condominioId: number | null;
  isActive: number;
  isDeleted: number;
};

export type CondominioParaSessao = {
  id: number;
  statusCadastro: string | null;
};

/** Regras puras de sessão, compartilhadas pela autenticação e pelos testes. */
export function validarUsuarioCondominialParaSessao(
  user: UsuarioCondominialParaSessao,
  condominio: CondominioParaSessao,
): { ok: true } | { ok: false; error: string } {
  if (user.isActive !== 1 || user.isDeleted === 1) {
    return { ok: false, error: "Usuário inativo" };
  }
  if (user.condominioId !== condominio.id) {
    return { ok: false, error: "Usuário não pertence ao condomínio informado" };
  }
  if (condominio.statusCadastro !== "ativo") {
    return { ok: false, error: "Condomínio inativo ou arquivado" };
  }
  return { ok: true };
}

/**
 * Autentica uma pessoa vinculada a um condomínio.
 *
 * A sessão sempre representa um registro individual da tabela `users`.
 * Credenciais legadas gravadas no condomínio não são transformadas em uma
 * identidade compartilhada, pois isso impede auditoria individual e isolamento
 * por vínculos condominiais.
 */
export async function authenticateCondominio(
  username: string,
  password: string,
): Promise<CustomAuthResult> {
  try {
    const db = await getDb();
    if (!db) return { success: false, error: "Banco de dados indisponível" };

    const email = username.includes("@") ? username.toLowerCase() : `${username.toLowerCase()}@condominio.local`;
    const userRows = await db
      .select({ user: users, condominio: condominios })
      .from(users)
      .innerJoin(condominios, eq(users.condominioId, condominios.id))
      .where(or(eq(users.email, username.toLowerCase()), eq(users.email, email)))
      .limit(1);

    if (userRows.length === 0) {
      return {
        success: false,
        error: "Usuário ou senha inválidos. Solicite ao administrador um acesso individual.",
      };
    }

    const { user, condominio } = userRows[0];
    const elegibilidade = validarUsuarioCondominialParaSessao(user, condominio);
    if (!elegibilidade.ok) return { success: false, error: elegibilidade.error };

    if (!user.passwordHash) {
      return { success: false, error: "Usuário sem senha cadastrada" };
    }

    const senhaValida = await bcrypt.compare(password, user.passwordHash);
    if (!senhaValida) return { success: false, error: "Usuário ou senha inválidos" };

    await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

    const secret = new TextEncoder().encode(ENV.cookieSecret);
    const token = await new SignJWT({
      condominioId: condominio.id,
      condominioName: condominio.name,
      username: user.email || username,
      userId: user.id,
      isPrimaryAdmin: user.isPrimaryAdmin === 1,
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
        username: user.email || username,
        userId: user.id,
        isPrimaryAdmin: user.isPrimaryAdmin === 1,
      },
    };
  } catch (error) {
    console.error("[Custom Auth] Error:", error);
    return { success: false, error: "Erro ao autenticar" };
  }
}

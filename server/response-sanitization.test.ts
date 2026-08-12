import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { semCredenciais } from "./db-condominios";
import { getSessionCookieOptions } from "./_core/cookies";

describe("sanitização de respostas sensíveis", () => {
  it("remove credenciais de condomínio antes de expor dados ao cliente", () => {
    const resultado = semCredenciais({ id: 1, name: "Condomínio", username: "login-legado", password: "hash" });
    expect(resultado).toEqual({ id: 1, name: "Condomínio" });
    expect(resultado).not.toHaveProperty("username");
    expect(resultado).not.toHaveProperty("password");
  });

  it("não seleciona hash ou identificador de autenticação nas procedures de usuário", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const usersBlock = source.slice(source.indexOf("// Usuários (apenas admin)"), source.indexOf("// Condomínios"));
    expect(usersBlock).not.toContain("passwordHash: users.passwordHash");
    expect(usersBlock).not.toContain("openId: users.openId");
  });

  it("emite cookie HTTP-only, seguro em HTTPS e limitado ao mesmo site", () => {
    const options = getSessionCookieOptions({ protocol: "https", headers: {} } as any);
    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  });
});

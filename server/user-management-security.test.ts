import { describe, expect, it } from "vitest";
import { motivoBloqueioDesativacao, validarSenhaDeUsuario } from "./user-management-security";

describe("segurança da gestão de usuários", () => {
  it("exige senha com comprimento e diversidade mínimos", () => {
    expect(validarSenhaDeUsuario("123")).toContain("10 caracteres");
    expect(validarSenhaDeUsuario("senhasemnumero")).toContain("maiúscula");
    expect(validarSenhaDeUsuario("SenhaSegura2026")).toBeNull();
  });

  it("bloqueia autoexclusão, administrador principal e último administrador ativo", () => {
    expect(motivoBloqueioDesativacao({ actorId: 1, targetId: 1, targetIsPrimary: false, targetRole: "admin", targetIsActive: true, totalAdminsAtivos: 2 })).toContain("próprio usuário");
    expect(motivoBloqueioDesativacao({ actorId: 1, targetId: 2, targetIsPrimary: true, targetRole: "admin", targetIsActive: true, totalAdminsAtivos: 2 })).toContain("administrador principal");
    expect(motivoBloqueioDesativacao({ actorId: 1, targetId: 2, targetIsPrimary: false, targetRole: "admin", targetIsActive: true, totalAdminsAtivos: 1 })).toContain("último administrador");
  });
});

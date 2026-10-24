import { describe, expect, it } from "vitest";
import {
  validarUsuarioCondominialParaSessao,
  type UsuarioCondominialParaSessao,
} from "./auth-custom";

function usuario(overrides: Partial<UsuarioCondominialParaSessao> = {}): UsuarioCondominialParaSessao {
  return {
    id: 10,
    condominioId: 1,
    isActive: 1,
    isDeleted: 0,
    ...overrides,
  };
}

describe("auth custom — identidade condominial individual", () => {
  it("aceita usuário ativo de condomínio ativo", () => {
    expect(validarUsuarioCondominialParaSessao(usuario(), { id: 1, statusCadastro: "ativo" }))
      .toEqual({ ok: true });
  });

  it("recusa usuário inativo ou excluído", () => {
    expect(validarUsuarioCondominialParaSessao(usuario({ isActive: 0 }), { id: 1, statusCadastro: "ativo" }))
      .toMatchObject({ ok: false });
    expect(validarUsuarioCondominialParaSessao(usuario({ isDeleted: 1 }), { id: 1, statusCadastro: "ativo" }))
      .toMatchObject({ ok: false });
  });

  it("recusa condomínio inativo ou arquivado", () => {
    expect(validarUsuarioCondominialParaSessao(usuario(), { id: 1, statusCadastro: "inativo" }))
      .toMatchObject({ ok: false });
    expect(validarUsuarioCondominialParaSessao(usuario(), { id: 1, statusCadastro: "arquivado" }))
      .toMatchObject({ ok: false });
  });

  it("recusa usuário cujo condomínio não corresponde ao token", () => {
    expect(validarUsuarioCondominialParaSessao(usuario({ condominioId: 2 }), { id: 1, statusCadastro: "ativo" }))
      .toMatchObject({ ok: false });
  });
});

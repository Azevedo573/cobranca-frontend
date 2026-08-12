import { describe, expect, it } from "vitest";
import { exigirAdministradorOperacional } from "./routers/operacional";
import { sanitizarDadosOperacionais } from "./operacional";

describe("sanitizarDadosOperacionais", () => {
  it("redige segredos em objetos e estruturas aninhadas antes do log operacional", () => {
    const resultado = sanitizarDadosOperacionais({
      processoId: 1,
      token: "segredo",
      credenciais: {
        password: "senha-super-secreta",
        apiKey: "chave-privada",
      },
      itens: [{ nome: "TJRJ", clientSecret: "outro-segredo" }],
    });

    expect(resultado).toEqual({
      processoId: 1,
      token: "[REDACTED]",
      credenciais: {
        password: "[REDACTED]",
        apiKey: "[REDACTED]",
      },
      itens: [{ nome: "TJRJ", clientSecret: "[REDACTED]" }],
    });
  });

  it("restringe o painel de saúde operacional ao perfil administrador", () => {
    expect(() => exigirAdministradorOperacional("cobrador")).toThrow("Apenas administradores");
    expect(() => exigirAdministradorOperacional("admin")).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { BtgV2ConfigurationError, normalizarContaManualSandbox, validarCadastroManualSandbox } from "./btg-v2/config";

describe("BTG v2 — conta manual Sandbox", () => {
  it("normaliza conta manual sem perder zeros à esquerda e cria ID interno não reversível", () => {
    const conta = normalizarContaManualSandbox({
      rotulo: "Conta de homologação do escritório",
      agencia: "0050",
      numero: "0003081850",
      documentoBeneficiario: "30.306.294/0001-45",
      nomeBeneficiario: "Escritório Gomes & Silva",
    });

    expect(conta).toMatchObject({
      origemCadastro: "manual_sandbox",
      agencia: "0050",
      numero: "0003081850",
      documentoBeneficiario: "30306294000145",
      nomeBeneficiario: "Escritório Gomes & Silva",
      rotulo: "Conta de homologação do escritório",
    });
    expect(conta.accountId).toMatch(/^manual-sandbox:[a-f0-9]{48}$/);
    expect(conta.accountId).not.toContain("0003081850");
  });

  it("rejeita campos incompletos, formatados ou com conteúdo não numérico", () => {
    expect(() => normalizarContaManualSandbox({ rotulo: "Conta", agencia: "50-1", numero: "003" }))
      .toThrow(BtgV2ConfigurationError);
    expect(() => normalizarContaManualSandbox({ rotulo: "Conta", agencia: "50", numero: "" }))
      .toThrow("obrigatórios");
    expect(() => normalizarContaManualSandbox({ rotulo: "Conta", agencia: "50", numero: "003", documentoBeneficiario: "123" }))
      .toThrow("11 ou 14 dígitos");
  });

  it("produz o mesmo ID para os mesmos dados bancários e rótulo", () => {
    const first = normalizarContaManualSandbox({ rotulo: "Conta Teste", agencia: "1", numero: "002" });
    const second = normalizarContaManualSandbox({ rotulo: "Conta Teste", agencia: "1", numero: "002" });
    expect(first.accountId).toBe(second.accountId);
  });

  it("bloqueia cadastro manual fora do Sandbox ou sem OAuth conectado", () => {
    expect(() => validarCadastroManualSandbox({ ambiente: "producao", oauthConectado: true }))
      .toThrow("permitido apenas no Sandbox");
    expect(() => validarCadastroManualSandbox({ ambiente: "sandbox", oauthConectado: false }))
      .toThrow("Conecte a conta BTG Sandbox");
    expect(validarCadastroManualSandbox({ ambiente: "sandbox", oauthConectado: true })).toBeUndefined();
  });
});

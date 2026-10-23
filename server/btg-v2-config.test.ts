import { describe, expect, it } from "vitest";
import {
  BtgV2ConfigurationError,
  normalizarContaRecebedoraBtg,
  validarVinculoContaRecebedora,
  type BtgContaRecebedoraNormalizada,
} from "./btg-v2/config";

describe("BTG v2 — configuração e contas recebedoras", () => {
  it("normaliza e preserva os dados não sensíveis de uma conta retornada pelo BTG", () => {
    const conta = normalizarContaRecebedoraBtg({
      accountId: "30306294000145-208-50-003081850",
      branch: "50",
      number: "003081850",
      taxId: "30.306.294/0001-45",
      legalName: "Empresa Sandbox BTG",
    });

    expect(conta).toEqual({
      accountId: "30306294000145-208-50-003081850",
      agencia: "50",
      numero: "003081850",
      documentoBeneficiario: "30306294000145",
      nomeBeneficiario: "Empresa Sandbox BTG",
    });
  });

  it("aceita as variações documentadas de campos da API de contas", () => {
    const conta = normalizarContaRecebedoraBtg({
      id: "conta-alternativa",
      branchCode: 1,
      accountNumber: 2232343,
      taxId: "10101111000444",
      name: "Escritório Gomes & Silva",
    });

    expect(conta).toMatchObject({
      accountId: "conta-alternativa",
      agencia: "1",
      numero: "2232343",
      documentoBeneficiario: "10101111000444",
      nomeBeneficiario: "Escritório Gomes & Silva",
    });
  });

  it("rejeita conta sem identificador ou dados bancários essenciais", () => {
    expect(() => normalizarContaRecebedoraBtg({ number: "123" }))
      .toThrow(BtgV2ConfigurationError);
    expect(() => normalizarContaRecebedoraBtg({ accountId: "x", branch: "1" }))
      .toThrow("não trouxe agência e número válidos");
  });

  it("requer uma conta ativa vinculada ao condomínio antes da emissão", () => {
    const conta: BtgContaRecebedoraNormalizada = {
      accountId: "conta-1",
      agencia: "1",
      numero: "123",
      documentoBeneficiario: "12345678000190",
      nomeBeneficiario: "Escritório",
    };

    expect(validarVinculoContaRecebedora({
      condominioId: 12,
      integracaoAtiva: true,
      vinculoAtivo: true,
      conta,
    })).toBeUndefined();

    expect(() => validarVinculoContaRecebedora({
      condominioId: 12,
      integracaoAtiva: false,
      vinculoAtivo: true,
      conta,
    })).toThrow("não está ativa");

    expect(() => validarVinculoContaRecebedora({
      condominioId: 12,
      integracaoAtiva: true,
      vinculoAtivo: false,
      conta: null,
    })).toThrow("não possui conta recebedora BTG ativa");
  });
});

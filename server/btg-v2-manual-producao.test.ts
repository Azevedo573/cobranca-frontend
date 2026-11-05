import { describe, expect, it } from "vitest";
import {
  normalizarContaManualProducao,
  normalizarContaManualSandbox,
  validarCadastroManualProducao,
  validarContaRecebedoraParaAmbiente,
  validarIntegracaoRuntimeBtg,
} from "./btg-v2/config";

const companyId = "30306294000145";
const config = { ambiente: "producao" as const, companyId, apiBaseUrl: "https://local.invalid" };
const integracao = { id: 7, ambiente: "producao" as const, companyId, ativo: 1 };
const dados = { rotulo: "Conta escritório", agencia: "0050", numero: "0003081850", documentoBeneficiario: "30.306.294/0001-45", nomeBeneficiario: "Escritório Teste" };
const conta = () => ({ ...normalizarContaManualProducao(dados, companyId), btgIntegracaoId: 7, ativo: 1, confirmadoPorId: 10, confirmadoEm: new Date("2026-11-05T20:00:00Z") });

describe("BTG v2 — contrato manual Produção", () => {
  it("preserva zeros, normaliza titular e usa ID interno isolado e determinístico", () => {
    const normalizada = normalizarContaManualProducao(dados, companyId);
    expect(normalizada).toMatchObject({ agencia: "0050", numero: "0003081850", documentoBeneficiario: companyId, origemCadastro: "manual_producao" });
    expect(normalizada.accountId).toMatch(/^manual-producao:[a-f0-9]{48}$/);
    expect(normalizada.accountId).toBe(normalizarContaManualProducao({ ...dados, rotulo: "Outro rótulo" }, companyId).accountId);
    expect(normalizada.accountId).not.toBe(normalizarContaManualSandbox(dados).accountId);
  });

  it.each([
    { agencia: "50-1" }, { numero: "" }, { numero: "abc" }, { rotulo: "a" },
    { nomeBeneficiario: " " }, { documentoBeneficiario: "30306294000144" },
    { documentoBeneficiario: "00000000000000" }, { documentoBeneficiario: "12345678901" },
    { documentoBeneficiario: "04.252.011/0001-10" }, { documentoBeneficiario: "abc30306294000145" },
  ])("recusa dado inválido ou CNPJ de outro titular: %j", (alteracao) => {
    expect(() => normalizarContaManualProducao({ ...dados, ...alteracao }, companyId)).toThrow();
  });

  it("exige OAuth, Produção e integração consistente sem migrar CNPJ", () => {
    expect(() => validarCadastroManualProducao({ ambiente: "sandbox", oauthConectado: true })).toThrow("Produção");
    expect(() => validarCadastroManualProducao({ ambiente: "producao", oauthConectado: false })).toThrow("Conecte");
    expect(() => validarIntegracaoRuntimeBtg({ ...integracao, companyId: "04252011000110" }, config)).toThrow("CNPJ");
    expect(() => validarIntegracaoRuntimeBtg({ ...integracao, ambiente: "sandbox" }, config)).toThrow("ambiente");
  });

  it("aceita somente origem API ou manual Produção confirmada em Produção", () => {
    expect(() => validarContaRecebedoraParaAmbiente({ conta: conta(), integracao, serverConfig: config })).not.toThrow();
    expect(() => validarContaRecebedoraParaAmbiente({ conta: { ...conta(), origemCadastro: "api", accountId: "official-account" }, integracao, serverConfig: config })).not.toThrow();
    for (const origemCadastro of ["manual_sandbox", "manual", "manual_producao_falsa", ""]) {
      expect(() => validarContaRecebedoraParaAmbiente({ conta: { ...conta(), origemCadastro }, integracao, serverConfig: config })).toThrow();
    }
  });

  it.each([
    { confirmadoPorId: null }, { confirmadoPorId: 0 }, { confirmadoEm: null },
    { confirmadoEm: new Date("invalid") }, { documentoBeneficiario: "04252011000110" },
    { btgIntegracaoId: 8 }, { ativo: 0 }, { accountId: "official-id-fake" }, { nomeBeneficiario: "" },
  ])("revalida confirmação, dados, titular e isolamento em qualquer uso: %j", (alteracao) => {
    expect(() => validarContaRecebedoraParaAmbiente({ conta: { ...conta(), ...alteracao }, integracao, serverConfig: config })).toThrow();
  });

  it("CNPJ atual de runtime invalida conta antiga mesmo que a integração antiga coincida com a conta", () => {
    expect(() => validarContaRecebedoraParaAmbiente({ conta: conta(), integracao, serverConfig: { ...config, companyId: "04252011000110" } })).toThrow("CNPJ");
  });

  it("mantém conta manual Sandbox apenas no ambiente original", () => {
    const sandboxConfig = { ...config, ambiente: "sandbox" as const };
    const sandboxIntegracao = { ...integracao, ambiente: "sandbox" as const };
    const sandboxConta = { ...conta(), ...normalizarContaManualSandbox(dados) };
    expect(() => validarContaRecebedoraParaAmbiente({ conta: sandboxConta, integracao: sandboxIntegracao, serverConfig: sandboxConfig })).not.toThrow();
    expect(() => validarContaRecebedoraParaAmbiente({ conta: conta(), integracao: sandboxIntegracao, serverConfig: sandboxConfig })).toThrow();
  });
});

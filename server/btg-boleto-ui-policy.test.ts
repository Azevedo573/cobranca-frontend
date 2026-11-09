import { describe, expect, it } from "vitest";
import { CONFIRMACAO_CANCELAMENTO_BTG, podeConfirmarCancelamentoUI, podeReapresentarCnabUI, rotuloAmbienteBtg } from "../client/src/lib/btgBoletoUI";

const cnab = { status: "pendente", nossoNumero: "0000012345", canalBancario: "cnab240", remessaId: 2, statusRemessa: "remessa_gerada" };
const confirmacao = { elegivel: true, expiraEm: new Date(200_000), motivo: "Solicitação administrativa", confirmacao: CONFIRMACAO_CANCELAMENTO_BTG, ciente: true, busy: false, enviado: false, agora: 100_000 };

describe("guardas documentais UI BTG", () => {
  it("reapresenta CNAB somente comprovado, sem reserva local como fallback", () => {
    expect(podeReapresentarCnabUI(cnab)).toBe(true);
    expect(podeReapresentarCnabUI({ ...cnab, canalBancario: null, remessaId: null, statusRemessa: "nao_enviado", nossoNumeroOrigem: "reserva_local" })).toBe(false);
    expect(podeReapresentarCnabUI({ ...cnab, remessaId: null, pixCopiaCola: "EMV retornado CNAB" })).toBe(true);
    for (const bloqueio of [{ canalBancario: "api_btg_v2" }, { btgEmissaoV2Existente: true }, { btgBankSlipUrl: "https://banco.test" }, { btgCollectionId: "collection" }, { canalBancario: "legado" }, { status: "pago" }, { status: "cancelado" }, { codigoBloqueioCnab: "api_vinculada" }]) {
      expect(podeReapresentarCnabUI({ ...cnab, ...bloqueio })).toBe(false);
    }
  });
  it("exige motivo, literal exato, ciência e prévia vigente", () => {
    expect(podeConfirmarCancelamentoUI(confirmacao)).toBe(true);
    for (const bloqueio of [{ elegivel: false }, { motivo: "    " }, { motivo: "abcd" }, { motivo: "x".repeat(501) }, { confirmacao: "CANCELAR" }, { confirmacao: "cancelar cobrança btg" }, { ciente: false }, { busy: true }, { enviado: true }, { expiraEm: new Date(100_000) }, { expiraEm: "inválido" }]) {
      expect(podeConfirmarCancelamentoUI({ ...confirmacao, ...bloqueio })).toBe(false);
    }
  });
  it("não presume Sandbox para ambiente desconhecido", () => {
    expect(rotuloAmbienteBtg("producao")).toBe("PRODUÇÃO");
    expect(rotuloAmbienteBtg("sandbox")).toBe("SANDBOX");
    expect(rotuloAmbienteBtg(null)).toBe("AMBIENTE NÃO CONFIRMADO");
  });
});

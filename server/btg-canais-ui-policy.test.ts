import { describe, expect, it } from "vitest";
import {
  CONFIRMACAO_RESERVA_LOCAL,
  caminhoCnabAcordo,
  contextoBancarioBusca,
  elegibilidadeCnabUI,
  podeConfirmarReservaLocalUI,
  podeRevisarReservaLocal,
  preservarSelecaoElegivel,
  rotuloCanalParcela,
  selecionavelApi,
} from "../client/src/lib/btgCanaisUI";
import { verificarElegibilidadeBolePixV2 } from "../client/src/lib/btgV2Eligibility";

const livre = {
  id: 19,
  parcelaId: 19,
  status: "pendente",
  statusRemessa: "nao_enviado",
  canalBancario: null,
  nossoNumero: "1000000018",
  nossoNumeroOrigem: "reserva_local",
};
const ambigua = {
  ...livre,
  nossoNumeroOrigem: null,
  podeConfirmarReserva: true,
};

describe("UI BTG: origem/canal e seleção", () => {
  it("reserva local permite escolher API ou CNAB sem modificar o número", () => {
    expect(verificarElegibilidadeBolePixV2(livre).elegivel).toBe(true);
    expect(elegibilidadeCnabUI(livre).elegivel).toBe(true);
    expect(livre.nossoNumero).toBe("1000000018");
    expect(rotuloCanalParcela(livre)).toContain("Reserva local");
  });
  it.each(["api_btg_v2", "cnab240", "legado", "desconhecido"])(
    "não seleciona título no canal já reservado %s",
    canalBancario => {
      const p = { ...livre, canalBancario, elegivel: true };
      expect(selecionavelApi(p)).toBe(false);
      expect(elegibilidadeCnabUI(p).elegivel).toBe(false);
    }
  );
  it("a prévia API é autoridade e não pode ser liberada por marcador local", () => {
    expect(selecionavelApi({ ...livre, elegivel: false })).toBe(false);
    expect(selecionavelApi(livre)).toBe(false);
    expect(selecionavelApi({ ...livre, elegivel: true })).toBe(true);
  });
  it("bloqueio real CNAB por emissão não exposta prevalece", () => {
    expect(
      elegibilidadeCnabUI({
        ...livre,
        elegivelCnab: false,
        motivoBloqueioCnab: "Estado incerto da API",
      })
    ).toEqual({ elegivel: false, motivo: "Estado incerto da API" });
  });
  it("número de origem desconhecida não é liberado por flags visuais", () => {
    expect(verificarElegibilidadeBolePixV2(ambigua).elegivel).toBe(false);
    expect(
      elegibilidadeCnabUI({ ...ambigua, elegivelCnab: true }).elegivel
    ).toBe(false);
    expect(rotuloCanalParcela(ambigua)).toContain("origem não confirmada");
  });
  it.each(["pago", "cancelado", "desconhecido"])(
    "status %s impede nova operação",
    status => {
      expect(elegibilidadeCnabUI({ ...livre, status }).elegivel).toBe(false);
      expect(
        verificarElegibilidadeBolePixV2({ ...livre, status }).elegivel
      ).toBe(false);
    }
  );
  it("evidências bancárias prevalecem sobre a reserva local", () => {
    expect(rotuloCanalParcela({ ...livre, remessaId: 7 })).toContain("CNAB");
    expect(
      rotuloCanalParcela({ ...livre, btgCollectionId: "legacy" })
    ).toContain("legado");
    expect(
      rotuloCanalParcela({ ...livre, codigoBloqueio: "api_vinculada" })
    ).toContain("API BTG v2");
    expect(
      rotuloCanalParcela({ ...livre, codigoBloqueioCnab: "api_vinculada" })
    ).toContain("API BTG v2");
    expect(
      elegibilidadeCnabUI({ ...livre, btgEmissaoV2Existente: true }).elegivel
    ).toBe(false);
  });
  it("revalidação mantém seleção livre e remove bloqueios sem pré-selecionar reserva confirmada", () => {
    expect([
      ...preservarSelecaoElegivel(new Set([1, 2]), [
        { id: 1, elegivel: true },
        { id: 2, elegivel: false },
        { id: 19, elegivel: true },
      ]),
    ]).toEqual([1]);
    expect([
      ...preservarSelecaoElegivel(new Set(), [{ id: 19, elegivel: true }]),
    ]).toEqual([]);
  });
});

describe("UI: confirmação administrativa individual", () => {
  it("exige flag real do backend, não infere autorização por número", () => {
    expect(
      podeRevisarReservaLocal(
        { ...ambigua, podeConfirmarReserva: false },
        "admin"
      )
    ).toBe(false);
    expect(podeRevisarReservaLocal(ambigua, "admin")).toBe(true);
    expect(
      podeRevisarReservaLocal(
        {
          ...ambigua,
          podeConfirmarReserva: false,
          confirmarReservaDisponivel: true,
        },
        "admin"
      )
    ).toBe(true);
  });
  it.each([
    "sindico",
    "colaborador",
    "advogado",
    "cobrador",
    "gerente_juridica",
    undefined,
  ])("perfil %s não confirma", role => {
    expect(podeRevisarReservaLocal(ambigua, role)).toBe(false);
  });
  it("exige literal exato e declaração; não tolera trim nem confirmação de envio", () => {
    const base = {
      parcela: ambigua,
      role: "admin",
      confirmacao: CONFIRMACAO_RESERVA_LOCAL,
      declaracaoNaoEncaminhada: true,
    };
    expect(podeConfirmarReservaLocalUI(base)).toBe(true);
    for (const confirmacao of [
      "",
      "confirmar reserva local",
      "CONFIRMAR RESERVA LOCAL ",
      "ENVIAR REMESSA",
      "ENVIAR API BTG",
    ])
      expect(podeConfirmarReservaLocalUI({ ...base, confirmacao })).toBe(false);
    expect(
      podeConfirmarReservaLocalUI({ ...base, declaracaoNaoEncaminhada: false })
    ).toBe(false);
    expect(podeConfirmarReservaLocalUI({ ...base, pendente: true })).toBe(
      false
    );
    expect(
      podeConfirmarReservaLocalUI({
        ...base,
        parcela: { ...ambigua, canalBancario: "api_btg_v2" },
      })
    ).toBe(false);
  });
});

describe("CNAB alternativo preserva contexto válido", () => {
  it("navega para rota real com contexto sem criar outro acordo", () => {
    expect(caminhoCnabAcordo(5, 3)).toBe(
      "/admin/cnab240?acordoId=5&condominioId=3"
    );
    expect(contextoBancarioBusca("?acordoId=5&condominioId=3")).toEqual({
      acordoId: 5,
      condominioId: 3,
    });
  });
  it.each(["-1", "0", "abc", "1.5", "1e3", "9007199254740992"])(
    "ignora id inválido %s",
    valor => {
      expect(
        contextoBancarioBusca(`acordoId=${valor}&condominioId=${valor}`)
      ).toEqual({ acordoId: null, condominioId: null });
    }
  );
});

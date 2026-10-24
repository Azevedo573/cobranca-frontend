import { describe, expect, it } from "vitest";
import {
  BtgV2ConfigurationError,
  avaliarElegibilidadeParcelaAcordoBtgV2,
  validarAcordoAtivoBtgV2,
  validarSelecaoParcelasAcordoBtgV2,
} from "./btg-v2/issuance";

describe("BTG v2 — emissão por acordo", () => {
  it("considera pendente, atrasada e entrada pendente como parcelas elegíveis", () => {
    expect(avaliarElegibilidadeParcelaAcordoBtgV2({ status: "pendente" })).toEqual({ elegivel: true, motivo: null });
    expect(avaliarElegibilidadeParcelaAcordoBtgV2({ status: "atrasado" })).toEqual({ elegivel: true, motivo: null });
    expect(avaliarElegibilidadeParcelaAcordoBtgV2({ status: "pendente", installmentNumber: 0 })).toEqual({ elegivel: true, motivo: null });
  });

  it("bloqueia parcela paga, cancelada ou vinculada ao fluxo legado", () => {
    expect(avaliarElegibilidadeParcelaAcordoBtgV2({ status: "pago" })).toMatchObject({ elegivel: false });
    expect(avaliarElegibilidadeParcelaAcordoBtgV2({ status: "cancelado" })).toMatchObject({ elegivel: false });
    expect(avaliarElegibilidadeParcelaAcordoBtgV2({ status: "pendente", nossoNumero: "123" })).toMatchObject({ elegivel: false });
    expect(avaliarElegibilidadeParcelaAcordoBtgV2({ status: "pendente", remessaId: 77 })).toMatchObject({ elegivel: false });
    expect(avaliarElegibilidadeParcelaAcordoBtgV2({ status: "pendente", btgCollectionId: "legado" })).toMatchObject({ elegivel: false });
  });

  it("exige acordo ativo", () => {
    expect(() => validarAcordoAtivoBtgV2("ativo")).not.toThrow();
    expect(() => validarAcordoAtivoBtgV2("cancelado")).toThrow(BtgV2ConfigurationError);
    expect(() => validarAcordoAtivoBtgV2("pago")).toThrow("acordo ativo");
  });

  it("rejeita antes do envio seleção de outro acordo, id inexistente ou parcela bloqueada", () => {
    const parcelas = [
      { id: 10, acordoId: 1, status: "pendente" as const },
      { id: 11, acordoId: 1, status: "atrasado" as const },
      { id: 12, acordoId: 2, status: "pendente" as const },
      { id: 13, acordoId: 1, status: "pago" as const },
    ];

    expect(validarSelecaoParcelasAcordoBtgV2({ acordoId: 1, parcelaIds: [10, 11], parcelas })).toHaveLength(2);
    expect(() => validarSelecaoParcelasAcordoBtgV2({ acordoId: 1, parcelaIds: [12], parcelas })).toThrow("não pertence");
    expect(() => validarSelecaoParcelasAcordoBtgV2({ acordoId: 1, parcelaIds: [99], parcelas })).toThrow("não foi encontrada");
    expect(() => validarSelecaoParcelasAcordoBtgV2({ acordoId: 1, parcelaIds: [13], parcelas })).toThrow("paga ou cancelada");
  });
});

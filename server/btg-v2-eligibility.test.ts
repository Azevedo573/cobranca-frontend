import { describe, expect, it } from "vitest";
import { verificarElegibilidadeBolePixV2 } from "../client/src/lib/btgV2Eligibility";

describe("elegibilidade visual BolePix v2", () => {
  it("permite cobrança comum pendente sem vínculo legado", () => {
    expect(verificarElegibilidadeBolePixV2({ status: "pendente", statusRemessa: "nao_enviado" }))
      .toEqual({ elegivel: true, motivo: null });
  });

  it("permite parcela de acordo pendente sem vínculo legado", () => {
    expect(verificarElegibilidadeBolePixV2({ status: "atrasado", statusRemessa: "nao_enviado" }))
      .toEqual({ elegivel: true, motivo: null });
  });

  it.each(["pago", "cancelado"])("bloqueia título %s", (status) => {
    expect(verificarElegibilidadeBolePixV2({ status })).toMatchObject({ elegivel: false, motivo: "Título pago ou cancelado" });
  });

  it("bloqueia título com remessa, nosso número ou coleção do fluxo legado", () => {
    expect(verificarElegibilidadeBolePixV2({ status: "pendente", remessaId: 12 })).toMatchObject({ elegivel: false });
    expect(verificarElegibilidadeBolePixV2({ status: "pendente", nossoNumero: "12345" })).toMatchObject({ elegivel: false });
    expect(verificarElegibilidadeBolePixV2({ status: "pendente", btgCollectionId: "legacy-id" })).toMatchObject({ elegivel: false });
  });
});

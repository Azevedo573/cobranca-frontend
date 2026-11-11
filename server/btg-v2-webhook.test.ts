import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  mapearStatusWebhookBtgV2,
  validarAutenticacaoWebhookBtgV2,
  valorPagoWebhookBtgEmCentavos,
} from "./btg-v2/webhook";

describe("BTG v2 — webhook Bearer", () => {
  it("autentica o segredo Bearer documentado pelo BTG", () => {
    const secret = "segredo-de-teste";
    expect(validarAutenticacaoWebhookBtgV2(`Bearer ${secret}`, secret)).toBe(true);
    expect(validarAutenticacaoWebhookBtgV2(`bearer ${secret}`, secret)).toBe(true);
    expect(validarAutenticacaoWebhookBtgV2("Bearer outro-segredo", secret)).toBe(false);
  });

  it.each([undefined, null, [], ["Bearer segredo"], "", "Basic segredo", "segredo", "Bearer ", "Bearer  segredo", "Bearer segredo ", " Bearer segredo", "Bearer segredo, Bearer segredo", "Bearer seg\nredo", "Bearer seg\tredo"])(
    "recusa cabeçalho ausente, múltiplo ou malformado: %j", value => {
      expect(validarAutenticacaoWebhookBtgV2(value, "segredo")).toBe(false);
    },
  );

  it("recusa segredo ausente e nunca aceita HMAC como substituto", () => {
    expect(validarAutenticacaoWebhookBtgV2("Bearer segredo", "")).toBe(false);
    expect(validarAutenticacaoWebhookBtgV2("Bearer segredo", "seg redo")).toBe(false);
    const assinatura = createHmac("sha256", "segredo").update('{"event":"collections.paid"}').digest("hex");
    expect(validarAutenticacaoWebhookBtgV2(assinatura, "segredo")).toBe(false);
  });

  it("mapeia eventos sem regredir pagamento ou reabrir título encerrado por criação tardia", () => {
    expect(mapearStatusWebhookBtgV2("collections.created", "emitida")).toBe("emitida");
    expect(mapearStatusWebhookBtgV2("collections.paid", "emitida")).toBe("paga");
    expect(mapearStatusWebhookBtgV2("collections.expired", "emitida")).toBe("expirada");
    for (const nome of ["collections.cancelled", "collections.canceled", "colections.cancelled"]) {
      expect(mapearStatusWebhookBtgV2(nome, "emitida")).toBe("cancelada");
    }
    for (const nome of ["collections.created", "collections.expired", "collections.cancelled"]) {
      expect(mapearStatusWebhookBtgV2(nome, "paga")).toBe("paga");
    }
    expect(mapearStatusWebhookBtgV2("collections.created", "cancelada")).toBe("cancelada");
    expect(mapearStatusWebhookBtgV2("collections.created", "expirada")).toBe("expirada");
    expect(mapearStatusWebhookBtgV2("collections.expired", "cancelada")).toBe("cancelada");
    expect(mapearStatusWebhookBtgV2("evento.desconhecido", "emitida")).toBe("emitida");
  });

  it("converte prova paga externa em reais para centavos, sem substituir pelo nominal", () => {
    expect(valorPagoWebhookBtgEmCentavos({ amountPaid: 92 })).toBe(9200);
    expect(valorPagoWebhookBtgEmCentavos({ paidAmount: 92 })).toBe(9200);
    expect(
      valorPagoWebhookBtgEmCentavos({ amountPaid: 92, paidAmount: 92 })
    ).toBe(9200);
    expect(valorPagoWebhookBtgEmCentavos({ amountPaid: 5.84 })).toBe(584);
    expect(valorPagoWebhookBtgEmCentavos({ paidAmount: 5.84 })).toBe(584);
    expect(valorPagoWebhookBtgEmCentavos({ amountPaid: 5 })).toBe(500);
    expect(valorPagoWebhookBtgEmCentavos({ amountPaid: 9200 })).toBe(920000);
    expect(valorPagoWebhookBtgEmCentavos({ amountPaid: 0 })).toBe(0);
    expect(valorPagoWebhookBtgEmCentavos({})).toBeNull();
    expect(valorPagoWebhookBtgEmCentavos({ amountPaid: "9200" })).toBeNull();
    expect(valorPagoWebhookBtgEmCentavos({ amountPaid: 92.01 })).toBe(9201);
    expect(valorPagoWebhookBtgEmCentavos({ amountPaid: 92.001 })).toBeNull();
    expect(valorPagoWebhookBtgEmCentavos({ amountPaid: -1 })).toBeNull();
    expect(
      valorPagoWebhookBtgEmCentavos({ amountPaid: Number.NaN })
    ).toBeNull();
    expect(
      valorPagoWebhookBtgEmCentavos({ amountPaid: Number.MAX_SAFE_INTEGER + 1 })
    ).toBeNull();
    expect(
      valorPagoWebhookBtgEmCentavos({ amountPaid: 92, paidAmount: 91 })
    ).toBeNull();
    expect(
      valorPagoWebhookBtgEmCentavos({ amountPaid: 92, paidAmount: null })
    ).toBeNull();
    expect(valorPagoWebhookBtgEmCentavos({ amountPaid: true })).toBeNull();
    expect(
      valorPagoWebhookBtgEmCentavos({ amountPaid: Number.POSITIVE_INFINITY })
    ).toBeNull();
    // Mesmo um inteiro externo seguro deve caber após conversão para centavos.
    expect(
      valorPagoWebhookBtgEmCentavos({ amountPaid: Number.MAX_SAFE_INTEGER })
    ).toBeNull();
  });
});

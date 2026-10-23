import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  mapearStatusWebhookBtgV2,
  validarAssinaturaWebhookBtgV2,
} from "./btg-v2/webhook";

describe("BTG v2 — webhook", () => {
  it("valida HMAC-SHA256 sobre os bytes originais do corpo", () => {
    const secret = "segredo-de-teste";
    const raw = Buffer.from('{"event":"collections.paid","data":{"collectionId":"abc"}}');
    const signature = createHmac("sha256", secret).update(raw).digest("hex");

    expect(validarAssinaturaWebhookBtgV2(raw, signature, secret)).toBe(true);
    expect(validarAssinaturaWebhookBtgV2(raw, "assinatura-invalida", secret)).toBe(false);
    expect(validarAssinaturaWebhookBtgV2(Buffer.from(raw.toString() + " "), signature, secret)).toBe(false);
  });

  it("mapeia eventos BTG para estados v2 sem permitir regressão após pagamento", () => {
    expect(mapearStatusWebhookBtgV2("collections.created", "emitida")).toBe("emitida");
    expect(mapearStatusWebhookBtgV2("collections.paid", "emitida")).toBe("paga");
    expect(mapearStatusWebhookBtgV2("collections.expired", "emitida")).toBe("expirada");
    expect(mapearStatusWebhookBtgV2("collections.cancelled", "emitida")).toBe("cancelada");
    expect(mapearStatusWebhookBtgV2("collections.cancelled", "paga")).toBe("paga");
  });
});

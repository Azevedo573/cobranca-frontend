import { describe, expect, it } from "vitest";
import { mapearStatusCollectionsV2 } from "./btg-v2/settlement";

describe("BTG v2 — conciliação", () => {
  it("traduz status oficiais de Collections para estados canônicos internos", () => {
    expect(mapearStatusCollectionsV2("CREATED", "reservada")).toBe("emitida");
    expect(mapearStatusCollectionsV2("PROCESSING", "emitida")).toBe("emitida");
    expect(mapearStatusCollectionsV2("PAID", "emitida")).toBe("paga");
    expect(mapearStatusCollectionsV2("EXPIRED", "emitida")).toBe("expirada");
    expect(mapearStatusCollectionsV2("CANCELED", "emitida")).toBe("cancelada");
    expect(mapearStatusCollectionsV2("FAILED", "emitida")).toBe("falha");
  });

  it("não permite que uma cobrança paga regrida por evento posterior", () => {
    expect(mapearStatusCollectionsV2("CANCELED", "paga")).toBe("paga");
    expect(mapearStatusCollectionsV2("EXPIRED", "paga")).toBe("paga");
  });
});

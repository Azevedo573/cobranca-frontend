import { describe, expect, it } from "vitest";
import { normalizarErroRegua } from "./job-regua";

describe("normalizarErroRegua", () => {
  it("mantém uma mensagem de erro legível em uma única linha", () => {
    expect(normalizarErroRegua(new Error("  Falha\n  na régua  "))).toBe("Falha na régua");
  });

  it("limita mensagens longas no histórico operacional", () => {
    expect(normalizarErroRegua("x".repeat(1_500))).toHaveLength(1_000);
  });
});

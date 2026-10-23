import { describe, expect, it } from "vitest";
import {
  calcularDataLimiteBtgV2,
  gerarExternalIdBtgV2,
  gerarIdempotencyKeyBtgV2,
} from "./btg-v2/issuance";

describe("BTG v2 — proteção de emissão", () => {
  it("gera identificadores diferentes por ambiente e estáveis para a mesma origem", () => {
    const sandbox = gerarExternalIdBtgV2("sandbox", "cobranca", 42);
    const producao = gerarExternalIdBtgV2("producao", "cobranca", 42);

    expect(sandbox).toBe("v2:sbx:cobranca:42:r1");
    expect(producao).toBe("v2:prd:cobranca:42:r1");
    expect(gerarIdempotencyKeyBtgV2(sandbox)).toHaveLength(64);
    expect(gerarIdempotencyKeyBtgV2(sandbox)).toBe(gerarIdempotencyKeyBtgV2(sandbox));
    expect(gerarIdempotencyKeyBtgV2(sandbox)).not.toBe(gerarIdempotencyKeyBtgV2(producao));
  });

  it("calcula data limite de pagamento em UTC e bloqueia políticas inválidas", () => {
    const vencimento = new Date("2026-11-15T12:00:00.000Z");
    expect(calcularDataLimiteBtgV2(vencimento, 60).toISOString()).toBe("2027-01-14T12:00:00.000Z");
    expect(() => calcularDataLimiteBtgV2(vencimento, 0)).toThrow("entre 1 e 365");
    expect(() => calcularDataLimiteBtgV2(vencimento, 366)).toThrow("entre 1 e 365");
  });
});

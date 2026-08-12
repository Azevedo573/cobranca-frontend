import { describe, expect, it } from "vitest";
import { encontrarProcessoPorCNJ, normalizarNumeroCNJ } from "./processos-cnj";

describe("deduplicação de processo por CNJ", () => {
  it("normaliza diferentes máscaras do mesmo número CNJ", () => {
    expect(normalizarNumeroCNJ("0002295-31.2021.8.19.0208")).toBe("00022953120218190208");
  });

  it("localiza o processo existente antes de criar um duplicado", () => {
    const processo = { id: 42, numeroCNJ: "0002295-31.2021.8.19.0208" };
    const encontrado = encontrarProcessoPorCNJ([processo], "00022953120218190208");
    expect(encontrado?.id).toBe(42);
  });
});

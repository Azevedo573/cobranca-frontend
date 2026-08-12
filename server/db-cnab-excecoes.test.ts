import { describe, expect, it } from "vitest";
import { classificarExcecaoRetorno } from "./db-cnab";

describe("classificarExcecaoRetorno", () => {
  it("prioriza como alta uma falha de processamento", () => {
    expect(classificarExcecaoRetorno({ statusProcessamento: "erro", valorPago: 0 })).toBe("alta");
  });

  it("prioriza como alta um título não encontrado com valor recebido", () => {
    expect(classificarExcecaoRetorno({ statusProcessamento: "nao_encontrado", valorPago: 12500 })).toBe("alta");
  });

  it("mantém como média um título não encontrado sem pagamento associado", () => {
    expect(classificarExcecaoRetorno({ statusProcessamento: "nao_encontrado", valorPago: 0 })).toBe("media");
  });
});

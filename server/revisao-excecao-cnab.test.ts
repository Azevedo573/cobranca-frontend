import { describe, expect, it } from "vitest";
import { ACOES_REVISAO_MANUAL, decisaoAlteraFinanceiro, validarDecisaoManual } from "./revisao-excecao-cnab";

describe("revisão manual de exceção CNAB", () => {
  it("oferece apenas decisões sem baixa financeira", () => {
    expect(ACOES_REVISAO_MANUAL).toEqual(["em_revisao", "ignorada", "demanda_criada"]);
    expect(decisaoAlteraFinanceiro()).toBe(false);
  });

  it("exige demanda vinculada somente para a decisão de criar demanda", () => {
    expect(() => validarDecisaoManual("demanda_criada")).toThrow("identificador da demanda");
    expect(() => validarDecisaoManual("demanda_criada", 17)).not.toThrow();
    expect(() => validarDecisaoManual("ignorada")).not.toThrow();
  });
});

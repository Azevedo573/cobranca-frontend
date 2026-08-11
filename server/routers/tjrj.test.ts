import { describe, expect, it } from "vitest";
import { movimentoTjrjDiverge } from "./tjrj";

describe("movimentoTjrjDiverge", () => {
  const movimento = { ordem: 86, descrMov: "Remessa", dtMovimento: "10/08/2026", descricao: "Texto original" };

  it("identifica JSON ausente como pendente de reparo", () => {
    expect(movimentoTjrjDiverge(null, movimento)).toBe(true);
  });

  it("identifica JSON associado à ordem errada como pendente de reparo", () => {
    expect(movimentoTjrjDiverge(JSON.stringify({ ...movimento, ordem: 1 }), movimento)).toBe(true);
  });

  it("preserva movimentação cujo JSON representa o mesmo evento do TJRJ", () => {
    expect(movimentoTjrjDiverge(JSON.stringify(movimento), movimento)).toBe(false);
  });
});

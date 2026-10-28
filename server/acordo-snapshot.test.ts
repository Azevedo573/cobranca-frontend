import { describe, expect, it } from "vitest";
import { criarSnapshotBaseAcordo } from "../shared/snapshot-acordo";

describe("criarSnapshotBaseAcordo", () => {
  it("preserva integralmente a base histórica para a entrada e as parcelas do mesmo acordo", () => {
    const snapshot = criarSnapshotBaseAcordo({
      principal: 10000,
      juros: 73,
      multa: 200,
      correcao: 0,
      honorarios: 1027,
      valorAtualizado: 11301,
      descricao: "Cota condominial 10/2026",
    });

    expect(snapshot).toEqual({
      snapshotPrincipal: 10000,
      snapshotJuros: 73,
      snapshotMulta: 200,
      snapshotCorrecao: 0,
      snapshotHonorarios: 1027,
      snapshotValorAtualizado: 11301,
      snapshotDescricao: "Cota condominial 10/2026",
    });
  });
});

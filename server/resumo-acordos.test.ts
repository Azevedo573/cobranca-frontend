import { describe, expect, it } from "vitest";
import { agruparParcelasPorAcordo } from "../client/src/lib/resumoAcordos";

const parcelas = [
  { id: 1, acordoId: 1470001, installmentNumber: 1, amount: 6827, dueDate: new Date("2026-10-28T12:00:00Z"), status: "pendente" },
  { id: 2, acordoId: 1470001, installmentNumber: 2, amount: 6827, dueDate: new Date("2026-11-28T12:00:00Z"), status: "pendente" },
  { id: 3, acordoId: 1470001, installmentNumber: 3, amount: 6827, dueDate: new Date("2026-12-28T12:00:00Z"), status: "pendente" },
  { id: 4, acordoId: 1470001, installmentNumber: 4, amount: 6827, dueDate: new Date("2027-01-28T12:00:00Z"), status: "pendente" },
];

describe("agruparParcelasPorAcordo", () => {
  it("consolida quatro parcelas do mesmo acordo em uma única linha-resumo", () => {
    const resumos = agruparParcelasPorAcordo(parcelas);

    expect(resumos).toHaveLength(1);
    expect(resumos[0]).toMatchObject({
      acordoId: 1470001,
      quantidadeParcelas: 4,
      parcelasPagas: 0,
      totalNegociado: 27308,
      saldoEmAberto: 27308,
      status: "pendente",
    });
    expect(resumos[0].proximoVencimento?.toISOString()).toBe("2026-10-28T12:00:00.000Z");
  });

  it("mantém acordos distintos em linhas separadas e ordenados pelo próximo vencimento", () => {
    const resumos = agruparParcelasPorAcordo([
      ...parcelas,
      { id: 5, acordoId: 1470002, installmentNumber: 1, amount: 9900, dueDate: new Date("2026-10-15T12:00:00Z"), status: "pendente" },
    ]);

    expect(resumos.map((resumo) => resumo.acordoId)).toEqual([1470002, 1470001]);
  });

  it("não considera parcelas pagas ou canceladas no saldo e no próximo vencimento", () => {
    const resumos = agruparParcelasPorAcordo([
      { ...parcelas[0], status: "pago" },
      { ...parcelas[1], status: "cancelado" },
      { ...parcelas[2], status: "atrasado" },
    ]);

    expect(resumos[0]).toMatchObject({
      parcelasPagas: 1,
      saldoEmAberto: 6827,
      status: "atrasado",
    });
    expect(resumos[0].proximoVencimento?.toISOString()).toBe("2026-12-28T12:00:00.000Z");
  });
});

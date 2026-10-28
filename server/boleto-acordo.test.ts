import { describe, expect, it } from "vitest";
import {
  montarContextoBoletoAcordo,
  type ParcelaBoletoAcordo,
} from "./boleto-acordo";

const parcelas: ParcelaBoletoAcordo[] = [
  {
    id: 1440001,
    installmentNumber: 0,
    amount: 5000,
    dueDate: new Date("2026-10-26T12:00:00.000Z"),
    status: "pendente",
  },
  {
    id: 1440002,
    installmentNumber: 1,
    amount: 6301,
    dueDate: new Date("2026-10-30T12:00:00.000Z"),
    status: "pendente",
  },
];

describe("montarContextoBoletoAcordo", () => {
  it("identifica a entrada como o documento atual e mantém o valor do título separado do total do acordo", () => {
    const contexto = montarContextoBoletoAcordo({
      acordoId: 1410001,
      valorOrigem: 11301,
      totalNegociado: 11301,
      parcelaAtualId: 1440001,
      parcelas,
    });

    expect(contexto.referenciaParcelaAtual).toBe("Entrada do Acordo #1410001");
    expect(contexto.valorDocumento).toBe(5000);
    expect(contexto.valorOrigem).toBe(11301);
    expect(contexto.totalNegociado).toBe(11301);
    expect(contexto.saldoAposEstePagamento).toBe(6301);
    expect(contexto.parcelas).toEqual([
      expect.objectContaining({
        id: 1440001,
        etapa: "Entrada",
        valor: 5000,
        situacao: "Este boleto",
        documentoAtual: true,
      }),
      expect.objectContaining({
        id: 1440002,
        etapa: "Parcela 1/1",
        valor: 6301,
        situacao: "A vencer",
        documentoAtual: false,
      }),
    ]);
  });

  it("considera parcelas anteriormente pagas ao calcular o saldo posterior do documento atual", () => {
    const contexto = montarContextoBoletoAcordo({
      acordoId: 900,
      totalNegociado: 15000,
      parcelaAtualId: 3,
      parcelas: [
        {
          id: 1,
          installmentNumber: 0,
          amount: 3000,
          dueDate: new Date("2026-01-10T12:00:00.000Z"),
          status: "pago",
        },
        {
          id: 2,
          installmentNumber: 1,
          amount: 6000,
          dueDate: new Date("2026-02-10T12:00:00.000Z"),
          status: "pago",
        },
        {
          id: 3,
          installmentNumber: 2,
          amount: 6000,
          dueDate: new Date("2026-03-10T12:00:00.000Z"),
          status: "pendente",
        },
      ],
    });

    expect(contexto.referenciaParcelaAtual).toBe("Parcela 2/2 do Acordo #900");
    expect(contexto.saldoAposEstePagamento).toBe(0);
  });

  it("bloqueia contexto quando a parcela informada não pertence ao plano", () => {
    expect(() => montarContextoBoletoAcordo({
      acordoId: 1410001,
      totalNegociado: 11301,
      parcelaAtualId: 999999,
      parcelas,
    })).toThrow("Parcela atual não pertence ao acordo");
  });
});

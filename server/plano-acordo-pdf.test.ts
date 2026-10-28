import { describe, expect, it } from "vitest";
import {
  dividirParcelasEmPaginas,
  gerarPlanoCompletoAcordoPDF,
  resumirPlanoBoletoAcordo,
  type ParcelaResumoPlanoAcordo,
} from "./plano-acordo-pdf";

function parcela(
  installmentNumber: number,
  amount: number,
  dueDate: string,
  status: ParcelaResumoPlanoAcordo["status"] = "pendente",
): ParcelaResumoPlanoAcordo {
  return {
    id: installmentNumber + 100,
    installmentNumber,
    amount,
    dueDate: new Date(`${dueDate}T12:00:00.000Z`),
    status,
    paymentDate: status === "pago" ? new Date(`${dueDate}T12:00:00.000Z`) : null,
  };
}

describe("resumirPlanoBoletoAcordo", () => {
  it("reduz entrada e 64 parcelas em um resumo sem usar o total do acordo como valor do título", () => {
    const parcelas = [
      parcela(0, 5000, "2026-10-28"),
      ...Array.from({ length: 64 }, (_, index) =>
        parcela(index + 1, 6827, `2026-${String((index % 12) + 1).padStart(2, "0")}-28`),
      ),
    ];

    const resumo = resumirPlanoBoletoAcordo(parcelas);

    expect(resumo.quantidadeEtapas).toBe(65);
    expect(resumo.entrada).toMatchObject({ valor: 5000, rotulo: "Entrada" });
    expect(resumo.quantidadeParcelasRegulares).toBe(64);
    expect(resumo.valorMinimoParcela).toBe(6827);
    expect(resumo.valorMaximoParcela).toBe(6827);
    expect(resumo.totalPlano).toBe(5000 + 64 * 6827);
    expect(resumo.parcelasQuitadas).toBe(0);
  });

  it("mantém o saldo em aberto separado das parcelas canceladas e quitadas", () => {
    const resumo = resumirPlanoBoletoAcordo([
      parcela(0, 3000, "2026-01-10", "pago"),
      parcela(1, 6000, "2026-02-10", "pago"),
      parcela(2, 6000, "2026-03-10", "pendente"),
      parcela(3, 6000, "2026-04-10", "cancelado"),
    ]);

    expect(resumo.parcelasQuitadas).toBe(2);
    expect(resumo.valorPago).toBe(9000);
    expect(resumo.saldoEmAberto).toBe(6000);
  });
});

describe("dividirParcelasEmPaginas", () => {
  it("paginar 65 etapas em blocos completos, sem criar uma página por célula", () => {
    const parcelas = Array.from({ length: 65 }, (_, index) => parcela(index, 1000, "2026-10-28"));
    const paginas = dividirParcelasEmPaginas(parcelas, 24);

    expect(paginas).toHaveLength(3);
    expect(paginas.map((pagina) => pagina.length)).toEqual([24, 24, 17]);
    expect(paginas.flat().map((item) => item.id)).toEqual(parcelas.map((item) => item.id));
  });

  it("rejeita tamanho de página inválido para prevenir loop de paginação", () => {
    expect(() => dividirParcelasEmPaginas([parcela(1, 1000, "2026-10-28")], 0))
      .toThrow("O tamanho da página deve ser maior que zero");
  });
});

describe("gerarPlanoCompletoAcordoPDF", () => {
  it("gera documento informativo mesmo sem configuração bancária, Pix ou nosso número", async () => {
    const pdf = await gerarPlanoCompletoAcordoPDF({
      acordo: {
        id: 1500001,
        totalAmount: 11301,
        agreedAmount: 11301,
        installments: 1,
        paymentFrequency: "mensal",
        status: "ativo",
        valorPago: 0,
        notes: null,
        createdAt: new Date("2026-10-28T12:00:00.000Z"),
      },
      condominio: { name: "Condomínio de Teste", cnpj: null },
      devedor: { name: "Pagador de Teste", unitNumber: "101", bloco: "A", cpfCnpj: null },
      parcelas: [
        parcela(0, 5000, "2026-10-28"),
        parcela(1, 6301, "2026-11-28"),
      ],
      geradoEm: new Date("2026-10-28T12:00:00.000Z"),
    });

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1_000);
  });
});

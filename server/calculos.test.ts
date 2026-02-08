import { describe, it, expect } from "vitest";
import { calcularValorDevido } from "../shared/calculos";

describe("Cálculos de Cobrança com Custas e Correção Monetária", () => {
  const taxas = {
    taxaJurosMensal: 1.0, // 1% ao mês
    taxaMulta: 2.0, // 2%
    taxaHonorarios: 10.0, // 10%
    correcaoMonetaria: 0.5, // 0.5% ao mês
  };

  it("deve calcular valor devid com custas judiciais", () => {
    const valorOriginal = 1000; // R$ 1.000,00
    const dataVencimento = new Date("2025-12-01");
    const custasJudiciais = 200; // R$ 200,00

    const resultado = calcularValorDevido(
      valorOriginal,
      dataVencimento,
      taxas,
      custasJudiciais
    );

    // Verificar que custas foram incluídas
    expect(resultado.custasJudiciais).toBe(200);
    expect(resultado.valorTotal).toBeGreaterThan(valorOriginal + custasJudiciais);
  });

  it("deve calcular correção monetária baseada em tempo de atraso", () => {
    const valorOriginal = 1000; // R$ 1.000,00
    // Data de vencimento há 3 meses atrás
    const dataVencimento = new Date();
    dataVencimento.setMonth(dataVencimento.getMonth() - 3);

    const resultado = calcularValorDevido(
      valorOriginal,
      dataVencimento,
      taxas,
      0
    );

    // Com 3 meses de atraso, correção monetária deve ser aplicada
    expect(resultado.correcaoMonetaria).toBeGreaterThan(0);
    // Correção aproximada: 1000 * 0.5% * 3 = 15
    expect(resultado.correcaoMonetaria).toBeCloseTo(15, 1);
  });

  it("deve calcular valor total incluindo todos os encargos", () => {
    const valorOriginal = 1000; // R$ 1.000,00
    const dataVencimento = new Date();
    dataVencimento.setMonth(dataVencimento.getMonth() - 2); // 2 meses atrás
    const custasJudiciais = 150; // R$ 150,00

    const resultado = calcularValorDevido(
      valorOriginal,
      dataVencimento,
      taxas,
      custasJudiciais
    );

    // Verificar que todos os componentes estão presentes
    expect(resultado.valorOriginal).toBe(1000);
    expect(resultado.juros).toBeGreaterThan(0);
    expect(resultado.multa).toBeGreaterThan(0);
    expect(resultado.honorarios).toBeGreaterThan(0);
    expect(resultado.custasJudiciais).toBe(150);
    expect(resultado.correcaoMonetaria).toBeGreaterThan(0);

    // Valor total deve ser a soma de todos
    const somaEsperada =
      resultado.valorOriginal +
      resultado.juros +
      resultado.multa +
      resultado.honorarios +
      resultado.custasJudiciais +
      resultado.correcaoMonetaria;

    expect(resultado.valorTotal).toBeCloseTo(somaEsperada, 2);
  });

  it("deve funcionar sem custas judiciais (padrão 0)", () => {
    const valorOriginal = 1000;
    const dataVencimento = new Date();
    dataVencimento.setMonth(dataVencimento.getMonth() - 1);

    const resultado = calcularValorDevido(
      valorOriginal,
      dataVencimento,
      taxas
    );

    expect(resultado.custasJudiciais).toBe(0);
    expect(resultado.valorTotal).toBeGreaterThan(valorOriginal);
  });

  it("deve funcionar sem correção monetária (taxa 0)", () => {
    const taxasSemCorrecao = {
      ...taxas,
      correcaoMonetaria: 0,
    };

    const valorOriginal = 1000;
    const dataVencimento = new Date();
    dataVencimento.setMonth(dataVencimento.getMonth() - 3);

    const resultado = calcularValorDevido(
      valorOriginal,
      dataVencimento,
      taxasSemCorrecao,
      0
    );

    expect(resultado.correcaoMonetaria).toBe(0);
  });

  it("não deve aplicar correção monetária se não houver atraso", () => {
    const valorOriginal = 1000;
    const dataVencimento = new Date(); // Vencimento hoje
    dataVencimento.setDate(dataVencimento.getDate() + 10); // Vence daqui 10 dias

    const resultado = calcularValorDevido(
      valorOriginal,
      dataVencimento,
      taxas,
      0
    );

    // Sem atraso, não deve ter correção, juros, multa ou honorários
    expect(resultado.correcaoMonetaria).toBe(0);
    expect(resultado.juros).toBe(0);
    expect(resultado.multa).toBe(0);
    expect(resultado.honorarios).toBe(0);
    expect(resultado.valorTotal).toBe(valorOriginal);
  });
});

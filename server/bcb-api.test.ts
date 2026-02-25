import { describe, it, expect } from "vitest";
import {
  buscarIndices,
  calcularFatorCorrecao,
  aplicarCorrecaoMonetaria,
  calcularPercentualCorrecao,
} from "./bcb-api";

describe("BCB API Integration", () => {
  it("deve buscar índices IPCA para um período", async () => {
    const dataInicial = new Date(2025, 0, 1); // 01/01/2025
    const dataFinal = new Date(2025, 2, 31); // 31/03/2025
    
    const indices = await buscarIndices("IPCA", dataInicial, dataFinal);
    
    expect(indices).toBeInstanceOf(Array);
    expect(indices.length).toBeGreaterThan(0);
    expect(indices[0]).toHaveProperty("data");
    expect(indices[0]).toHaveProperty("valor");
    expect(typeof indices[0].valor).toBe("number");
  });

  it("deve calcular fator de correção para um período", { timeout: 10000 }, async () => {
    const dataInicial = new Date(2025, 0, 1); // 01/01/2025
    const dataFinal = new Date(2025, 2, 31); // 31/03/2025
    
    const fator = await calcularFatorCorrecao("IPCA", dataInicial, dataFinal);
    
    expect(typeof fator).toBe("number");
    expect(fator).toBeGreaterThan(0);
    // Fator deve ser próximo de 1.0 (ex: 1.0204 = 2.04% de correção)
    expect(fator).toBeGreaterThanOrEqual(0.9);
    expect(fator).toBeLessThanOrEqual(1.5);
  });

  it("deve aplicar correção monetária a um valor", async () => {
    const valorOriginal = 100000; // R$ 1.000,00 em centavos
    const dataInicial = new Date(2025, 0, 1); // 01/01/2025
    const dataFinal = new Date(2025, 2, 31); // 31/03/2025
    
    const valorCorrigido = await aplicarCorrecaoMonetaria(
      valorOriginal,
      "IPCA",
      dataInicial,
      dataFinal
    );
    
    expect(typeof valorCorrigido).toBe("number");
    expect(valorCorrigido).toBeGreaterThan(valorOriginal);
    // Valor corrigido deve ser maior que o original (inflação positiva esperada)
    expect(valorCorrigido).toBeGreaterThanOrEqual(valorOriginal);
  });

  it("deve calcular percentual de correção", async () => {
    const dataInicial = new Date(2025, 0, 1); // 01/01/2025
    const dataFinal = new Date(2025, 2, 31); // 31/03/2025
    
    const percentual = await calcularPercentualCorrecao("IPCA", dataInicial, dataFinal);
    
    expect(typeof percentual).toBe("number");
    // Percentual deve estar em uma faixa razoável (-5% a +20% ao ano)
    expect(percentual).toBeGreaterThanOrEqual(-5);
    expect(percentual).toBeLessThanOrEqual(20);
  });

  it("deve funcionar com diferentes índices", async () => {
    const dataInicial = new Date(2025, 0, 1);
    const dataFinal = new Date(2025, 1, 28);
    
    const indicesIPCA = await buscarIndices("IPCA", dataInicial, dataFinal);
    const indicesIGPM = await buscarIndices("IGP-M", dataInicial, dataFinal);
    
    expect(indicesIPCA.length).toBeGreaterThan(0);
    expect(indicesIGPM.length).toBeGreaterThan(0);
    
    // Valores podem ser diferentes entre índices
    expect(indicesIPCA[0].valor).not.toBe(indicesIGPM[0].valor);
  });

  it("deve retornar fator 1.0 quando não há índices no período", { timeout: 10000 }, async () => {
    // Período futuro sem dados
    const dataInicial = new Date(2030, 0, 1);
    const dataFinal = new Date(2030, 11, 31);
    
    const fator = await calcularFatorCorrecao("IPCA", dataInicial, dataFinal);
    
    expect(fator).toBe(1.0);
  });
});

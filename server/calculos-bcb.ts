/**
 * Funções de cálculo de valores devidos com correção monetária via API BCB
 * 
 * NOTA: Este arquivo contém versões assíncronas que usam o cache de índices do BCB.
 * Para cálculos síncronos com percentual fixo, use shared/calculos.ts
 */

import { calcularMesesAtraso, type TaxasCondominio, type BreakdownValor } from "../shared/calculos";
import { calcularFatorCorrecaoCache } from "./bcb-cache";

/**
 * Calcula o valor total devido incluindo juros, multa, honorários, custas judiciais e correção monetária via API BCB
 * 
 * Versão assíncrona que usa índices oficiais do Banco Central (IPCA, IGP-M, INPC, IGP-DI).
 * Se indiceCorrecao não for especificado ou for "NENHUM", usa o percentual fixo.
 * 
 * @param valorOriginal Valor original em centavos
 * @param dataVencimento Data de vencimento da cobrança
 * @param taxas Configuração de taxas do condomínio
 * @param custasJudiciais Custas judiciais em centavos (opcional)
 * @returns Promise com breakdown detalhado dos valores
 */
export async function calcularValorDevidoAsync(
  valorOriginal: number,
  dataVencimento: Date,
  taxas: TaxasCondominio,
  custasJudiciais: number = 0
): Promise<BreakdownValor> {
  const mesesAtraso = calcularMesesAtraso(dataVencimento);
  
  // Calcula juros (percentual mensal * meses de atraso)
  const juros = (valorOriginal * (taxas.taxaJurosMensal / 100)) * mesesAtraso;
  
  // Calcula multa (percentual fixo, aplicado apenas se houver atraso)
  const multa = mesesAtraso > 0 ? (valorOriginal * (taxas.taxaMulta / 100)) : 0;
  
  // Calcula honorários (percentual sobre valor original, aplicado apenas se houver atraso)
  const honorarios = mesesAtraso > 0 ? (valorOriginal * (taxas.taxaHonorarios / 100)) : 0;
  
  // Calcula correção monetária
  let correcaoMonetaria = 0;
  
  if (mesesAtraso > 0 && taxas.aplicarCorrecaoAuto && taxas.indiceCorrecao && taxas.indiceCorrecao !== "NENHUM") {
    // Usar correção via API BCB
    try {
      const hoje = new Date();
      const fator = await calcularFatorCorrecaoCache(taxas.indiceCorrecao, dataVencimento, hoje);
      correcaoMonetaria = Math.round(valorOriginal * (fator - 1)); // fator - 1 = percentual de correção
    } catch (error) {
      console.error("Erro ao calcular correção monetária via BCB, usando percentual fixo:", error);
      // Fallback para percentual fixo
      correcaoMonetaria = (valorOriginal * (taxas.correcaoMonetaria / 100)) * mesesAtraso;
    }
  } else {
    // Usar percentual fixo (comportamento antigo)
    correcaoMonetaria = (valorOriginal * (taxas.correcaoMonetaria / 100)) * mesesAtraso;
  }
  
  // Valor total
  const valorTotal = valorOriginal + juros + multa + honorarios + custasJudiciais + correcaoMonetaria;
  
  return {
    valorOriginal,
    juros,
    multa,
    honorarios,
    custasJudiciais,
    correcaoMonetaria,
    valorTotal,
    mesesAtraso,
  };
}

/**
 * Calcula o total devido de múltiplas cobranças (versão assíncrona com correção via BCB)
 */
export async function calcularTotalMultiplasCobrancasAsync(
  cobrancas: Array<{ amount: number; dueDate: Date; custasJudiciais?: number }>,
  taxas: TaxasCondominio
): Promise<BreakdownValor> {
  const resultado: BreakdownValor = {
    valorOriginal: 0,
    juros: 0,
    multa: 0,
    honorarios: 0,
    custasJudiciais: 0,
    correcaoMonetaria: 0,
    valorTotal: 0,
    mesesAtraso: 0,
  };
  
  for (const cobranca of cobrancas) {
    const breakdown = await calcularValorDevidoAsync(cobranca.amount, cobranca.dueDate, taxas, cobranca.custasJudiciais || 0);
    resultado.valorOriginal += breakdown.valorOriginal;
    resultado.juros += breakdown.juros;
    resultado.multa += breakdown.multa;
    resultado.honorarios += breakdown.honorarios;
    resultado.custasJudiciais += breakdown.custasJudiciais;
    resultado.correcaoMonetaria += breakdown.correcaoMonetaria;
    resultado.valorTotal += breakdown.valorTotal;
    resultado.mesesAtraso = Math.max(resultado.mesesAtraso, breakdown.mesesAtraso);
  }
  
  return resultado;
}

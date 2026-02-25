/**
 * Serviço de integração com a API do Banco Central do Brasil
 * 
 * Fornece acesso aos índices de correção monetária oficiais (IPCA, IGP-M, INPC, IGP-DI)
 * através da API pública do BCB.
 * 
 * Documentação: https://api.bcb.gov.br/
 */

export type IndiceType = "IPCA" | "IGP-M" | "INPC" | "IGP-DI";

/**
 * Mapeamento de índices para códigos de série do BCB
 */
const SERIE_CODES: Record<IndiceType, number> = {
  "IPCA": 433,    // Índice Nacional de Preços ao Consumidor Amplo (IBGE)
  "IGP-M": 189,   // Índice Geral de Preços do Mercado (FGV)
  "INPC": 188,    // Índice Nacional de Preços ao Consumidor (IBGE)
  "IGP-DI": 190,  // Índice Geral de Preços - Disponibilidade Interna (FGV)
};

/**
 * Resposta da API do BCB para um ponto de dados
 */
interface BCBDataPoint {
  data: string;  // Formato: "dd/mm/aaaa"
  valor: string; // Percentual como string (ex: "0.56")
}

/**
 * Converte Date para formato dd/mm/aaaa
 */
function formatDateBR(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Converte string dd/mm/aaaa para Date
 */
function parseDateBR(dateBR: string): Date {
  const [day, month, year] = dateBR.split("/").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Busca índices de correção monetária para um período
 * 
 * @param indice Tipo de índice (IPCA, IGP-M, INPC, IGP-DI)
 * @param dataInicial Data inicial do período
 * @param dataFinal Data final do período
 * @returns Array de pontos de dados com data e valor percentual
 */
export async function buscarIndices(
  indice: IndiceType,
  dataInicial: Date,
  dataFinal: Date
): Promise<Array<{ data: Date; valor: number }>> {
  const codigoSerie = SERIE_CODES[indice];
  
  const dataInicialStr = formatDateBR(dataInicial);
  const dataFinalStr = formatDateBR(dataFinal);
  
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigoSerie}/dados?formato=json&dataInicial=${dataInicialStr}&dataFinal=${dataFinalStr}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      // 404 = período sem dados disponíveis (ex: futuro)
      if (response.status === 404) {
        console.warn(`Sem dados disponíveis para ${indice} no período ${dataInicialStr} a ${dataFinalStr}`);
        return [];
      }
      throw new Error(`Erro ao buscar índices do BCB: ${response.status} ${response.statusText}`);
    }
    
    const data: BCBDataPoint[] = await response.json();
    
    // Converter formato da API para formato interno
    return data.map((point) => ({
      data: parseDateBR(point.data),
      valor: parseFloat(point.valor),
    }));
  } catch (error) {
    // Se for 404, já tratamos acima
    if (error instanceof Error && error.message.includes("404")) {
      return [];
    }
    console.error(`Erro ao buscar índices ${indice}:`, error);
    throw new Error(`Falha ao buscar índices de correção monetária: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
  }
}

/**
 * Calcula o fator de correção monetária acumulado para um período
 * 
 * @param indice Tipo de índice (IPCA, IGP-M, INPC, IGP-DI)
 * @param dataInicial Data inicial do período
 * @param dataFinal Data final do período
 * @returns Fator de correção (ex: 1.0204 = 2.04% de correção)
 */
export async function calcularFatorCorrecao(
  indice: IndiceType,
  dataInicial: Date,
  dataFinal: Date
): Promise<number> {
  const indices = await buscarIndices(indice, dataInicial, dataFinal);
  
  if (indices.length === 0) {
    // Sem índices no período = sem correção
    return 1.0;
  }
  
  // Fórmula de correção acumulada:
  // fator = (1 + índice1/100) × (1 + índice2/100) × ... × (1 + índiceN/100)
  const fator = indices.reduce((acc, point) => {
    return acc * (1 + point.valor / 100);
  }, 1.0);
  
  return fator;
}

/**
 * Aplica correção monetária a um valor
 * 
 * @param valorOriginal Valor original em centavos
 * @param indice Tipo de índice (IPCA, IGP-M, INPC, IGP-DI)
 * @param dataInicial Data inicial do período
 * @param dataFinal Data final do período (padrão: hoje)
 * @returns Valor corrigido em centavos
 */
export async function aplicarCorrecaoMonetaria(
  valorOriginal: number,
  indice: IndiceType,
  dataInicial: Date,
  dataFinal: Date = new Date()
): Promise<number> {
  const fator = await calcularFatorCorrecao(indice, dataInicial, dataFinal);
  return Math.round(valorOriginal * fator);
}

/**
 * Calcula o percentual de correção para um período
 * 
 * @param indice Tipo de índice (IPCA, IGP-M, INPC, IGP-DI)
 * @param dataInicial Data inicial do período
 * @param dataFinal Data final do período
 * @returns Percentual de correção (ex: 2.04 = 2.04%)
 */
export async function calcularPercentualCorrecao(
  indice: IndiceType,
  dataInicial: Date,
  dataFinal: Date
): Promise<number> {
  const fator = await calcularFatorCorrecao(indice, dataInicial, dataFinal);
  return (fator - 1) * 100;
}

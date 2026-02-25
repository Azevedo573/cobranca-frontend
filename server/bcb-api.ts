/**
 * Integração com API do Banco Central do Brasil
 * https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados
 * 
 * Códigos dos índices:
 * - IPCA: 433
 * - IGP-M: 189
 * - INPC: 188
 * - IGP-DI: 190
 */

interface BCBDataPoint {
  data: string; // formato: "DD/MM/YYYY"
  valor: string; // percentual como string, ex: "0.42"
}

const CODIGO_INDICES: Record<string, number> = {
  "IPCA": 433,
  "IGP-M": 189,
  "INPC": 188,
  "IGP-DI": 190,
};

// Cache simples em memória (em produção, usar Redis)
const cache: Map<string, { data: BCBDataPoint[], timestamp: number }> = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

/**
 * Busca dados de um índice na API do BCB
 * @param indice Nome do índice (IPCA, IGP-M, INPC, IGP-DI)
 * @param dataInicio Data inicial no formato DD/MM/YYYY
 * @param dataFim Data final no formato DD/MM/YYYY
 */
async function buscarIndicesBCB(
  indice: string,
  dataInicio: string,
  dataFim: string
): Promise<BCBDataPoint[]> {
  const codigo = CODIGO_INDICES[indice];
  if (!codigo) {
    throw new Error(`Índice desconhecido: ${indice}`);
  }

  const cacheKey = `${indice}-${dataInicio}-${dataFim}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados?formato=json&dataInicial=${dataInicio}&dataFinal=${dataFim}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erro na API BCB: ${response.status}`);
    }
    
    const data: BCBDataPoint[] = await response.json();
    cache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error("Erro ao buscar índices BCB:", error);
    throw error;
  }
}

/**
 * Converte Date para formato DD/MM/YYYY
 */
function formatarDataBCB(date: Date): string {
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const ano = date.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Calcula a correção monetária acumulada entre duas datas usando índice BCB
 * @param valorOriginal Valor a ser corrigido
 * @param dataVencimento Data de vencimento da cobrança
 * @param indice Nome do índice (IPCA, IGP-M, INPC, IGP-DI)
 * @returns Valor da correção monetária
 */
export async function calcularCorrecaoBCB(
  valorOriginal: number,
  dataVencimento: Date,
  indice: string
): Promise<number> {
  const hoje = new Date();
  
  // Se não venceu ainda, não há correção
  if (dataVencimento >= hoje) {
    return 0;
  }

  const dataInicio = formatarDataBCB(dataVencimento);
  const dataFim = formatarDataBCB(hoje);

  try {
    const indices = await buscarIndicesBCB(indice, dataInicio, dataFim);
    
    // Calcula correção acumulada (produto dos fatores)
    let fatorAcumulado = 1;
    for (const ponto of indices) {
      const percentual = parseFloat(ponto.valor);
      fatorAcumulado *= (1 + percentual / 100);
    }
    
    // Correção = valor original * (fator acumulado - 1)
    const correcao = valorOriginal * (fatorAcumulado - 1);
    return Math.max(0, correcao);
  } catch (error) {
    console.error("Erro ao calcular correção BCB, usando 0:", error);
    return 0; // Fallback: retorna 0 se API falhar
  }
}

/**
 * Limpa o cache (útil para testes)
 */
export function limparCacheBCB(): void {
  cache.clear();
}

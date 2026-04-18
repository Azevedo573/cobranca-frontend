/**
 * Integração com tabela local de índices do Banco Central do Brasil
 * Usa dados históricos armazenados na tabela indicesBCB
 */

import { getDb } from "./db";
import { indicesbcb } from "../drizzle/schema";
import { and, gte, lte, eq, sql } from "drizzle-orm";

/**
 * Formata data para YYYY-MM-01 (primeiro do mês, formato do banco)
 * Os registros na tabela indicesBCB usam sempre o dia 01 do mês
 */
function formatarDataSQL(date: Date): string {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}-01`;
}

/**
 * Busca índices na tabela local entre duas datas
 */
async function buscarIndicesLocais(
  indice: string,
  dataInicio: Date,
  dataFim: Date
): Promise<Array<{ mesReferencia: string; valor: number }>> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const dataInicioStr = formatarDataSQL(dataInicio);
  const dataFimStr = formatarDataSQL(dataFim);

  const indices = await db
    .select()
    .from(indicesbcb)
    .where(
      and(
        sql`${indicesbcb.indice} = ${indice}`,
        gte(indicesbcb.mesReferencia, dataInicioStr),
        lte(indicesbcb.mesReferencia, dataFimStr)
      )
    )
    .orderBy(indicesbcb.mesReferencia);

  return indices.map((idx) => ({
    mesReferencia: idx.mesReferencia,
    valor: Number(idx.valor),
  }));
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

  try {
    const indices = await buscarIndicesLocais(indice, dataVencimento, hoje);
    
    if (indices.length === 0) {
      console.warn(`Nenhum índice encontrado para ${indice} entre ${dataVencimento.toISOString()} e ${hoje.toISOString()}`);
      return 0;
    }
    
    // Calcula correção acumulada (produto dos fatores)
    let fatorAcumulado = 1;
    for (const ponto of indices) {
      fatorAcumulado *= (1 + ponto.valor / 100);
    }
    
    // Correção = valor original * (fator acumulado - 1)
    const correcao = valorOriginal * (fatorAcumulado - 1);
    console.log(`Correção ${indice}: R$ ${correcao.toFixed(2)} (${indices.length} meses, fator: ${fatorAcumulado.toFixed(4)})`);
    return Math.max(0, correcao);
  } catch (error) {
    console.error("Erro ao calcular correção BCB, usando 0:", error);
    return 0; // Fallback: retorna 0 se houver erro
  }
}



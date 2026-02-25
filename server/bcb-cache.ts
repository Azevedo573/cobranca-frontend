/**
 * Serviço de cache de índices do Banco Central
 * 
 * Gerencia o armazenamento local de índices de correção monetária
 * para cálculos rápidos sem requisições HTTP repetidas.
 */

import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getDb } from "./db";
import { indicesBCB, type InsertIndiceBCB } from "../drizzle/schema";
import { buscarIndices, type IndiceType } from "./bcb-api";

/**
 * Formata Date para string YYYY-MM-DD (primeiro dia do mês)
 */
function formatarMesReferencia(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

/**
 * Atualiza cache de índices para um período específico
 * 
 * @param indice Tipo de índice (IPCA, IGP-M, INPC, IGP-DI)
 * @param dataInicial Data inicial do período
 * @param dataFinal Data final do período
 * @returns Número de índices inseridos/atualizados
 */
export async function atualizarCacheIndices(
  indice: IndiceType,
  dataInicial: Date,
  dataFinal: Date
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Buscar índices da API do BCB
  const indices = await buscarIndices(indice, dataInicial, dataFinal);

  if (indices.length === 0) {
    console.log(`Nenhum índice encontrado para ${indice} no período ${dataInicial.toISOString()} a ${dataFinal.toISOString()}`);
    return 0;
  }

  let count = 0;

  // Inserir/atualizar cada índice no cache
  for (const ponto of indices) {
    const mesRef = formatarMesReferencia(ponto.data);

    try {
      // Verificar se já existe
      const existente = await db
        .select()
        .from(indicesBCB)
        .where(
          and(
            eq(indicesBCB.indice, indice),
            eq(indicesBCB.mesReferencia, mesRef)
          )
        )
        .limit(1);

      if (existente.length > 0) {
        // Atualizar valor existente
        await db
          .update(indicesBCB)
          .set({
            valor: ponto.valor.toString(),
            updatedAt: new Date(),
          })
          .where(eq(indicesBCB.id, existente[0].id));
      } else {
        // Inserir novo
        await db.insert(indicesBCB).values({
          indice,
          mesReferencia: mesRef,
          valor: ponto.valor.toString(),
        });
      }

      count++;
    } catch (error) {
      console.error(`Erro ao salvar índice ${indice} para ${mesRef}:`, error);
    }
  }

  console.log(`Cache atualizado: ${count} índices ${indice} inseridos/atualizados`);
  return count;
}

/**
 * Busca índices do cache local para um período
 * 
 * @param indice Tipo de índice (IPCA, IGP-M, INPC, IGP-DI)
 * @param dataInicial Data inicial do período
 * @param dataFinal Data final do período
 * @returns Array de índices do cache
 */
export async function buscarIndicesCache(
  indice: IndiceType,
  dataInicial: Date,
  dataFinal: Date
): Promise<Array<{ data: Date; valor: number }>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const mesInicial = formatarMesReferencia(dataInicial);
  const mesFinal = formatarMesReferencia(dataFinal);

  const resultados = await db
    .select()
    .from(indicesBCB)
    .where(
      and(
        eq(indicesBCB.indice, indice),
        gte(indicesBCB.mesReferencia, mesInicial),
        lte(indicesBCB.mesReferencia, mesFinal)
      )
    )
    .orderBy(indicesBCB.mesReferencia);

  return resultados.map((row) => ({
    data: new Date(row.mesReferencia),
    valor: parseFloat(row.valor),
  }));
}

/**
 * Calcula fator de correção monetária usando cache local
 * 
 * Se não houver dados no cache, busca da API e atualiza o cache automaticamente.
 * 
 * @param indice Tipo de índice (IPCA, IGP-M, INPC, IGP-DI)
 * @param dataInicial Data inicial do período
 * @param dataFinal Data final do período
 * @returns Fator de correção (ex: 1.0204 = 2.04% de correção)
 */
export async function calcularFatorCorrecaoCache(
  indice: IndiceType,
  dataInicial: Date,
  dataFinal: Date
): Promise<number> {
  // Tentar buscar do cache primeiro
  let indices = await buscarIndicesCache(indice, dataInicial, dataFinal);

  // Se não houver dados no cache, buscar da API e atualizar cache
  if (indices.length === 0) {
    console.log(`Cache vazio para ${indice}, buscando da API...`);
    await atualizarCacheIndices(indice, dataInicial, dataFinal);
    indices = await buscarIndicesCache(indice, dataInicial, dataFinal);
  }

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
 * Aplica correção monetária a um valor usando cache local
 * 
 * @param valorOriginal Valor original em centavos
 * @param indice Tipo de índice (IPCA, IGP-M, INPC, IGP-DI)
 * @param dataInicial Data inicial do período
 * @param dataFinal Data final do período (padrão: hoje)
 * @returns Valor corrigido em centavos
 */
export async function aplicarCorrecaoMonetariaCache(
  valorOriginal: number,
  indice: IndiceType,
  dataInicial: Date,
  dataFinal: Date = new Date()
): Promise<number> {
  const fator = await calcularFatorCorrecaoCache(indice, dataInicial, dataFinal);
  return Math.round(valorOriginal * fator);
}

/**
 * Atualiza cache de todos os índices para o último ano
 * 
 * Função útil para job mensal de atualização automática.
 * 
 * @returns Objeto com contadores de índices atualizados por tipo
 */
export async function atualizarCacheTodosIndices(): Promise<Record<IndiceType, number>> {
  const hoje = new Date();
  const umAnoAtras = new Date();
  umAnoAtras.setFullYear(hoje.getFullYear() - 1);

  const indices: IndiceType[] = ["IPCA", "IGP-M", "INPC", "IGP-DI"];
  const resultados: Record<IndiceType, number> = {
    "IPCA": 0,
    "IGP-M": 0,
    "INPC": 0,
    "IGP-DI": 0,
  };

  for (const indice of indices) {
    try {
      const count = await atualizarCacheIndices(indice, umAnoAtras, hoje);
      resultados[indice] = count;
    } catch (error) {
      console.error(`Erro ao atualizar cache de ${indice}:`, error);
    }
  }

  return resultados;
}

/**
 * Verifica se o cache está desatualizado (mais de 30 dias sem atualização)
 * 
 * @param indice Tipo de índice (IPCA, IGP-M, INPC, IGP-DI)
 * @returns true se o cache está desatualizado
 */
export async function cacheDesatualizado(indice: IndiceType): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const resultado = await db
    .select()
    .from(indicesBCB)
    .where(eq(indicesBCB.indice, indice))
    .orderBy(desc(indicesBCB.updatedAt))
    .limit(1);

  if (resultado.length === 0) {
    return true; // Cache vazio = desatualizado
  }

  const ultimaAtualizacao = new Date(resultado[0].updatedAt);
  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

  return ultimaAtualizacao < trintaDiasAtras;
}

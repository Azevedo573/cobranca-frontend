import { and, eq } from "drizzle-orm";
import { cobrancas, InsertCobranca, condominios } from "../drizzle/schema";
import { getDb } from "./db";
import { calcularValorDevido, BreakdownValor } from "../shared/calculos";
import { calcularCorrecaoBCB } from "./bcb-api";

export async function getCobrancasByCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(cobrancas).where(eq(cobrancas.condominioId, condominioId));
}

export async function getCobrancasByDevedor(devedorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(cobrancas).where(eq(cobrancas.devedorId, devedorId));
}

export async function getCobrancaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(cobrancas).where(eq(cobrancas.id, id)).limit(1);
  return result[0] || null;
}

export async function createCobranca(data: InsertCobranca) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(cobrancas).values(data);
  return result;
}

export async function updateCobranca(id: number, data: Partial<InsertCobranca>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(cobrancas).set(data).where(eq(cobrancas.id, id));
  return await getCobrancaById(id);
}

export async function deleteCobranca(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(cobrancas).where(eq(cobrancas.id, id));
}

export interface CobrancaComCalculos {
  id: number;
  devedorId: number;
  condominioId: number;
  tipoCobranca: string | null;
  description: string | null;
  amount: number;
  dueDate: Date | null;
  monthReference: string | null;
  status: string;
  custasJudiciais: number | null;
  createdAt: Date;
  updatedAt: Date | null;
  // Campos calculados
  breakdown: BreakdownValor;
}

/**
 * Busca cobranças de um devedor com valores calculados (incluindo correção BCB se ativado)
 */
export async function getCobrancasComCalculos(devedorId: number): Promise<CobrancaComCalculos[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Buscar cobranças
  const cobrancasList = await db.select().from(cobrancas).where(eq(cobrancas.devedorId, devedorId));
  
  if (cobrancasList.length === 0) {
    return [];
  }
  
  // Buscar configurações do condomínio
  const condominioId = cobrancasList[0].condominioId;
  const condominioData = await db.select().from(condominios).where(eq(condominios.id, condominioId)).limit(1);
  
  if (!condominioData[0]) {
    return [];
  }
  
  const condominio = condominioData[0];
  const taxas = {
    taxaJurosMensal: Number(condominio.taxaJurosMensal || 0),
    taxaMulta: Number(condominio.taxaMulta || 0),
    taxaHonorarios: Number(condominio.taxaHonorarios || 0),
    correcaoMonetaria: Number(condominio.correcaoMonetaria || 0),
  };
  
  const aplicarCorrecaoBCB = Boolean(condominio.aplicarCorrecaoAuto) && 
                             condominio.indiceCorrecao && 
                             condominio.indiceCorrecao !== "NENHUM";
  
  // Calcular valores para cada cobrança
  const cobrancasComCalculos: CobrancaComCalculos[] = [];
  
  for (const cobranca of cobrancasList) {
    const valorOriginal = cobranca.amount / 100; // converter de centavos
    if (!cobranca.dueDate) continue; // pular cobranças sem data de vencimento
    const dataVencimento = new Date(cobranca.dueDate);
    const custasJudiciais = cobranca.custasJudiciais ? cobranca.custasJudiciais / 100 : 0;
    
    // Calcular valores base (juros, multa, honorários)
    let breakdown = calcularValorDevido(valorOriginal, dataVencimento, taxas, custasJudiciais);
    
    // Se correção BCB estiver ativada, substituir correção monetária
    if (aplicarCorrecaoBCB && condominio.indiceCorrecao) {
      try {
        const correcaoBCB = await calcularCorrecaoBCB(
          valorOriginal,
          dataVencimento,
          condominio.indiceCorrecao
        );
        
        // Recalcular honorários sobre o valor atualizado (com correção BCB)
        const baseHonorarios = valorOriginal + breakdown.juros + breakdown.multa + correcaoBCB;
        const mesesAtraso = breakdown.mesesAtraso;
        const honorarios = mesesAtraso > 0 ? (baseHonorarios * (taxas.taxaHonorarios / 100)) : 0;
        
        // Recalcular valor total com correção BCB e honorários atualizados
        breakdown = {
          ...breakdown,
          honorarios,
          correcaoMonetaria: correcaoBCB,
          valorTotal: valorOriginal + breakdown.juros + breakdown.multa + honorarios + custasJudiciais + correcaoBCB,
        };
      } catch (error) {
        console.error("Erro ao calcular correção BCB, usando percentual fixo:", error);
        // Mantém o breakdown original com percentual fixo
      }
    }
    
    cobrancasComCalculos.push({
      ...cobranca,
      breakdown,
    });
  }
  
  return cobrancasComCalculos;
}

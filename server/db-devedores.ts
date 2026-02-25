import { eq, and } from "drizzle-orm";
import { devedores, InsertDevedor, cobrancas, condominios } from "../drizzle/schema";
import { getDb } from "./db";
import { calcularValorDevido } from "../shared/calculos";
import { calcularValorDevidoAsync } from "./calculos-bcb";

export async function getDevedoresByCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Buscar devedores
  const devedoresList = await db.select().from(devedores).where(eq(devedores.condominioId, condominioId));
  
  // Buscar taxas do condomínio
  const condominioData = await db.select().from(condominios).where(eq(condominios.id, condominioId)).limit(1);
  const taxas = condominioData[0] ? {
    taxaJurosMensal: Number(condominioData[0].taxaJurosMensal || 0),
    taxaMulta: Number(condominioData[0].taxaMulta || 0),
    taxaHonorarios: Number(condominioData[0].taxaHonorarios || 0),
    correcaoMonetaria: Number(condominioData[0].correcaoMonetaria || 0),
    indiceCorrecao: condominioData[0].indiceCorrecao || "NENHUM",
    aplicarCorrecaoAuto: Boolean(condominioData[0].aplicarCorrecaoAuto),
  } : null;
  
  // Para cada devedor, calcular valor total devido
  const devedoresComValor = await Promise.all(
    devedoresList.map(async (devedor) => {
      // Buscar cobranças ativas (pendentes ou em acordo)
      const cobrancasAtivas = await db.select().from(cobrancas).where(
        and(
          eq(cobrancas.devedorId, devedor.id),
          eq(cobrancas.status, "pendente")
        )
      );
      
      const cobrancasEmAcordo = await db.select().from(cobrancas).where(
        and(
          eq(cobrancas.devedorId, devedor.id),
          eq(cobrancas.status, "em_acordo")
        )
      );
      
      const todasCobrancasAtivas = [...cobrancasAtivas, ...cobrancasEmAcordo];
      
      // Calcular valor total com encargos
      let valorTotalDevido = 0;
      if (todasCobrancasAtivas.length > 0 && taxas) {
        // Usar correção monetária via BCB se configurado
        if (taxas.aplicarCorrecaoAuto && taxas.indiceCorrecao && taxas.indiceCorrecao !== "NENHUM") {
          // Versão assíncrona com correção BCB
          for (const cob of todasCobrancasAtivas) {
            const breakdown = await calcularValorDevidoAsync(
              cob.amount,  // Já está em centavos
              cob.dueDate ? new Date(cob.dueDate) : new Date(),
              taxas
            );
            valorTotalDevido += breakdown.valorTotal;
          }
        } else {
          // Versão síncrona com percentual fixo
          valorTotalDevido = todasCobrancasAtivas.reduce((sum, cob) => {
            const breakdown = calcularValorDevido(
              cob.amount,  // Já está em centavos
              cob.dueDate ? new Date(cob.dueDate) : new Date(),
              taxas
            );
            return sum + breakdown.valorTotal;
          }, 0);
        }
      }
      
      // Retornar devedor com valor atualizado (em centavos)
      return {
        ...devedor,
        totalDue: Math.round(valorTotalDevido * 100),
      };
    })
  );
  
  return devedoresComValor;
}

export async function getDevedorById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(devedores).where(eq(devedores.id, id)).limit(1);
  return result[0] || null;
}

export async function createDevedor(data: InsertDevedor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(devedores).values(data);
  return result;
}

export async function updateDevedor(id: number, data: Partial<InsertDevedor>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(devedores).set(data).where(eq(devedores.id, id));
  return await getDevedorById(id);
}

export async function deleteDevedor(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(devedores).where(eq(devedores.id, id));
}

export async function getDevedorByCpfCnpj(cpfCnpj: string, condominioId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(devedores).where(
    and(
      eq(devedores.cpfCnpj, cpfCnpj),
      eq(devedores.condominioId, condominioId)
    )
  ).limit(1);
  return result[0] || null;
}

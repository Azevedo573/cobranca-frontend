import { eq, and } from "drizzle-orm";
import { devedores, InsertDevedor, cobrancas, condominios, demandas } from "../drizzle/schema";
import { getDb } from "./db";
import { calcularValorDevido } from "../shared/calculos";

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
        valorTotalDevido = todasCobrancasAtivas.reduce((sum, cob) => {
          const breakdown = calcularValorDevido(
            cob.amount / 100,  // Converter centavos para reais
            cob.dueDate ? new Date(cob.dueDate) : new Date(),
            taxas
          );
          return sum + breakdown.valorTotal;
        }, 0);
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
  const devedor = result[0];
  if (!devedor) return null;

  // Buscar nome do condomínio
  let condominioNome: string | null = null;
  if (devedor.condominioId) {
    const cond = await db.select({ name: condominios.name }).from(condominios).where(eq(condominios.id, devedor.condominioId)).limit(1);
    condominioNome = cond[0]?.name ?? null;
  }

  // Verificar se existe demanda judicial ativa vinculada a este devedor
  const demandasJudiciais = await db.select({ id: demandas.id }).from(demandas).where(
    and(
      eq(demandas.devedorId, devedor.id),
      eq(demandas.tipo, "cobranca_judicial")
    )
  ).limit(1);
  const statusUnidade: "padrao" | "ajuizado" = demandasJudiciais.length > 0 ? "ajuizado" : "padrao";

  return { ...devedor, condominioNome, statusUnidade };
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

export async function getDevedorByBlocoUnidade(
  unitNumber: string,
  bloco: string | undefined | null,
  condominioId: number
) {
  const db = await getDb();
  if (!db) return null;
  const conditions = [
    eq(devedores.unitNumber, unitNumber),
    eq(devedores.condominioId, condominioId),
  ];
  if (bloco) {
    conditions.push(eq(devedores.bloco, bloco));
  }
  const result = await db
    .select()
    .from(devedores)
    .where(and(...conditions))
    .limit(1);
  return result[0] || null;
}

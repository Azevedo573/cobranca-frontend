import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { tentativasCobranca, users, devedores, condominios } from "../drizzle/schema";
import { getDb } from "./db";

export interface ProdutividadeColaborador {
  colaboradorId: number;
  colaboradorNome: string;
  colaboradorEmail: string;
  totalTentativas: number;
  devedoresUnicos: number;
  tentativasSemResposta: number;
  tentativasPromessa: number;
  tentativasRecusa: number;
  tentativasOutros: number;
  taxaSucesso: number; // Porcentagem de promessas
}

export interface DistribuicaoCondominio {
  colaboradorId: number;
  colaboradorNome: string;
  condominioId: number;
  condominioNome: string;
  totalTentativas: number;
}

export async function getProdutividadeColaboradores(
  dataInicio?: Date,
  dataFim?: Date,
  condominioId?: number
): Promise<ProdutividadeColaborador[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    // Construir filtros
    const conditions = [];
    
    if (dataInicio) {
      conditions.push(gte(tentativasCobranca.attemptDate, dataInicio));
    }
    
    if (dataFim) {
      conditions.push(lte(tentativasCobranca.attemptDate, dataFim));
    }
    
    if (condominioId) {
      conditions.push(eq(devedores.condominioId, condominioId));
    }

    // Query complexa com agregações
    const results = await db
      .select({
        colaboradorId: users.id,
        colaboradorNome: users.name,
        colaboradorEmail: users.email,
        totalTentativas: sql<number>`count(${tentativasCobranca.id})`,
        devedoresUnicos: sql<number>`count(distinct ${tentativasCobranca.devedorId})`,
        tentativasSemResposta: sql<number>`sum(case when ${tentativasCobranca.result} = 'sem_resposta' then 1 else 0 end)`,
        tentativasPromessa: sql<number>`sum(case when ${tentativasCobranca.result} = 'promessa_pagamento' then 1 else 0 end)`,
        tentativasRecusa: sql<number>`sum(case when ${tentativasCobranca.result} = 'recusa' then 1 else 0 end)`,
        tentativasOutros: sql<number>`sum(case when ${tentativasCobranca.result} not in ('sem_resposta', 'promessa_pagamento', 'recusa') then 1 else 0 end)`,
      })
      .from(tentativasCobranca)
      .innerJoin(users, eq(tentativasCobranca.userId, users.id))
      .innerJoin(devedores, eq(tentativasCobranca.devedorId, devedores.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(users.id, users.name, users.email)
      .orderBy(desc(sql`count(${tentativasCobranca.id})`));

    // Calcular taxa de sucesso
    return results.map((r) => ({
      colaboradorId: r.colaboradorId,
      colaboradorNome: r.colaboradorNome || "Sem nome",
      colaboradorEmail: r.colaboradorEmail || "",
      totalTentativas: Number(r.totalTentativas) || 0,
      devedoresUnicos: Number(r.devedoresUnicos) || 0,
      tentativasSemResposta: Number(r.tentativasSemResposta) || 0,
      tentativasPromessa: Number(r.tentativasPromessa) || 0,
      tentativasRecusa: Number(r.tentativasRecusa) || 0,
      tentativasOutros: Number(r.tentativasOutros) || 0,
      taxaSucesso:
        Number(r.totalTentativas) > 0
          ? Math.round((Number(r.tentativasPromessa) / Number(r.totalTentativas)) * 100)
          : 0,
    }));
  } catch (error) {
    console.error("[DB Relatórios] Erro ao buscar produtividade:", error);
    return [];
  }
}

export async function getDistribuicaoPorCondominio(
  dataInicio?: Date,
  dataFim?: Date
): Promise<DistribuicaoCondominio[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const conditions = [];
    
    if (dataInicio) {
      conditions.push(gte(tentativasCobranca.attemptDate, dataInicio));
    }
    
    if (dataFim) {
      conditions.push(lte(tentativasCobranca.attemptDate, dataFim));
    }

    const results = await db
      .select({
        colaboradorId: users.id,
        colaboradorNome: users.name,
        condominioId: condominios.id,
        condominioNome: condominios.name,
        totalTentativas: sql<number>`count(${tentativasCobranca.id})`,
      })
      .from(tentativasCobranca)
      .innerJoin(users, eq(tentativasCobranca.userId, users.id))
      .innerJoin(devedores, eq(tentativasCobranca.devedorId, devedores.id))
      .innerJoin(condominios, eq(devedores.condominioId, condominios.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(users.id, users.name, condominios.id, condominios.name)
      .orderBy(desc(sql`count(${tentativasCobranca.id})`));

    return results.map((r) => ({
      colaboradorId: r.colaboradorId,
      colaboradorNome: r.colaboradorNome || "Sem nome",
      condominioId: r.condominioId,
      condominioNome: r.condominioNome || "Sem nome",
      totalTentativas: Number(r.totalTentativas) || 0,
    }));
  } catch (error) {
    console.error("[DB Relatórios] Erro ao buscar distribuição:", error);
    return [];
  }
}

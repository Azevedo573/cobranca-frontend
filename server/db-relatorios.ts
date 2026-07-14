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

// ─── Relatório de Cobrança (Produtividade detalhada por contato) ─────────────

export interface RelatorioCobrancaRow {
  tentativaId: number;
  attemptDate: Date;
  contactType: string;
  result: string | null;
  notes: string | null;
  nomeDevedor: string;
  unitNumber: string;
  bloco: string | null;
  nomeCondominio: string;
  condominioId: number;
  colaboradorNome: string;
  colaboradorEmail: string;
  colaboradorId: number;
  isSistema: boolean;
}

export interface RelatorioCobrancaTotais {
  total: number;
  promessas: number;
  semResposta: number;
  recusas: number;
  outros: number;
  porTipo: Record<string, number>;
}

export interface RelatorioCobrancaResult {
  rows: RelatorioCobrancaRow[];
  totais: RelatorioCobrancaTotais;
}

export async function getRelatorioCobranca(params: {
  condominioId?: number;
  unitNumber?: string;
  dataInicio?: Date;
  dataFim?: Date;
  results?: string[];
  contactTypes?: string[];
  userId?: number;
  isSistema?: boolean;
}): Promise<RelatorioCobrancaResult> {
  const db = await getDb();
  if (!db) return { rows: [], totais: { total: 0, promessas: 0, semResposta: 0, recusas: 0, outros: 0, porTipo: {} } };

  try {
    const conditions: any[] = [];

    if (params.condominioId) {
      conditions.push(eq(tentativasCobranca.condominioId, params.condominioId));
    }
    if (params.unitNumber) {
      conditions.push(eq(devedores.unitNumber, params.unitNumber));
    }
    if (params.dataInicio) {
      conditions.push(gte(tentativasCobranca.attemptDate, params.dataInicio));
    }
    if (params.dataFim) {
      const fim = new Date(params.dataFim);
      fim.setHours(23, 59, 59, 999);
      conditions.push(lte(tentativasCobranca.attemptDate, fim));
    }
    if (params.results && params.results.length > 0) {
      const { inArray } = await import("drizzle-orm");
      conditions.push(inArray(tentativasCobranca.result, params.results as any[]));
    }
    if (params.contactTypes && params.contactTypes.length > 0) {
      const normalTypes = params.contactTypes.filter((t) => t !== "sistema");
      if (normalTypes.length > 0) {
        const { inArray } = await import("drizzle-orm");
        conditions.push(inArray(tentativasCobranca.contactType, normalTypes as any[]));
      }
    }
    if (params.userId) {
      conditions.push(eq(tentativasCobranca.userId, params.userId));
    }
    if (params.isSistema === true) {
      // Filtra por usuários com isPrimaryAdmin = 1 (usuários de sistema/automação)
      conditions.push(eq(users.isPrimaryAdmin, 1));
    } else if (params.isSistema === false) {
      // Exclui usuários de sistema
      conditions.push(eq(users.isPrimaryAdmin, 0));
    }

    const rows = await db
      .select({
        tentativaId: tentativasCobranca.id,
        attemptDate: tentativasCobranca.attemptDate,
        contactType: tentativasCobranca.contactType,
        result: tentativasCobranca.result,
        notes: tentativasCobranca.notes,
        nomeDevedor: devedores.name,
        unitNumber: devedores.unitNumber,
        bloco: devedores.bloco,
        nomeCondominio: condominios.name,
        condominioId: tentativasCobranca.condominioId,
        colaboradorNome: users.name,
        colaboradorEmail: users.email,
        colaboradorId: users.id,
        isPrimaryAdmin: users.isPrimaryAdmin,
      })
      .from(tentativasCobranca)
      .innerJoin(users, eq(tentativasCobranca.userId, users.id))
      .innerJoin(devedores, eq(tentativasCobranca.devedorId, devedores.id))
      .innerJoin(condominios, eq(tentativasCobranca.condominioId, condominios.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tentativasCobranca.attemptDate))
      .limit(2000);

    const mapped: RelatorioCobrancaRow[] = rows.map((r) => ({
      tentativaId: r.tentativaId,
      attemptDate: r.attemptDate,
      contactType: r.contactType,
      result: r.result,
      notes: r.notes,
      nomeDevedor: r.nomeDevedor || "—",
      unitNumber: r.unitNumber,
      bloco: r.bloco,
      nomeCondominio: r.nomeCondominio || "—",
      condominioId: r.condominioId,
      colaboradorNome: r.colaboradorNome || "—",
      colaboradorEmail: r.colaboradorEmail || "",
      colaboradorId: r.colaboradorId,
      isSistema: r.isPrimaryAdmin === 1,
    }));

    // Calcular totais
    const totais: RelatorioCobrancaTotais = {
      total: mapped.length,
      promessas: mapped.filter((r) => r.result === "promessa_pagamento").length,
      semResposta: mapped.filter((r) => r.result === "sem_resposta").length,
      recusas: mapped.filter((r) => r.result === "recusa").length,
      outros: mapped.filter((r) => !["promessa_pagamento", "sem_resposta", "recusa"].includes(r.result ?? "")).length,
      porTipo: mapped.reduce((acc, r) => {
        const tipo = r.isSistema ? "sistema" : r.contactType;
        acc[tipo] = (acc[tipo] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    return { rows: mapped, totais };
  } catch (error) {
    console.error("[DB Relatórios] Erro ao buscar relatório de cobrança:", error);
    return { rows: [], totais: { total: 0, promessas: 0, semResposta: 0, recusas: 0, outros: 0, porTipo: {} } };
  }
}

export async function getUnidadesByCondominio(condominioId?: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db
      .selectDistinct({ unitNumber: devedores.unitNumber })
      .from(devedores)
      .where(condominioId ? eq(devedores.condominioId, condominioId) : undefined)
      .orderBy(devedores.unitNumber);
    return rows.map((r) => r.unitNumber).filter(Boolean);
  } catch {
    return [];
  }
}

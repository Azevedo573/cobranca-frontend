import { getDb } from "./db";
import {
  processosJudiciais,
  prazosJuridicos,
  demandas,
  condominios,
} from "../drizzle/schema";
import { eq, and, count, sum, sql, gte, lte, or } from "drizzle-orm";

// ─── Resumo jurídico de um condomínio específico ─────────────────────────────
export async function getResumoJuridicoCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const agora = new Date();
  const em7Dias = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);
  const em30Dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fimHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59);

  // ── Processos ──
  const [processosAtivos] = await db
    .select({ total: count() })
    .from(processosJudiciais)
    .where(and(eq(processosJudiciais.condominioId, condominioId), eq(processosJudiciais.status, "ativo")));

  const [processosSuspensos] = await db
    .select({ total: count() })
    .from(processosJudiciais)
    .where(and(eq(processosJudiciais.condominioId, condominioId), eq(processosJudiciais.status, "suspenso")));

  const [processosEncerrados] = await db
    .select({ total: count() })
    .from(processosJudiciais)
    .where(and(eq(processosJudiciais.condominioId, condominioId), eq(processosJudiciais.status, "encerrado")));

  const [valorEmDisputa] = await db
    .select({ total: sum(processosJudiciais.valorCausa) })
    .from(processosJudiciais)
    .where(and(eq(processosJudiciais.condominioId, condominioId), eq(processosJudiciais.status, "ativo")));

  // ── Prazos ──
  const [prazosAtrasados] = await db
    .select({ total: count() })
    .from(prazosJuridicos)
    .where(
      and(
        eq(prazosJuridicos.condominioId, condominioId),
        eq(prazosJuridicos.status, "pendente"),
        lte(prazosJuridicos.dataLimite, agora)
      )
    );

  const [prazosHoje] = await db
    .select({ total: count() })
    .from(prazosJuridicos)
    .where(
      and(
        eq(prazosJuridicos.condominioId, condominioId),
        eq(prazosJuridicos.status, "pendente"),
        gte(prazosJuridicos.dataLimite, agora),
        lte(prazosJuridicos.dataLimite, fimHoje)
      )
    );

  const [prazosEm7Dias] = await db
    .select({ total: count() })
    .from(prazosJuridicos)
    .where(
      and(
        eq(prazosJuridicos.condominioId, condominioId),
        eq(prazosJuridicos.status, "pendente"),
        gte(prazosJuridicos.dataLimite, agora),
        lte(prazosJuridicos.dataLimite, em7Dias)
      )
    );

  const [prazosEm30Dias] = await db
    .select({ total: count() })
    .from(prazosJuridicos)
    .where(
      and(
        eq(prazosJuridicos.condominioId, condominioId),
        eq(prazosJuridicos.status, "pendente"),
        gte(prazosJuridicos.dataLimite, agora),
        lte(prazosJuridicos.dataLimite, em30Dias)
      )
    );

  // ── Demandas (Kanban) — contar pelo condominioId diretamente ──
  const [totalDemandas] = await db
    .select({ total: count() })
    .from(demandas)
    .where(eq(demandas.condominioId, condominioId));

  // ── Processos recentes (últimos 5) ──
  const processosRecentes = await db
    .select({
      id: processosJudiciais.id,
      numeroCNJ: processosJudiciais.numeroCNJ,
      tribunal: processosJudiciais.tribunal,
      classe: processosJudiciais.classe,
      faseProcessual: processosJudiciais.faseProcessual,
      status: processosJudiciais.status,
      valorCausa: processosJudiciais.valorCausa,
      dataUltimaMovimentacao: processosJudiciais.dataUltimaMovimentacao,
      createdAt: processosJudiciais.createdAt,
    })
    .from(processosJudiciais)
    .where(eq(processosJudiciais.condominioId, condominioId))
    .orderBy(sql`${processosJudiciais.updatedAt} DESC`)
    .limit(5);

  // ── Prazos urgentes (próximos 7 dias + atrasados) ──
  const prazosUrgentes = await db
    .select({
      id: prazosJuridicos.id,
      titulo: prazosJuridicos.titulo,
      tipo: prazosJuridicos.tipo,
      dataLimite: prazosJuridicos.dataLimite,
      status: prazosJuridicos.status,
      processoId: prazosJuridicos.processoId,
      responsavelNome: prazosJuridicos.responsavelNome,
    })
    .from(prazosJuridicos)
    .where(
      and(
        eq(prazosJuridicos.condominioId, condominioId),
        eq(prazosJuridicos.status, "pendente"),
        lte(prazosJuridicos.dataLimite, em7Dias)
      )
    )
    .orderBy(prazosJuridicos.dataLimite)
    .limit(5);

  // ── Distribuição por tipo de processo ──
  const distribuicaoPorTipo = await db
    .select({
      tipo: processosJudiciais.tipo,
      total: count(),
    })
    .from(processosJudiciais)
    .where(
      and(
        eq(processosJudiciais.condominioId, condominioId),
        eq(processosJudiciais.status, "ativo")
      )
    )
    .groupBy(processosJudiciais.tipo);

  return {
    processos: {
      ativos: processosAtivos.total ?? 0,
      suspensos: processosSuspensos.total ?? 0,
      encerrados: processosEncerrados.total ?? 0,
      total: (processosAtivos.total ?? 0) + (processosSuspensos.total ?? 0) + (processosEncerrados.total ?? 0),
      valorEmDisputa: Number(valorEmDisputa.total ?? 0),
    },
    prazos: {
      atrasados: prazosAtrasados.total ?? 0,
      hoje: prazosHoje.total ?? 0,
      em7Dias: prazosEm7Dias.total ?? 0,
      em30Dias: prazosEm30Dias.total ?? 0,
    },
    demandas: {
      total: totalDemandas.total ?? 0,
    },
    processosRecentes,
    prazosUrgentes,
    distribuicaoPorTipo,
  };
}

// ─── Lista de condomínios com indicadores jurídicos ──────────────────────────
// Versão corrigida: usa GROUP BY em vez de N+1 queries por condomínio
export async function listarCondominiosComJuridico() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const agora = new Date();
  const em7Dias = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);

  // ── 1 query: todos os condomínios ──
  const todosCondominios = await db
    .select({
      id: condominios.id,
      name: condominios.name,
      city: condominios.city,
      state: condominios.state,
    })
    .from(condominios)
    .orderBy(condominios.name);

  // ── 1 query: processos ativos agrupados por condomínio ──
  const processosAtivosPorCond = await db
    .select({
      condominioId: processosJudiciais.condominioId,
      total: count(),
      valorEmDisputa: sum(processosJudiciais.valorCausa),
    })
    .from(processosJudiciais)
    .where(eq(processosJudiciais.status, "ativo"))
    .groupBy(processosJudiciais.condominioId);

  // ── 1 query: prazos urgentes (próximos 7 dias) agrupados por condomínio ──
  const prazosUrgentesPorCond = await db
    .select({
      condominioId: prazosJuridicos.condominioId,
      total: count(),
    })
    .from(prazosJuridicos)
    .where(
      and(
        eq(prazosJuridicos.status, "pendente"),
        gte(prazosJuridicos.dataLimite, agora),
        lte(prazosJuridicos.dataLimite, em7Dias)
      )
    )
    .groupBy(prazosJuridicos.condominioId);

  // ── 1 query: prazos atrasados agrupados por condomínio ──
  const prazosAtrasadosPorCond = await db
    .select({
      condominioId: prazosJuridicos.condominioId,
      total: count(),
    })
    .from(prazosJuridicos)
    .where(
      and(
        eq(prazosJuridicos.status, "pendente"),
        lte(prazosJuridicos.dataLimite, agora)
      )
    )
    .groupBy(prazosJuridicos.condominioId);

  // ── 1 query: total de demandas agrupadas por condomínio ──
  const demandasPorCond = await db
    .select({
      condominioId: demandas.condominioId,
      total: count(),
    })
    .from(demandas)
    .groupBy(demandas.condominioId);

  // Montar mapas para lookup O(1)
  const mapProcessos = new Map(processosAtivosPorCond.map(r => [r.condominioId, r]));
  const mapPrazosUrgentes = new Map(prazosUrgentesPorCond.map(r => [r.condominioId, r.total ?? 0]));
  const mapPrazosAtrasados = new Map(prazosAtrasadosPorCond.map(r => [r.condominioId, r.total ?? 0]));
  const mapDemandas = new Map(demandasPorCond.map(r => [r.condominioId, r.total ?? 0]));

  return todosCondominios.map((cond) => {
    const proc = mapProcessos.get(cond.id);
    const processosAtivos = proc?.total ?? 0;
    const valorEmDisputa = Number(proc?.valorEmDisputa ?? 0);
    const prazosUrgentes = mapPrazosUrgentes.get(cond.id) ?? 0;
    const prazosAtrasados = mapPrazosAtrasados.get(cond.id) ?? 0;
    const totalDemandas = mapDemandas.get(cond.id) ?? 0;

    return {
      ...cond,
      processosAtivos,
      prazosUrgentes,
      prazosAtrasados,
      totalDemandas,
      valorEmDisputa,
      temJuridico: processosAtivos > 0 || totalDemandas > 0,
    };
  });
}

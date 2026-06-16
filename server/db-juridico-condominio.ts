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
export async function listarCondominiosComJuridico() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const agora = new Date();
  const em7Dias = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Buscar todos os condomínios
  const todosCondominios = await db
    .select({
      id: condominios.id,
      name: condominios.name,
      city: condominios.city,
      state: condominios.state,
    })
    .from(condominios)
    .orderBy(condominios.name);

  // Para cada condomínio, buscar contadores jurídicos
  const resultado = await Promise.all(
    todosCondominios.map(async (cond) => {
      const [processosAtivos] = await db
        .select({ total: count() })
        .from(processosJudiciais)
        .where(
          and(
            eq(processosJudiciais.condominioId, cond.id),
            eq(processosJudiciais.status, "ativo")
          )
        );

      const [prazosUrgentes] = await db
        .select({ total: count() })
        .from(prazosJuridicos)
        .where(
          and(
            eq(prazosJuridicos.condominioId, cond.id),
            eq(prazosJuridicos.status, "pendente"),
            lte(prazosJuridicos.dataLimite, em7Dias)
          )
        );

      const [prazosAtrasados] = await db
        .select({ total: count() })
        .from(prazosJuridicos)
        .where(
          and(
            eq(prazosJuridicos.condominioId, cond.id),
            eq(prazosJuridicos.status, "pendente"),
            lte(prazosJuridicos.dataLimite, agora)
          )
        );

      const [totalDemandas] = await db
        .select({ total: count() })
        .from(demandas)
        .where(eq(demandas.condominioId, cond.id));

      const [valorEmDisputa] = await db
        .select({ total: sum(processosJudiciais.valorCausa) })
        .from(processosJudiciais)
        .where(
          and(
            eq(processosJudiciais.condominioId, cond.id),
            eq(processosJudiciais.status, "ativo")
          )
        );

      return {
        ...cond,
        processosAtivos: processosAtivos.total ?? 0,
        prazosUrgentes: prazosUrgentes.total ?? 0,
        prazosAtrasados: prazosAtrasados.total ?? 0,
        totalDemandas: totalDemandas.total ?? 0,
        valorEmDisputa: Number(valorEmDisputa.total ?? 0),
        temJuridico:
          (processosAtivos.total ?? 0) > 0 ||
          (totalDemandas.total ?? 0) > 0,
      };
    })
  );

  return resultado;
}

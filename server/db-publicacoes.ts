import { eq, desc, and, sql, isNull, gte, lt } from "drizzle-orm";
import { getDb } from "./db";
import { monitoramentosPublicacoes, publicacoes } from "../drizzle/schema";

// ─── Monitoramentos ───────────────────────────────────────────────────────────

export async function listarMonitoramentos() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(monitoramentosPublicacoes).orderBy(desc(monitoramentosPublicacoes.createdAt));
}

export async function getMonitoramento(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(monitoramentosPublicacoes).where(eq(monitoramentosPublicacoes.id, id));
  return row ?? null;
}

export async function createMonitoramento(data: {
  advogadoNome: string;
  oab?: string | null;
  uf?: string | null;
  palavrasChave?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const [result] = await db.insert(monitoramentosPublicacoes).values({
    advogadoNome: data.advogadoNome,
    oab: data.oab ?? null,
    uf: data.uf ?? null,
    palavrasChave: data.palavrasChave ?? null,
    ativo: 1,
  });
  return result;
}

export async function updateMonitoramento(id: number, data: {
  advogadoNome?: string;
  oab?: string | null;
  uf?: string | null;
  palavrasChave?: string | null;
  ativo?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(monitoramentosPublicacoes).set(data).where(eq(monitoramentosPublicacoes.id, id));
}

export async function deleteMonitoramento(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(monitoramentosPublicacoes).where(eq(monitoramentosPublicacoes.id, id));
}

export async function toggleMonitoramento(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const [row] = await db.select({ ativo: monitoramentosPublicacoes.ativo })
    .from(monitoramentosPublicacoes).where(eq(monitoramentosPublicacoes.id, id));
  if (!row) throw new Error("Monitoramento não encontrado");
  await db.update(monitoramentosPublicacoes)
    .set({ ativo: row.ativo === 1 ? 0 : 1 })
    .where(eq(monitoramentosPublicacoes.id, id));
}

// ─── Publicações ──────────────────────────────────────────────────────────────

export async function listarPublicacoes(filtros?: {
  status?: string;
  monitoramentoId?: number;
  lida?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db
    .select({
      id: publicacoes.id,
      monitoramentoId: publicacoes.monitoramentoId,
      advogadoNome: monitoramentosPublicacoes.advogadoNome,
      oab: monitoramentosPublicacoes.oab,
      tribunal: publicacoes.tribunal,
      comarca: publicacoes.comarca,
      vara: publicacoes.vara,
      dataPublicacao: publicacoes.dataPublicacao,
      tipo: publicacoes.tipo,
      textoCompleto: publicacoes.textoCompleto,
      numeroCNJ: publicacoes.numeroCNJ,
      encontradoPor: publicacoes.encontradoPor,
      status: publicacoes.status,
      lida: publicacoes.lida,
      observacoes: publicacoes.observacoes,
      responsavelNome: publicacoes.responsavelNome,
      createdAt: publicacoes.createdAt,
    })
    .from(publicacoes)
    .leftJoin(monitoramentosPublicacoes, eq(publicacoes.monitoramentoId, monitoramentosPublicacoes.id))
    .orderBy(desc(publicacoes.createdAt))
    .$dynamic();

  const conditions = [];
  if (filtros?.status) conditions.push(eq(publicacoes.status, filtros.status as any));
  if (filtros?.monitoramentoId) conditions.push(eq(publicacoes.monitoramentoId, filtros.monitoramentoId));
  if (filtros?.lida !== undefined) conditions.push(eq(publicacoes.lida, filtros.lida));
  if (conditions.length > 0) query = query.where(and(...conditions));
  if (filtros?.limit) query = query.limit(filtros.limit);
  if (filtros?.offset) query = query.offset(filtros.offset);

  return query;
}

export async function getPublicacao(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      id: publicacoes.id,
      monitoramentoId: publicacoes.monitoramentoId,
      advogadoNome: monitoramentosPublicacoes.advogadoNome,
      oab: monitoramentosPublicacoes.oab,
      tribunal: publicacoes.tribunal,
      comarca: publicacoes.comarca,
      vara: publicacoes.vara,
      dataPublicacao: publicacoes.dataPublicacao,
      tipo: publicacoes.tipo,
      textoCompleto: publicacoes.textoCompleto,
      numeroCNJ: publicacoes.numeroCNJ,
      encontradoPor: publicacoes.encontradoPor,
      status: publicacoes.status,
      lida: publicacoes.lida,
      observacoes: publicacoes.observacoes,
      responsavelNome: publicacoes.responsavelNome,
      createdAt: publicacoes.createdAt,
      updatedAt: publicacoes.updatedAt,
    })
    .from(publicacoes)
    .leftJoin(monitoramentosPublicacoes, eq(publicacoes.monitoramentoId, monitoramentosPublicacoes.id))
    .where(eq(publicacoes.id, id));
  return row ?? null;
}

export async function createPublicacaoManual(data: {
  monitoramentoId?: number | null;
  tribunal?: string | null;
  comarca?: string | null;
  vara?: string | null;
  dataPublicacao?: Date | null;
  tipo: "intimacao" | "sentenca" | "despacho" | "audiencia" | "decisao" | "outro";
  textoCompleto: string;
  numeroCNJ?: string | null;
  encontradoPor?: string | null;
  responsavelNome?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const [result] = await db.insert(publicacoes).values({
    monitoramentoId: data.monitoramentoId ?? null,
    tribunal: data.tribunal ?? null,
    comarca: data.comarca ?? null,
    vara: data.vara ?? null,
    dataPublicacao: data.dataPublicacao ?? null,
    tipo: data.tipo,
    textoCompleto: data.textoCompleto,
    numeroCNJ: data.numeroCNJ ?? null,
    encontradoPor: data.encontradoPor ?? "manual",
    status: "nova",
    lida: 0,
    responsavelNome: data.responsavelNome ?? null,
  });
  return result;
}

export async function updatePublicacaoStatus(id: number, status: string) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(publicacoes)
    .set({ status: status as any })
    .where(eq(publicacoes.id, id));
}

export async function marcarPublicacaoLida(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.update(publicacoes).set({ lida: 1 }).where(eq(publicacoes.id, id));
}

export async function updatePublicacao(id: number, data: {
  status?: string;
  lida?: number;
  observacoes?: string | null;
  responsavelNome?: string | null;
  numeroCNJ?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const update: Record<string, any> = {};
  if (data.status !== undefined) update.status = data.status;
  if (data.lida !== undefined) update.lida = data.lida;
  if (data.observacoes !== undefined) update.observacoes = data.observacoes;
  if (data.responsavelNome !== undefined) update.responsavelNome = data.responsavelNome;
  if (data.numeroCNJ !== undefined) update.numeroCNJ = data.numeroCNJ;
  if (Object.keys(update).length > 0) {
    await db.update(publicacoes).set(update).where(eq(publicacoes.id, id));
  }
}

export async function getDashboardPublicacoes() {
  const db = await getDb();
  if (!db) return { hoje: 0, naoLidas: 0, novas: 0, analisando: 0, aguardandoProvidencia: 0, providenciadas: 0, arquivadas: 0, total: 0, porAdvogado: [] };

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  const [totais] = await db.select({
    total: sql<number>`COUNT(*)`,
    naoLidas: sql<number>`SUM(CASE WHEN ${publicacoes.lida} = 0 THEN 1 ELSE 0 END)`,
    novas: sql<number>`SUM(CASE WHEN ${publicacoes.status} = 'nova' THEN 1 ELSE 0 END)`,
    analisando: sql<number>`SUM(CASE WHEN ${publicacoes.status} = 'analisando' THEN 1 ELSE 0 END)`,
    aguardandoProvidencia: sql<number>`SUM(CASE WHEN ${publicacoes.status} = 'aguardando_providencia' THEN 1 ELSE 0 END)`,
    providenciadas: sql<number>`SUM(CASE WHEN ${publicacoes.status} = 'providenciada' THEN 1 ELSE 0 END)`,
    arquivadas: sql<number>`SUM(CASE WHEN ${publicacoes.status} = 'arquivada' THEN 1 ELSE 0 END)`,
    hoje: sql<number>`SUM(CASE WHEN ${publicacoes.createdAt} >= ${hoje.toISOString()} AND ${publicacoes.createdAt} < ${amanha.toISOString()} THEN 1 ELSE 0 END)`,
  }).from(publicacoes);

  const porAdvogado = await db
    .select({
      advogadoNome: monitoramentosPublicacoes.advogadoNome,
      oab: monitoramentosPublicacoes.oab,
      total: sql<number>`COUNT(${publicacoes.id})`,
      naoLidas: sql<number>`SUM(CASE WHEN ${publicacoes.lida} = 0 THEN 1 ELSE 0 END)`,
    })
    .from(publicacoes)
    .innerJoin(monitoramentosPublicacoes, eq(publicacoes.monitoramentoId, monitoramentosPublicacoes.id))
    .groupBy(monitoramentosPublicacoes.id, monitoramentosPublicacoes.advogadoNome, monitoramentosPublicacoes.oab)
    .orderBy(desc(sql<number>`COUNT(${publicacoes.id})`))
    .limit(10);

  return {
    hoje: totais?.hoje ?? 0,
    naoLidas: totais?.naoLidas ?? 0,
    novas: totais?.novas ?? 0,
    analisando: totais?.analisando ?? 0,
    aguardandoProvidencia: totais?.aguardandoProvidencia ?? 0,
    providenciadas: totais?.providenciadas ?? 0,
    arquivadas: totais?.arquivadas ?? 0,
    total: totais?.total ?? 0,
    porAdvogado,
  };
}

import { getDb } from "./db";
import { eq, desc, asc, and, gte, lte, inArray, sql } from "drizzle-orm";
import {
  demandas,
  colunasDemanda,
  timelineDemanda,
  anexosDemanda,
  assembleias,
  condominios,
} from "../drizzle/schema";

// ─── Colunas Kanban ───────────────────────────────────────────────────────────

export async function getColunasDemanda() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(colunasDemanda).orderBy(asc(colunasDemanda.ordem));
}

export async function createColunaDemanda(data: {
  nome: string;
  icone?: string;
  cor?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [maxOrdem] = await db
    .select({ max: sql<number>`MAX(${colunasDemanda.ordem})` })
    .from(colunasDemanda);
  const novaOrdem = (maxOrdem?.max ?? 0) + 1;
  const result = await db.insert(colunasDemanda).values({
    nome: data.nome,
    icone: data.icone ?? "📋",
    cor: data.cor ?? "slate",
    ordem: novaOrdem,
    padrao: 0,
  });
  return result;
}

export async function updateColunaDemanda(
  id: number,
  data: { nome?: string; icone?: string; cor?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.update(colunasDemanda).set(data).where(eq(colunasDemanda.id, id));
}

export async function deleteColunaDemanda(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [col] = await db
    .select()
    .from(colunasDemanda)
    .where(eq(colunasDemanda.id, id))
    .limit(1);
  if (col?.padrao) throw new Error("Não é possível excluir colunas padrão do sistema");
  return db.delete(colunasDemanda).where(eq(colunasDemanda.id, id));
}

export async function reordenarColunas(colunaIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  for (let i = 0; i < colunaIds.length; i++) {
    await db
      .update(colunasDemanda)
      .set({ ordem: i })
      .where(eq(colunasDemanda.id, colunaIds[i]));
  }
}

export async function seedColunasPadrao() {
  const db = await getDb();
  if (!db) return;
  const existentes = await db.select().from(colunasDemanda).limit(1);
  if (existentes.length > 0) return;
  const colunasPadrao = [
    { nome: "Recebido", icone: "📥", cor: "blue", ordem: 0, padrao: 1 },
    { nome: "Triagem", icone: "🔍", cor: "yellow", ordem: 1, padrao: 1 },
    { nome: "Em Elaboração", icone: "📄", cor: "orange", ordem: 2, padrao: 1 },
    { nome: "Em Atendimento", icone: "⚖️", cor: "purple", ordem: 3, padrao: 1 },
    { nome: "Aguardando Cliente", icone: "⏳", cor: "amber", ordem: 4, padrao: 1 },
    { nome: "Aguardando Administradora", icone: "⏳", cor: "amber", ordem: 5, padrao: 1 },
    { nome: "Aguardando Condomínio", icone: "🏢", cor: "cyan", ordem: 6, padrao: 1 },
    { nome: "Concluído", icone: "✅", cor: "green", ordem: 7, padrao: 1 },
    { nome: "Cancelado", icone: "🚫", cor: "red", ordem: 8, padrao: 1 },
  ];
  await db.insert(colunasDemanda).values(colunasPadrao);
}

// ─── Demandas ─────────────────────────────────────────────────────────────────

async function gerarNumeroDemanda(): Promise<string> {
  const db = await getDb();
  if (!db) return "#0001";
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(demandas);
  const num = (result?.count ?? 0) + 1;
  return `#${String(num).padStart(4, "0")}`;
}

export async function createDemanda(data: {
  condominioId?: number | null;
  colunaId: number;
  solicitante?: string;
  solicitanteTipo?: string;
  canal: "whatsapp" | "email" | "portal" | "telefone" | "presencial" | "assembleia" | "processo_interno" | "manual";
  assunto: string;
  descricao?: string;
  tipo: string;
  prioridade?: "baixa" | "media" | "alta" | "urgente";
  prazo?: Date | null;
  responsavelId?: number | null;
  responsavelNome?: string;
  devedorId?: number | null;
  cobrancaId?: number | null;
  criadoPorId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const numero = await gerarNumeroDemanda();
  const result = await db.insert(demandas).values({
    numero,
    condominioId: data.condominioId ?? null,
    colunaId: data.colunaId,
    solicitante: data.solicitante,
    solicitanteTipo: data.solicitanteTipo,
    canal: data.canal,
    assunto: data.assunto,
    descricao: data.descricao,
    tipo: data.tipo as any,
    prioridade: data.prioridade ?? "media",
    prazo: data.prazo ?? null,
    responsavelId: data.responsavelId ?? null,
    responsavelNome: data.responsavelNome,
    devedorId: data.devedorId ?? null,
    cobrancaId: data.cobrancaId ?? null,
    criadoPorId: data.criadoPorId,
  });
  const insertId = (result as any).insertId ?? (result[0] as any)?.insertId;
  if (insertId) {
    await db.insert(timelineDemanda).values({
      demandaId: insertId,
      tipo: "criacao",
      descricao: `Demanda ${numero} criada via ${data.canal}`,
      usuarioId: data.criadoPorId,
    });
  }
  return { insertId, numero };
}

export async function getDemandas(filters?: {
  condominioId?: number;
  colunaId?: number;
  responsavelId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.condominioId) conditions.push(eq(demandas.condominioId, filters.condominioId));
  if (filters?.colunaId) conditions.push(eq(demandas.colunaId, filters.colunaId));
  if (filters?.responsavelId) conditions.push(eq(demandas.responsavelId, filters.responsavelId));
  const query = db
    .select({
      id: demandas.id,
      numero: demandas.numero,
      condominioId: demandas.condominioId,
      condominioNome: condominios.name,
      colunaId: demandas.colunaId,
      solicitante: demandas.solicitante,
      solicitanteTipo: demandas.solicitanteTipo,
      canal: demandas.canal,
      assunto: demandas.assunto,
      descricao: demandas.descricao,
      tipo: demandas.tipo,
      prioridade: demandas.prioridade,
      prazo: demandas.prazo,
      responsavelId: demandas.responsavelId,
      responsavelNome: demandas.responsavelNome,
      devedorId: demandas.devedorId,
      cobrancaId: demandas.cobrancaId,
      criadoPorId: demandas.criadoPorId,
      createdAt: demandas.createdAt,
      updatedAt: demandas.updatedAt,
    })
    .from(demandas)
    .leftJoin(condominios, eq(demandas.condominioId, condominios.id))
    .orderBy(desc(demandas.createdAt));
  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }
  return query;
}

export async function getDemandaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: demandas.id,
      numero: demandas.numero,
      condominioId: demandas.condominioId,
      condominioNome: condominios.name,
      colunaId: demandas.colunaId,
      solicitante: demandas.solicitante,
      solicitanteTipo: demandas.solicitanteTipo,
      canal: demandas.canal,
      assunto: demandas.assunto,
      descricao: demandas.descricao,
      tipo: demandas.tipo,
      prioridade: demandas.prioridade,
      prazo: demandas.prazo,
      responsavelId: demandas.responsavelId,
      responsavelNome: demandas.responsavelNome,
      devedorId: demandas.devedorId,
      cobrancaId: demandas.cobrancaId,
      criadoPorId: demandas.criadoPorId,
      createdAt: demandas.createdAt,
      updatedAt: demandas.updatedAt,
    })
    .from(demandas)
    .leftJoin(condominios, eq(demandas.condominioId, condominios.id))
    .where(eq(demandas.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateDemanda(
  id: number,
  data: Partial<{
    colunaId: number;
    solicitante: string;
    solicitanteTipo: string;
    canal: string;
    assunto: string;
    descricao: string;
    tipo: string;
    prioridade: string;
    prazo: Date | null;
    responsavelId: number | null;
    responsavelNome: string;
    condominioId: number | null;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.update(demandas).set(data as any).where(eq(demandas.id, id));
}

export async function moverDemanda(
  id: number,
  novaColunaId: number,
  usuarioId?: number,
  usuarioNome?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [coluna] = await db
    .select()
    .from(colunasDemanda)
    .where(eq(colunasDemanda.id, novaColunaId))
    .limit(1);
  await db.update(demandas).set({ colunaId: novaColunaId }).where(eq(demandas.id, id));
  await db.insert(timelineDemanda).values({
    demandaId: id,
    tipo: "movimentacao",
    descricao: `Movida para "${coluna?.nome ?? "nova coluna"}"`,
    usuarioId,
    usuarioNome,
  });
}

export async function deleteDemanda(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(timelineDemanda).where(eq(timelineDemanda.demandaId, id));
  await db.delete(anexosDemanda).where(eq(anexosDemanda.demandaId, id));
  return db.delete(demandas).where(eq(demandas.id, id));
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export async function getTimelineDemanda(demandaId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(timelineDemanda)
    .where(eq(timelineDemanda.demandaId, demandaId))
    .orderBy(asc(timelineDemanda.createdAt));
}

export async function addTimelineEvento(data: {
  demandaId: number;
  tipo: "criacao" | "atribuicao" | "movimentacao" | "comentario" | "anexo" | "email" | "whatsapp" | "conclusao" | "cancelamento" | "outro";
  descricao: string;
  usuarioId?: number;
  usuarioNome?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.insert(timelineDemanda).values(data);
}

// ─── Assembleias ──────────────────────────────────────────────────────────────

export async function getAssembleias(filters?: {
  condominioId?: number;
  status?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.condominioId) conditions.push(eq(assembleias.condominioId, filters.condominioId));
  if (filters?.status) conditions.push(eq(assembleias.status, filters.status as any));
  const query = db
    .select({
      id: assembleias.id,
      condominioId: assembleias.condominioId,
      condominioNome: condominios.name,
      tipo: assembleias.tipo,
      data: assembleias.data,
      hora: assembleias.hora,
      endereco: assembleias.endereco,
      advogadoResponsavelId: assembleias.advogadoResponsavelId,
      advogadoNome: assembleias.advogadoNome,
      status: assembleias.status,
      pauta: assembleias.pauta,
      ata: assembleias.ata,
      horasGastas: assembleias.horasGastas,
      observacoes: assembleias.observacoes,
      criadoPorId: assembleias.criadoPorId,
      createdAt: assembleias.createdAt,
    })
    .from(assembleias)
    .leftJoin(condominios, eq(assembleias.condominioId, condominios.id))
    .orderBy(desc(assembleias.data));
  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }
  return query;
}

export async function getAssembleiaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: assembleias.id,
      condominioId: assembleias.condominioId,
      condominioNome: condominios.name,
      tipo: assembleias.tipo,
      data: assembleias.data,
      hora: assembleias.hora,
      endereco: assembleias.endereco,
      advogadoResponsavelId: assembleias.advogadoResponsavelId,
      advogadoNome: assembleias.advogadoNome,
      status: assembleias.status,
      pauta: assembleias.pauta,
      ata: assembleias.ata,
      horasGastas: assembleias.horasGastas,
      observacoes: assembleias.observacoes,
      criadoPorId: assembleias.criadoPorId,
      createdAt: assembleias.createdAt,
    })
    .from(assembleias)
    .leftJoin(condominios, eq(assembleias.condominioId, condominios.id))
    .where(eq(assembleias.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createAssembleia(data: {
  condominioId?: number | null;
  tipo: "ordinaria" | "extraordinaria" | "prestacao_contas" | "eleicao" | "outro";
  data: Date;
  hora: string;
  endereco?: string;
  advogadoResponsavelId?: number | null;
  advogadoNome?: string;
  pauta?: string;
  criadoPorId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.insert(assembleias).values({
    condominioId: data.condominioId ?? null,
    tipo: data.tipo,
    data: data.data,
    hora: data.hora,
    endereco: data.endereco,
    advogadoResponsavelId: data.advogadoResponsavelId ?? null,
    advogadoNome: data.advogadoNome,
    pauta: data.pauta,
    criadoPorId: data.criadoPorId,
    status: "agendada",
  });
}

export async function updateAssembleia(
  id: number,
  data: Partial<{
    tipo: string;
    data: Date;
    hora: string;
    endereco: string;
    advogadoResponsavelId: number | null;
    advogadoNome: string;
    status: string;
    pauta: string;
    ata: string;
    horasGastas: string;
    observacoes: string;
    condominioId: number | null;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.update(assembleias).set(data as any).where(eq(assembleias.id, id));
}

export async function deleteAssembleia(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.delete(assembleias).where(eq(assembleias.id, id));
}

// ─── Dashboard Jurídico ───────────────────────────────────────────────────────

export async function getDashboardJuridico() {
  const db = await getDb();
  if (!db) return null;

  const porColuna = await db
    .select({
      colunaId: demandas.colunaId,
      colunaNome: colunasDemanda.nome,
      colunaIcone: colunasDemanda.icone,
      cor: colunasDemanda.cor,
      total: sql<number>`COUNT(*)`,
    })
    .from(demandas)
    .leftJoin(colunasDemanda, eq(demandas.colunaId, colunasDemanda.id))
    .groupBy(demandas.colunaId, colunasDemanda.nome, colunasDemanda.icone, colunasDemanda.cor);

  const porPrioridade = await db
    .select({
      prioridade: demandas.prioridade,
      total: sql<number>`COUNT(*)`,
    })
    .from(demandas)
    .groupBy(demandas.prioridade);

  const porCanal = await db
    .select({
      canal: demandas.canal,
      total: sql<number>`COUNT(*)`,
    })
    .from(demandas)
    .groupBy(demandas.canal);

  const porResponsavel = await db
    .select({
      responsavelNome: demandas.responsavelNome,
      responsavelId: demandas.responsavelId,
      total: sql<number>`COUNT(*)`,
    })
    .from(demandas)
    .groupBy(demandas.responsavelNome, demandas.responsavelId)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(10);

  // Demandas em atraso
  const [atrasadas] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(demandas)
    .where(
      and(
        sql`${demandas.prazo} IS NOT NULL`,
        lte(demandas.prazo, new Date())
      )
    );

  // Assembleias do mês
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const fimMes = new Date(inicioMes.getFullYear(), inicioMes.getMonth() + 1, 0, 23, 59, 59);

  const [assembleiasMes] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(assembleias)
    .where(and(gte(assembleias.data, inicioMes), lte(assembleias.data, fimMes)));

  const [horasAssembleias] = await db
    .select({ total: sql<number>`SUM(${assembleias.horasGastas})` })
    .from(assembleias)
    .where(eq(assembleias.status, "realizada"));

  return {
    porColuna,
    porPrioridade,
    porCanal,
    porResponsavel,
    demandasAtrasadas: atrasadas?.total ?? 0,
    assembleiasMes: assembleiasMes?.total ?? 0,
    horasTotaisAssembleias: Number(horasAssembleias?.total ?? 0),
  };
}

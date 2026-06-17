import { getDb } from "./db";
import { eq, desc, asc, and, gte, lte, inArray, sql } from "drizzle-orm";
import {
  demandas,
  colunasDemanda,
  timelineDemanda,
  anexosDemanda,
  assembleias,
  condominios,
  users,
} from "../drizzle/schema";

// ─── Colunas Kanban ───────────────────────────────────────────────────────────

/**
 * Retorna as colunas visíveis para um usuário:
 * - Colunas fixas globais (userId IS NULL): entrada e saída
 * - Colunas intermediárias do próprio usuário (userId = userId)
 */
export async function getColunasDemanda(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!userId) {
    // Sem userId: retorna apenas as fixas globais
    return db
      .select()
      .from(colunasDemanda)
      .where(sql`${colunasDemanda.userId} IS NULL`)
      .orderBy(asc(colunasDemanda.ordem));
  }
  // Retorna fixas globais + intermediárias do usuário
  return db
    .select()
    .from(colunasDemanda)
    .where(
      sql`(${colunasDemanda.userId} IS NULL AND ${colunasDemanda.tipo} IN ('entrada','saida'))
       OR (${colunasDemanda.userId} = ${userId} AND ${colunasDemanda.tipo} = 'intermediaria')`
    )
    .orderBy(asc(colunasDemanda.ordem));
}

/** Retorna a coluna de entrada (tipo=entrada) — usada ao criar novas demandas */
export async function getColunaEntrada() {
  const db = await getDb();
  if (!db) return null;
  const [col] = await db
    .select()
    .from(colunasDemanda)
    .where(eq(colunasDemanda.tipo, "entrada"))
    .orderBy(asc(colunasDemanda.ordem))
    .limit(1);
  return col ?? null;
}

/** Retorna a coluna de saída (tipo=saida) — usada para concluir demandas */
export async function getColunaSaida() {
  const db = await getDb();
  if (!db) return null;
  const [col] = await db
    .select()
    .from(colunasDemanda)
    .where(eq(colunasDemanda.tipo, "saida"))
    .orderBy(asc(colunasDemanda.ordem))
    .limit(1);
  return col ?? null;
}

export async function createColunaDemanda(data: {
  nome: string;
  icone?: string;
  cor?: string;
  userId: number; // obrigatório: colunas intermediárias são sempre pessoais
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Busca a maior ordem entre as colunas intermediárias deste usuário
  const [maxIntermed] = await db
    .select({ max: sql<number>`MAX(${colunasDemanda.ordem})` })
    .from(colunasDemanda)
    .where(
      sql`${colunasDemanda.tipo} = 'intermediaria' AND ${colunasDemanda.userId} = ${data.userId}`
    );
  // Coluna de saída global fica sempre por último (ordem 99)
  const novaOrdem = (maxIntermed?.max ?? 0) + 1;
  const result = await db.insert(colunasDemanda).values({
    nome: data.nome,
    icone: data.icone ?? "📋",
    cor: data.cor ?? "slate",
    ordem: novaOrdem,
    padrao: 0,
    tipo: "intermediaria",
    userId: data.userId,
  });
  return result;
}

export async function updateColunaDemanda(
  id: number,
  userId: number,
  data: { nome?: string; icone?: string; cor?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [col] = await db.select().from(colunasDemanda).where(eq(colunasDemanda.id, id)).limit(1);
  if (!col) throw new Error("Coluna não encontrada");
  if (col.tipo === "entrada" || col.tipo === "saida") {
    throw new Error("Não é possível editar colunas fixas do sistema");
  }
  // Só o dono da coluna pode editar
  if (col.userId !== userId) {
    throw new Error("Você não tem permissão para editar esta coluna");
  }
  return db.update(colunasDemanda).set(data).where(eq(colunasDemanda.id, id));
}

export async function deleteColunaDemanda(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [col] = await db
    .select()
    .from(colunasDemanda)
    .where(eq(colunasDemanda.id, id))
    .limit(1);
  if (!col) throw new Error("Coluna não encontrada");
  if (col.tipo === "entrada" || col.tipo === "saida") {
    throw new Error("Não é possível excluir as colunas fixas do sistema (Demandas Recebidas e Demandas Resolvidas)");
  }
  // Só o dono da coluna pode excluir
  if (col.userId !== userId) {
    throw new Error("Você não tem permissão para excluir esta coluna");
  }
  // Mover demandas desta coluna para a coluna de entrada antes de excluir
  const colunaEntrada = await getColunaEntrada();
  if (colunaEntrada) {
    await db
      .update(demandas)
      .set({ colunaId: colunaEntrada.id })
      .where(eq(demandas.colunaId, id));
  }
  return db.delete(colunasDemanda).where(eq(colunasDemanda.id, id));
}

export async function reordenarColunas(colunaIds: number[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Busca as colunas do usuário (fixas globais + intermediárias pessoais)
  const todasColunas = await getColunasDemanda(userId);
  const colunaEntrada = todasColunas.find(c => c.tipo === "entrada");
  const colunaSaida = todasColunas.find(c => c.tipo === "saida");
  // Filtra apenas as colunas intermediárias do usuário na lista de reordenação
  const idsIntermedios = colunaIds.filter(id => {
    const col = todasColunas.find(c => c.id === id);
    return col?.tipo === "intermediaria" && col.userId === userId;
  });
  // Entrada sempre na ordem 0, intermediárias a partir de 1, saída por último
  if (colunaEntrada) {
    await db.update(colunasDemanda).set({ ordem: 0 }).where(eq(colunasDemanda.id, colunaEntrada.id));
  }
  for (let i = 0; i < idsIntermedios.length; i++) {
    await db
      .update(colunasDemanda)
      .set({ ordem: i + 1 })
      .where(eq(colunasDemanda.id, idsIntermedios[i]));
  }
  if (colunaSaida) {
    await db.update(colunasDemanda).set({ ordem: idsIntermedios.length + 1 }).where(eq(colunasDemanda.id, colunaSaida.id));
  }
}

export async function migrarColunasPadrao() {
  /**
   * Migração: garante que as colunas existentes tenham o campo tipo correto.
   * - Primeira coluna (ordem=0 ou nome="Recebido") → tipo=entrada
   * - Última coluna com nome "Concluído" ou "Cancelado" → tipo=saida (cria se não existir)
   * - Demais → tipo=intermediaria
   * Executada automaticamente no boot do servidor.
   */
  const db = await getDb();
  if (!db) return;
  const cols = await db.select().from(colunasDemanda).orderBy(asc(colunasDemanda.ordem));
  if (cols.length === 0) return;
  // Verifica se já existe coluna de entrada e saída
  const temEntrada = cols.some(c => c.tipo === "entrada");
  const temSaida = cols.some(c => c.tipo === "saida");
  if (temEntrada && temSaida) return; // já migrado
  // Marca a primeira coluna como entrada
  if (!temEntrada) {
    const primeiraColuna = cols[0];
    await db.update(colunasDemanda).set({ tipo: "entrada" }).where(eq(colunasDemanda.id, primeiraColuna.id));
  }
  // Marca a última coluna como saída (ou cria uma nova)
  if (!temSaida) {
    // Procura por "Concluído" ou "Cancelado"
    const colConcluido = cols.find(c => c.nome.toLowerCase().includes("conclu") || c.nome.toLowerCase().includes("resolv"));
    if (colConcluido) {
      await db.update(colunasDemanda).set({ tipo: "saida" }).where(eq(colunasDemanda.id, colConcluido.id));
    } else {
      // Cria uma nova coluna de saída
      const maxOrdem = Math.max(...cols.map(c => c.ordem));
      await db.insert(colunasDemanda).values({
        nome: "Demandas Resolvidas",
        icone: "✅",
        cor: "green",
        ordem: maxOrdem + 1,
        padrao: 1,
        tipo: "saida",
      });
    }
  }
  // Marca todas as demais como intermediaria
  const colsAtualizadas = await db.select().from(colunasDemanda);
  for (const col of colsAtualizadas) {
    if (col.tipo !== "entrada" && col.tipo !== "saida") {
      await db.update(colunasDemanda).set({ tipo: "intermediaria" }).where(eq(colunasDemanda.id, col.id));
    }
  }
}

/**
 * Seed de colunas para um usuário específico:
 * - Garante que as colunas fixas globais (entrada/saida) existam (userId=null)
 * - Cria colunas intermediárias de exemplo para o usuário se ele ainda não tiver nenhuma
 */
export async function seedColunasPadrao(userId?: number) {
  const db = await getDb();
  if (!db) return;

  // 1. Garante as colunas fixas globais (userId IS NULL)
  const fixasExistentes = await db
    .select()
    .from(colunasDemanda)
    .where(sql`${colunasDemanda.userId} IS NULL AND ${colunasDemanda.tipo} IN ('entrada','saida')`);

  const temEntradaGlobal = fixasExistentes.some(c => c.tipo === "entrada");
  const temSaidaGlobal = fixasExistentes.some(c => c.tipo === "saida");

  if (!temEntradaGlobal) {
    await db.insert(colunasDemanda).values({
      nome: "Demandas Recebidas", icone: "📥", cor: "blue",
      ordem: 0, padrao: 1, tipo: "entrada", userId: null,
    });
  }
  if (!temSaidaGlobal) {
    await db.insert(colunasDemanda).values({
      nome: "Demandas Resolvidas", icone: "✅", cor: "green",
      ordem: 99, padrao: 1, tipo: "saida", userId: null,
    });
  }

  // 2. Se userId fornecido, cria colunas intermediárias de exemplo para o usuário
  if (userId) {
    const intermedExistentes = await db
      .select()
      .from(colunasDemanda)
      .where(
        sql`${colunasDemanda.tipo} = 'intermediaria' AND ${colunasDemanda.userId} = ${userId}`
      );
    if (intermedExistentes.length === 0) {
      // Cria etapas de exemplo para o novo usuário
      await db.insert(colunasDemanda).values([
        { nome: "Em Análise",         icone: "🔍", cor: "yellow", ordem: 1, padrao: 0, tipo: "intermediaria", userId },
        { nome: "Elaboração de Peça", icone: "📄", cor: "orange", ordem: 2, padrao: 0, tipo: "intermediaria", userId },
        { nome: "Aguardando Cliente", icone: "⏳", cor: "amber",  ordem: 3, padrao: 0, tipo: "intermediaria", userId },
        { nome: "Em Audiência",       icone: "⚖️", cor: "purple", ordem: 4, padrao: 0, tipo: "intermediaria", userId },
      ]);
    }
  }
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
      valorDivida: demandas.valorDivida,
      nomeDevedor: demandas.nomeDevedor,
      cpfDevedor: demandas.cpfDevedor,
      unidadeDevedor: demandas.unidadeDevedor,
      qtdCobrancas: demandas.qtdCobrancas,
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
      valorDivida: demandas.valorDivida,
      nomeDevedor: demandas.nomeDevedor,
      cpfDevedor: demandas.cpfDevedor,
      unidadeDevedor: demandas.unidadeDevedor,
      qtdCobrancas: demandas.qtdCobrancas,
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
  // Se a coluna de destino é do tipo saida, marca a demanda como concluída
  const updateData: any = { colunaId: novaColunaId };
  if (coluna?.tipo === "saida") {
    updateData.status = "concluida";
    updateData.resolvidoEm = new Date();
  }
  await db.update(demandas).set(updateData).where(eq(demandas.id, id));
  const tipoEvento = coluna?.tipo === "saida" ? "conclusao" : "movimentacao";
  const descricaoEvento = coluna?.tipo === "saida"
    ? `Demanda concluída e movida para "${coluna.nome}"`
    : `Movida para "${coluna?.nome ?? "nova coluna"}"`;
  await db.insert(timelineDemanda).values({
    demandaId: id,
    tipo: tipoEvento,
    descricao: descricaoEvento,
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

// ─── Advogados ────────────────────────────────────────────────────────────────

/**
 * Retorna todos os usuários com role "advogado" e isActive=1.
 * Usado para popular selects de responsável nas demandas e assembleias.
 */
export async function getAdvogados() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isActive: users.isActive,
    })
    .from(users)
    .where(and(eq(users.role, "advogado"), eq(users.isActive, 1)))
    .orderBy(asc(users.name));
}

// ─── Integração Jurídico ↔ Cobrança ──────────────────────────────────────────

/**
 * Cria uma demanda jurídica a partir de um devedor inadimplente.
 */
export async function escalarParaJuridico(params: {
  devedorId: number;
  condominioId?: number;
  nomeDevedor: string;
  cpfDevedor?: string;
  unidadeDevedor: string;
  valorDivida: number; // em centavos
  qtdCobrancas: number;
  assunto: string;
  descricao?: string;
  prioridade?: "baixa" | "media" | "alta" | "urgente";
  criadoPorId: number;
  criadoPorNome?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Buscar a primeira coluna do kanban (menor ordem)
  const [primeiraColuna] = await db
    .select({ id: colunasDemanda.id })
    .from(colunasDemanda)
    .orderBy(asc(colunasDemanda.ordem))
    .limit(1);

  if (!primeiraColuna) {
    throw new Error("Nenhuma coluna do kanban encontrada. Configure o módulo jurídico primeiro.");
  }

  // Gerar número sequencial
  const [ultimaDemanda] = await db
    .select({ numero: demandas.numero })
    .from(demandas)
    .orderBy(desc(demandas.id))
    .limit(1);

  let proximoNumero = 1;
  if (ultimaDemanda?.numero) {
    const match = ultimaDemanda.numero.match(/\d+/);
    if (match) proximoNumero = parseInt(match[0]) + 1;
  }
  const numero = `#${String(proximoNumero).padStart(4, "0")}`;

  const [result] = await db.insert(demandas).values({
    numero,
    condominioId: params.condominioId ?? null,
    colunaId: primeiraColuna.id,
    canal: "manual",
    assunto: params.assunto,
    descricao: params.descricao ?? null,
    tipo: "cobranca_judicial",
    prioridade: params.prioridade ?? "media",
    devedorId: params.devedorId,
    valorDivida: params.valorDivida,
    nomeDevedor: params.nomeDevedor,
    cpfDevedor: params.cpfDevedor ?? null,
    unidadeDevedor: params.unidadeDevedor,
    qtdCobrancas: params.qtdCobrancas,
    criadoPorId: params.criadoPorId,
  });

  const demandaId = (result as any).insertId as number;

  // Adicionar evento na timeline
  await db.insert(timelineDemanda).values({
    demandaId,
    tipo: "criacao",
    descricao: `Demanda criada via escalada de cobrança. Devedor: ${params.nomeDevedor} (${params.unidadeDevedor}). Valor devido: R$ ${(params.valorDivida / 100).toFixed(2).replace(".", ",")}. Cobranças em aberto: ${params.qtdCobrancas}.`,
    usuarioId: params.criadoPorId,
    usuarioNome: params.criadoPorNome ?? undefined,
  });

  return { demandaId, numero };
}

/**
 * Retorna dados do devedor vinculado a uma demanda (snapshot salvo na demanda).
 */
export async function getCobrancasVinculadas(demandaId: number) {
  const db = await getDb();
  if (!db) return null;

  const [demanda] = await db
    .select({
      devedorId: demandas.devedorId,
      nomeDevedor: demandas.nomeDevedor,
      unidadeDevedor: demandas.unidadeDevedor,
      valorDivida: demandas.valorDivida,
      qtdCobrancas: demandas.qtdCobrancas,
    })
    .from(demandas)
    .where(eq(demandas.id, demandaId))
    .limit(1);

  if (!demanda?.devedorId) return null;

  return {
    devedorId: demanda.devedorId,
    nomeDevedor: demanda.nomeDevedor,
    unidadeDevedor: demanda.unidadeDevedor,
    valorDivida: demanda.valorDivida,
    qtdCobrancas: demanda.qtdCobrancas,
  };
}

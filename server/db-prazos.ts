import { getDb } from "./db";
import { eq, and, desc, asc, lte } from "drizzle-orm";
import {
  prazosJuridicos,
  PrazoJuridico,
  InsertPrazoJuridico,
} from "../drizzle/schema";

// ─── Urgência ─────────────────────────────────────────────────────────────────

export type UrgenciaPrazo = "atrasado" | "hoje" | "7dias" | "15dias" | "30dias" | "futuro";

export function calcularUrgencia(dataLimite: Date): UrgenciaPrazo {
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const limite = new Date(dataLimite.getFullYear(), dataLimite.getMonth(), dataLimite.getDate());
  const diffMs = limite.getTime() - hoje.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDias < 0) return "atrasado";
  if (diffDias === 0) return "hoje";
  if (diffDias <= 7) return "7dias";
  if (diffDias <= 15) return "15dias";
  if (diffDias <= 30) return "30dias";
  return "futuro";
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export interface FiltrosPrazo {
  condominioId?: number;
  processoId?: number;
  demandaId?: number;
  responsavelId?: number;
  status?: string;
  urgencia?: UrgenciaPrazo;
}

export async function getPrazos(filtros: FiltrosPrazo = {}): Promise<PrazoJuridico[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];

  if (filtros.condominioId) {
    conditions.push(eq(prazosJuridicos.condominioId, filtros.condominioId));
  }
  if (filtros.processoId) {
    conditions.push(eq(prazosJuridicos.processoId, filtros.processoId));
  }
  if (filtros.demandaId) {
    conditions.push(eq(prazosJuridicos.demandaId, filtros.demandaId));
  }
  if (filtros.responsavelId) {
    conditions.push(eq(prazosJuridicos.responsavelId, filtros.responsavelId));
  }
  if (filtros.status) {
    conditions.push(eq(prazosJuridicos.status, filtros.status as PrazoJuridico["status"]));
  }

  const rows: PrazoJuridico[] = await (conditions.length > 0
    ? db.select().from(prazosJuridicos).where(and(...conditions))
    : db.select().from(prazosJuridicos))
    .orderBy(asc(prazosJuridicos.dataLimite));

  if (filtros.urgencia) {
    return rows.filter((p: PrazoJuridico) => calcularUrgencia(p.dataLimite) === filtros.urgencia);
  }

  return rows;
}

export async function getPrazoById(id: number): Promise<PrazoJuridico | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(prazosJuridicos)
    .where(eq(prazosJuridicos.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createPrazo(data: InsertPrazoJuridico): Promise<PrazoJuridico | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(prazosJuridicos).values(data);
  const id = (result as any)[0]?.insertId as number;
  return getPrazoById(id);
}

export async function updatePrazo(id: number, data: Partial<InsertPrazoJuridico>): Promise<PrazoJuridico | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(prazosJuridicos).set(data).where(eq(prazosJuridicos.id, id));
  return getPrazoById(id);
}

export async function concluirPrazo(id: number): Promise<PrazoJuridico | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(prazosJuridicos)
    .set({ status: "concluido", concluidoEm: new Date() })
    .where(eq(prazosJuridicos.id, id));
  return getPrazoById(id);
}

export async function deletePrazo(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(prazosJuridicos).where(eq(prazosJuridicos.id, id));
  return true;
}

// ─── Resumo e dashboard ───────────────────────────────────────────────────────

export async function getResumoPrazos(condominioId?: number) {
  const pendentes = await getPrazos(
    condominioId
      ? { condominioId, status: "pendente" }
      : { status: "pendente" }
  );

  let atrasados = 0;
  let vencemHoje = 0;
  let vencemEm7Dias = 0;
  let vencemEm15Dias = 0;
  let vencemEm30Dias = 0;

  for (const p of pendentes) {
    const urgencia = calcularUrgencia(p.dataLimite);
    if (urgencia === "atrasado") atrasados++;
    else if (urgencia === "hoje") vencemHoje++;
    else if (urgencia === "7dias") vencemEm7Dias++;
    else if (urgencia === "15dias") vencemEm15Dias++;
    else if (urgencia === "30dias") vencemEm30Dias++;
  }

  return {
    total: pendentes.length,
    atrasados,
    vencemHoje,
    vencemEm7Dias,
    vencemEm15Dias,
    vencemEm30Dias,
    urgentes: atrasados + vencemHoje,
  };
}

export async function atualizarStatusPrazosAtrasados(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const agora = new Date();
  await db.update(prazosJuridicos)
    .set({ status: "atrasado" })
    .where(
      and(
        eq(prazosJuridicos.status, "pendente"),
        lte(prazosJuridicos.dataLimite, agora),
      )
    );
}

import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { custasJudiciais, type InsertCustaJudicial } from "../drizzle/schema";

/** Todas as custas do devedor (independente de estar em acordo ou não) */
export async function getCustasByDevedor(devedorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(custasJudiciais)
    .where(eq(custasJudiciais.devedorId, devedorId))
    .orderBy(desc(custasJudiciais.data));
}

/**
 * Custas LIVRES do devedor — sem acordo ativo vinculado.
 * Usadas no modal de novo acordo para não cobrar em duplicidade.
 */
export async function getCustasLivresByDevedor(devedorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(custasJudiciais)
    .where(and(
      eq(custasJudiciais.devedorId, devedorId),
      isNull(custasJudiciais.acordoId)
    ))
    .orderBy(desc(custasJudiciais.data));
}

export async function getTotalCustasByDevedor(devedorId: number): Promise<number> {
  const custas = await getCustasByDevedor(devedorId);
  return custas.reduce((sum: number, c: { valor: number }) => sum + c.valor, 0);
}

/** Total de custas LIVRES (não vinculadas a acordo ativo) */
export async function getTotalCustasLivresByDevedor(devedorId: number): Promise<number> {
  const custas = await getCustasLivresByDevedor(devedorId);
  return custas.reduce((sum: number, c: { valor: number }) => sum + c.valor, 0);
}

/** Vincula todas as custas livres do devedor ao acordo criado */
export async function vincularCustasAoAcordo(devedorId: number, acordoId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db
    .update(custasJudiciais)
    .set({ acordoId })
    .where(and(
      eq(custasJudiciais.devedorId, devedorId),
      isNull(custasJudiciais.acordoId)
    ));
}

/** Libera as custas vinculadas ao acordo (ao cancelar o acordo) */
export async function liberarCustasDoAcordo(acordoId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db
    .update(custasJudiciais)
    .set({ acordoId: null })
    .where(eq(custasJudiciais.acordoId, acordoId));
}

export async function createCusta(data: InsertCustaJudicial) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const [result] = await db.insert(custasJudiciais).values(data);
  return result;
}

export async function deleteCusta(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(custasJudiciais).where(eq(custasJudiciais.id, id));
}

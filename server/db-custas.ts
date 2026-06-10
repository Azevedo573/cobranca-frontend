import { desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { custasJudiciais, type InsertCustaJudicial } from "../drizzle/schema";

export async function getCustasByDevedor(devedorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(custasJudiciais)
    .where(eq(custasJudiciais.devedorId, devedorId))
    .orderBy(desc(custasJudiciais.data));
}

export async function getTotalCustasByDevedor(devedorId: number): Promise<number> {
  const custas = await getCustasByDevedor(devedorId);
  return custas.reduce((sum: number, c: { valor: number }) => sum + c.valor, 0);
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

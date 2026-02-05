import { getDb } from "./db";
import { acordos, parcelasAcordo, cobrancas } from "../drizzle/schema";
import { eq, and, lt } from "drizzle-orm";

/**
 * Verifica parcelas atrasadas e atualiza status de acordos e cobranças
 * Deve ser chamado periodicamente (ex: diariamente via cron job)
 */
export async function verificarParcelasAtrasadas() {
  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    return { success: false, message: "Database not available" };
  }

  try {
    const hoje = new Date();
    const dezDiasAtras = new Date(hoje);
    dezDiasAtras.setDate(hoje.getDate() - 10);

    // Buscar parcelas pendentes vencidas há mais de 10 dias
    const parcelasAtrasadas = await db
      .select({
        id: parcelasAcordo.id,
        acordoId: parcelasAcordo.acordoId,
        dueDate: parcelasAcordo.dueDate,
      })
      .from(parcelasAcordo)
      .where(
        and(
          eq(parcelasAcordo.status, "pendente"),
          lt(parcelasAcordo.dueDate, dezDiasAtras)
        )
      );

    if (parcelasAtrasadas.length === 0) {
      return {
        success: true,
        message: "Nenhuma parcela atrasada encontrada",
        atrasadas: 0,
      };
    }

    // Atualizar status das parcelas para "atrasado"
    for (const parcela of parcelasAtrasadas) {
      await db
        .update(parcelasAcordo)
        .set({ status: "atrasado" })
        .where(eq(parcelasAcordo.id, parcela.id));
    }

    // Buscar acordos afetados
    const acordosAfetadosArray = Array.from(new Set(parcelasAtrasadas.map((p) => p.acordoId)));

    // Para cada acordo afetado, atualizar status da cobrança para "acordo_atrasado"
    for (const acordoId of acordosAfetadosArray) {
      const acordo = await db
        .select({ cobrancaId: acordos.cobrancaId })
        .from(acordos)
        .where(eq(acordos.id, acordoId))
        .limit(1);

      if (acordo[0]) {
        await db
          .update(cobrancas)
          .set({ status: "acordo_atrasado" })
          .where(eq(cobrancas.id, acordo[0].cobrancaId));
      }
    }

    return {
      success: true,
      message: `${parcelasAtrasadas.length} parcelas atrasadas atualizadas`,
      atrasadas: parcelasAtrasadas.length,
      acordosAfetados: acordosAfetadosArray.length,
    };
  } catch (error) {
    console.error("Erro ao verificar parcelas atrasadas:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

/**
 * Verifica se uma cobrança específica tem parcelas atrasadas
 */
export async function verificarAtrasoCobranca(cobrancaId: number) {
  const db = await getDb();
  if (!db) return false;

  try {
    const hoje = new Date();
    const dezDiasAtras = new Date(hoje);
    dezDiasAtras.setDate(hoje.getDate() - 10);

    // Buscar acordo ativo para esta cobrança
    const acordo = await db
      .select({ id: acordos.id })
      .from(acordos)
      .where(
        and(eq(acordos.cobrancaId, cobrancaId), eq(acordos.status, "ativo"))
      )
      .limit(1);

    if (!acordo[0]) return false;

    // Verificar se há parcelas atrasadas
    const parcelasAtrasadas = await db
      .select({ id: parcelasAcordo.id })
      .from(parcelasAcordo)
      .where(
        and(
          eq(parcelasAcordo.acordoId, acordo[0].id),
          eq(parcelasAcordo.status, "pendente"),
          lt(parcelasAcordo.dueDate, dezDiasAtras)
        )
      )
      .limit(1);

    return parcelasAtrasadas.length > 0;
  } catch (error) {
    console.error("Erro ao verificar atraso:", error);
    return false;
  }
}

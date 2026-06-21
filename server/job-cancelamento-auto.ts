/**
 * Job de cancelamento automático de acordos
 * Roda via Heartbeat (HTTP cron) diariamente
 * Gera alerta quando a 1ª parcela não foi paga dentro do prazo após o VENCIMENTO do boleto
 */
import type { Request, Response } from "express";
import { getDb } from "./db";
import { condominios, acordos, parcelasAcordo } from "../drizzle/schema";
import { eq, and, lte, isNull } from "drizzle-orm";

export async function cancelamentoAutoHandler(req: Request, res: Response) {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(503).json({ error: "Banco de dados indisponível" });
    }
    let cancelados = 0;
    let erros = 0;
    const detalhes: string[] = [];

    // Buscar todos os condomínios com cancelamento automático ativo
    const condominiosAtivos = await db
      .select({
        id: condominios.id,
        name: condominios.name,
        cancelamentoPrazoDias: condominios.cancelamentoPrazoDias,
      })
      .from(condominios)
      .where(eq(condominios.cancelamentoAutoAtivo, 1));

    for (const cond of condominiosAtivos) {
      const prazoDias = cond.cancelamentoPrazoDias ?? 20;
      const agora = new Date();

      try {
        // Buscar acordos ativos deste condomínio
        const acordosAtivos = await db
          .select({ id: acordos.id })
          .from(acordos)
          .where(
            and(
              eq(acordos.condominioId, cond.id),
              eq(acordos.status, "ativo")
            )
          );

        for (const acordo of acordosAtivos) {
          try {
            // Buscar a primeira parcela do acordo (menor id = parcela 1)
            const primeiraParcela = await db
              .select({
                id: parcelasAcordo.id,
                status: parcelasAcordo.status,
                paymentDate: parcelasAcordo.paymentDate,
                dueDate: parcelasAcordo.dueDate,
              })
              .from(parcelasAcordo)
              .where(eq(parcelasAcordo.acordoId, acordo.id))
              .orderBy(parcelasAcordo.id)
              .limit(1);

            if (primeiraParcela.length === 0) continue;

            const parcela = primeiraParcela[0];

            // Pular se já foi paga
            if (parcela.status === "pago" || parcela.paymentDate) continue;

            // Calcular dias após o VENCIMENTO do boleto
            if (!parcela.dueDate) continue;
            const vencimento = new Date(parcela.dueDate);
            const diasAposVencimento = Math.floor(
              (agora.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24)
            );

            // Só age se já passou o prazo configurado após o vencimento
            if (diasAposVencimento < prazoDias) continue;

            // Cancelar o acordo
            await db
              .update(acordos)
              .set({ status: "cancelado", updatedAt: new Date() })
              .where(eq(acordos.id, acordo.id));

            // Marcar todas as parcelas pendentes como canceladas
            await db
              .update(parcelasAcordo)
              .set({ status: "cancelado" as any })
              .where(
                and(
                  eq(parcelasAcordo.acordoId, acordo.id),
                  eq(parcelasAcordo.status, "pendente")
                )
              );

            cancelados++;
            detalhes.push(
              `Acordo #${acordo.id} do condomínio "${cond.name}" cancelado ` +
              `(1ª parcela vencida há ${diasAposVencimento} dias, prazo: ${prazoDias} dias após vencimento)`
            );
          } catch (err) {
            erros++;
            detalhes.push(`Erro ao processar acordo #${acordo.id}: ${String(err)}`);
          }
        }
      } catch (err) {
        erros++;
        detalhes.push(`Erro ao processar condomínio #${cond.id}: ${String(err)}`);
      }
    }

    console.log(`[cancelamento-auto] Processados ${condominiosAtivos.length} condomínios. Cancelados: ${cancelados}. Erros: ${erros}.`);
    if (detalhes.length > 0) {
      console.log("[cancelamento-auto] Detalhes:", detalhes.join("\n"));
    }

    return res.json({
      ok: true,
      condominiosProcessados: condominiosAtivos.length,
      acordosCancelados: cancelados,
      erros,
      detalhes,
      executadoEm: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cancelamento-auto] Erro geral:", err);
    return res.status(500).json({
      error: String(err),
      timestamp: new Date().toISOString(),
    });
  }
}

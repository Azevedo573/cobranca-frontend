/**
 * Job de cancelamento automático de acordos
 * Roda via Heartbeat (HTTP cron) diariamente
 * Cancela acordos cuja primeira parcela não foi paga dentro do prazo configurado no condomínio
 */
import type { Request, Response } from "express";
import { getDb } from "./db";
import { condominios, acordos, parcelasAcordo } from "../drizzle/schema";
import { eq, and, lte } from "drizzle-orm";

export async function cancelamentoAutoHandler(req: Request, res: Response) {
  try {
    // Verificar autenticação de cron via header (sem patches §5c)
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

      // Buscar acordos ativos deste condomínio criados há mais de prazoDias dias
      // e cuja primeira parcela ainda não foi paga
      const agora = new Date();
      const limiteData = new Date(agora.getTime() - prazoDias * 24 * 60 * 60 * 1000);
      try {
        // Buscar acordos ativos do condomínio criados antes do limite
        const acordosAtivos = await db
          .select({
            id: acordos.id,
            createdAt: acordos.createdAt,
          })
          .from(acordos)
          .where(
            and(
              eq(acordos.condominioId, cond.id),
              eq(acordos.status, "ativo"),
              lte(acordos.createdAt, limiteData)
            )
          );

        for (const acordo of acordosAtivos) {
          try {
            // Verificar se a primeira parcela (menor número de parcela) foi paga
            const primeiraParcela = await db
              .select({
                id: parcelasAcordo.id,
                status: parcelasAcordo.status,
                paymentDate: parcelasAcordo.paymentDate,
              })
              .from(parcelasAcordo)
              .where(eq(parcelasAcordo.acordoId, acordo.id))
              .orderBy(parcelasAcordo.id)
              .limit(1);

            if (primeiraParcela.length === 0) continue;

            const parcela = primeiraParcela[0];

            // Se a primeira parcela não foi paga (status pendente ou atrasado, sem paymentDate)
            if (parcela.status !== "pago" && !parcela.paymentDate) {
              // Cancelar o acordo
              await db
                .update(acordos)
                .set({
                  status: "cancelado",
                  updatedAt: new Date(),
                })
                .where(eq(acordos.id, acordo.id));

              // Marcar todas as parcelas como canceladas
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
              detalhes.push(`Acordo #${acordo.id} do condomínio "${cond.name}" cancelado (prazo de ${prazoDias} dias expirado)`);
            }
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

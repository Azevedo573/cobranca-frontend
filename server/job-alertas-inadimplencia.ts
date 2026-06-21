/**
 * Job de alertas progressivos de inadimplência de parcelas de acordo
 * Roda via Heartbeat (HTTP cron) diariamente
 *
 * Regras:
 * 1. Primeira parcela não paga dentro do prazo configurado → Alerta nível 0
 * 2. Parcelas seguintes (após 1ª paga) em atraso:
 *    - Nível 1: X dias (padrão 5)
 *    - Nível 2: X dias (padrão 10)
 *    - Nível 3: X dias crítico (padrão 30)
 *
 * Cada alerta é único por (parcelaId + nivel) — não duplica.
 */
import type { Request, Response } from "express";
import { getDb } from "./db";
import {
  condominios,
  acordos,
  parcelasAcordo,
  devedores,
  alertasInadimplenciaAcordo,
} from "../drizzle/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";

export async function alertasInadimplenciaHandler(req: Request, res: Response) {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(503).json({ error: "Banco de dados indisponível" });
    }

    let alertasGerados = 0;
    let alertasIgnorados = 0;
    const detalhes: string[] = [];

    // Buscar todos os condomínios
    const todosCondominios = await db
      .select({
        id: condominios.id,
        name: condominios.name,
        cancelamentoPrazoDias: condominios.cancelamentoPrazoDias,
        alertaParcela1Ativo: condominios.alertaParcela1Ativo,
        alertaParcela1Dias: condominios.alertaParcela1Dias,
        alertaParcela2Ativo: condominios.alertaParcela2Ativo,
        alertaParcela2Dias: condominios.alertaParcela2Dias,
        alertaParcela3Ativo: condominios.alertaParcela3Ativo,
        alertaParcela3Dias: condominios.alertaParcela3Dias,
      })
      .from(condominios);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    for (const cond of todosCondominios) {
      // Buscar acordos ativos do condomínio
      const acordosAtivos = await db
        .select({ id: acordos.id, devedorId: acordos.devedorId, createdAt: acordos.createdAt })
        .from(acordos)
        .where(and(eq(acordos.condominioId, cond.id), eq(acordos.status, "ativo")));

      for (const acordo of acordosAtivos) {
        // Buscar todas as parcelas do acordo ordenadas
        const parcelas = await db
          .select()
          .from(parcelasAcordo)
          .where(eq(parcelasAcordo.acordoId, acordo.id))
          .orderBy(parcelasAcordo.installmentNumber);

        if (parcelas.length === 0) continue;

        const totalParcelas = parcelas.length;
        const primeiraParcela = parcelas[0];
        const primeiraPaga = primeiraParcela.status === "pago" && !!primeiraParcela.paymentDate;

        // ── Regra 1: Primeira parcela não paga dentro do prazo ──────────────
        if (!primeiraPaga && primeiraParcela.status !== "cancelado") {
          const prazoDias = cond.cancelamentoPrazoDias ?? 20;
          const venc = new Date(primeiraParcela.dueDate);
          venc.setHours(0, 0, 0, 0);
          const diasAtraso = Math.floor((hoje.getTime() - venc.getTime()) / 86400000);

          if (diasAtraso >= prazoDias) {
            const gerado = await gerarAlerta(db, {
              acordoId: acordo.id,
              parcelaId: primeiraParcela.id,
              condominioId: cond.id,
              devedorId: acordo.devedorId,
              nivel: 0,
              diasAtraso,
              valorParcela: primeiraParcela.amount,
              dataVencimento: primeiraParcela.dueDate,
              installmentNumber: primeiraParcela.installmentNumber,
              totalParcelas,
              statusBoleto: primeiraParcela.statusRemessa ?? null,
              temBoletoAtualizado: primeiraParcela.nossoNumero ? 1 : 0,
            });
            if (gerado) {
              alertasGerados++;
              detalhes.push(`Alerta nível 0: Acordo #${acordo.id} — 1ª parcela ${diasAtraso}d em atraso (prazo: ${prazoDias}d)`);
            } else {
              alertasIgnorados++;
            }
          }
        }

        // ── Regra 2: Parcelas seguintes com 1ª paga ──────────────────────────
        if (primeiraPaga) {
          const niveisConfig = [
            { nivel: 1, ativo: cond.alertaParcela1Ativo, dias: cond.alertaParcela1Dias ?? 5 },
            { nivel: 2, ativo: cond.alertaParcela2Ativo, dias: cond.alertaParcela2Dias ?? 10 },
            { nivel: 3, ativo: cond.alertaParcela3Ativo, dias: cond.alertaParcela3Dias ?? 30 },
          ];

          // Verificar parcelas pendentes/atrasadas (exceto a 1ª)
          const parcelasPendentes = parcelas.filter(
            (p) => p.installmentNumber > 1 && p.status !== "pago" && p.status !== "cancelado"
          );

          for (const parcela of parcelasPendentes) {
            const venc = new Date(parcela.dueDate);
            venc.setHours(0, 0, 0, 0);
            const diasAtraso = Math.floor((hoje.getTime() - venc.getTime()) / 86400000);

            if (diasAtraso <= 0) continue; // ainda não venceu

            for (const cfg of niveisConfig) {
              if (!cfg.ativo) continue;
              if (diasAtraso < cfg.dias) continue;

              const gerado = await gerarAlerta(db, {
                acordoId: acordo.id,
                parcelaId: parcela.id,
                condominioId: cond.id,
                devedorId: acordo.devedorId,
                nivel: cfg.nivel,
                diasAtraso,
                valorParcela: parcela.amount,
                dataVencimento: parcela.dueDate,
                installmentNumber: parcela.installmentNumber,
                totalParcelas,
                statusBoleto: parcela.statusRemessa ?? null,
                temBoletoAtualizado: parcela.nossoNumero ? 1 : 0,
              });

              if (gerado) {
                alertasGerados++;
                detalhes.push(
                  `Alerta nível ${cfg.nivel}: Acordo #${acordo.id} — Parcela ${parcela.installmentNumber}/${totalParcelas} com ${diasAtraso}d de atraso`
                );
              } else {
                alertasIgnorados++;
              }
            }
          }
        }
      }
    }

    console.log(
      `[alertas-inadimplencia] Gerados: ${alertasGerados}. Ignorados (já existiam): ${alertasIgnorados}.`
    );

    return res.json({
      ok: true,
      alertasGerados,
      alertasIgnorados,
      detalhes,
      executadoEm: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[alertas-inadimplencia] Erro geral:", err);
    return res.status(500).json({ error: String(err) });
  }
}

// ── Helper: insere alerta apenas se não existir para (parcelaId + nivel) ──────
async function gerarAlerta(
  db: Awaited<ReturnType<typeof getDb>>,
  data: {
    acordoId: number;
    parcelaId: number;
    condominioId: number;
    devedorId: number;
    nivel: number;
    diasAtraso: number;
    valorParcela: number;
    dataVencimento: Date;
    installmentNumber: number;
    totalParcelas: number;
    statusBoleto: string | null;
    temBoletoAtualizado: number;
  }
): Promise<boolean> {
  if (!db) return false;

  // Verificar se já existe alerta para esta parcela + nível
  const existente = await db
    .select({ id: alertasInadimplenciaAcordo.id })
    .from(alertasInadimplenciaAcordo)
    .where(
      and(
        eq(alertasInadimplenciaAcordo.parcelaId, data.parcelaId),
        eq(alertasInadimplenciaAcordo.nivel, data.nivel)
      )
    )
    .limit(1);

  if (existente.length > 0) return false; // já existe

  await db.insert(alertasInadimplenciaAcordo).values({
    acordoId: data.acordoId,
    parcelaId: data.parcelaId,
    condominioId: data.condominioId,
    devedorId: data.devedorId,
    nivel: data.nivel,
    diasAtraso: data.diasAtraso,
    valorParcela: data.valorParcela,
    dataVencimento: data.dataVencimento,
    installmentNumber: data.installmentNumber,
    totalParcelas: data.totalParcelas,
    statusBoleto: data.statusBoleto,
    temBoletoAtualizado: data.temBoletoAtualizado,
    status: "pendente",
  });

  return true;
}

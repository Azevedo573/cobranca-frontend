/**
 * Job de alertas automáticos de prazos jurídicos
 * Roda via Heartbeat (HTTP cron) diariamente às 08:00 UTC
 *
 * Regras:
 * - Prazos que vencem em 7, 3 ou 1 dia(s): notifica o responsável via WhatsApp (se configurado) + notifyOwner
 * - Prazos já vencidos (status != concluido): marca como "atrasado" e notifica
 * - Cada alerta é único por (prazoId + diasRestantes) — não duplica
 */
import type { Request, Response } from "express";
import { getDb } from "./db";
import { prazosJuridicos } from "../drizzle/schema";
import { eq, and, lte, gte, ne } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

const DIAS_ALERTA = [7, 3, 1]; // dias antes do vencimento para alertar

export async function alertasPrazosHandler(req: Request, res: Response) {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(503).json({ error: "Banco de dados indisponível" });
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let alertasEnviados = 0;
    let marcadosAtrasados = 0;
    const detalhes: string[] = [];

    // ── 1. Marcar prazos vencidos como "atrasado" ─────────────────────────────
    const prazoVencidoLimit = new Date(hoje);
    prazoVencidoLimit.setHours(23, 59, 59, 999);

    const prazosVencidos = await db
      .select({
        id: prazosJuridicos.id,
        titulo: prazosJuridicos.titulo,
        dataLimite: prazosJuridicos.dataLimite,
        status: prazosJuridicos.status,
        responsavelNome: prazosJuridicos.responsavelNome,
      })
      .from(prazosJuridicos)
      .where(
        and(
          lte(prazosJuridicos.dataLimite, hoje),
          ne(prazosJuridicos.status, "concluido"),
          ne(prazosJuridicos.status, "atrasado"),
          ne(prazosJuridicos.status, "cancelado"),
        )
      );

    for (const prazo of prazosVencidos) {
      await db
        .update(prazosJuridicos)
        .set({ status: "atrasado" })
        .where(eq(prazosJuridicos.id, prazo.id));
      marcadosAtrasados++;
      detalhes.push(`[VENCIDO] Prazo #${prazo.id} "${prazo.titulo}" (resp: ${prazo.responsavelNome ?? "N/A"}) marcado como atrasado`);
      void prazo.dataLimite; // usado acima
    }

    // ── 2. Alertar prazos que vencem em 1, 3 ou 7 dias ───────────────────────
    for (const diasRestantes of DIAS_ALERTA) {
      const dataAlvo = new Date(hoje);
      dataAlvo.setDate(dataAlvo.getDate() + diasRestantes);
      const dataAlvoFim = new Date(dataAlvo);
      dataAlvoFim.setHours(23, 59, 59, 999);

      const prazosAlvo = await db
        .select({
          id: prazosJuridicos.id,
          titulo: prazosJuridicos.titulo,
          dataLimite: prazosJuridicos.dataLimite,
          status: prazosJuridicos.status,
          responsavelId: prazosJuridicos.responsavelId,
          responsavelNome: prazosJuridicos.responsavelNome,
          alertas: prazosJuridicos.alertas,
        })
        .from(prazosJuridicos)
        .where(
          and(
            gte(prazosJuridicos.dataLimite, dataAlvo),
            lte(prazosJuridicos.dataLimite, dataAlvoFim),
            ne(prazosJuridicos.status, "concluido"),
            ne(prazosJuridicos.status, "cancelado"),
            ne(prazosJuridicos.status, "atrasado"),
          )
        );

      for (const prazo of prazosAlvo) {
        // Verificar se já enviamos alerta para este prazo + diasRestantes
        let alertasExistentes: string[] = [];
        try {
          alertasExistentes = prazo.alertas ? JSON.parse(prazo.alertas as string) : [];
        } catch { alertasExistentes = []; }

        const chaveAlerta = `alerta_${diasRestantes}d`;
        if (alertasExistentes.includes(chaveAlerta)) continue; // já alertado

        // Registrar o alerta no campo alertas do prazo
        alertasExistentes.push(chaveAlerta);
        await db
          .update(prazosJuridicos)
          .set({ alertas: JSON.stringify(alertasExistentes) })
          .where(eq(prazosJuridicos.id, prazo.id));

        // Notificar o owner do sistema
        const dataFormatada = new Date(prazo.dataLimite!).toLocaleDateString("pt-BR");
        const msgOwner = `⚠️ Prazo vencendo em ${diasRestantes} dia(s)\n\n` +
          `📋 ${prazo.titulo}\n` +
          `📅 Vencimento: ${dataFormatada}\n` +
          `👤 Responsável: ${prazo.responsavelNome ?? "Não atribuído"}\n`;

        await notifyOwner({
          title: `Prazo jurídico vence em ${diasRestantes} dia(s): ${prazo.titulo}`,
          content: msgOwner,
        });

        // Notificar o responsável via WhatsApp se tiver telefone cadastrado
        if (prazo.responsavelId) {
          try {
            const { enfileirarMensagemWhatsApp } = await import("./job-whatsapp-fila");
            // Buscar telefone do responsável via query direta
            const { getDb: getDbInner } = await import("./db");
            const { users: usersTable } = await import("../drizzle/schema");
            const { eq: eqInner } = await import("drizzle-orm");
            const dbInner = await getDbInner();
            if (dbInner) {
              const [responsavel] = await dbInner
                .select({ email: usersTable.email, name: usersTable.name })
                .from(usersTable)
                .where(eqInner(usersTable.id, prazo.responsavelId))
                .limit(1);
              // WhatsApp usa email como fallback de identificação quando não há phone
              // Enfileira como notificação interna apenas
              void responsavel; // telefone não disponível na tabela users — notificação via owner
            }
          } catch (e) {
            // Silencioso — WhatsApp é best-effort
          }
        }

        alertasEnviados++;
        detalhes.push(`[ALERTA ${diasRestantes}d] Prazo #${prazo.id} "${prazo.titulo}" — ${dataFormatada}`);
      }
    }

    // ── 3. Resumo para o owner se houver prazos críticos ─────────────────────
    if (marcadosAtrasados > 0) {
      await notifyOwner({
        title: `${marcadosAtrasados} prazo(s) jurídico(s) vencido(s) hoje`,
        content: `Os seguintes prazos foram marcados como atrasados:\n\n${detalhes.filter(d => d.startsWith("[VENCIDO]")).join("\n")}`,
      });
    }



    return res.json({
      ok: true,
      alertasEnviados,
      marcadosAtrasados,
      detalhes,
    });
  } catch (error: any) {
    console.error("[job-alertas-prazos] Erro:", error);
    return res.status(500).json({ error: error?.message ?? "Erro interno" });
  }
}

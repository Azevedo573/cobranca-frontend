/**
 * Job PJe — Busca diária de publicações judiciais via API PJe
 * Roda como Heartbeat job às 08:00 (Brasília)
 */

import type { Express } from "express";
import { buscarTodasPublicacoesPJe } from "./pje-api";

export function registrarJobPJe(app: Express) {
  /**
   * POST /api/scheduled/pje
   * Chamado pelo Heartbeat job diariamente às 08:00 (Brasília)
   */
  app.post("/api/scheduled/pje", async (req, res) => {
    try {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database connection failed" });
      }

      const { doerjMonitoramentos, pjePublicacoes } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      // Buscar todos os termos de monitoramento ativos
      const monitoramentos = await db
        .select()
        .from(doerjMonitoramentos)
        .where(eq(doerjMonitoramentos.ativo, 1));

      if (monitoramentos.length === 0) {
        return res.json({ success: true, message: "Nenhum monitoramento ativo", total: 0 });
      }

      // Data de ontem e hoje para busca (publicações do dia anterior podem aparecer hoje)
      const hoje = new Date();
      const ontem = new Date(hoje);
      ontem.setDate(ontem.getDate() - 1);
      const dataInicio = ontem.toISOString().split("T")[0];
      const dataFim = hoje.toISOString().split("T")[0];

      let totalSalvas = 0;
      let totalDuplicadas = 0;
      const erros: string[] = [];

      for (const monitoramento of monitoramentos) {
        try {
          const publicacoes = await buscarTodasPublicacoesPJe({
            nomeAdvogado: monitoramento.nome,
            siglaTribunal: "TJRJ",
            dataInicio,
            dataFim,
          });

          for (const pub of publicacoes) {
            try {
              // Verificar se já existe (evitar duplicatas pelo pje_id)
              const existente = await db
                .select({ id: pjePublicacoes.id })
                .from(pjePublicacoes)
                .where(eq(pjePublicacoes.pjeId, pub.id))
                .limit(1);

              if (existente.length > 0) {
                totalDuplicadas++;
                continue;
              }

              // Montar JSON de destinatários
              const destinatariosJson = JSON.stringify({
                destinatarios: pub.destinatarios || [],
                advogados: pub.destinatarioadvogados?.map(d => d.advogado) || [],
              });

              await db.insert(pjePublicacoes).values({
                pjeId: pub.id,
                dataDisponibilizacao: pub.data_disponibilizacao,
                siglaTribunal: pub.siglaTribunal,
                tipoComunicacao: pub.tipoComunicacao || null,
                nomeOrgao: pub.nomeOrgao || null,
                numeroProcesso: pub.numero_processo || null,
                numeroProcessoMascara: pub.numeroprocessocommascara || null,
                tipoDocumento: pub.tipoDocumento || null,
                nomeClasse: pub.nomeClasse || null,
                texto: pub.texto || null,
                link: pub.link || null,
                meio: pub.meio || null,
                meioCompleto: pub.meiocompleto || null,
                destinatariosJson,
                monitoramentoId: monitoramento.id,
                lida: 0,
              });

              totalSalvas++;
            } catch (insertErr: unknown) {
              // Ignorar erro de duplicata (unique constraint)
              const msg = insertErr instanceof Error ? insertErr.message : String(insertErr);
              if (!msg.includes("Duplicate entry")) {
                erros.push(`Erro ao salvar publicação ${pub.id}: ${msg}`);
              } else {
                totalDuplicadas++;
              }
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          erros.push(`Erro ao buscar publicações para "${monitoramento.nome}": ${msg}`);
        }
      }

      return res.json({
        success: true,
        totalSalvas,
        totalDuplicadas,
        erros,
        message: `${totalSalvas} publicação(ões) salva(s), ${totalDuplicadas} duplicada(s)`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[JobPJe] Erro:", msg);
      return res.status(500).json({ error: msg });
    }
  });

  /**
   * GET /api/scheduled/pje/termos
   * Retorna os termos de monitoramento ativos (usado pelo card na página Agendamentos)
   */
  app.get("/api/scheduled/pje/termos", async (_req, res) => {
    try {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return res.status(500).json({ error: "DB error" });

      const { doerjMonitoramentos } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const termos = await db
        .select()
        .from(doerjMonitoramentos)
        .where(eq(doerjMonitoramentos.ativo, 1));

      return res.json({ termos });
    } catch (err: unknown) {
      return res.status(500).json({ error: String(err) });
    }
  });
}

/**
 * Handler do job de monitoramento do DOERJ (Diário Oficial do Estado do RJ)
 * Recebe publicações encontradas pelo AGENT cron e as persiste no banco.
 *
 * Endpoint: POST /api/scheduled/doerj
 * Autenticação: isCron === true (Heartbeat SDK)
 */
import { Request, Response } from "express";
import { getDb } from "./db";
import { doerjPublicacoes } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export interface DoerjPublicacaoInput {
  materiaId: string;
  dataPublicacao: string; // "YYYY-MM-DD"
  jornal?: string;
  tipo?: string;
  trecho?: string;
  url?: string;
  termoBusca?: string;
}

export async function doerjHandler(req: Request, res: Response) {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    // Aceita tanto chamadas do AGENT cron (array de publicações) quanto chamadas de teste
    const body = req.body as {
      publicacoes?: DoerjPublicacaoInput[];
      // Também aceita objeto único para facilitar testes
      materiaId?: string;
    };

    let publicacoes: DoerjPublicacaoInput[] = [];

    if (Array.isArray(body.publicacoes)) {
      publicacoes = body.publicacoes;
    } else if (body.materiaId) {
      // Objeto único
      publicacoes = [body as DoerjPublicacaoInput];
    }

    if (publicacoes.length === 0) {
      return res.json({ ok: true, inserted: 0, message: "Nenhuma publicação recebida" });
    }

    let inserted = 0;
    let skipped = 0;

    for (const pub of publicacoes) {
      if (!pub.materiaId || !pub.dataPublicacao) {
        skipped++;
        continue;
      }

      // Verificar se já existe (idempotente)
      const existing = await db
        .select({ id: doerjPublicacoes.id })
        .from(doerjPublicacoes)
        .where(eq(doerjPublicacoes.materiaId, pub.materiaId))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await db.insert(doerjPublicacoes).values({
        materiaId: pub.materiaId,
        dataPublicacao: pub.dataPublicacao,
        jornal: pub.jornal ?? null,
        tipo: pub.tipo ?? null,
        trecho: pub.trecho ?? null,
        url: pub.url ?? null,
        termoBusca: pub.termoBusca ?? "Higor",
        lida: 0,
      });

      inserted++;
    }

    console.log(`[DOERJ] Recebidas ${publicacoes.length} publicações: ${inserted} inseridas, ${skipped} ignoradas`);
    return res.json({ ok: true, inserted, skipped });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[DOERJ] Erro ao processar publicações:", error);
    return res.status(500).json({
      error,
      timestamp: new Date().toISOString(),
      context: { url: req.url },
    });
  }
}

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { movimentacoesProcesso, processosJudiciais } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ─── Constantes ───────────────────────────────────────────────────────────────

const TJRJ_BASE = "https://www3.tjrj.jus.br/consultaprocessual/api";

const HEADERS = {
  "Accept": "application/json",
  "Content-Type": "application/json",
  "Origin": "https://www3.tjrj.jus.br",
  "Referer": "https://www3.tjrj.jus.br/consultaprocessual/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function tjrjPost(path: string, body: object): Promise<any> {
  const url = `${TJRJ_BASE}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `TJRJ retornou resposta inválida (HTTP ${res.status}): ${text.slice(0, 200)}`,
    });
  }

  // O TJRJ retorna 412 com array de erros quando o número é inválido
  if (!res.ok || (Array.isArray(data) && typeof data[0] === "string" && data[0].toLowerCase().includes("inválido"))) {
    const msg = Array.isArray(data) ? data[0] : JSON.stringify(data);
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `TJRJ: ${msg}`,
    });
  }

  return data;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const tjrjRouter = router({

  /**
   * Etapa 1: Resolve o número CNJ para o número interno do TJRJ.
   * Retorna a lista de processos encontrados (pode haver mais de um).
   */
  resolverNumeracao: protectedProcedure
    .input(z.object({
      numeroCNJ: z.string().min(5, "Informe o número do processo"),
      tipoProcesso: z.string().default("1"),
    }))
    .query(async ({ input }) => {
      const data = await tjrjPost("processos/por-numeracao-unica", {
        tipoProcesso: input.tipoProcesso,
        codigoProcesso: input.numeroCNJ.trim(),
      });

      // Pode retornar array de objetos ou objeto único
      const lista = Array.isArray(data) ? data : [data];
      return lista as Array<{
        numProcesso: string;
        tipoProcesso: string | number;
        codProc?: string;
        codCnj?: string;
        [key: string]: any;
      }>;
    }),

  /**
   * Etapa 2: Busca os movimentos do processo usando o numProcesso interno.
   * Executa as duas etapas em sequência.
   */
  consultarMovimentos: protectedProcedure
    .input(z.object({
      numeroCNJ: z.string().min(5, "Informe o número do processo"),
      tipoProcesso: z.string().default("1"),
    }))
    .query(async ({ input }) => {
      // ── Etapa 1: resolver numeração ──────────────────────────────────────
      let resolucao: any[];
      try {
        const raw = await tjrjPost("processos/por-numeracao-unica", {
          tipoProcesso: input.tipoProcesso,
          codigoProcesso: input.numeroCNJ.trim(),
        });
        resolucao = Array.isArray(raw) ? raw : [raw];
      } catch (err: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err?.message ?? "Erro ao resolver numeração no TJRJ",
        });
      }

      if (!resolucao.length || !resolucao[0]?.numProcesso) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Processo não encontrado no TJRJ para o número informado",
        });
      }

      const primeiroProcesso = resolucao[0];
      const numProcessoInterno = primeiroProcesso.numProcesso as string;
      const tipoProcessoResolvido = String(primeiroProcesso.tipoProcesso ?? input.tipoProcesso);

      // ── Etapa 2: buscar movimentos ───────────────────────────────────────
      let movimentos: any;
      try {
        movimentos = await tjrjPost("processos/por-numero/movimentos", {
          tipoProcesso: tipoProcessoResolvido,
          codigoProcesso: numProcessoInterno,
          indProcVolumoso: "N",
          ultimaOrdemExibida: null,
        });
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err?.message ?? "Erro ao buscar movimentos no TJRJ",
        });
      }

      return {
        resolucao: primeiroProcesso,
        numProcessoInterno,
        movimentos,
      };
    }),

  /**
   * Debug: retorna a resposta bruta da etapa 2 para inspecionar a estrutura real.
   */
  debugMovimentos: protectedProcedure
    .input(z.object({
      numeroCNJ: z.string().min(5),
      tipoProcesso: z.string().default("1"),
    }))
    .query(async ({ input }) => {
      const raw1 = await tjrjPost("processos/por-numeracao-unica", {
        tipoProcesso: input.tipoProcesso,
        codigoProcesso: input.numeroCNJ.trim(),
      });
      const lista = Array.isArray(raw1) ? raw1 : [raw1];
      if (!lista.length || !lista[0]?.numProcesso) {
        return { etapa1: raw1, etapa2: null, chaves_etapa2: [] };
      }
      const numProcesso = lista[0].numProcesso as string;
      const tipoResolvido = String(lista[0].tipoProcesso ?? input.tipoProcesso);
      const raw2 = await tjrjPost("processos/por-numero/movimentos", {
        tipoProcesso: tipoResolvido,
        codigoProcesso: numProcesso,
        indProcVolumoso: "N",
        ultimaOrdemExibida: null,
      });
      // Inspecionar chaves do objeto retornado
      const chaves_etapa2 = typeof raw2 === "object" && raw2 !== null ? Object.keys(raw2) : [];
      // Pegar primeiro item de cada array para ver a estrutura
      const amostras: Record<string, any> = {};
      for (const k of chaves_etapa2) {
        if (Array.isArray(raw2[k]) && raw2[k].length > 0) {
          amostras[k] = raw2[k][0]; // primeiro item
        }
      }
      return {
        etapa1_primeiro: lista[0],
        numProcessoInterno: numProcesso,
        etapa2_chaves: chaves_etapa2,
        etapa2_amostras: amostras,
        etapa2_raw_preview: JSON.stringify(raw2).slice(0, 3000),
      };
    }),

  /**
   * Sincroniza as movimentações do TJRJ no banco de dados do processo.
   * Busca as movimentações via API TJRJ e salva no banco, evitando duplicatas.
   * Retorna o número de movimentações novas inseridas.
   */
  sincronizarMovimentos: protectedProcedure
    .input(z.object({
      processoId: z.number().int().positive(),
      numeroCNJ: z.string().min(5, "Informe o número do processo"),
      tipoProcesso: z.string().default("1"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

      // ── Etapa 1: resolver numeração ──────────────────────────────────────
      const raw1 = await tjrjPost("processos/por-numeracao-unica", {
        tipoProcesso: input.tipoProcesso,
        codigoProcesso: input.numeroCNJ.trim(),
      });
      const lista = Array.isArray(raw1) ? raw1 : [raw1];
      if (!lista.length || !lista[0]?.numProcesso) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado no TJRJ" });
      }
      const numProcessoInterno = lista[0].numProcesso as string;
      const tipoResolvido = String(lista[0].tipoProcesso ?? input.tipoProcesso);

      // ── Etapa 2: buscar movimentos ───────────────────────────────────────
      const raw2 = await tjrjPost("processos/por-numero/movimentos", {
        tipoProcesso: tipoResolvido,
        codigoProcesso: numProcessoInterno,
        indProcVolumoso: "N",
        ultimaOrdemExibida: null,
      });

      const movimentosTJRJ: any[] = raw2?.movimentosProc ?? [];
      if (!movimentosTJRJ.length) {
        return { inseridas: 0, total: 0, numProcessoInterno };
      }

      // ── Buscar movimentações TJRJ já salvas para este processo ─────────
      const existentes = await db.select({ tjrjOrdem: movimentacoesProcesso.tjrjOrdem })
        .from(movimentacoesProcesso)
        .where(and(
          eq(movimentacoesProcesso.processoId, input.processoId),
          eq(movimentacoesProcesso.origem, "tjrj"),
        ));
      const ordensExistentes = new Set(existentes.map(e => e.tjrjOrdem).filter(Boolean));

      // ── Mapear tipo TJRJ para enum interno ───────────────────────────────
      function mapearTipo(descr: string): "distribuicao" | "citacao" | "contestacao" | "audiencia" | "sentenca" | "recurso" | "despacho" | "decisao" | "peticao" | "transito_julgado" | "execucao" | "outro" {
        const d = (descr ?? "").toLowerCase();
        if (d.includes("distribui")) return "distribuicao";
        if (d.includes("citação") || d.includes("citacao")) return "citacao";
        if (d.includes("contesta")) return "contestacao";
        if (d.includes("audiência") || d.includes("audiencia")) return "audiencia";
        if (d.includes("sentença") || d.includes("sentenca")) return "sentenca";
        if (d.includes("recurso") || d.includes("apelação") || d.includes("apelacao")) return "recurso";
        if (d.includes("despacho")) return "despacho";
        if (d.includes("decisão") || d.includes("decisao")) return "decisao";
        if (d.includes("petição") || d.includes("peticao")) return "peticao";
        if (d.includes("trânsito") || d.includes("transito")) return "transito_julgado";
        if (d.includes("execução") || d.includes("execucao") || d.includes("cumprimento")) return "execucao";
        return "outro";
      }

      // ── Inserir movimentações novas ─────────────────────────────────────
      let inseridas = 0;
      for (let i = 0; i < movimentosTJRJ.length; i++) {
        const mov = movimentosTJRJ[i];
        const ordem = mov.ordemExibicao ?? i;
        if (ordensExistentes.has(ordem)) continue; // já existe

        // Montar descrição: nome do movimento + complementos
        const descricao = mov.descrMov ?? "Movimentação";
        const complementos = mov.movimentosExibicao?.map((c: any) =>
          [c.tipoMovimento, c.descricao].filter(Boolean).join(": ")
        ).filter(Boolean).join(" | ") ?? "";
        const descricaoCompleta = complementos ? `${descricao}\n\n${complementos}` : descricao;

        // Parsear data: formato "DD/MM/AAAA"
        let dataMovimento: Date;
        try {
          const [d, m, a] = (mov.dtMovimento ?? "").split("/");
          dataMovimento = new Date(Number(a), Number(m) - 1, Number(d));
          if (isNaN(dataMovimento.getTime())) dataMovimento = new Date();
        } catch {
          dataMovimento = new Date();
        }

        await db.insert(movimentacoesProcesso).values({
          processoId: input.processoId,
          data: dataMovimento,
          descricao: descricaoCompleta,
          tipo: mapearTipo(descricao),
          origem: "tjrj",
          tjrjOrdem: ordem,
          usuarioId: ctx.user?.id ?? undefined,
          usuarioNome: "TJRJ (sincronização automática)",
        });
        inseridas++;
      }

      // ── Atualizar dataUltimaMovimentacao no processo ──────────────────────
      if (inseridas > 0) {
        const ultimaMov = movimentosTJRJ[0]; // já vem ordenado do mais recente
        try {
          const [d, m, a] = (ultimaMov.dtMovimento ?? "").split("/");
          const dataUltima = new Date(Number(a), Number(m) - 1, Number(d));
          if (!isNaN(dataUltima.getTime())) {
            await db.update(processosJudiciais)
              .set({ dataUltimaMovimentacao: dataUltima })
              .where(eq(processosJudiciais.id, input.processoId));
          }
        } catch { /* ignora erro de data */ }
      }

      return {
        inseridas,
        total: movimentosTJRJ.length,
        numProcessoInterno,
      };
    }),

  /**
   * Busca apenas os dados básicos do processo (sem movimentos) — mais rápido.
   */
  dadosBasicos: protectedProcedure
    .input(z.object({
      numeroCNJ: z.string().min(5),
      tipoProcesso: z.string().default("1"),
    }))
    .query(async ({ input }) => {
      const raw = await tjrjPost("processos/por-numeracao-unica", {
        tipoProcesso: input.tipoProcesso,
        codigoProcesso: input.numeroCNJ.trim(),
      });
      const lista = Array.isArray(raw) ? raw : [raw];
      if (!lista.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado no TJRJ" });
      }
      return lista[0];
    }),
});

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

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

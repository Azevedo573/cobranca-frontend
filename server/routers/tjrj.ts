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
      const existentes = await db.select({ id: movimentacoesProcesso.id, tjrjOrdem: movimentacoesProcesso.tjrjOrdem, complementosJson: movimentacoesProcesso.complementosJson })
        .from(movimentacoesProcesso)
        .where(and(
          eq(movimentacoesProcesso.processoId, input.processoId),
          eq(movimentacoesProcesso.origem, "tjrj"),
        ));
      const ordensExistentes = new Set(existentes.map(e => e.tjrjOrdem).filter(Boolean));
      // Mapa de ordem → id para movimentações que precisam de update (sem complementosJson)
      const ordemParaAtualizar = new Map<number, number>(
        existentes
          .filter(e => e.tjrjOrdem !== null && !e.complementosJson)
          .map(e => [e.tjrjOrdem as number, e.id])
      );

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
      let atualizadas = 0;
      for (let i = 0; i < movimentosTJRJ.length; i++) {
        const mov = movimentosTJRJ[i];
        // O TJRJ retorna o campo "ordem" (ex: 64, 63, 62...) — não "ordemExibicao"
        const ordem = mov.ordem ?? mov.ordemExibicao ?? i;

        // Se já existe mas não tem complementosJson, atualizar com o JSON completo + descricao correta
        if (ordemParaAtualizar.has(ordem)) {
          const descrMov = mov.descrMov ?? "Movimentação";
          const textoMov = mov.descricao?.trim() || "";
          const descricaoAtualizada = textoMov ? `${descrMov}\n\n${textoMov}` : descrMov;
          let dataMov: Date;
          try {
            const [dd, mm, aa] = (mov.dtMovimento ?? "").split("/");
            dataMov = new Date(Number(aa), Number(mm) - 1, Number(dd));
            if (isNaN(dataMov.getTime())) dataMov = new Date();
          } catch { dataMov = new Date(); }
          await db.update(movimentacoesProcesso)
            .set({
              complementosJson: JSON.stringify(mov),
              descricao: descricaoAtualizada,
              tipo: mapearTipo(descrMov),
              data: dataMov,
            })
            .where(eq(movimentacoesProcesso.id, ordemParaAtualizar.get(ordem)!));
          atualizadas++;
          continue;
        }

        if (ordensExistentes.has(ordem)) continue; // já existe com JSON completo

        // Montar descrição: nome do movimento + complementos
        const descricao = mov.descrMov ?? "Movimentação";
        // Usar o texto completo da movimentação como descrição principal
        const textoCompleto = mov.descricao?.trim() || "";
        const descricaoCompleta = textoCompleto ? `${descricao}\n\n${textoCompleto}` : descricao;

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
          // Salvar o JSON completo da movimentação para exibição detalhada
          complementosJson: JSON.stringify(mov),
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
        atualizadas,
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

  /**
   * Sincroniza as movimentações do TJRJ para TODOS os processos ativos do TJRJ.
   * Processa em sequência com delay entre requisições para não sobrecarregar a API.
   */
  sincronizarTodos: protectedProcedure
    .input(z.object({
      delayMs: z.number().int().min(500).max(5000).default(1500),
    }).optional())
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

      const delay = input?.delayMs ?? 1500;

      // Buscar todos os processos ativos
      const todosProcessos = await db.select({
        id: processosJudiciais.id,
        numeroCNJ: processosJudiciais.numeroCNJ,
        tribunal: processosJudiciais.tribunal,
        condominioNome: processosJudiciais.condominioNome,
      }).from(processosJudiciais).where(eq(processosJudiciais.status, "ativo"));

      // Filtrar apenas processos do TJRJ
      const processosTJRJ = todosProcessos.filter(p =>
        p.tribunal?.toUpperCase().includes("TJRJ") ||
        p.tribunal?.toUpperCase().includes("RJ")
      );

      if (!processosTJRJ.length) {
        return { total: 0, sincronizados: 0, erros: 0, novasMovimentacoes: 0, resultados: [] };
      }

      const resultados: Array<{
        processoId: number; numeroCNJ: string; condominioNome: string | null;
        status: "ok" | "erro" | "sem_novidades"; inseridas: number; erro?: string;
      }> = [];
      let sincronizados = 0, erros = 0;

      function mapTipoLote(descr: string): "distribuicao" | "citacao" | "contestacao" | "audiencia" | "sentenca" | "recurso" | "despacho" | "decisao" | "peticao" | "transito_julgado" | "execucao" | "outro" {
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

      for (const processo of processosTJRJ) {
        try {
          const raw1 = await tjrjPost("processos/por-numeracao-unica", { tipoProcesso: "1", codigoProcesso: processo.numeroCNJ.trim() });
          const lista = Array.isArray(raw1) ? raw1 : [raw1];
          if (!lista.length || !lista[0]?.numProcesso) {
            resultados.push({ processoId: processo.id, numeroCNJ: processo.numeroCNJ, condominioNome: processo.condominioNome ?? null, status: "erro", inseridas: 0, erro: "Não encontrado no TJRJ" });
            erros++;
            await new Promise(r => setTimeout(r, delay));
            continue;
          }

          const numProcessoInterno = lista[0].numProcesso as string;
          const tipoResolvido = String(lista[0].tipoProcesso ?? "1");

          const raw2 = await tjrjPost("processos/por-numero/movimentos", {
            tipoProcesso: tipoResolvido, codigoProcesso: numProcessoInterno,
            indProcVolumoso: "N", ultimaOrdemExibida: null,
          });

          const movimentosTJRJ: any[] = raw2?.movimentosProc ?? [];
          if (!movimentosTJRJ.length) {
            resultados.push({ processoId: processo.id, numeroCNJ: processo.numeroCNJ, condominioNome: processo.condominioNome ?? null, status: "sem_novidades", inseridas: 0 });
            sincronizados++;
            await new Promise(r => setTimeout(r, delay));
            continue;
          }

          const existentes = await db.select({ tjrjOrdem: movimentacoesProcesso.tjrjOrdem })
            .from(movimentacoesProcesso)
            .where(and(eq(movimentacoesProcesso.processoId, processo.id), eq(movimentacoesProcesso.origem, "tjrj")));
          const ordensExistentes = new Set(existentes.map(e => e.tjrjOrdem).filter(Boolean));

          let inseridas = 0;
          for (const mov of movimentosTJRJ) {
            const ordem = mov.ordemMovimento ?? mov.ordem ?? null;
            if (ordem !== null && ordensExistentes.has(ordem)) continue;
            const descricao = mov.descrMov ?? mov.descricao ?? "Movimentação TJRJ";
            const textoCompleto = (typeof mov.descricao === "string" ? mov.descricao.trim() : "");
            const descricaoCompleta = textoCompleto ? `${descricao}\n\n${textoCompleto}` : descricao;
            let dataMovimento: Date;
            try {
              const dtStr = mov.dtMovimento ?? mov.data;
              if (dtStr) {
                const parts = dtStr.split("/");
                dataMovimento = parts.length === 3
                  ? new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
                  : new Date(dtStr);
              } else { dataMovimento = new Date(); }
            } catch { dataMovimento = new Date(); }
            await db.insert(movimentacoesProcesso).values({
              processoId: processo.id, data: dataMovimento, descricao: descricaoCompleta,
              tipo: mapTipoLote(descricao), origem: "tjrj", tjrjOrdem: ordem ?? null,
              complementosJson: JSON.stringify(mov),
              usuarioId: ctx.user.id, usuarioNome: ctx.user.name ?? ctx.user.email,
            });
            inseridas++;
          }

          if (inseridas > 0 && movimentosTJRJ[0]?.dtMovimento) {
            try {
              const parts = movimentosTJRJ[0].dtMovimento.split("/");
              if (parts.length === 3) {
                const dataUltima = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                if (!isNaN(dataUltima.getTime())) {
                  await db.update(processosJudiciais).set({ dataUltimaMovimentacao: dataUltima }).where(eq(processosJudiciais.id, processo.id));
                }
              }
            } catch { /* ignora */ }
          }

          resultados.push({ processoId: processo.id, numeroCNJ: processo.numeroCNJ, condominioNome: processo.condominioNome ?? null, status: "ok", inseridas });
          sincronizados++;
        } catch (err: any) {
          resultados.push({ processoId: processo.id, numeroCNJ: processo.numeroCNJ, condominioNome: processo.condominioNome ?? null, status: "erro", inseridas: 0, erro: err?.message ?? "Erro desconhecido" });
          erros++;
        }
        await new Promise(r => setTimeout(r, delay));
      }

      return {
        total: processosTJRJ.length, sincronizados, erros,
        novasMovimentacoes: resultados.reduce((acc, r) => acc + r.inseridas, 0),
        resultados,
      };
    }),

});

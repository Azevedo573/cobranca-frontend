import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getProcessos,
  getProcessoById,
  createProcesso,
  updateProcesso,
  deleteProcesso,
  getResumoProcessos,
  getPartes,
  addParte,
  removeParte,
  getMovimentacoes,
  addMovimentacao,
  deleteMovimentacao,
  getFinanceiro,
  addFinanceiro,
  updateFinanceiro,
  deleteFinanceiro,
  getResumoFinanceiro,
  updateParteAdvogados,
} from "../db-processos";
import {
  getPrazos,
  getPrazoById,
  createPrazo,
  updatePrazo,
  concluirPrazo,
  deletePrazo,
  getResumoPrazos,
  calcularUrgencia,
} from "../db-prazos";
import {
  buscarProcessoPorNumero,
  detectarTribunalPorCNJ,
  listarTribunais,
  buscarProcessosPorNomeAdvogado,
  buscarProcessosPorNomeAdvogadoMultiTribunal,
  TRIBUNAIS_ALIASES,
} from "../datajud";

// ─── Funções auxiliares ─────────────────────────────────────────────────────────

/** Mapeia código CNJ de movimento para o tipo interno */
function resolverTipoMovimentacao(codigo: number, nome: string): "distribuicao" | "citacao" | "contestacao" | "audiencia" | "sentenca" | "recurso" | "despacho" | "decisao" | "peticao" | "transito_julgado" | "execucao" | "outro" {
  const n = nome.toLowerCase();
  if (n.includes("distribuição") || n.includes("distribuicao") || codigo === 26) return "distribuicao";
  if (n.includes("citação") || n.includes("citacao") || codigo === 7) return "citacao";
  if (n.includes("contestação") || n.includes("contestacao")) return "contestacao";
  if (n.includes("audiência") || n.includes("audiencia")) return "audiencia";
  if (n.includes("sentença") || n.includes("sentenca")) return "sentenca";
  if (n.includes("recurso") || n.includes("apelação") || n.includes("apelacao") || n.includes("agravo")) return "recurso";
  if (n.includes("despacho")) return "despacho";
  if (n.includes("decisão") || n.includes("decisao")) return "decisao";
  if (n.includes("petição") || n.includes("peticao")) return "peticao";
  if (n.includes("trânsito") || n.includes("transito em julgado")) return "transito_julgado";
  if (n.includes("execução") || n.includes("execucao") || n.includes("cumprimento de sentença")) return "execucao";
  return "outro";
}

/** Normaliza o tipo de parte do DataJud para o enum interno */
function normalizarTipoParte(tipo?: string): "autor" | "reu" | "terceiro" | "outro" {
  if (!tipo) return "outro";
  const t = tipo.toLowerCase();
  if (t.includes("ativo") || t.includes("autor") || t.includes("requerente") || t.includes("exequente") || t.includes("reclamante") || t.includes("apelante")) return "autor";
  if (t.includes("passivo") || t.includes("réu") || t.includes("reu") || t.includes("requerido") || t.includes("executado") || t.includes("reclamado") || t.includes("apelado")) return "reu";
  if (t.includes("terceiro") || t.includes("interveniente") || t.includes("amicus")) return "terceiro";
  return "outro";
}

// ─── Processos ────────────────────────────────────────────────────────────────

export const processosRouter = router({
  // Listar processos com filtros
  listar: protectedProcedure
    .input(z.object({
      condominioId: z.number().int().positive().optional(),
      status: z.enum(["ativo", "suspenso", "arquivado", "encerrado"]).optional(),
      tipo: z.enum(["civel", "trabalhista", "previdenciario", "criminal", "tributario", "administrativo", "outro"]).optional(),
      faseProcessual: z.string().optional(),
      advogadoId: z.number().int().positive().optional(),
      busca: z.string().optional(),
      demandaId: z.number().int().positive().optional(),
    }).optional())
    .query(async ({ input }) => {
      return getProcessos(input ?? {});
    }),

  // Buscar processo por ID com partes, movimentações e financeiro
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const processo = await getProcessoById(input.id);
      if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });
      const [partes, movimentacoes, financeiro, resumoFinanceiro] = await Promise.all([
        getPartes(input.id),
        getMovimentacoes(input.id),
        getFinanceiro(input.id),
        getResumoFinanceiro(input.id),
      ]);
      return { ...processo, partes, movimentacoes, financeiro, resumoFinanceiro };
    }),

  // Resumo de processos (para dashboard)
  resumo: protectedProcedure
    .input(z.object({ condominioId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => {
      return getResumoProcessos(input?.condominioId);
    }),

  // Criar processo
  create: protectedProcedure
    .input(z.object({
      numeroCNJ: z.string().min(1).max(30),
      tribunal: z.string().min(1).max(20),
      tribunalAlias: z.string().optional(),
      comarca: z.string().optional(),
      vara: z.string().optional(),
      classe: z.string().optional(),
      assunto: z.string().optional(),
      tipo: z.enum(["civel", "trabalhista", "previdenciario", "criminal", "tributario", "administrativo", "outro"]).default("civel"),
      faseProcessual: z.enum(["distribuicao", "citacao", "contestacao", "instrucao", "audiencia", "sentenca", "recurso", "transito_julgado", "execucao", "arquivado", "outro"]).default("distribuicao"),
      status: z.enum(["ativo", "suspenso", "arquivado", "encerrado"]).default("ativo"),
      dataAjuizamento: z.date().optional(),
      condominioId: z.number().int().positive().optional(),
      condominioNome: z.string().optional(),
      demandaId: z.number().int().positive().optional(),
      advogadoId: z.number().int().positive().optional(),
      advogadoNome: z.string().optional(),
      valorCausa: z.number().int().min(0).optional(),
      valorCondenacao: z.number().int().min(0).optional(),
      observacoes: z.string().optional(),
      datajudId: z.string().optional(),
      datajudSincronizadoEm: z.date().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return createProcesso({ ...input, criadoPorId: ctx.user.id });
    }),

  // Atualizar processo
  update: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      numeroCNJ: z.string().min(1).max(30).optional(),
      tribunal: z.string().min(1).max(20).optional(),
      tribunalAlias: z.string().optional(),
      comarca: z.string().optional(),
      vara: z.string().optional(),
      classe: z.string().optional(),
      assunto: z.string().optional(),
      tipo: z.enum(["civel", "trabalhista", "previdenciario", "criminal", "tributario", "administrativo", "outro"]).optional(),
      faseProcessual: z.enum(["distribuicao", "citacao", "contestacao", "instrucao", "audiencia", "sentenca", "recurso", "transito_julgado", "execucao", "arquivado", "outro"]).optional(),
      status: z.enum(["ativo", "suspenso", "arquivado", "encerrado"]).optional(),
      dataAjuizamento: z.date().optional(),
      condominioId: z.number().int().positive().optional(),
      condominioNome: z.string().optional(),
      demandaId: z.number().int().positive().optional(),
      advogadoId: z.number().int().positive().optional(),
      advogadoNome: z.string().optional(),
      valorCausa: z.number().int().min(0).optional(),
      valorCondenacao: z.number().int().min(0).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const processo = await updateProcesso(id, data);
      if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });
      return processo;
    }),

  // Excluir processo
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deleteProcesso(input.id);
      return { success: true };
    }),

  // ─── Partes ────────────────────────────────────────────────────────────────

  getPartes: protectedProcedure
    .input(z.object({ processoId: z.number().int().positive() }))
    .query(async ({ input }) => getPartes(input.processoId)),

  addParte: protectedProcedure
    .input(z.object({
      processoId: z.number().int().positive(),
      tipo: z.enum(["autor", "reu", "terceiro", "outro"]).default("autor"),
      nome: z.string().min(1).max(255),
      cpfCnpj: z.string().optional(),
      representante: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => addParte(input)),

  removeParte: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await removeParte(input.id);
      return { success: true };
    }),

  // ─── Movimentações ─────────────────────────────────────────────────────────

  getMovimentacoes: protectedProcedure
    .input(z.object({ processoId: z.number().int().positive() }))
    .query(async ({ input }) => getMovimentacoes(input.processoId)),

  addMovimentacao: protectedProcedure
    .input(z.object({
      processoId: z.number().int().positive(),
      data: z.date(),
      descricao: z.string().min(1),
      tipo: z.enum(["distribuicao", "citacao", "contestacao", "audiencia", "sentenca", "recurso", "despacho", "decisao", "peticao", "transito_julgado", "execucao", "outro"]).default("outro"),
    }))
    .mutation(async ({ input, ctx }) => {
      return addMovimentacao({
        ...input,
        origem: "manual",
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name ?? undefined,
      });
    }),

  deleteMovimentacao: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deleteMovimentacao(input.id);
      return { success: true };
    }),

  // ─── Financeiro ────────────────────────────────────────────────────────────

  getFinanceiro: protectedProcedure
    .input(z.object({ processoId: z.number().int().positive() }))
    .query(async ({ input }) => getFinanceiro(input.processoId)),

  addFinanceiro: protectedProcedure
    .input(z.object({
      processoId: z.number().int().positive(),
      tipo: z.enum(["custas", "honorarios", "despesas", "deposito", "condenacao", "reembolso", "outro"]).default("custas"),
      descricao: z.string().min(1).max(500),
      valor: z.number().int().min(1),
      data: z.date(),
      pago: z.boolean().default(false),
      dataPagamento: z.date().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return addFinanceiro({ ...input, criadoPorId: ctx.user.id });
    }),

  updateFinanceiro: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      pago: z.boolean().optional(),
      dataPagamento: z.date().optional(),
      descricao: z.string().optional(),
      valor: z.number().int().min(1).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateFinanceiro(id, data);
    }),

  deleteFinanceiro: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deleteFinanceiro(input.id);
      return { success: true };
    }),

  // ─── DataJud ───────────────────────────────────────────────────────────────

  // Listar tribunais disponíveis
  listarTribunais: protectedProcedure
    .query(() => listarTribunais()),

  // Buscar processo no DataJud pelo número CNJ
  buscarDataJud: protectedProcedure
    .input(z.object({
      numeroCNJ: z.string().min(1),
      tribunalAlias: z.string().optional(), // se não informado, detecta automaticamente
    }))
    .mutation(async ({ input }) => {
      // Detectar tribunal automaticamente se não informado
      let alias = input.tribunalAlias;
      let tribunalSigla: string | undefined;

      if (!alias) {
        const detectado = detectarTribunalPorCNJ(input.numeroCNJ);
        if (!detectado) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Não foi possível detectar o tribunal pelo número CNJ. Informe o tribunal manualmente.",
          });
        }
        alias = detectado.alias;
        tribunalSigla = detectado.tribunal;
      }

      const resultado = await buscarProcessoPorNumero(input.numeroCNJ, alias);

      if (resultado.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: resultado.error,
        });
      }

      if (resultado.total === 0) {
        return { encontrado: false, processo: null, tribunal: tribunalSigla };
      }

      // Pegar o primeiro resultado
      const hit = resultado.processos[0];
      const src = hit._source;

      return {
        encontrado: true,
        tribunal: tribunalSigla ?? src.tribunal,
        processo: {
          datajudId: hit._id,
          numeroCNJ: src.numeroProcesso,
          tribunal: src.tribunal,
          classe: src.classe?.nome ?? null,
          assunto: src.assuntos?.[0]?.nome ?? null,
          vara: src.orgaoJulgador?.nome ?? null,
          dataAjuizamento: src.dataAjuizamento ? new Date(src.dataAjuizamento) : null,
          dataUltimaMovimentacao: src.dataHoraUltimaAtualizacao
            ? new Date(src.dataHoraUltimaAtualizacao)
            : null,
          movimentos: (src.movimentos ?? []).map((m) => ({
            codigo: m.codigo,
            nome: m.nome,
            dataHora: m.dataHora,
          })),
          partes: src.partes ?? [],
        },
      };
    }),

  // Buscar processos no DataJud pelo nome do advogado
  buscarPorNomeAdvogado: protectedProcedure
    .input(z.object({
      nomeAdvogado: z.string().min(3, "Informe ao menos 3 caracteres"),
      tribunaisAliases: z.array(z.string()).optional(), // se vazio, busca nos principais tribunais
      pagina: z.number().int().min(0).default(0),
      tamanho: z.number().int().min(1).max(50).default(20),
    }))
    .mutation(async ({ input }) => {
      const { nomeAdvogado, tribunaisAliases, pagina, tamanho } = input;

      // Se tribunais específicos foram informados, busca neles
      if (tribunaisAliases && tribunaisAliases.length > 0) {
        if (tribunaisAliases.length === 1) {
          // Busca em um único tribunal com paginação
          const resultado = await buscarProcessosPorNomeAdvogado(
            nomeAdvogado,
            tribunaisAliases[0],
            pagina,
            tamanho
          );
          if (resultado.error) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: resultado.error,
            });
          }
          return {
            multiTribunal: false,
            total: resultado.total,
            processos: resultado.processos.map((hit) => ({
              id: hit._id,
              tribunal: hit._source.tribunal,
              numeroProcesso: hit._source.numeroProcesso,
              classe: hit._source.classe?.nome ?? null,
              assunto: hit._source.assuntos?.[0]?.nome ?? null,
              vara: hit._source.orgaoJulgador?.nome ?? null,
              dataAjuizamento: hit._source.dataAjuizamento ?? null,
              partes: (hit._source.partes ?? []).map((p) => ({
                nome: p.nome,
                tipo: p.tipo ?? null,
                advogados: p.advogados ?? [],
              })),
            })),
          };
        } else {
          // Busca em múltiplos tribunais (sem paginação)
          const resultados = await buscarProcessosPorNomeAdvogadoMultiTribunal(
            nomeAdvogado,
            tribunaisAliases,
            tamanho
          );
          const processos = resultados.flatMap((r) =>
            r.resultado.processos.map((hit) => ({
              id: hit._id,
              tribunal: hit._source.tribunal,
              numeroProcesso: hit._source.numeroProcesso,
              classe: hit._source.classe?.nome ?? null,
              assunto: hit._source.assuntos?.[0]?.nome ?? null,
              vara: hit._source.orgaoJulgador?.nome ?? null,
              dataAjuizamento: hit._source.dataAjuizamento ?? null,
              partes: (hit._source.partes ?? []).map((p) => ({
                nome: p.nome,
                tipo: p.tipo ?? null,
                advogados: p.advogados ?? [],
              })),
            }))
          );
          return {
            multiTribunal: true,
            total: processos.length,
            processos,
          };
        }
      }

      // Sem tribunal específico: busca nos principais tribunais em paralelo
      const principaisTribunais = [
        TRIBUNAIS_ALIASES["TJSP"],
        TRIBUNAIS_ALIASES["TJRJ"],
        TRIBUNAIS_ALIASES["TJMG"],
        TRIBUNAIS_ALIASES["TJRS"],
        TRIBUNAIS_ALIASES["TJPR"],
        TRIBUNAIS_ALIASES["STJ"],
        TRIBUNAIS_ALIASES["TST"],
        TRIBUNAIS_ALIASES["TRT2"],
        TRIBUNAIS_ALIASES["TRT15"],
      ].filter(Boolean) as string[];

      const resultados = await buscarProcessosPorNomeAdvogadoMultiTribunal(
        nomeAdvogado,
        principaisTribunais,
        10
      );

      const processos = resultados.flatMap((r) =>
        r.resultado.processos.map((hit) => ({
          id: hit._id,
          tribunal: hit._source.tribunal,
          numeroProcesso: hit._source.numeroProcesso,
          classe: hit._source.classe?.nome ?? null,
          assunto: hit._source.assuntos?.[0]?.nome ?? null,
          vara: hit._source.orgaoJulgador?.nome ?? null,
          dataAjuizamento: hit._source.dataAjuizamento ?? null,
          partes: (hit._source.partes ?? []).map((p) => ({
            nome: p.nome,
            tipo: p.tipo ?? null,
            advogados: p.advogados ?? [],
          })),
        }))
      );

      return {
        multiTribunal: true,
        total: processos.length,
        processos,
        tribunaisConsultados: principaisTribunais.length,
      };
    }),

  // Sincronizar movimentações do DataJud para um processo existente
  sincronizarDataJud: protectedProcedure
    .input(z.object({ processoId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const processo = await getProcessoById(input.processoId);
      if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });
      if (!processo.tribunalAlias) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Processo não tem alias de tribunal configurado" });
      }

      const resultado = await buscarProcessoPorNumero(processo.numeroCNJ, processo.tribunalAlias);
      if (resultado.error || resultado.total === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: resultado.error ?? "Processo não encontrado no DataJud",
        });
      }

      const src = resultado.processos[0]._source;
      const movimentosExistentes = await getMovimentacoes(input.processoId);
      const codigosExistentes = new Set(
        movimentosExistentes
          .filter((m) => m.codigoDatajud != null)
          .map((m) => m.codigoDatajud)
      );

      let novas = 0;
      for (const mov of src.movimentos ?? []) {
        if (codigosExistentes.has(mov.codigo)) continue;

        // Montar complementos (tabelados + textuais) em JSON
        const todosComplementos: Array<{ nome: string; valor: string }> = [];
        for (const c of mov.complementosTabelados ?? []) {
          todosComplementos.push({ nome: c.nome, valor: String(c.valor ?? c.descricao ?? "") });
        }
        for (const c of mov.complementosTextuais ?? []) {
          todosComplementos.push({ nome: c.nome, valor: c.valor });
        }

        // Determinar tipo de movimentação pelo código CNJ
        const tipoMovimentacao = resolverTipoMovimentacao(mov.codigo, mov.nome);

        await addMovimentacao({
          processoId: input.processoId,
          data: new Date(mov.dataHora),
          descricao: mov.nome,
          tipo: tipoMovimentacao,
          origem: "datajud",
          codigoDatajud: mov.codigo,
          complementosJson: todosComplementos.length > 0 ? JSON.stringify(todosComplementos) : null,
          nomeOrgao: mov.nomeOrgao ?? null,
          tipoComunicacao: mov.tipoComunicacao ?? null,
          meioPublicacao: mov.meioPublicacao ?? null,
          usuarioId: ctx.user.id,
          usuarioNome: ctx.user.name ?? undefined,
        });
        novas++;
      }

      // Sincronizar partes com advogados e OAB
      const partesExistentes = await getPartes(input.processoId);
      const nomesExistentes = new Set(partesExistentes.map((p) => p.nome.toLowerCase()));
      let novasPartes = 0;
      for (const parte of src.partes ?? []) {
        if (nomesExistentes.has(parte.nome.toLowerCase())) {
          // Atualizar advogados se ainda não tem
          const existente = partesExistentes.find((p) => p.nome.toLowerCase() === parte.nome.toLowerCase());
          if (existente && !existente.advogadosJson && parte.advogados && parte.advogados.length > 0) {
            await updateParteAdvogados(existente.id, JSON.stringify(
              parte.advogados.map((a) => ({ nome: a.nome, oab: a.documento ?? a.codigoOAB ?? null }))
            ));
          }
          continue;
        }
        const tipoParteNorm = normalizarTipoParte(parte.tipo);
        await addParte({
          processoId: input.processoId,
          tipo: tipoParteNorm,
          nome: parte.nome,
          cpfCnpj: parte.documento ?? null,
          representante: null,
          advogadosJson: parte.advogados && parte.advogados.length > 0
            ? JSON.stringify(parte.advogados.map((a) => ({ nome: a.nome, oab: a.documento ?? a.codigoOAB ?? null })))
            : null,
        });
        nomesExistentes.add(parte.nome.toLowerCase());
        novasPartes++;
      }

      // Atualizar metadados do processo
      await updateProcesso(input.processoId, {
        datajudId: resultado.processos[0]._id,
        datajudSincronizadoEm: new Date(),
        dataUltimaMovimentacao: src.dataHoraUltimaAtualizacao
          ? new Date(src.dataHoraUltimaAtualizacao)
          : undefined,
      });

      return { sincronizado: true, novasMovimentacoes: novas, novasPartes };
    }),
});

// ─── Prazos ───────────────────────────────────────────────────────────────────

export const prazosRouter = router({
  // Listar prazos com filtros e urgência calculada
  listar: protectedProcedure
    .input(z.object({
      condominioId: z.number().int().positive().optional(),
      processoId: z.number().int().positive().optional(),
      demandaId: z.number().int().positive().optional(),
      responsavelId: z.number().int().positive().optional(),
      status: z.enum(["pendente", "concluido", "cancelado", "atrasado"]).optional(),
      urgencia: z.enum(["atrasado", "hoje", "7dias", "15dias", "30dias", "futuro"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      const prazos = await getPrazos(input ?? {});
      return prazos.map((p) => ({
        ...p,
        urgencia: p.status === "pendente" ? calcularUrgencia(p.dataLimite) : null,
      }));
    }),

  // Resumo de prazos para dashboard
  resumo: protectedProcedure
    .input(z.object({ condominioId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => getResumoPrazos(input?.condominioId)),

  // Criar prazo
  create: protectedProcedure
    .input(z.object({
      titulo: z.string().min(1).max(255),
      tipo: z.enum(["processual", "contratual", "administrativo", "audiencia", "recurso", "interno", "outro"]).default("processual"),
      processoId: z.number().int().positive().optional(),
      demandaId: z.number().int().positive().optional(),
      condominioId: z.number().int().positive().optional(),
      condominioNome: z.string().optional(),
      responsavelId: z.number().int().positive().optional(),
      responsavelNome: z.string().optional(),
      dataLimite: z.date(),
      alertas: z.string().optional(), // JSON: "[30,15,7,1]"
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return createPrazo({ ...input, criadoPorId: ctx.user.id });
    }),

  // Atualizar prazo
  update: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      titulo: z.string().min(1).max(255).optional(),
      tipo: z.enum(["processual", "contratual", "administrativo", "audiencia", "recurso", "interno", "outro"]).optional(),
      processoId: z.number().int().positive().optional(),
      condominioId: z.number().int().positive().optional(),
      condominioNome: z.string().optional(),
      responsavelId: z.number().int().positive().optional(),
      responsavelNome: z.string().optional(),
      dataLimite: z.date().optional(),
      alertas: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const prazo = await updatePrazo(id, data);
      if (!prazo) throw new TRPCError({ code: "NOT_FOUND", message: "Prazo não encontrado" });
      return prazo;
    }),

  // Concluir prazo
  concluir: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const prazo = await concluirPrazo(input.id);
      if (!prazo) throw new TRPCError({ code: "NOT_FOUND", message: "Prazo não encontrado" });
      return prazo;
    }),

  // Cancelar prazo
  cancelar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const prazo = await updatePrazo(input.id, { status: "cancelado" });
      if (!prazo) throw new TRPCError({ code: "NOT_FOUND", message: "Prazo não encontrado" });
      return prazo;
    }),

  // Excluir prazo
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deletePrazo(input.id);
      return { success: true };
    }),
});

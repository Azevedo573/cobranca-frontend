/**
 * router/mni.ts — Procedures tRPC para integração MNI TJRJ.
 *
 * Procedures:
 *  Credenciais:
 *    mni.listarCredenciais      — lista todas as credenciais cadastradas
 *    mni.salvarCredencial       — cria ou atualiza credencial MNI
 *    mni.deletarCredencial      — remove credencial
 *    mni.testarConexao          — testa se as credenciais funcionam
 *
 *  Intimações:
 *    mni.listarIntimacoes       — lista intimações com filtros
 *    mni.getIntimacao           — detalhe de uma intimação
 *    mni.buscarAvisosPendentes  — consulta o TJRJ e importa novos avisos
 *    mni.buscarTeor             — consulta o inteiro teor de uma intimação
 *    mni.marcarVisualizado      — marca como visualizado
 *    mni.tratarIntimacao        — trata (conclui ou descarta) uma intimação
 *    mni.countPendentes         — conta intimações pendentes (para badge)
 *
 *  Sincronização de Processo:
 *    mni.sincronizarProcesso    — sincroniza um processo com o TJRJ via MNI
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  listMniCredenciais,
  getMniCredencialById,
  upsertMniCredencial,
  updateMniCredencial,
  deleteMniCredencial,
  listIntimacoes,
  getIntimacao,
  salvarIntimacao,
  marcarIntimacaoVisualizada,
  tratarIntimacao as dbTratarIntimacao,
  atualizarTeorIntimacao,
  countIntimacoesPendentes,
  registrarSincronizacao,
  getUltimaSincronizacao,
} from "../db-mni";
import {
  getProcessoById,
  addMovimentacao,
  addParte,
} from "../db-processos";
import { createPrazo } from "../db-prazos";
import { criarMniClient, normalizarTipoParte } from "../mni-client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getClientAtivo() {
  const cred = await import("../db-mni").then((m) => m.getMniCredencial());
  if (!cred) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Nenhuma credencial MNI ativa encontrada. Configure as credenciais do TJRJ primeiro.",
    });
  }
  return criarMniClient(cred);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const mniRouter = router({

  // ── Credenciais ─────────────────────────────────────────────────────────────

  listarCredenciais: protectedProcedure.query(async () => {
    return listMniCredenciais();
  }),

  salvarCredencial: protectedProcedure
    .input(
      z.object({
        tribunal: z.string().default("TJRJ"),
        idConsultante: z.string().min(1, "ID do consultante obrigatório"),
        senhaConsultante: z.string().min(1, "Senha obrigatória"),
        ambiente: z.enum(["homologacao", "producao"]).default("homologacao"),
        urlWsdl: z.string().url().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return upsertMniCredencial({
        tribunal: input.tribunal,
        idConsultante: input.idConsultante,
        senhaConsultante: input.senhaConsultante,
        ambiente: input.ambiente,
        urlWsdl: input.urlWsdl,
        criadoPorId: ctx.user.id,
      });
    }),

  deletarCredencial: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteMniCredencial(input.id);
      return { ok: true };
    }),

  testarConexao: protectedProcedure
    .input(
      z.object({
        idConsultante: z.string(),
        senhaConsultante: z.string(),
        ambiente: z.enum(["homologacao", "producao"]).default("homologacao"),
        urlWsdl: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const client = criarMniClient({
        idConsultante: input.idConsultante,
        senhaConsultante: input.senhaConsultante,
        ambiente: input.ambiente,
        urlWsdl: input.urlWsdl,
      });
      const resultado = await client.testarConexao();

      // Atualiza status do teste na credencial ativa se existir
      const creds = await listMniCredenciais();
      const credAtiva = creds.find((c) => c.idConsultante === input.idConsultante);
      if (credAtiva) {
        await updateMniCredencial(credAtiva.id, {
          ultimoTesteEm: new Date(),
          ultimoTesteStatus: resultado.ok ? "ok" : "erro",
        });
      }

      return resultado;
    }),

  // ── Intimações ───────────────────────────────────────────────────────────────

  countPendentes: protectedProcedure.query(async () => {
    return countIntimacoesPendentes();
  }),

  listarIntimacoes: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pendente", "visualizado", "tratado", "descartado"]).optional(),
        processoId: z.number().optional(),
        numeroCNJ: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      return listIntimacoes(input);
    }),

  getIntimacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const intimacao = await getIntimacao(input.id);
      if (!intimacao) throw new TRPCError({ code: "NOT_FOUND", message: "Intimação não encontrada" });
      // Marca como visualizado automaticamente
      await marcarIntimacaoVisualizada(input.id);
      return intimacao;
    }),

  buscarAvisosPendentes: protectedProcedure
    .input(
      z.object({
        idRepresentado: z.string().optional(),
        dataReferencia: z.string().optional(), // AAAA/MM/DD
      })
    )
    .mutation(async ({ input }) => {
      const client = await getClientAtivo();

      let avisos;
      try {
        avisos = await client.consultarAvisosPendentes({
          idRepresentado: input.idRepresentado,
          dataReferencia: input.dataReferencia,
        });
      } catch (err: any) {
        await registrarSincronizacao({
          tipo: "avisos",
          status: "erro",
          erroMsg: err?.message || String(err),
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao consultar avisos: ${err?.message || "Erro desconhecido"}`,
        });
      }

      let importados = 0;
      for (const aviso of avisos) {
        if (!aviso.idAviso) continue;
        await salvarIntimacao({
          idAviso: aviso.idAviso,
          numeroCNJ: aviso.numeroProcesso,
          tipoAviso: aviso.tipoAviso,
          tipoComunicacao: aviso.tipoComunicacao,
          dataDisponibilizacao: aviso.dataDisponibilizacao
            ? new Date(aviso.dataDisponibilizacao.replace(/\//g, "-"))
            : null,
          dataPublicacao: aviso.dataPublicacao
            ? new Date(aviso.dataPublicacao.replace(/\//g, "-"))
            : null,
          orgao: aviso.orgao,
          vara: aviso.vara,
          comarca: aviso.comarca,
          partesJson: aviso.partes ? JSON.stringify(aviso.partes) : null,
          status: "pendente",
        });
        importados++;
      }

      await registrarSincronizacao({
        tipo: "avisos",
        status: "sucesso",
        avisosImportados: importados,
      });

      return { importados, total: avisos.length };
    }),

  buscarTeor: protectedProcedure
    .input(z.object({ id: z.number(), idAviso: z.string() }))
    .mutation(async ({ input }) => {
      const client = await getClientAtivo();

      let teor;
      try {
        teor = await client.consultarTeorComunicacao({ idAviso: input.idAviso });
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao buscar teor: ${err?.message || "Erro desconhecido"}`,
        });
      }

      await atualizarTeorIntimacao(
        input.id,
        teor.teor,
        teor.parametros ? JSON.stringify(teor.parametros) : undefined
      );

      return teor;
    }),

  marcarVisualizado: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await marcarIntimacaoVisualizada(input.id);
      return { ok: true };
    }),

  tratarIntimacao: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["tratado", "descartado"]),
        observacoes: z.string().optional(),
        // Se true, cria prazo automático de 15 dias úteis a partir da data de disponibilização
        gerarPrazoAutomatico: z.boolean().optional().default(true),
        diasPrazo: z.number().int().min(1).max(180).optional().default(15),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const intimacao = await getIntimacao(input.id);
      if (!intimacao) throw new TRPCError({ code: "NOT_FOUND", message: "Intimação não encontrada" });

      let prazoGeradoId: number | undefined;

      // Cria prazo automático quando a intimação é tratada (não descartada)
      if (input.status === "tratado" && input.gerarPrazoAutomatico) {
        const dataBase = intimacao.dataDisponibilizacao
          ? new Date(intimacao.dataDisponibilizacao)
          : new Date();
        const dataLimite = new Date(dataBase);
        dataLimite.setDate(dataLimite.getDate() + (input.diasPrazo ?? 15));

        const processo = intimacao.processoId
          ? await getProcessoById(intimacao.processoId)
          : null;

        const prazo = await createPrazo({
          titulo: `Prazo — ${intimacao.tipoComunicacao ?? "Intimação"} (${intimacao.numeroCNJ ?? "sem CNJ"})`,
          tipo: "processual",
          processoId: intimacao.processoId ?? undefined,
          condominioId: processo?.condominioId ?? undefined,
          condominioNome: processo?.condominioNome ?? undefined,
          responsavelId: ctx.user.id,
          responsavelNome: ctx.user.name ?? undefined,
          dataLimite,
          alertas: JSON.stringify([7, 3, 1]),
          observacoes: `Gerado automaticamente ao tratar intimação #${input.id}${input.observacoes ? ". " + input.observacoes : ""}`,
          criadoPorId: ctx.user.id,
        });
        prazoGeradoId = prazo?.id;
      }

      await dbTratarIntimacao(input.id, {
        status: input.status,
        tratadoPorId: ctx.user.id,
        tratadoPorNome: ctx.user.name || "Usuário",
        observacoes: input.observacoes,
        prazoGeradoId,
      });
      return { ok: true, prazoGeradoId };
    }),

  // ── Sincronização de Processo ─────────────────────────────────────────────

  sincronizarProcesso: protectedProcedure
    .input(
      z.object({
        processoId: z.number(),
        dataReferencia: z.string().optional(), // AAAA/MM/DD — importa só movimentos a partir desta data
      })
    )
    .mutation(async ({ input, ctx }) => {
      const processo = await getProcessoById(input.processoId);
      if (!processo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });
      }

      const client = await getClientAtivo();

      let dadosMNI;
      try {
        dadosMNI = await client.consultarProcesso({
          numeroProcesso: processo.numeroCNJ,
          dataReferencia: input.dataReferencia,
        });
      } catch (err: any) {
        await registrarSincronizacao({
          processoId: input.processoId,
          numeroCNJ: processo.numeroCNJ,
          tipo: "processo",
          status: "erro",
          erroMsg: err?.message || String(err),
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao consultar MNI: ${err?.message || "Erro desconhecido"}`,
        });
      }

      let movimentacoesImportadas = 0;

      // Importa movimentos
      for (const mov of dadosMNI.movimentos) {
        const dataHora = mov.dataHora
          ? (() => {
              const parts = mov.dataHora.split("/");
              if (parts.length >= 3) {
                const [y, m, d, h = "00", mi = "00", s = "00"] = parts;
                return new Date(`${y}-${m}-${d}T${h}:${mi}:${s}.000Z`);
              }
              return new Date();
            })()
          : new Date();

        await addMovimentacao({
          processoId: input.processoId,
          data: dataHora,
          descricao: mov.nome || "Movimentação importada do MNI",
          tipo: "despacho",
          origem: "datajud", // reutilizamos o enum existente para indicar origem externa
          codigoDatajud: mov.codigo || null,
          complementosJson: mov.complementos?.length
            ? JSON.stringify(mov.complementos)
            : null,
          nomeOrgao: mov.nomeOrgao || dadosMNI.orgaoJulgador || null,
          tipoComunicacao: mov.tipoComunicacao || null,
          meioPublicacao: mov.meioPublicacao || null,
          usuarioId: ctx.user.id,
          usuarioNome: ctx.user.name || "Sistema MNI",
        });
        movimentacoesImportadas++;
      }

      // Importa/atualiza partes (apenas se ainda não existem)
      for (const parte of dadosMNI.partes) {
        await addParte({
          processoId: input.processoId,
          tipo: normalizarTipoParte(parte.tipo),
          nome: parte.nome,
          cpfCnpj: parte.cpfCnpj || null,
          advogadosJson: parte.advogados?.length
            ? JSON.stringify(parte.advogados)
            : null,
        });
      }

      await registrarSincronizacao({
        processoId: input.processoId,
        numeroCNJ: processo.numeroCNJ,
        tipo: "processo",
        status: "sucesso",
        movimentacoesImportadas,
      });

      return {
        ok: true,
        movimentacoesImportadas,
        partesImportadas: dadosMNI.partes.length,
        ultimaSincronizacao: new Date(),
      };
    }),

  getUltimaSincronizacao: protectedProcedure
    .input(z.object({ processoId: z.number() }))
    .query(async ({ input }) => {
      const data = await getUltimaSincronizacao(input.processoId);
      return { ultimaSincronizacao: data };
    }),
});

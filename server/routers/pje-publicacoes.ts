/**
 * Router tRPC para publicações PJe
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { pjePublicacoes, doerjMonitoramentos } from "../../drizzle/schema";
import { eq, desc, and, isNull, or } from "drizzle-orm";
import { buscarTodasPublicacoesPJe } from "../pje-api";

export const pjePublicacoesRouter = router({
  /**
   * Listar publicações PJe com filtros
   */
  listar: protectedProcedure
    .input(
      z.object({
        lida: z.enum(["todas", "nao_lidas", "lidas"]).default("todas"),
        limite: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB error");

      const condicoes = [];
      if (input.lida === "nao_lidas") condicoes.push(eq(pjePublicacoes.lida, 0));
      if (input.lida === "lidas") condicoes.push(eq(pjePublicacoes.lida, 1));

      const rows = await db
        .select({
          id: pjePublicacoes.id,
          pjeId: pjePublicacoes.pjeId,
          dataDisponibilizacao: pjePublicacoes.dataDisponibilizacao,
          siglaTribunal: pjePublicacoes.siglaTribunal,
          tipoComunicacao: pjePublicacoes.tipoComunicacao,
          nomeOrgao: pjePublicacoes.nomeOrgao,
          numeroProcesso: pjePublicacoes.numeroProcesso,
          numeroProcessoMascara: pjePublicacoes.numeroProcessoMascara,
          tipoDocumento: pjePublicacoes.tipoDocumento,
          nomeClasse: pjePublicacoes.nomeClasse,
          texto: pjePublicacoes.texto,
          link: pjePublicacoes.link,
          meio: pjePublicacoes.meio,
          meioCompleto: pjePublicacoes.meioCompleto,
          destinatariosJson: pjePublicacoes.destinatariosJson,
          monitoramentoId: pjePublicacoes.monitoramentoId,
          lida: pjePublicacoes.lida,
          createdAt: pjePublicacoes.createdAt,
          nomePesquisado: doerjMonitoramentos.nome,
        })
        .from(pjePublicacoes)
        .leftJoin(doerjMonitoramentos, eq(pjePublicacoes.monitoramentoId, doerjMonitoramentos.id))
        .where(condicoes.length > 0 ? and(...condicoes) : undefined)
        .orderBy(desc(pjePublicacoes.dataDisponibilizacao), desc(pjePublicacoes.id))
        .limit(input.limite)
        .offset(input.offset);

      // Contar não lidas
      const naoLidas = await db
        .select({ id: pjePublicacoes.id })
        .from(pjePublicacoes)
        .where(eq(pjePublicacoes.lida, 0));

      return {
        publicacoes: rows.map(r => ({
          ...r,
          destinatariosJson: r.destinatariosJson
            ? (() => {
                try { return JSON.parse(r.destinatariosJson!); }
                catch { return null; }
              })()
            : null,
        })),
        totalNaoLidas: naoLidas.length,
      };
    }),

  /**
   * Marcar publicação como lida
   */
  marcarLida: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB error");
      await db.update(pjePublicacoes).set({ lida: 1 }).where(eq(pjePublicacoes.id, input.id));
      return { success: true };
    }),

  /**
   * Marcar todas como lidas
   */
  marcarTodasLidas: protectedProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("DB error");
      await db.update(pjePublicacoes).set({ lida: 1 }).where(eq(pjePublicacoes.lida, 0));
      return { success: true };
    }),

  /**
   * Buscar publicações agora (execução manual do job)
   */
  buscarAgora: protectedProcedure
    .input(
      z.object({
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
      }).optional()
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB error");

      // Buscar monitoramentos ativos
      const monitoramentos = await db
        .select()
        .from(doerjMonitoramentos)
        .where(eq(doerjMonitoramentos.ativo, 1));

      if (monitoramentos.length === 0) {
        return { success: true, totalSalvas: 0, totalDuplicadas: 0, erros: [], message: "Nenhum monitoramento ativo" };
      }

      const hoje = new Date().toISOString().split("T")[0];
      const ontem = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const dataInicio = input?.dataInicio || ontem;
      const dataFim = input?.dataFim || hoje;

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
              const existente = await db
                .select({ id: pjePublicacoes.id })
                .from(pjePublicacoes)
                .where(eq(pjePublicacoes.pjeId, pub.id))
                .limit(1);

              if (existente.length > 0) { totalDuplicadas++; continue; }

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
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              if (!msg.includes("Duplicate entry")) erros.push(msg);
              else totalDuplicadas++;
            }
          }
        } catch (e: unknown) {
          erros.push(`Erro ao buscar "${monitoramento.nome}": ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return {
        success: true,
        totalSalvas,
        totalDuplicadas,
        erros,
        message: `${totalSalvas} publicação(ões) salva(s), ${totalDuplicadas} duplicada(s)`,
      };
    }),
});

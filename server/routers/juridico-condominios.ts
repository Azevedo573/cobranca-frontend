import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getResumoJuridicoCondominio,
  listarCondominiosComJuridico,
} from "../db-juridico-condominio";
import { getMovimentacoesRecentes } from "../db-processos";

export const juridicoCondominiosRouter = router({
  // Lista todos os condomínios com seus indicadores jurídicos
  listar: protectedProcedure.query(async () => {
    return listarCondominiosComJuridico();
  }),

  // Resumo jurídico detalhado de um condomínio específico
  resumo: protectedProcedure
    .input(z.object({ condominioId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getResumoJuridicoCondominio(input.condominioId);
    }),

  // Movimentações recentes dos processos de um condomínio (timeline unificada)
  movimentacoesRecentes: protectedProcedure
    .input(z.object({
      condominioId: z.number().int().positive(),
      limite: z.number().int().min(5).max(50).default(20),
    }))
    .query(async ({ input }) => {
      return getMovimentacoesRecentes(input.condominioId, input.limite);
    }),
});

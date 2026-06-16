import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getResumoJuridicoCondominio,
  listarCondominiosComJuridico,
} from "../db-juridico-condominio";

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
});

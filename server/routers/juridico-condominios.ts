import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { condominioAccessProcedure } from "../middleware";
import {
  getResumoJuridicoCondominio,
  listarCondominiosComJuridico,
} from "../db-juridico-condominio";
import { getMovimentacoesRecentes } from "../db-processos";

export const juridicoCondominiosRouter = router({
  // Lista todos para admin e somente vínculos ativos para roles locais.
  listar: protectedProcedure.query(async ({ ctx }) => {
    const todos = await listarCondominiosComJuridico();
    if (ctx.user.role === "admin") return todos;
    const { getCondominiosAtivosDoUsuario } = await import("../tenant-guard");
    const permitidos = await getCondominiosAtivosDoUsuario(ctx.user);
    return todos.filter((condominio) => permitidos.includes(condominio.id));
  }),

  resumo: condominioAccessProcedure
    .input(z.object({ condominioId: z.number().int().positive() }))
    .query(async ({ ctx }) => getResumoJuridicoCondominio(ctx.user.condominioId!)),

  movimentacoesRecentes: condominioAccessProcedure
    .input(z.object({
      condominioId: z.number().int().positive(),
      limite: z.number().int().min(5).max(50).default(20),
    }))
    .query(async ({ input, ctx }) => getMovimentacoesRecentes(ctx.user.condominioId!, input.limite)),
});

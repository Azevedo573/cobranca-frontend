import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getResumoJuridicoCondominio,
  listarCondominiosComJuridico,
} from "../db-juridico-condominio";
import { getMovimentacoesRecentes } from "../db-processos";

export const juridicoCondominiosRouter = router({
  // Lista todos para admin e somente vínculos ativos para roles locais.
  listar: protectedProcedure.query(async ({ ctx }) => {
    const carteira = await (await import("../escopo-explicito")).getCarteiraExplicita(ctx.user);
    if (carteira) {
      if (!carteira.ids.length) return [];
      const { getJuridicoScope, demandaScopeCondition } = await import("../juridico-access");
      const scope = await getJuridicoScope(carteira.actor);
      return listarCondominiosComJuridico({ condominioIds: carteira.ids }, demandaScopeCondition(scope, true));
    }
    const todos = await listarCondominiosComJuridico();
    if (ctx.user.role === "admin") return todos;
    const { getCondominiosAtivosDoUsuario } = await import("../tenant-guard");
    const permitidos = await getCondominiosAtivosDoUsuario(ctx.user);
    return todos.filter((condominio) => permitidos.includes(condominio.id));
  }),

  resumo: protectedProcedure
    .input(z.object({ condominioId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const carteira = await (await import("../escopo-explicito")).getCarteiraExplicita(ctx.user);
      const condominioId = await (await import("../tenant-guard")).resolveCondominioEfetivo(ctx.user, input.condominioId);
      if (carteira) {
        const { getJuridicoScope, demandaScopeCondition } = await import("../juridico-access");
        const scope = await getJuridicoScope(carteira.actor);
        return getResumoJuridicoCondominio(condominioId!, demandaScopeCondition(scope, true));
      }
      return getResumoJuridicoCondominio(condominioId ?? ctx.user.condominioId!);
    }),

  movimentacoesRecentes: protectedProcedure
    .input(z.object({
      condominioId: z.number().int().positive(),
      limite: z.number().int().min(5).max(50).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const condominioId = await (await import("../tenant-guard")).resolveCondominioEfetivo(ctx.user, input.condominioId);
      return getMovimentacoesRecentes(condominioId ?? ctx.user.condominioId!, input.limite);
    }),
});

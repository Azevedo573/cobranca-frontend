import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "./_core/trpc";
import { resolveCondominioEfetivo } from "./tenant-guard";

// Middleware para verificar se o usuário é admin
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ 
      code: "FORBIDDEN",
      message: "Acesso negado. Apenas administradores podem realizar esta ação." 
    });
  }
  return next({ ctx });
});

// Middleware para verificar se o usuário tem acesso ao condomínio
export const condominioAccessProcedure = protectedProcedure.use(async ({ ctx, next, input }) => {
  const requestedCondominioId = (input as { condominioId?: number } | undefined)?.condominioId;
  const condominioEfetivo = await resolveCondominioEfetivo(ctx.user, requestedCondominioId);

  // Mantém compatibilidade com handlers legados que usam ctx.user.condominioId,
  // mas nunca aceita um condomínio sem vínculo ativo para roles locais.
  const userComEscopo = condominioEfetivo === undefined
    ? ctx.user
    : { ...ctx.user, condominioId: condominioEfetivo };

  return next({ ctx: { ...ctx, user: userComEscopo } });
});

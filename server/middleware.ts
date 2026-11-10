import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "./_core/trpc";
import { resolveCondominioEfetivo } from "./tenant-guard";

// Middleware para verificar se o usuário é admin
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const { getCurrentAuthorizationUser } = await import("./_core/auth-helper");
  const user = await getCurrentAuthorizationUser(ctx.user);
  if (!user || user.role !== "admin") {
    throw new TRPCError({ 
      code: "FORBIDDEN",
      message: "Acesso negado. Apenas administradores podem realizar esta ação." 
    });
  }
  return next({ ctx: { ...ctx, user } });
});

// Middleware para verificar se o usuário tem acesso ao condomínio
export const condominioAccessProcedure = protectedProcedure.use(async ({ ctx, next, input }) => {
  const { getCurrentAuthorizationUser } = await import("./_core/auth-helper");
  const user = await getCurrentAuthorizationUser(ctx.user);
  if (!user) throw new TRPCError({ code: "FORBIDDEN", message: "Identidade ou perfil revogado. Entre novamente." });
  const requestedCondominioId = (input as { condominioId?: number } | undefined)?.condominioId;
  const condominioEfetivo = await resolveCondominioEfetivo(user, requestedCondominioId);

  // Mantém compatibilidade com handlers legados que usam ctx.user.condominioId,
  // mas nunca aceita um condomínio sem vínculo ativo para roles locais.
  const userComEscopo = condominioEfetivo === undefined
    ? user
    : { ...user, condominioId: condominioEfetivo };

  return next({ ctx: { ...ctx, user: userComEscopo } });
});

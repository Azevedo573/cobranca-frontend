import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "./_core/trpc";

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
export const condominioAccessProcedure = protectedProcedure.use(({ ctx, next, input }) => {
  // Admin tem acesso a tudo
  if (ctx.user.role === "admin") {
    return next({ ctx });
  }

  // Verificar se o usuário tem condominioId
  if (!ctx.user.condominioId) {
    throw new TRPCError({ 
      code: "FORBIDDEN",
      message: "Usuário não está vinculado a nenhum condomínio." 
    });
  }

  // Verificar se está tentando acessar dados do próprio condomínio
  const requestedCondominioId = (input as any)?.condominioId;
  if (requestedCondominioId && requestedCondominioId !== ctx.user.condominioId) {
    throw new TRPCError({ 
      code: "FORBIDDEN",
      message: "Acesso negado. Você só pode acessar dados do seu condomínio." 
    });
  }

  return next({ ctx });
});

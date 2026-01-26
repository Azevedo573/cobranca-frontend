import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { adminProcedure, condominioAccessProcedure } from "./middleware";
import { z } from "zod";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    loginCustom: publicProcedure
      .input(z.object({
        username: z.string(),
        password: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { authenticateCondominio } = await import("./auth-custom");
        const result = await authenticateCondominio(input.username, input.password);
        
        if (result.success && result.token) {
          // Definir cookie com o token
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, result.token, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
          });
        }
        
        return result;
      }),
    loginColaborador: publicProcedure
      .input(z.object({
        username: z.string(),
        password: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { authenticateColaborador } = await import("./auth-colaborador");
        const result = await authenticateColaborador(input.username, input.password);
        
        if (result.success && result.token) {
          // Definir cookie com o token
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, result.token, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
          });
        }
        
        return result;
      }),
  }),

  // Condominios (apenas admin)
  condominios: router({
    list: adminProcedure.query(async () => {
      const { getAllCondominios } = await import("./db-condominios");
      return await getAllCondominios();
    }),
    getById: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const { getCondominioById } = await import("./db-condominios");
      return await getCondominioById(input.id);
    }),
    create: adminProcedure.input(z.object({
      name: z.string(),
      cnpj: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      managerName: z.string().optional(),
      managerEmail: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      taxaJurosMensal: z.string().optional(),
      taxaMulta: z.string().optional(),
      taxaHonorarios: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { createCondominio } = await import("./db-condominios");
      return await createCondominio(input);
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      cnpj: z.string().optional(),
      taxaJurosMensal: z.string().optional(),
      taxaMulta: z.string().optional(),
      taxaHonorarios: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      managerName: z.string().optional(),
      managerEmail: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      const { updateCondominio } = await import("./db-condominios");
      return await updateCondominio(id, data);
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const { deleteCondominio } = await import("./db-condominios");
      await deleteCondominio(input.id);
      return { success: true };
    }),
  }),

  // Devedores
  devedores: router({
    list: condominioAccessProcedure.input(z.object({ condominioId: z.number() })).query(async ({ input, ctx }) => {
      const condominioId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;
      const { getDevedoresByCondominio } = await import("./db-devedores");
      return await getDevedoresByCondominio(condominioId);
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const { getDevedorById } = await import("./db-devedores");
      return await getDevedorById(input.id);
    }),
    create: condominioAccessProcedure.input(z.object({
      condominioId: z.number(),
      name: z.string(),
      unitNumber: z.string(),
      email: z.string().optional(),
      phone: z.string().optional(),
      totalDue: z.number().default(0),
    })).mutation(async ({ input }) => {
      const { createDevedor } = await import("./db-devedores");
      return await createDevedor(input);
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      unitNumber: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      totalDue: z.number().optional(),
      status: z.enum(["ativo", "pago", "acordo"]).optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      const { updateDevedor } = await import("./db-devedores");
      return await updateDevedor(id, data);
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const { deleteDevedor } = await import("./db-devedores");
      await deleteDevedor(input.id);
      return { success: true };
    }),
  }),

  // Cobranças
  cobrancas: router({
    list: condominioAccessProcedure.input(z.object({ condominioId: z.number() })).query(async ({ input, ctx }) => {
      const condominioId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;
      const { getCobrancasByCondominio } = await import("./db-cobrancas");
      return await getCobrancasByCondominio(condominioId);
    }),
    getByDevedor: protectedProcedure.input(z.object({ devedorId: z.number() })).query(async ({ input }) => {
      const { getCobrancasByDevedor } = await import("./db-cobrancas");
      return await getCobrancasByDevedor(input.devedorId);
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const { getCobrancaById } = await import("./db-cobrancas");
      return await getCobrancaById(input.id);
    }),
    create: condominioAccessProcedure.input(z.object({
      devedorId: z.number(),
      condominioId: z.number(),
      description: z.string().optional(),
      amount: z.number(),
      dueDate: z.date().optional(),
      monthReference: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { createCobranca } = await import("./db-cobrancas");
      return await createCobranca(input);
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      description: z.string().optional(),
      amount: z.number().optional(),
      dueDate: z.date().optional(),
      status: z.enum(["pendente", "em_cobranca", "pago", "acordo"]).optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      const { updateCobranca } = await import("./db-cobrancas");
      return await updateCobranca(id, data);
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const { deleteCobranca } = await import("./db-cobrancas");
      await deleteCobranca(input.id);
      return { success: true };
    }),
  }),

  // Tentativas de Cobrança
  tentativas: router({
    list: condominioAccessProcedure.input(z.object({ condominioId: z.number() })).query(async ({ input, ctx }) => {
      const condominioId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;
      const { getTentativasByCondominio } = await import("./db-acordos");
      return await getTentativasByCondominio(condominioId);
    }),
    listAll: adminProcedure.query(async () => {
      const { getAllTentativas } = await import("./db-acordos");
      return await getAllTentativas();
    }),
    getByDevedor: protectedProcedure.input(z.object({ devedorId: z.number() })).query(async ({ input }) => {
      const { getTentativasByDevedor } = await import("./db-acordos");
      return await getTentativasByDevedor(input.devedorId);
    }),
    create: condominioAccessProcedure.input(z.object({
      cobrancaId: z.number(),
      devedorId: z.number(),
      condominioId: z.number(),
      contactType: z.enum(["telefone", "email", "pessoal", "whatsapp"]),
      notes: z.string().optional(),
      result: z.enum(["sem_resposta", "promessa_pagamento", "recusa", "outro"]).optional(),
      nextAttemptDate: z.date().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { createTentativa } = await import("./db-acordos");
      return await createTentativa({ ...input, userId: ctx.user.id });
    }),
  }),

  // Acordos
  acordos: router({
    list: condominioAccessProcedure.input(z.object({ condominioId: z.number() })).query(async ({ input, ctx }) => {
      const condominioId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;
      const { getAcordosByCondominio } = await import("./db-acordos");
      return await getAcordosByCondominio(condominioId);
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const { getAcordoById } = await import("./db-acordos");
      return await getAcordoById(input.id);
    }),
    create: condominioAccessProcedure.input(z.object({
      devedorId: z.number(),
      condominioId: z.number(),
      totalAmount: z.number(),
      agreedAmount: z.number(),
      installments: z.number(),
      firstPaymentDate: z.date(),
      paymentFrequency: z.enum(["mensal", "semanal", "quinzenal"]).default("mensal"),
      notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { createAcordo, createParcela } = await import("./db-acordos");
      const acordoResult = await createAcordo(input);
      const acordoId = Number((acordoResult as any).insertId || 0);
      
      // Criar parcelas automaticamente
      const valorParcela = Math.round(input.agreedAmount / input.installments);
      let dataAtual = new Date(input.firstPaymentDate);
      
      for (let i = 1; i <= input.installments; i++) {
        await createParcela({
          acordoId,
          installmentNumber: i,
          amount: valorParcela,
          dueDate: new Date(dataAtual),
        });
        
        // Calcular próxima data
        if (input.paymentFrequency === "semanal") {
          dataAtual.setDate(dataAtual.getDate() + 7);
        } else if (input.paymentFrequency === "quinzenal") {
          dataAtual.setDate(dataAtual.getDate() + 15);
        } else {
          dataAtual.setMonth(dataAtual.getMonth() + 1);
        }
      }
      
      return { success: true, acordoId };
    }),
    getParcelas: protectedProcedure.input(z.object({ acordoId: z.number() })).query(async ({ input }) => {
      const { getParcelasByAcordo } = await import("./db-acordos");
      return await getParcelasByAcordo(input.acordoId);
    }),
    updateParcela: protectedProcedure.input(z.object({
      id: z.number(),
      paymentDate: z.date().optional(),
      status: z.enum(["pendente", "pago", "atrasado"]).optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      const { updateParcela } = await import("./db-acordos");
      await updateParcela(id, data);
      return { success: true };
    }),
  }),

  // Usuários (apenas admin)
  users: router({
    list: adminProcedure.query(async () => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return [];
      const { users } = await import("../drizzle/schema");
      return await db.select().from(users);
    }),
    getById: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return null;
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const result = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
      return result[0] || null;
    }),
    create: adminProcedure.input(z.object({
      name: z.string(),
      email: z.string().email(),
      password: z.string(),
      role: z.enum(["admin", "sindico", "cobrador"]),
      condominioId: z.number().optional(),
      isActive: z.number().optional(),
    })).mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Gerar hash da senha
      const bcrypt = await import("bcryptjs");
      const hashedPassword = await bcrypt.default.hash(input.password, 10);
      
      // Gerar openId único baseado no email e timestamp
      const openId = hashedPassword;
      
      const { users } = await import("../drizzle/schema");
      return await db.insert(users).values({
        openId,
        name: input.name,
        email: input.email,
        role: input.role,
        condominioId: input.condominioId,
        isActive: input.isActive ?? 1,
      });
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      email: z.string().email().optional(),
      password: z.string().optional(),
      role: z.enum(["admin", "sindico", "cobrador"]).optional(),
      condominioId: z.number().optional(),
      isActive: z.number().optional(),
    })).mutation(async ({ input }) => {
      const { id, password, ...data } = input;
      
      // Se tem senha, gerar hash
      let updateData: any = { ...data };
      if (password) {
        const bcrypt = await import("bcryptjs");
        const hashedPassword = await bcrypt.default.hash(password, 10);
        updateData.openId = hashedPassword;
      }
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(users).set(updateData).where(eq(users.id, id));
      return { success: true };
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(users).where(eq(users.id, input.id));
      return { success: true };
    }),
  }),

  // Relatórios (apenas admin)
  relatorios: router({
    produtividade: adminProcedure.input(z.object({
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      condominioId: z.number().optional(),
    })).query(async ({ input }) => {
      const { getProdutividadeColaboradores } = await import("./db-relatorios");
      const dataInicio = input.dataInicio ? new Date(input.dataInicio) : undefined;
      const dataFim = input.dataFim ? new Date(input.dataFim) : undefined;
      return await getProdutividadeColaboradores(dataInicio, dataFim, input.condominioId);
    }),
    distribuicao: adminProcedure.input(z.object({
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    })).query(async ({ input }) => {
      const { getDistribuicaoPorCondominio } = await import("./db-relatorios");
      const dataInicio = input.dataInicio ? new Date(input.dataInicio) : undefined;
      const dataFim = input.dataFim ? new Date(input.dataFim) : undefined;
      return await getDistribuicaoPorCondominio(dataInicio, dataFim);
    }),
  }),
  scoring: router({
    atualizarScore: protectedProcedure.input(z.object({
      devedorId: z.number(),
    })).mutation(async ({ input }) => {
      const { atualizarScoreDevedor } = await import("./db-scoring");
      return await atualizarScoreDevedor(input.devedorId);
    }),
    atualizarTodos: adminProcedure.mutation(async () => {
      const { atualizarScoreTodosDevedores } = await import("./db-scoring");
      return await atualizarScoreTodosDevedores();
    }),
    listarPorPrioridade: protectedProcedure.input(z.object({
      condominioId: z.number().optional(),
    })).query(async ({ input }) => {
      const { buscarDevedoresPorPrioridade } = await import("./db-scoring");
      return await buscarDevedoresPorPrioridade(input.condominioId);
    }),
  }),
});

export type AppRouter = typeof appRouter;

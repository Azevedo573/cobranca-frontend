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
    loginAdmin: publicProcedure
      .input(z.object({
        email: z.string(),
        password: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { authenticateAdmin } = await import("./auth-admin");
        const result = await authenticateAdmin(input.email, input.password);
        
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
      descontoMaximo: z.string().optional(),
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
      descontoMaximo: z.string().optional(),
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
      bloco: z.string().optional(),
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
      bloco: z.string().optional(),
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
      tipoCobranca: z.enum(["condominio", "salao_jogos", "churrasqueira", "cota_extra", "multa", "outros"]).optional(),
      description: z.string().optional(),
      amount: z.number(),
      custasJudiciais: z.number().optional(),
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
    list: protectedProcedure.input(z.object({ condominioId: z.number() })).query(async ({ input, ctx }) => {
      const condominioId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;
      const { getTentativasByCondominio } = await import("./db-tentativas");
      return await getTentativasByCondominio(condominioId);
    }),
    listAll: adminProcedure.query(async () => {
      const { getAllTentativas } = await import("./db-acordos");
      return await getAllTentativas();
    }),
    getByDevedor: protectedProcedure.input(z.object({ devedorId: z.number() })).query(async ({ input }) => {
      const { getTentativasByDevedor } = await import("./db-tentativas");
      return await getTentativasByDevedor(input.devedorId);
    }),
    create: protectedProcedure.input(z.object({
      cobrancaId: z.number(),
      devedorId: z.number(),
      condominioId: z.number(),
      contactType: z.enum(["telefone", "email", "pessoal", "whatsapp"]),
      notes: z.string().optional(),
      result: z.enum(["sem_resposta", "promessa_pagamento", "recusa", "outro", "deseja_acordo"]).optional(),
      nextAttemptDate: z.date().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { createTentativa } = await import("./db-tentativas");
      return await createTentativa({ ...input, userId: ctx.user.id });
    }),
    getEstatisticas: protectedProcedure.input(z.object({ condominioId: z.number() })).query(async ({ input, ctx }) => {
      const condominioId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;
      const { getEstatisticasTentativas } = await import("./db-tentativas");
      return await getEstatisticasTentativas(condominioId);
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
    getByCobranca: protectedProcedure.input(z.object({ cobrancaId: z.number() })).query(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return null;
      const { acordos, acordoCobrancas } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const result = await db.select({
        id: acordos.id,
        devedorId: acordos.devedorId,
        condominioId: acordos.condominioId,
        valorPago: acordos.valorPago,
        totalAmount: acordos.totalAmount,
        agreedAmount: acordos.agreedAmount,
        installments: acordos.installments,
        firstPaymentDate: acordos.firstPaymentDate,
        paymentFrequency: acordos.paymentFrequency,
        status: acordos.status,
        notes: acordos.notes,
        createdAt: acordos.createdAt,
        updatedAt: acordos.updatedAt,
      }).from(acordos)
        .innerJoin(acordoCobrancas, eq(acordos.id, acordoCobrancas.acordoId))
        .where(
          and(
            eq(acordoCobrancas.cobrancaId, input.cobrancaId),
            eq(acordos.status, "ativo")
          )
        ).limit(1);
      return result[0] || null;
    }),
    create: condominioAccessProcedure.input(z.object({
      cobrancaIds: z.array(z.number()),
      devedorId: z.number(),
      condominioId: z.number(),
      totalAmount: z.number(),
      agreedAmount: z.number(),
      installments: z.number(),
      firstPaymentDate: z.date(),
      paymentFrequency: z.enum(["mensal", "semanal", "quinzenal"]).default("mensal"),
      notes: z.string().optional(),
      parcelas: z.array(z.object({
        installmentNumber: z.number(),
        amount: z.number(),
        dueDate: z.date(),
      })),
    })).mutation(async ({ input }) => {
      const { createAcordo, createParcelas, createAcordoCobrancas } = await import("./db-acordos");
      const acordoResult = await createAcordo({
        devedorId: input.devedorId,
        condominioId: input.condominioId,
        totalAmount: input.totalAmount,
        agreedAmount: input.agreedAmount,
        installments: input.installments,
        firstPaymentDate: input.firstPaymentDate,
        paymentFrequency: input.paymentFrequency,
        notes: input.notes,
      });
      const acordoId = Number((acordoResult as any).insertId || 0);
      
      // Criar todas as parcelas de uma vez
      const parcelasData = input.parcelas.map(p => ({
        acordoId,
        installmentNumber: p.installmentNumber,
        amount: p.amount,
        dueDate: p.dueDate,
      }));
      
      await createParcelas(parcelasData);
      
      // Criar relacionamentos entre acordo e cobranças
      await createAcordoCobrancas(acordoId, input.cobrancaIds);
      
      // Atualizar status de todas as cobranças para 'em_acordo'
      const { updateCobranca } = await import("./db-cobrancas");
      for (const cobrancaId of input.cobrancaIds) {
        await updateCobranca(cobrancaId, { status: "em_acordo" });
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
      const { updateParcela } = await import("./db-acordos");
      return await updateParcela(input.id, input);
    }),
    darBaixaParcela: protectedProcedure.input(z.object({
      parcelaId: z.number(),
      dataPagamento: z.date().optional(),
    })).mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      
      const { parcelasAcordo, acordos } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      
      // Buscar parcela
      const parcela = await db.select().from(parcelasAcordo).where(eq(parcelasAcordo.id, input.parcelaId)).limit(1);
      if (!parcela || parcela.length === 0) {
        throw new Error("Parcela não encontrada");
      }
      
      // Validar que não foi paga
      if (parcela[0].status === "pago") {
        throw new Error("Parcela já foi paga anteriormente");
      }
      
      // Atualizar parcela como paga
      const dataPagamento = input.dataPagamento || new Date();
      await db.update(parcelasAcordo)
        .set({ 
          status: "pago", 
          paymentDate: dataPagamento 
        })
        .where(eq(parcelasAcordo.id, input.parcelaId));
      
      // Buscar todas as parcelas do acordo
      const todasParcelas = await db.select().from(parcelasAcordo)
        .where(eq(parcelasAcordo.acordoId, parcela[0].acordoId));
      
      // Calcular valor pago total
      const valorPagoTotal = todasParcelas
        .filter(p => p.status === "pago" || p.id === input.parcelaId)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      
      // Verificar se todas as parcelas foram pagas
      const todasPagas = todasParcelas.every(p => 
        p.status === "pago" || p.id === input.parcelaId
      );
      
      // Atualizar acordo
      await db.update(acordos)
        .set({ 
          valorPago: valorPagoTotal,
          status: todasPagas ? "pago" : "ativo"
        })
        .where(eq(acordos.id, parcela[0].acordoId));
      
      return { 
        success: true, 
        valorPagoTotal,
        statusAcordo: todasPagas ? "pago" : "ativo"
      };
    }),
    verificarAtrasos: adminProcedure.mutation(async () => {
      const { verificarParcelasAtrasadas } = await import("./verificar-atrasos");
      return await verificarParcelasAtrasadas();
    }),
    getVencimentosProximos: condominioAccessProcedure.input(z.object({
      condominioId: z.number().optional(),
      dias: z.number().default(7), // próximos 7, 15 ou 30 dias
    })).query(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return [];
      
      const { parcelasAcordo, acordos, devedores } = await import("../drizzle/schema");
      const { eq, and, gte, lte, sql } = await import("drizzle-orm");
      
      // Calcular data limite (hoje + X dias)
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const dataLimite = new Date(hoje);
      dataLimite.setDate(dataLimite.getDate() + input.dias);
      
      // Filtrar por condomínio baseado no papel do usuário
      const condominioId = ctx.user.role === "admin" 
        ? input.condominioId 
        : ctx.user.condominioId;
      
      const conditions = [
        eq(parcelasAcordo.status, "pendente"),
        gte(parcelasAcordo.dueDate, hoje),
        lte(parcelasAcordo.dueDate, dataLimite),
      ];
      
      if (condominioId) {
        conditions.push(eq(acordos.condominioId, condominioId));
      }
      
      const parcelas = await db.select({
        parcelaId: parcelasAcordo.id,
        acordoId: acordos.id,
        devedorId: devedores.id,
        devedorNome: devedores.name,
        devedorUnidade: devedores.unitNumber,
        devedorBloco: devedores.bloco,
        parcelaNumero: parcelasAcordo.installmentNumber,
        parcelaValor: parcelasAcordo.amount,
        dataVencimento: parcelasAcordo.dueDate,
        condominioId: acordos.condominioId,
      })
      .from(parcelasAcordo)
      .innerJoin(acordos, eq(parcelasAcordo.acordoId, acordos.id))
      .innerJoin(devedores, eq(acordos.devedorId, devedores.id))
      .where(and(...conditions))
      .orderBy(parcelasAcordo.dueDate);
      
      return parcelas;
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
        passwordHash: hashedPassword,
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
        updateData.passwordHash = hashedPassword;
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
  
  // Importação de devedores via Excel
  importacao: router({
    downloadTemplate: adminProcedure.mutation(async () => {
      const { gerarTemplateExcel } = await import("./excel-import");
      const buffer = gerarTemplateExcel();
      return { 
        success: true, 
        base64: buffer.toString("base64"),
        filename: "template_devedores.xlsx"
      };
    }),
    
    processarPlanilha: adminProcedure.input(z.object({
      base64: z.string(),
      condominioId: z.number(),
    })).mutation(async ({ input }) => {
      const { processarPlanilha } = await import("./excel-import");
      const buffer = Buffer.from(input.base64, "base64");
      const resultado = processarPlanilha(buffer);
      return resultado;
    }),
    
    importarDevedores: adminProcedure.input(z.object({
      condominioId: z.number(),
      dados: z.array(z.object({
        nomeCompleto: z.string(),
        cpfCnpj: z.string(),
        email: z.string().optional(),
        telefone: z.string().optional(),
        unidade: z.string(),
        bloco: z.string().optional(),
        descricaoCobranca: z.string().optional(),
        mesReferencia: z.string().optional(),
        dataVencimento: z.string(),
        valorOriginal: z.number(),
      })),
    })).mutation(async ({ input }) => {
      const { createDevedor } = await import("./db-devedores");
      const { createCobranca } = await import("./db-cobrancas");
      const { converterData } = await import("./excel-import");
      
      const resultados = {
        devedoresCriados: 0,
        devedoresAtualizados: 0,
        cobrancasCriadas: 0,
        erros: [] as string[],
      };
      
      for (const dado of input.dados) {
        try {
          // Verificar se devedor já existe
          const { getDevedorByCpfCnpj, getDevedorById } = await import("./db-devedores");
          let devedor = await getDevedorByCpfCnpj(dado.cpfCnpj, input.condominioId);
          
          if (!devedor) {
            // Criar novo devedor
            const devedorResult = await createDevedor({
              condominioId: input.condominioId,
              name: dado.nomeCompleto,
              cpfCnpj: dado.cpfCnpj,
              email: dado.email,
              phone: dado.telefone,
              unitNumber: dado.unidade,
              bloco: dado.bloco,
            });
            const devedorId = Number((devedorResult as any).insertId || 0);
            devedor = await getDevedorById(devedorId);
            resultados.devedoresCriados++;
          } else {
            resultados.devedoresAtualizados++;
          }
          
          // Criar cobrança
          if (devedor) {
            const dataVencimento = converterData(dado.dataVencimento);
            await createCobranca({
              condominioId: input.condominioId,
              devedorId: devedor.id,
              description: dado.descricaoCobranca,
              monthReference: dado.mesReferencia,
              dueDate: dataVencimento,
              amount: Math.round(dado.valorOriginal * 100), // Converter para centavos
              status: "pendente",
            });
          }
          resultados.cobrancasCriadas++;
        } catch (error: any) {
          resultados.erros.push(`Erro ao processar ${dado.nomeCompleto}: ${error.message}`);
        }
      }
      
      return resultados;
    }),
  }),
});

export type AppRouter = typeof appRouter;

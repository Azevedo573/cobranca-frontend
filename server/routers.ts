import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { adminProcedure, condominioAccessProcedure } from "./middleware";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { logAudit, auditLoginSuccess, auditLoginFailed, auditLogout } from "./audit";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      await auditLogout(ctx);
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
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, result.token, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000,
          });
          await auditLoginSuccess(ctx, { condominioId: result.user?.condominioId, condominioNome: result.user?.condominioName });
        } else {
          await auditLoginFailed(ctx, input.username, result.error || "Credenciais inválidas");
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
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, result.token, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000,
          });
          await auditLoginSuccess(ctx, { condominioId: result.user?.condominioId ?? undefined });
        } else {
          await auditLoginFailed(ctx, input.username, result.message || "Credenciais inválidas");
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
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, result.token, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000,
          });
          await auditLoginSuccess(ctx);
        } else {
          await auditLoginFailed(ctx, input.email, result.message || "Credenciais inválidas");
        }
        
        return result;
      }),

    // ── Recuperação de Senha ──────────────────────────────────────────────
    requestPasswordReset: publicProcedure
      .input(z.object({
        identifier: z.string().min(1), // e-mail ou username
      }))
      .mutation(async ({ input, ctx }) => {
        const crypto = await import("crypto");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });
        const { users, passwordResetTokens } = await import("../drizzle/schema");
        const { eq, and, gt } = await import("drizzle-orm");

        // Rate limit: máx 3 solicitações por hora por IP
        const ip = (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
          || ctx.req.socket?.remoteAddress
          || "unknown";
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentRequests = await db
          .select({ id: passwordResetTokens.id })
          .from(passwordResetTokens)
          .where(and(
            eq(passwordResetTokens.ipAddress, ip),
            gt(passwordResetTokens.createdAt, oneHourAgo)
          ));
        if (recentRequests.length >= 3) {
          // Retornar sucesso genérico para não revelar rate limit
          return { success: true };
        }

        // Buscar usuário por e-mail ou username
        const identifier = input.identifier.trim().toLowerCase();
        const allUsers = await db.select().from(users);
        const user = allUsers.find(u =>
          (u.email?.toLowerCase() === identifier) ||
          (u.openId?.toLowerCase() === identifier)
        );

        // Sempre retornar sucesso genérico (evitar enumeração)
        if (!user || !user.email) {
          return { success: true };
        }

        // Invalidar tokens anteriores do usuário
        await db.delete(passwordResetTokens).where(
          and(
            eq(passwordResetTokens.userId, user.id),
            // só invalida os não usados
          )
        );

        // Gerar token criptograficamente seguro
        const rawToken = crypto.randomBytes(32).toString("hex"); // 64 chars hex
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

        await db.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash,
          expiresAt,
          ipAddress: ip,
        });

        // Enviar e-mail
        const { sendPasswordResetEmail } = await import("./email-password-reset");
        await sendPasswordResetEmail({
          to: user.email,
          name: user.name || user.openId || "Usuário",
          token: rawToken,
          ip,
        });

        return { success: true };
      }),

    resetPassword: publicProcedure
      .input(z.object({
        token: z.string().min(1),
        newPassword: z.string()
          .min(8, "Mínimo 8 caracteres")
          .regex(/[A-Z]/, "Deve conter letra maiúscula")
          .regex(/[0-9]/, "Deve conter número")
          .regex(/[^A-Za-z0-9]/, "Deve conter caractere especial"),
      }))
      .mutation(async ({ input }) => {
        const crypto = await import("crypto");
        const bcrypt = await import("bcryptjs");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });
        const { users, passwordResetTokens } = await import("../drizzle/schema");
        const { eq, and, isNull, gt } = await import("drizzle-orm");

        const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex");
        const now = new Date();

        // Buscar token válido
        const [resetToken] = await db
          .select()
          .from(passwordResetTokens)
          .where(and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, now)
          ))
          .limit(1);

        if (!resetToken) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "TOKEN_INVALID", // código para o frontend distinguir o erro
          });
        }

        // Verificar se o token já expirou (extra safety)
        if (resetToken.expiresAt < now) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "TOKEN_EXPIRED" });
        }

        // Hash da nova senha
        const passwordHash = await bcrypt.hash(input.newPassword, 12);

        // Atualizar senha do usuário
        await db.update(users)
          .set({ passwordHash, updatedAt: now })
          .where(eq(users.id, resetToken.userId));

        // Marcar token como usado
        await db.update(passwordResetTokens)
          .set({ usedAt: now })
          .where(eq(passwordResetTokens.id, resetToken.id));

        return { success: true };
      }),

    validateResetToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const crypto = await import("crypto");
        const db = await getDb();
        if (!db) return { valid: false, reason: "TOKEN_INVALID" as const };
        const { passwordResetTokens } = await import("../drizzle/schema");
        const { eq, and, isNull, gt } = await import("drizzle-orm");

        const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex");
        const now = new Date();

        const [resetToken] = await db
          .select({ id: passwordResetTokens.id, expiresAt: passwordResetTokens.expiresAt, usedAt: passwordResetTokens.usedAt })
          .from(passwordResetTokens)
          .where(eq(passwordResetTokens.tokenHash, tokenHash))
          .limit(1);

        if (!resetToken) return { valid: false, reason: "TOKEN_INVALID" as const };
        if (resetToken.usedAt) return { valid: false, reason: "TOKEN_USED" as const };
        if (resetToken.expiresAt < now) return { valid: false, reason: "TOKEN_EXPIRED" as const };

        return { valid: true, reason: null };
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
      billingIssuer: z.enum(["emissao_propria", "administradora", "outro"]).default("administradora"),
      customBillingIssuer: z.string().max(255).optional(),
    })).mutation(async ({ input, ctx }) => {
      // Validação: customBillingIssuer obrigatório quando billingIssuer = 'outro'
      if (input.billingIssuer === "outro" && !input.customBillingIssuer?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o nome do emissor personalizado." });
      }
      const { createCondominio } = await import("./db-condominios");
      const result = await createCondominio(input);
      await logAudit(ctx, { action: "create", entity: "condominio", entityLabel: input.name, afterData: { name: input.name, cnpj: input.cnpj }, severity: "info" });
      return result;
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
      billingIssuer: z.enum(["emissao_propria", "administradora", "outro"]).optional(),
      customBillingIssuer: z.string().max(255).optional().nullable(),
    })).mutation(async ({ input, ctx }) => {
      // Validação: customBillingIssuer obrigatório quando billingIssuer = 'outro'
      if (input.billingIssuer === "outro" && !input.customBillingIssuer?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o nome do emissor personalizado." });
      }
      const { id, ...data } = input;
      const { updateCondominio } = await import("./db-condominios");
      const result = await updateCondominio(id, data);
      await logAudit(ctx, { action: "update", entity: "condominio", entityId: String(id), entityLabel: input.name, afterData: data as Record<string, unknown>, severity: "info" });
      return result;
    }),
     delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const { deleteCondominio } = await import("./db-condominios");
      await deleteCondominio(input.id);
      await logAudit(ctx, { action: "delete", entity: "condominio", entityId: String(input.id), severity: "warning" });
      return { success: true };
    }),

    // Importacao de condomínios via planilha Excel
    importarPlanilha: adminProcedure.input(z.object({
      fileBase64: z.string(),
      fileName: z.string(),
      // Se true, apenas valida sem inserir (etapa de preview)
      apenasValidar: z.boolean().default(false),
      // Como tratar CNPJs duplicados: "pular" (ignora) ou "atualizar" (sobrescreve)
      modoConflito: z.enum(["pular", "atualizar"]).default("pular"),
    })).mutation(async ({ input, ctx }) => {
      const XLSX = await import("xlsx");
      const { createCondominio, updateCondominio, getAllCondominios } = await import("./db-condominios");
      const { getDb } = await import("./db");
      const { historicoImportacoes } = await import("../drizzle/schema");

      // Decodificar base64
      const buffer = Buffer.from(input.fileBase64, "base64");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      // Buscar todos os CNPJs existentes para detecção de duplicatas
      const todosCondominios = await getAllCondominios();
      const cnpjExistente = new Map<string, number>(); // cnpj -> id
      for (const c of todosCondominios) {
        if (c.cnpj) cnpjExistente.set(c.cnpj.replace(/\D/g, ""), c.id);
      }

      const resultados: Array<{
        linha: number;
        nome: string;
        status: "ok" | "erro" | "aviso" | "atualizado" | "pulado";
        mensagem: string;
        duplicado?: boolean;
        idExistente?: number;
        dados?: Record<string, unknown>;
      }> = [];

      let totalCriados = 0;
      let totalAtualizados = 0;
      let totalPulados = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const linha = i + 2;

        const nome = String(row["Nome"] || row["nome"] || row["NOME"] || "").trim();
        if (!nome) {
          resultados.push({ linha, nome: "(vazio)", status: "erro", mensagem: "Campo 'Nome' é obrigatório" });
          continue;
        }

        const cnpj = String(row["CNPJ"] || row["cnpj"] || "").trim();
        const cnpjLimpo = cnpj.replace(/\D/g, "");
        const address = String(row["Endereço"] || row["Endereco"] || row["endereco"] || "").trim();
        const city = String(row["Cidade"] || row["cidade"] || "").trim();
        const state = String(row["Estado"] || row["UF"] || row["uf"] || "").trim().toUpperCase().slice(0, 2);
        const zipCode = String(row["CEP"] || row["cep"] || "").trim();
        const phone = String(row["Telefone"] || row["telefone"] || "").trim();
        const email = String(row["Email"] || row["email"] || "").trim();
        const managerName = String(row["Síndico"] || row["Sindico"] || row["sindico"] || row["Gestor"] || "").trim();
        const managerEmail = String(row["Email Síndico"] || row["Email Sindico"] || row["email_sindico"] || "").trim();
        const taxaJurosMensal = String(row["Juros Mensal (%)"] || row["juros_mensal"] || "1.00").trim();
        const taxaMulta = String(row["Multa (%)"] || row["multa"] || "2.00").trim();
        const taxaHonorarios = String(row["Honorários (%)"] || row["honorarios"] || "10.00").trim();

        const dados = { nome, cnpj, address, city, state, zipCode, phone, email, managerName, managerEmail, taxaJurosMensal, taxaMulta, taxaHonorarios };

        // Verificar duplicata por CNPJ
        const idDuplicado = cnpjLimpo ? cnpjExistente.get(cnpjLimpo) : undefined;
        const isDuplicado = !!idDuplicado;

        if (input.apenasValidar) {
          if (isDuplicado) {
            resultados.push({
              linha, nome, status: "aviso",
              mensagem: `CNPJ já cadastrado (ID #${idDuplicado}) — será ${input.modoConflito === "atualizar" ? "atualizado" : "pulado"}`,
              duplicado: true, idExistente: idDuplicado, dados,
            });
          } else {
            resultados.push({ linha, nome, status: "ok", mensagem: "Válido — será criado", dados });
          }
          continue;
        }

        const payload = {
          name: nome,
          cnpj: cnpj || undefined,
          address: address || undefined,
          city: city || undefined,
          state: state || undefined,
          zipCode: zipCode || undefined,
          phone: phone || undefined,
          email: email || undefined,
          managerName: managerName || undefined,
          managerEmail: managerEmail || undefined,
          taxaJurosMensal: taxaJurosMensal || undefined,
          taxaMulta: taxaMulta || undefined,
          taxaHonorarios: taxaHonorarios || undefined,
        };

        try {
          if (isDuplicado) {
            if (input.modoConflito === "atualizar") {
              await updateCondominio(idDuplicado!, payload);
              totalAtualizados++;
              resultados.push({ linha, nome, status: "atualizado", mensagem: `Atualizado (ID #${idDuplicado})`, duplicado: true, idExistente: idDuplicado });
            } else {
              totalPulados++;
              resultados.push({ linha, nome, status: "pulado", mensagem: `Pulado — CNPJ já existe (ID #${idDuplicado})`, duplicado: true, idExistente: idDuplicado });
            }
          } else {
            await createCondominio(payload);
            totalCriados++;
            resultados.push({ linha, nome, status: "ok", mensagem: "Criado com sucesso" });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          resultados.push({ linha, nome, status: "erro", mensagem: `Erro: ${msg}` });
        }
      }

      // Registrar no histórico de importações
      if (!input.apenasValidar) {
        const db = await getDb();
        const totalErros = resultados.filter((r) => r.status === "erro").length;
        await db!.insert(historicoImportacoes).values({
          condominioId: null,
          usuarioId: ctx.user.id,
          tipo: "devedores" as const,
          nomeArquivo: input.fileName,
          totalRegistros: rows.length,
          registrosSucesso: totalCriados + totalAtualizados,
          registrosErro: totalErros,
          status: totalErros === 0 ? "concluido" : totalCriados + totalAtualizados === 0 ? "erro" : "concluido",
          detalhesErros: JSON.stringify(resultados.filter((r) => r.status === "erro").slice(0, 50)),
        });
      }

      return {
        total: rows.length,
        criados: totalCriados,
        atualizados: totalAtualizados,
        pulados: totalPulados,
        erros: resultados.filter((r) => r.status === "erro").length,
        resultados,
      };
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
      cpfCnpj: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      totalDue: z.number().default(0),
    })).mutation(async ({ input, ctx }) => {
      const { createDevedor } = await import("./db-devedores");
      const result = await createDevedor(input);
      await logAudit(ctx, { action: "create", entity: "devedor", entityLabel: input.name, condominioId: input.condominioId, afterData: { name: input.name, cpfCnpj: input.cpfCnpj, unitNumber: input.unitNumber }, severity: "info" });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      unitNumber: z.string().optional(),
      bloco: z.string().optional(),
      cpfCnpj: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      totalDue: z.number().optional(),
      status: z.enum(["ativo", "pago", "acordo"]).optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const { updateDevedor } = await import("./db-devedores");
      const result = await updateDevedor(id, data);
      await logAudit(ctx, { action: "update", entity: "devedor", entityId: String(id), afterData: data as Record<string, unknown>, severity: "info" });
      return result;
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const { deleteDevedor } = await import("./db-devedores");
      await deleteDevedor(input.id);
      await logAudit(ctx, { action: "delete", entity: "devedor", entityId: String(input.id), severity: "warning" });
      return { success: true };
    }),

    listarTodos: adminProcedure
      .input(z.object({
        condominioId: z.number().optional(),
        busca: z.string().optional(),
        status: z.enum(["ativo", "pago", "acordo"]).optional(),
        pagina: z.number().min(1).default(1),
        porPagina: z.number().min(10).max(30).default(10),
      }))
      .query(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return { itens: [], total: 0 };
        const { devedores, condominios } = await import("../drizzle/schema");
        const { eq, and, like, or, count, desc } = await import("drizzle-orm");

        const conditions: any[] = [];
        if (input.condominioId) conditions.push(eq(devedores.condominioId, input.condominioId));
        if (input.status) conditions.push(eq(devedores.status, input.status));
        if (input.busca && input.busca.trim().length >= 2) {
          const termo = `%${input.busca.trim()}%`;
          conditions.push(
            or(
              like(devedores.name, termo),
              like(devedores.cpfCnpj, termo),
              like(devedores.unitNumber, termo),
              like(devedores.email, termo),
            )
          );
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const offset = (input.pagina - 1) * input.porPagina;

        const [totalResult, itens] = await Promise.all([
          db.select({ total: count() }).from(devedores).where(where),
          db.select({
            id: devedores.id,
            name: devedores.name,
            unitNumber: devedores.unitNumber,
            bloco: devedores.bloco,
            cpfCnpj: devedores.cpfCnpj,
            email: devedores.email,
            phone: devedores.phone,
            status: devedores.status,
            totalDue: devedores.totalDue,
            condominioId: devedores.condominioId,
            condominioNome: condominios.name,
          })
          .from(devedores)
          .leftJoin(condominios, eq(devedores.condominioId, condominios.id))
          .where(where)
          .orderBy(desc(devedores.id))
          .limit(input.porPagina)
          .offset(offset),
        ]);

        return { itens, total: totalResult[0]?.total ?? 0 };
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
    getComCalculos: protectedProcedure.input(z.object({ devedorId: z.number() })).query(async ({ input }) => {
      const { getCobrancasComCalculos } = await import("./db-cobrancas");
      return await getCobrancasComCalculos(input.devedorId);
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
    })).mutation(async ({ input, ctx }) => {
      const { createCobranca } = await import("./db-cobrancas");
      const result = await createCobranca(input);
      await logAudit(ctx, { action: "create", entity: "cobranca", condominioId: input.condominioId, afterData: { devedorId: input.devedorId, amount: input.amount, tipoCobranca: input.tipoCobranca }, severity: "info" });
      return result;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      description: z.string().optional(),
      amount: z.number().optional(),
      dueDate: z.date().optional(),
      status: z.enum(["pendente", "em_cobranca", "pago", "acordo"]).optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const { updateCobranca } = await import("./db-cobrancas");
      const result = await updateCobranca(id, data);
      await logAudit(ctx, { action: "update", entity: "cobranca", entityId: String(id), afterData: data as Record<string, unknown>, severity: "info" });
      return result;
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const { deleteCobranca } = await import("./db-cobrancas");
      await deleteCobranca(input.id);
      await logAudit(ctx, { action: "delete", entity: "cobranca", entityId: String(input.id), severity: "warning" });
      return { success: true };
    }),
    importarPlanilha: condominioAccessProcedure.input(z.object({
      devedorId: z.number(),
      condominioId: z.number(),
      fileBase64: z.string(),
    })).mutation(async ({ input }) => {
      const { importarCobrancasPlanilha } = await import("./db-cobrancas");
      return await importarCobrancasPlanilha(input.devedorId, input.condominioId, input.fileBase64);
    }),

    // Gerar PDF do boleto para uma cobrança específica
    gerarBoletoPDF: protectedProcedure
      .input(z.object({ cobrancaId: z.number() }))
      .mutation(async ({ input }) => {
        const { getCobrancaById } = await import("./db-cobrancas");
        const { getDevedorById } = await import("./db-devedores");
        const { getConfiguracaoBoleto } = await import("./db-configuracao-boleto");
        const { getCondominioById } = await import("./db-condominios");
        const { gerarBoletoPDF, calcularCodigoBarras, calcularLinhaDigitavel, formatarLinhaDigitavel } = await import("./boleto-pdf");
        const { gerarPixCopiaCola } = await import("./pix-emv");
        const { storagePut } = await import("./storage");

        const cobranca = await getCobrancaById(input.cobrancaId);
        if (!cobranca) throw new TRPCError({ code: "NOT_FOUND", message: "Cobrança não encontrada" });
        if (!cobranca.nossoNumero) throw new TRPCError({ code: "BAD_REQUEST", message: "Cobrança sem nosso número — envie a remessa CNAB primeiro" });

        const devedor = await getDevedorById(cobranca.devedorId);
        if (!devedor) throw new TRPCError({ code: "NOT_FOUND", message: "Devedor não encontrado" });

        const config = await getConfiguracaoBoleto(cobranca.condominioId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Configuração de boleto não encontrada" });

        const condominio = await getCondominioById(cobranca.condominioId);
        if (!condominio) throw new TRPCError({ code: "NOT_FOUND", message: "Condomínio não encontrado" });

        const dataVencimento = cobranca.dueDate ? new Date(cobranca.dueDate) : new Date();
        const dataEmissao = new Date();

        const instrucoes: string[] = [];
        if (config.instrucoesCaixa) {
          const taxa = parseFloat(config.taxaJurosDia || "0") * 30;
          const multa = parseFloat(config.taxaMulta || "0");
          instrucoes.push(
            config.instrucoesCaixa
              .replace(/#MULTA#/g, `${multa.toFixed(2)}%`)
              .replace(/#JUROS#/g, `${taxa.toFixed(4)}% ao dia`)
          );
        }
        instrucoes.push("Não receber após 30 dias do vencimento.");

        const nomeSacado = devedor.name ||
          `${devedor.bloco ? `Bloco ${devedor.bloco} — ` : ""}Unidade ${devedor.unitNumber}`;

        // Pix copia e cola: prioridade para o Bolepix retornado pelo banco (campo pixCopiaCola)
        // Fallback: gerar a partir da chave estática configurada (se habilitarPix e chavePix preenchidos)
        let pixCopiaCola: string | undefined = cobranca.pixCopiaCola || undefined;
        if (!pixCopiaCola && config.habilitarPix && config.chavePix) {
          pixCopiaCola = gerarPixCopiaCola({
            chavePix: config.chavePix,
            nomeBeneficiario: config.nomeBeneficiario || condominio.name,
            cidade: condominio.city || "SAO PAULO",
            valor: cobranca.amount,
            txid: cobranca.nossoNumero || undefined,
            descricao: `Cobranca ${cobranca.nossoNumero}`,
          }) || undefined;
        }

        const dados = {
          nomeBeneficiario: config.nomeBeneficiario || condominio.name,
          cnpjBeneficiario: config.cnpjBeneficiario || condominio.cnpj || "",
          enderecoBeneficiario: config.enderecoBeneficiario || condominio.address || "",
          banco: config.banco,
          nomeBanco: config.nomeBanco,
          agencia: config.agencia,
          digitoAgencia: config.digitoAgencia,
          conta: config.conta,
          digitoConta: config.digitoConta,
          carteira: config.carteira,
          convenio: config.convenio,
          nossoNumero: cobranca.nossoNumero,
          dataVencimento,
          dataEmissao,
          valor: cobranca.amount,
          especieDocumento: config.especieDocumento,
          aceite: config.aceite,
          nomeSacado,
          cpfCnpjSacado: devedor.cpfCnpj || "",
          enderecoSacado: condominio.address || "",
          cidadeSacado: condominio.city || "",
          ufSacado: condominio.state || "",
          cepSacado: condominio.zipCode || "",
          localPagamento: config.localPagamento,
          instrucoes,
          seuNumero: cobranca.nossoNumero,
          pixCopiaCola,
        };

        const pdfBuffer = await gerarBoletoPDF(dados);

        // Salvar no S3
        const fileKey = `boletos/${cobranca.condominioId}/${cobranca.nossoNumero}-${Date.now()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        // Calcular linha digitável para retornar ao frontend
        const codigoBarras = calcularCodigoBarras(dados);
        const linhaDigitavel = formatarLinhaDigitavel(calcularLinhaDigitavel(codigoBarras));

        return {
          url,
          linhaDigitavel,
          codigoBarras,
          pixCopiaCola,
          nossoNumero: cobranca.nossoNumero,
          valor: cobranca.amount,
          vencimento: dataVencimento.toISOString(),
        };
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

    listAllFiltrada: adminProcedure
      .input(z.object({
        dataInicio: z.date().optional(),
        dataFim: z.date().optional(),
        colaboradorId: z.number().optional(), // userId do colaborador
        condominioId: z.number().optional(),
        limite: z.number().min(1).max(500).default(50),
      }))
      .query(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return [];
        const { tentativasCobranca, users } = await import("../drizzle/schema");
        const { eq, and, gte, lte, desc } = await import("drizzle-orm");

        const conditions: any[] = [];
        if (input.dataInicio) conditions.push(gte(tentativasCobranca.attemptDate, input.dataInicio));
        if (input.dataFim) {
          // Incluir o dia inteiro da data final
          const fimDia = new Date(input.dataFim);
          fimDia.setHours(23, 59, 59, 999);
          conditions.push(lte(tentativasCobranca.attemptDate, fimDia));
        }
        if (input.colaboradorId) conditions.push(eq(tentativasCobranca.userId, input.colaboradorId));
        if (input.condominioId) conditions.push(eq(tentativasCobranca.condominioId, input.condominioId));

        return db
          .select({
            id: tentativasCobranca.id,
            cobrancaId: tentativasCobranca.cobrancaId,
            devedorId: tentativasCobranca.devedorId,
            condominioId: tentativasCobranca.condominioId,
            userId: tentativasCobranca.userId,
            contactType: tentativasCobranca.contactType,
            notes: tentativasCobranca.notes,
            result: tentativasCobranca.result,
            attemptDate: tentativasCobranca.attemptDate,
            nextAttemptDate: tentativasCobranca.nextAttemptDate,
            createdAt: tentativasCobranca.createdAt,
            userName: users.name,
            userEmail: users.email,
          })
          .from(tentativasCobranca)
          .leftJoin(users, eq(tentativasCobranca.userId, users.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(tentativasCobranca.attemptDate))
          .limit(input.limite);
      }),

    listarColaboradores: adminProcedure.query(async () => {
      const db = await (await import("./db")).getDb();
      if (!db) return [];
      const { users } = await import("../drizzle/schema");
      const { ne } = await import("drizzle-orm");
      return db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
        .from(users)
        .where(ne(users.role, "admin" as any));
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
    // Buscar acordos ativos com parcelas restantes para consolidação
    getAtivosComParcelas: protectedProcedure.input(z.object({ devedorId: z.number() })).query(async ({ input }) => {
      const { getAcordosAtivosComParcelas } = await import("./db-acordos");
      return await getAcordosAtivosComParcelas(input.devedorId);
    }),
    // Buscar histórico de consolidações de um acordo
    getHistorico: protectedProcedure.input(z.object({ acordoId: z.number() })).query(async ({ input }) => {
      const { getHistoricoConsolidacoes } = await import("./db-acordos");
      return await getHistoricoConsolidacoes(input.acordoId);
    }),
    // Buscar todos os acordos de um devedor
    listByDevedor: protectedProcedure.input(z.object({ devedorId: z.number() })).query(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return [];
      const { acordos } = await import("../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      return await db.select().from(acordos).where(eq(acordos.devedorId, input.devedorId)).orderBy(desc(acordos.createdAt));
    }),
    create: condominioAccessProcedure.input(z.object({
      cobrancaIds: z.array(z.number()),
      devedorId: z.number(),
      condominioId: z.number(),
      acordoOrigemId: z.number().optional(), // ID do acordo anterior (para consolidação)
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
    })).mutation(async ({ input, ctx }) => {
      const { createAcordo, createParcelas, createAcordoCobrancas, getAcordosAtivosComParcelas, updateAcordo } = await import("./db-acordos");
      
      // Verificar se há acordos ativos e cancelar (se for consolidação)
      // Usa acordoOrigemId como flag confiável de consolidação (não depende do texto das notes)
      const acordosAtivos = await getAcordosAtivosComParcelas(input.devedorId);
      if (acordosAtivos.length > 0 && input.acordoOrigemId) {
        // Cancelar todos os acordos ativos do devedor
        for (const acordo of acordosAtivos) {
          await updateAcordo(acordo.id, { status: 'cancelado' });
          console.log(`[DEBUG] Acordo #${acordo.id} cancelado por consolidação`);
        }
      }
      
      const acordoResult = await createAcordo({
        devedorId: input.devedorId,
        condominioId: input.condominioId,
        acordoOrigemId: input.acordoOrigemId,
        totalAmount: input.totalAmount,
        agreedAmount: input.agreedAmount,
        installments: input.installments,
        firstPaymentDate: input.firstPaymentDate,
        paymentFrequency: input.paymentFrequency,
        notes: input.notes,
      });
      console.log('[DEBUG] Resultado do createAcordo:', JSON.stringify(acordoResult, null, 2));
      // Drizzle retorna um array com o resultado, acessar o primeiro elemento
      const insertResult = Array.isArray(acordoResult) ? acordoResult[0] : acordoResult;
      const acordoId = Number(insertResult?.insertId || 0);
      console.log('[DEBUG] acordoId extraído:', acordoId);
      
      if (acordoId === 0) {
        throw new Error('Falha ao obter ID do acordo criado');
      }
      
      // Tentar gerar nossos números automáticos via configuração BTG
      let nossoNumeroBase: number | null = null;
      try {
        const { getConfiguracaoBoleto, incrementarSequencialArquivo } = await import("./db-configuracao-boleto");
        const configBoleto = await getConfiguracaoBoleto(input.condominioId);
        if (configBoleto) {
          const seq = await incrementarSequencialArquivo(input.condominioId, input.parcelas.length);
          nossoNumeroBase = seq.nossoNumeroInicio;
        }
      } catch (e) {
        // Configuração BTG não disponível — parcelas ficam sem nossoNumero por enquanto
        console.log('[ACORDO] Configuração BTG não encontrada, parcelas sem nossoNumero');
      }

      // Criar todas as parcelas com nossoNumero (se disponível)
      const parcelasData = input.parcelas.map((p, idx) => ({
        acordoId,
        installmentNumber: p.installmentNumber,
        amount: p.amount,
        dueDate: p.dueDate,
        status: 'pendente' as const,
        nossoNumero: nossoNumeroBase !== null
          ? String(nossoNumeroBase + idx).padStart(10, '0')
          : undefined,
        statusRemessa: 'nao_enviado' as const,
      }));
      
      console.log('[DEBUG] Criando', parcelasData.length, 'parcelas para acordo', acordoId);
      await createParcelas(parcelasData);
      console.log('[DEBUG] Parcelas criadas com sucesso', nossoNumeroBase ? `(nossoNumero: ${nossoNumeroBase}..${nossoNumeroBase + input.parcelas.length - 1})` : '(sem nossoNumero)');
      
      // Criar relacionamentos entre acordo e cobranças
      await createAcordoCobrancas(acordoId, input.cobrancaIds);
      
      // Atualizar status de todas as cobranças para 'em_acordo'
      const { updateCobranca } = await import("./db-cobrancas");
      for (const cobrancaId of input.cobrancaIds) {
        await updateCobranca(cobrancaId, { status: "em_acordo" });
      }
      
      await logAudit(ctx, { action: "create", entity: "acordo", entityId: String(acordoId), condominioId: input.condominioId, afterData: { devedorId: input.devedorId, totalAmount: input.totalAmount, agreedAmount: input.agreedAmount, installments: input.installments }, severity: "info" });
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
    })).mutation(async ({ input, ctx }) => {
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
      
      await logAudit(ctx, { action: "pay_parcela", entity: "parcela", entityId: String(input.parcelaId), afterData: { acordoId: parcela[0].acordoId, valorPago: valorPagoTotal, statusAcordo: todasPagas ? "pago" : "ativo" }, severity: "info" });
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

    // Gerar PDF do boleto para uma parcela de acordo
    gerarBoletoPDFParcela: protectedProcedure
      .input(z.object({ parcelaId: z.number() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

        const { parcelasAcordo, acordos } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { getDevedorById } = await import("./db-devedores");
        const { getConfiguracaoBoleto } = await import("./db-configuracao-boleto");
        const { getCondominioById } = await import("./db-condominios");
        const { gerarBoletoPDF, calcularCodigoBarras, calcularLinhaDigitavel, formatarLinhaDigitavel } = await import("./boleto-pdf");
        const { gerarPixCopiaCola } = await import("./pix-emv");
        const { storagePut } = await import("./storage");

        // Buscar parcela com dados do acordo
        const rows = await db
          .select()
          .from(parcelasAcordo)
          .innerJoin(acordos, eq(parcelasAcordo.acordoId, acordos.id))
          .where(eq(parcelasAcordo.id, input.parcelaId))
          .limit(1);

        if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Parcela não encontrada" });
        const parcela = rows[0].parcelasAcordo;
        const acordo = rows[0].acordos;

        if (!parcela.nossoNumero) throw new TRPCError({ code: "BAD_REQUEST", message: "Parcela sem nosso número — envie a remessa CNAB primeiro" });

        const devedor = await getDevedorById(acordo.devedorId);
        if (!devedor) throw new TRPCError({ code: "NOT_FOUND", message: "Devedor não encontrado" });

        const config = await getConfiguracaoBoleto(acordo.condominioId);
        if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Configuração de boleto não encontrada" });

        const condominio = await getCondominioById(acordo.condominioId);
        if (!condominio) throw new TRPCError({ code: "NOT_FOUND", message: "Condomínio não encontrado" });

        const dataVencimento = parcela.dueDate ? new Date(parcela.dueDate) : new Date();
        const dataEmissao = new Date();

        const instrucoes: string[] = [];
        if (config.instrucoesCaixa) {
          const taxa = parseFloat(config.taxaJurosDia || "0") * 30;
          const multa = parseFloat(config.taxaMulta || "0");
          instrucoes.push(
            config.instrucoesCaixa
              .replace(/#MULTA#/g, `${multa.toFixed(2)}%`)
              .replace(/#JUROS#/g, `${taxa.toFixed(4)}% ao dia`)
          );
        }
        instrucoes.push("Não receber após 30 dias do vencimento.");

        const nomeSacado = devedor.name ||
          `${devedor.bloco ? `Bloco ${devedor.bloco} — ` : ""}Unidade ${devedor.unitNumber}`;

        // Pix copia e cola: prioridade para o Bolepix retornado pelo banco (campo pixCopiaCola)
        // Fallback: gerar a partir da chave estática configurada (se habilitarPix e chavePix preenchidos)
        let pixCopiaCola: string | undefined = parcela.pixCopiaCola || undefined;
        if (!pixCopiaCola && config.habilitarPix && config.chavePix) {
          pixCopiaCola = gerarPixCopiaCola({
            chavePix: config.chavePix,
            nomeBeneficiario: config.nomeBeneficiario || condominio.name,
            cidade: condominio.city || "SAO PAULO",
            valor: parcela.amount, // já em centavos no banco (int)
            txid: parcela.nossoNumero || undefined,
            descricao: `Parcela ${parcela.nossoNumero}`,
          }) || undefined;
        }

        const dados = {
          nomeBeneficiario: config.nomeBeneficiario || condominio.name,
          cnpjBeneficiario: config.cnpjBeneficiario || condominio.cnpj || "",
          enderecoBeneficiario: config.enderecoBeneficiario || condominio.address || "",
          banco: config.banco,
          nomeBanco: config.nomeBanco,
          agencia: config.agencia,
          digitoAgencia: config.digitoAgencia,
          conta: config.conta,
          digitoConta: config.digitoConta,
          carteira: config.carteira,
          convenio: config.convenio,
          nossoNumero: parcela.nossoNumero,
          dataVencimento,
          dataEmissao,
          valor: parcela.amount, // já em centavos no banco (int)
          especieDocumento: config.especieDocumento,
          aceite: config.aceite,
          nomeSacado,
          cpfCnpjSacado: devedor.cpfCnpj || "",
          enderecoSacado: condominio.address || "",
          cidadeSacado: condominio.city || "",
          ufSacado: condominio.state || "",
          cepSacado: condominio.zipCode || "",
          localPagamento: config.localPagamento,
          instrucoes,
          seuNumero: parcela.nossoNumero,
          pixCopiaCola,
        };

        const pdfBuffer = await gerarBoletoPDF(dados);

        const fileKey = `boletos/${acordo.condominioId}/${parcela.nossoNumero}-${Date.now()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        const codigoBarras = calcularCodigoBarras(dados);
        const linhaDigitavel = formatarLinhaDigitavel(calcularLinhaDigitavel(codigoBarras));

        return {
          url,
          linhaDigitavel,
          codigoBarras,
          pixCopiaCola,
          nossoNumero: parcela.nossoNumero,
          valor: parcela.amount, // já em centavos no banco (int)
          vencimento: dataVencimento.toISOString(),
        };
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
    getParcelasVencidas: condominioAccessProcedure.input(z.object({
      condominioId: z.number().optional(),
    })).query(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return [];
      
      const { parcelasAcordo, acordos, devedores } = await import("../drizzle/schema");
      const { eq, and, lt } = await import("drizzle-orm");
      
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      
      const condominioId = ctx.user.role === "admin" 
        ? input.condominioId 
        : ctx.user.condominioId;
      
      const conditions = [
        eq(parcelasAcordo.status, "pendente"),
        lt(parcelasAcordo.dueDate, hoje),
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

    // Gerar relatório PDF do acordo para envio à administradora
    gerarRelatorioAdministradora: protectedProcedure
      .input(z.object({ acordoId: z.number() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

        const { acordos, parcelasAcordo, devedores, condominios } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { storagePut } = await import("./storage");

        // Buscar acordo com devedor e condomínio
        const acordoRows = await db
          .select({
            acordo: acordos,
            devedor: devedores,
            condominio: condominios,
          })
          .from(acordos)
          .innerJoin(devedores, eq(acordos.devedorId, devedores.id))
          .innerJoin(condominios, eq(acordos.condominioId, condominios.id))
          .where(eq(acordos.id, input.acordoId))
          .limit(1);

        if (!acordoRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Acordo não encontrado" });
        const { acordo, devedor, condominio } = acordoRows[0];

        // Verificar se o emissor é administradora ou outro (não emissão própria)
        const issuer = condominio.billingIssuer ?? "administradora";
        if (issuer === "emissao_propria") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este condomínio usa emissão própria — gere o boleto diretamente." });
        }

        const nomeEmissor = issuer === "outro" && condominio.customBillingIssuer
          ? condominio.customBillingIssuer
          : "Administradora";

        // Buscar parcelas do acordo
        const parcelas = await db
          .select()
          .from(parcelasAcordo)
          .where(eq(parcelasAcordo.acordoId, input.acordoId))
          .orderBy(parcelasAcordo.installmentNumber);

        // Gerar PDF simples com dados do acordo
        const PDFDocument = (await import("pdfkit")).default;
        const chunks: Buffer[] = [];
        const doc = new PDFDocument({ margin: 50, size: "A4" });
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));

        await new Promise<void>((resolve, reject) => {
          doc.on("end", resolve);
          doc.on("error", reject);

          const fmt = (v: number) =>
            new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v / 100);
          const fmtDate = (d: Date | null | undefined) =>
            d ? new Date(d).toLocaleDateString("pt-BR") : "—";

          // Cabeçalho
          doc.fontSize(18).font("Helvetica-Bold").text("Relatório de Acordo de Cobrança", { align: "center" });
          doc.fontSize(11).font("Helvetica").text(`Emissor: ${nomeEmissor}`, { align: "center" });
          doc.moveDown(0.5);
          doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
          doc.moveDown(0.5);

          // Dados do condomínio
          doc.fontSize(12).font("Helvetica-Bold").text("Condomínio");
          doc.fontSize(10).font("Helvetica")
            .text(`Nome: ${condominio.name}`)
            .text(`CNPJ: ${condominio.cnpj || "—"}`)
            .text(`Endereço: ${condominio.address || "—"}`);
          doc.moveDown(0.5);

          // Dados do devedor
          doc.fontSize(12).font("Helvetica-Bold").text("Devedor / Unidade");
          doc.fontSize(10).font("Helvetica")
            .text(`Nome: ${devedor.name || `Unidade ${devedor.unitNumber}`}`)
            .text(`CPF/CNPJ: ${devedor.cpfCnpj || "—"}`)
            .text(`Unidade: ${devedor.bloco ? `Bloco ${devedor.bloco} — ` : ""}${devedor.unitNumber}`)
            .text(`E-mail: ${devedor.email || "—"}`)
            .text(`Telefone: ${devedor.phone || "—"}`);
          doc.moveDown(0.5);

          // Dados do acordo
          doc.fontSize(12).font("Helvetica-Bold").text("Dados do Acordo");
          doc.fontSize(10).font("Helvetica")
            .text(`Acordo Nº: ${acordo.id}`)
            .text(`Data de criação: ${fmtDate(acordo.createdAt)}`)
            .text(`Valor total original: ${fmt(Number(acordo.totalAmount))}`)
            .text(`Valor acordado: ${fmt(Number(acordo.agreedAmount))}`)
            .text(`Número de parcelas: ${acordo.installments}`)
            .text(`Frequência: ${acordo.paymentFrequency}`)
            .text(`Status: ${acordo.status}`);
          if (acordo.notes) doc.text(`Observações: ${acordo.notes}`);
          doc.moveDown(0.5);

          // Tabela de parcelas
          doc.fontSize(12).font("Helvetica-Bold").text("Parcelas");
          doc.moveDown(0.3);

          // Cabeçalho da tabela
          const colX = [50, 120, 230, 340, 450];
          doc.fontSize(9).font("Helvetica-Bold");
          doc.text("Parc.", colX[0], doc.y, { continued: false });
          const headerY = doc.y - 12;
          doc.text("Parc.", colX[0], headerY);
          doc.text("Vencimento", colX[1], headerY);
          doc.text("Valor", colX[2], headerY);
          doc.text("Status", colX[3], headerY);
          doc.text("Pago em", colX[4], headerY);
          doc.moveDown(0.3);
          doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
          doc.moveDown(0.2);

          doc.fontSize(9).font("Helvetica");
          for (const p of parcelas) {
            const rowY = doc.y;
            doc.text(String(p.installmentNumber), colX[0], rowY);
            doc.text(fmtDate(p.dueDate), colX[1], rowY);
            doc.text(fmt(Number(p.amount)), colX[2], rowY);
            doc.text(p.status, colX[3], rowY);
            doc.text(p.paymentDate ? fmtDate(p.paymentDate) : "—", colX[4], rowY);
            doc.moveDown(0.6);
          }

          doc.moveDown(0.5);
          doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
          doc.moveDown(0.5);

          // Rodapé
          doc.fontSize(9).font("Helvetica").fillColor("gray")
            .text(`Gerado em: ${new Date().toLocaleString("pt-BR")} — Sistema de Gestão de Cobranças`, { align: "center" });

          doc.end();
        });

        const pdfBuffer = Buffer.concat(chunks);
        const fileKey = `relatorios-acordo/acordo-${input.acordoId}-${Date.now()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        return { url, nomeEmissor };
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
    // Listar usuários de um condomínio específico
    listByCondominio: adminProcedure
      .input(z.object({ condominioId: z.number() }))
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return [];
        const { users } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        return await db.select().from(users).where(eq(users.condominioId, input.condominioId));
      }),

    // Definir administrador principal do condomínio
    definirAdminPrincipal: adminProcedure
      .input(z.object({ userId: z.number(), condominioId: z.number() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const { users } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");

        // Verificar se o usuário pertence ao condomínio
        const target = await db.select().from(users)
          .where(and(eq(users.id, input.userId), eq(users.condominioId, input.condominioId)))
          .limit(1);
        if (!target.length) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado neste condomínio" });

        // Remover isPrimaryAdmin de todos os usuários do condomínio
        await db.update(users).set({ isPrimaryAdmin: 0 }).where(eq(users.condominioId, input.condominioId));
        // Definir o novo admin principal
        await db.update(users).set({ isPrimaryAdmin: 1 }).where(eq(users.id, input.userId));
        return { success: true };
      }),

    create: adminProcedure.input(z.object({
      name: z.string(),
      email: z.string().email(),
      password: z.string(),
      role: z.enum(["admin", "sindico", "cobrador"]),
      condominioId: z.number().optional(),
      isActive: z.number().optional(),
      isPrimaryAdmin: z.number().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verificar duplicidade de email
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
      if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "Já existe um usuário com este e-mail" });

      // Gerar hash da senha
      const bcrypt = await import("bcryptjs");
      const hashedPassword = await bcrypt.default.hash(input.password, 10);
      const openId = `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      // Se isPrimaryAdmin, remover flag dos demais do mesmo condomínio
      if (input.isPrimaryAdmin && input.condominioId) {
        await db.update(users).set({ isPrimaryAdmin: 0 }).where(eq(users.condominioId, input.condominioId));
      }

      const insertResult = await db.insert(users).values({
        openId,
        name: input.name,
        email: input.email,
        passwordHash: hashedPassword,
        loginMethod: "custom",
        role: input.role,
        condominioId: input.condominioId,
        isPrimaryAdmin: input.isPrimaryAdmin ?? 0,
        isActive: input.isActive ?? 1,
      });
      await logAudit(ctx, { action: "create", entity: "user", entityLabel: input.name, condominioId: input.condominioId, afterData: { name: input.name, email: input.email, role: input.role }, severity: "info" });
      return insertResult;
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      email: z.string().email().optional(),
      password: z.string().optional(),
      role: z.enum(["admin", "sindico", "cobrador"]).optional(),
      condominioId: z.number().optional(),
      isActive: z.number().optional(),
      isPrimaryAdmin: z.number().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, password, isPrimaryAdmin, condominioId, ...data } = input;

      let updateData: any = { ...data };
      if (condominioId !== undefined) updateData.condominioId = condominioId;
      if (isPrimaryAdmin !== undefined) updateData.isPrimaryAdmin = isPrimaryAdmin;

      if (password) {
        const bcrypt = await import("bcryptjs");
        const hashedPassword = await bcrypt.default.hash(password, 10);
        updateData.passwordHash = hashedPassword;
      }

      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      // Se definindo como admin principal, remover flag dos demais do condomínio
      if (isPrimaryAdmin === 1 && condominioId) {
        await db.update(users).set({ isPrimaryAdmin: 0 }).where(eq(users.condominioId, condominioId));
      }

      await db.update(users).set(updateData).where(eq(users.id, id));
      await logAudit(ctx, { action: "update", entity: "user", entityId: String(id), afterData: { name: input.name, role: input.role, isActive: input.isActive, isPrimaryAdmin: input.isPrimaryAdmin }, severity: isPrimaryAdmin === 1 ? "warning" : "info" });
      return { success: true };
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      // Proteger admin principal: não permitir exclusão sem substituição
      const target = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
      if (target.length && target[0].isPrimaryAdmin === 1) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Não é possível excluir o administrador principal. Defina outro usuário como administrador principal antes de excluir este.",
        });
      }

      await db.delete(users).where(eq(users.id, input.id));
      await logAudit(ctx, { action: "delete", entity: "user", entityId: String(input.id), severity: "critical" });
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
        nomeCompleto: z.string().optional(),
        cpfCnpj: z.string().optional(),
        email: z.string().optional(),
        telefone: z.string().optional(),
        unidade: z.string(),
        bloco: z.string().optional(),
        tipoCobranca: z.string().optional(),
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
          // Verificar se devedor já existe (apenas se CPF/CNPJ fornecido)
          const { getDevedorByCpfCnpj, getDevedorById } = await import("./db-devedores");
          let devedor = null;
          if (dado.cpfCnpj) {
            devedor = await getDevedorByCpfCnpj(dado.cpfCnpj, input.condominioId);
          }
          
          if (!devedor) {
            // Criar novo devedor
            const devedorResult = await createDevedor({
              condominioId: input.condominioId,
              name: dado.nomeCompleto || null,
              cpfCnpj: dado.cpfCnpj || null,
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
            // Mapear tipo de cobrança do texto para o enum do banco
            const tipoMap: Record<string, string> = {
              "cota condominial": "condominio",
              "condomínio": "condominio",
              "condominio": "condominio",
              "fundo de reserva": "cota_extra",
              "taxa extra": "cota_extra",
              "cota extra": "cota_extra",
              "multa": "multa",
              "acordo": "outros",
              "judicial": "outros",
              "salão de jogos": "salao_jogos",
              "salao jogos": "salao_jogos",
              "churrasqueira": "churrasqueira",
              "outros": "outros",
            };
            const tipoNormalizado = dado.tipoCobranca
              ? tipoMap[dado.tipoCobranca.toLowerCase().trim()] || "outros"
              : "condominio"; // padrão: cota condominial
            
            await createCobranca({
              condominioId: input.condominioId,
              devedorId: devedor.id,
              tipoCobranca: tipoNormalizado as any,
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
  
  // Exportação de relatórios para Excel
  exportacao: router({
    devedores: protectedProcedure.input(z.object({
      condominioId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { exportDevedores } = await import("./excel-export");
      const { getDevedoresByCondominio } = await import("./db-devedores");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const { condominios } = await import("../drizzle/schema");
      
      const condominioId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId;
      if (!condominioId) throw new TRPCError({ code: "BAD_REQUEST", message: "Condomínio não especificado" });
      
      const devedores = await getDevedoresByCondominio(condominioId);
      const allCondominios = await db.select().from(condominios);
      
      const buffer = await exportDevedores(devedores, allCondominios);
      return {
        success: true,
        base64: buffer.toString("base64"),
        filename: `devedores_${new Date().toISOString().split('T')[0]}.xlsx`
      };
    }),
    
    cobrancas: protectedProcedure.input(z.object({
      condominioId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { exportCobrancas } = await import("./excel-export");
      const { getCobrancasByCondominio } = await import("./db-cobrancas");
      const { getDevedoresByCondominio } = await import("./db-devedores");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const { condominios } = await import("../drizzle/schema");
      
      const condominioId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId;
      if (!condominioId) throw new TRPCError({ code: "BAD_REQUEST", message: "Condomínio não especificado" });
      
      const cobrancas = await getCobrancasByCondominio(condominioId);
      const devedores = await getDevedoresByCondominio(condominioId);
      const allCondominios = await db.select().from(condominios);
      
      const buffer = await exportCobrancas(cobrancas, devedores, allCondominios);
      return {
        success: true,
        base64: buffer.toString("base64"),
        filename: `cobrancas_${new Date().toISOString().split('T')[0]}.xlsx`
      };
    }),
    
    acordos: protectedProcedure.input(z.object({
      condominioId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { exportAcordos } = await import("./excel-export");
      const { getAcordosByCondominio } = await import("./db-acordos");
      const { getDevedoresByCondominio } = await import("./db-devedores");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const { condominios } = await import("../drizzle/schema");
      
      const condominioId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId;
      if (!condominioId) throw new TRPCError({ code: "BAD_REQUEST", message: "Condomínio não especificado" });
      
      const acordos = await getAcordosByCondominio(condominioId);
      const devedores = await getDevedoresByCondominio(condominioId);
      const allCondominios = await db.select().from(condominios);
      
      const buffer = await exportAcordos(acordos, devedores, allCondominios);
      return {
        success: true,
        base64: buffer.toString("base64"),
        filename: `acordos_${new Date().toISOString().split('T')[0]}.xlsx`
      };
    }),
    
    tentativas: protectedProcedure.input(z.object({
      condominioId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { exportTentativas } = await import("./excel-export");
      const { getTentativasByCondominio } = await import("./db-tentativas");
      const { getDevedorById } = await import("./db-devedores");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const { users } = await import("../drizzle/schema");
      
      const condominioId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId;
      if (!condominioId) throw new TRPCError({ code: "BAD_REQUEST", message: "Condomínio não especificado" });
      
      const tentativas = await getTentativasByCondominio(condominioId);
      const usuarios = await db.select().from(users);
      
      // Buscar devedores das tentativas
      const devedoresMap = new Map();
      for (const tentativa of tentativas) {
        if (!devedoresMap.has(tentativa.devedorId)) {
          const devedor = await getDevedorById(tentativa.devedorId);
          if (devedor) devedoresMap.set(tentativa.devedorId, devedor);
        }
      }
      const devedores = Array.from(devedoresMap.values());
      
      const buffer = await exportTentativas(tentativas, devedores, usuarios);
      return {
        success: true,
        base64: buffer.toString("base64"),
        filename: `tentativas_${new Date().toISOString().split('T')[0]}.xlsx`
      };
    }),
    
    vencimentos: protectedProcedure.input(z.object({
      dias: z.number(),
      condominioId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { exportVencimentos } = await import("./excel-export");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const { parcelasAcordo, acordos, devedores, condominios } = await import("../drizzle/schema");
      const { eq, and, gte, lte } = await import("drizzle-orm");
      
      const hoje = new Date();
      const dataLimite = new Date();
      dataLimite.setDate(hoje.getDate() + input.dias);
      
      const condominioId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId;
      
      const conditions = [
        eq(parcelasAcordo.status, "pendente"),
        gte(parcelasAcordo.dueDate, hoje),
        lte(parcelasAcordo.dueDate, dataLimite),
      ];
      
      if (condominioId) {
        conditions.push(eq(devedores.condominioId, condominioId));
      }
      
      const parcelas = await db.select({
        id: parcelasAcordo.id,
        numeroParcela: parcelasAcordo.installmentNumber,
        valorParcela: parcelasAcordo.amount,
        dataVencimento: parcelasAcordo.dueDate,
        status: parcelasAcordo.status,
        acordoId: acordos.id,
        devedorNome: devedores.name,
        devedorTelefone: devedores.phone,
        condominioNome: condominios.name,
      })
      .from(parcelasAcordo)
      .innerJoin(acordos, eq(parcelasAcordo.acordoId, acordos.id))
      .innerJoin(devedores, eq(acordos.devedorId, devedores.id))
      .innerJoin(condominios, eq(devedores.condominioId, condominios.id))
      .where(and(...conditions))
      .orderBy(parcelasAcordo.dueDate);
      
      const buffer = await exportVencimentos(parcelas, input.dias);
      return {
        success: true,
        base64: buffer.toString("base64"),
        filename: `vencimentos_${input.dias}dias_${new Date().toISOString().split('T')[0]}.xlsx`
      };
    }),
  }),

  // ===== REGUA DE COBRANCA =====
  regua: router({
    list: protectedProcedure
      .input(z.object({ condominioId: z.number() }))
      .query(async ({ input }) => {
        const { listReguasByCondominio } = await import("./db-reguas");
        return listReguasByCondominio(input.condominioId);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getReguaById } = await import("./db-reguas");
        return getReguaById(input.id);
      }),

    create: adminProcedure
      .input(z.object({
        condominioId: z.number(),
        nome: z.string().min(1),
        descricao: z.string().optional(),
        tipoCobranca: z.enum(["todos", "condominio", "salao_jogos", "churrasqueira", "cota_extra", "multa", "outros"]).optional(),
        ativa: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { createRegua } = await import("./db-reguas");
        const id = await createRegua(input);
        return { id };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(1).optional(),
        descricao: z.string().optional(),
        tipoCobranca: z.enum(["todos", "condominio", "salao_jogos", "churrasqueira", "cota_extra", "multa", "outros"]).optional(),
        ativa: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { updateRegua } = await import("./db-reguas");
        const { id, ...data } = input;
        await updateRegua(id, data);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteRegua } = await import("./db-reguas");
        await deleteRegua(input.id);
        return { success: true };
      }),

    createPosicao: adminProcedure
      .input(z.object({
        reguaId: z.number(),
        diasInadimplencia: z.number(),
        tipoAcao: z.enum(["whatsapp", "email", "sms", "carta", "ligacao", "notificacao_interna"]),
        titulo: z.string().min(1),
        template: z.string().optional(),
        ordem: z.number().optional(),
        ativa: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { createPosicao } = await import("./db-reguas");
        const id = await createPosicao(input);
        return { id };
      }),

    updatePosicao: adminProcedure
      .input(z.object({
        id: z.number(),
        diasInadimplencia: z.number().optional(),
        tipoAcao: z.enum(["whatsapp", "email", "sms", "carta", "ligacao", "notificacao_interna"]).optional(),
        titulo: z.string().min(1).optional(),
        template: z.string().optional(),
        ordem: z.number().optional(),
        ativa: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { updatePosicao } = await import("./db-reguas");
        const { id, ...data } = input;
        await updatePosicao(id, data);
        return { success: true };
      }),

    deletePosicao: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deletePosicao } = await import("./db-reguas");
        await deletePosicao(input.id);
        return { success: true };
      }),

    executar: adminProcedure
      .input(z.object({ reguaId: z.number(), condominioId: z.number() }))
      .mutation(async ({ input }) => {
        const { executarRegua } = await import("./db-reguas");
        return executarRegua(input.reguaId, input.condominioId);
      }),

    getDisparos: protectedProcedure
      .input(z.object({ reguaId: z.number(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        const { getDisparosByRegua } = await import("./db-reguas");
        return getDisparosByRegua(input.reguaId, input.limit);
      }),

    getDisparosByCondominio: protectedProcedure
      .input(z.object({ condominioId: z.number(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        const { getDisparosByCondominio } = await import("./db-reguas");
        return getDisparosByCondominio(input.condominioId, input.limit);
      }),
  }),

  // ===== IMPORTACOES =====
  importacoes: router({
    list: protectedProcedure
      .input(z.object({ condominioId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const { listarHistoricoImportacoes } = await import("./db-importacoes");
        const condId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId ?? undefined;
        return listarHistoricoImportacoes(condId);
      }),

    baixaEmLote: adminProcedure
      .input(z.object({
        condominioId: z.number(),
        csvConteudo: z.string(),
        nomeArquivo: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { parsearCSVBaixaLote, executarBaixaEmLote, criarHistoricoImportacao, atualizarHistoricoImportacao } = await import("./db-importacoes");
        const itens = parsearCSVBaixaLote(input.csvConteudo);
        const [hist] = await criarHistoricoImportacao({
          condominioId: input.condominioId,
          usuarioId: ctx.user.id,
          tipo: "baixa_lote",
          nomeArquivo: input.nomeArquivo,
          totalRegistros: itens.length,
          status: "processando",
        }) as any;
        const resultado = await executarBaixaEmLote(itens, input.condominioId, ctx.user.id);
        await atualizarHistoricoImportacao(hist?.insertId ?? 0, {
          status: resultado.erros === itens.length && itens.length > 0 ? "erro" : "concluido",
          registrosSucesso: resultado.sucesso,
          registrosErro: resultado.erros,
          detalhesErros: JSON.stringify(resultado.detalhes.filter(d => d.status === "erro")),
        });
        return resultado;
      }),

    alterarStatusEmLote: condominioAccessProcedure
      .input(z.object({
        condominioId: z.number(),
        cobrancaIds: z.array(z.number()).min(1).max(500),
        novoStatus: z.enum(["pendente", "em_cobranca", "pago", "acordo", "em_acordo", "acordo_atrasado", "em_negociacao", "suspenso", "judicial", "cancelado"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const { alterarStatusEmLote } = await import("./db-importacoes");
        const condId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;
        return alterarStatusEmLote(input.cobrancaIds, input.novoStatus as any, condId);
      }),
  }),

  // ===== CNAB 240 =====
  cnab: router({
    // ---- Configuração de Boleto (Portador + Dados do Boleto + Arquivo) ----
    getConfiguracaoBoleto: condominioAccessProcedure
      .input(z.object({ condominioId: z.number() }))
      .query(async ({ input, ctx }) => {
        const condId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;
        const { getConfiguracaoBoleto } = await import("./db-configuracao-boleto");
        return await getConfiguracaoBoleto(condId);
      }),

    salvarConfiguracaoBoleto: condominioAccessProcedure
      .input(z.object({
        condominioId: z.number(),
        // Portador
        banco: z.string().default("208"),
        nomeBanco: z.string().default("BTG PACTUAL"),
        agencia: z.string(),
        digitoAgencia: z.string().default("0"),
        conta: z.string(),
        digitoConta: z.string().default("0"),
        convenio: z.string().default(""),
        ativo: z.number().default(1),
        contaRepasse: z.number().default(0),
        // Configuração de remessa
        minimosDiasAntesVencimento: z.number().default(0),
        usarMinimoDias: z.number().default(0),
        enviarParcelasApenasPrimeiraPaga: z.number().default(0),
        enviarParcelasApenasAnteriorPaga: z.number().default(1),
        // Dados do boleto
        carteira: z.string().default("1"),
        especieDocumento: z.string().default("DD"),
        aceite: z.string().default("N"),
        nomeBeneficiario: z.string().optional(),
        cnpjBeneficiario: z.string().optional(),
        enderecoBeneficiario: z.string().optional(),
        localPagamento: z.string().default("PAGAVEL EM QUALQUER BANCO ATE O VENCIMENTO"),
        instrucoesCaixa: z.string().default("APOS VENCIMENTO COBRAR MULTA DE #MULTA# e MORA DIARIA DE #JUROS#"),
        taxaJurosDia: z.string().default("0.03330"),
        taxaMulta: z.string().default("2.00"),
        // Configuração do arquivo
        padraoNomeArquivo: z.string().default("BTG_ddmmyyyy.txt"),
        layoutArquivo: z.string().default("CNAB240"),
        enviarInstrucoesProtesto: z.number().default(0),
        // Forma de pagamento
        habilitarBoleto: z.number().default(1),
        habilitarPix: z.number().default(1),
        chavePix: z.string().optional(),
        tipoChavePix: z.enum(["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"]).optional(),
        taxaCobrancaValor: z.string().default("3.50"),
        taxaCobrancaPercentual: z.string().default("0.00"),
        despesaValor: z.string().default("0.00"),
        despesaPercentual: z.string().default("0.00"),
      }))
      .mutation(async ({ input, ctx }) => {
        const condId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;
        const { upsertConfiguracaoBoleto } = await import("./db-configuracao-boleto");
        const { condominioId: _cid, ...data } = input;
        return await upsertConfiguracaoBoleto(condId, data);
      }),

    // Marcar cobranças como enviadas ao banco após envio da remessa
    marcarComoEnviado: protectedProcedure
      .input(z.object({
        cobrancaIds: z.array(z.number()).min(1),
        remessaId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await import("./db").then(m => m.getDb());
        if (!db) throw new Error("Database not available");
        const { inArray } = await import("drizzle-orm");
        const { cobrancas } = await import("../drizzle/schema");
        await db.update(cobrancas)
          .set({
            statusRemessa: "enviado",
            ...(input.remessaId ? { remessaId: input.remessaId } : {}),
          })
          .where(inArray(cobrancas.id, input.cobrancaIds));
        return { updated: input.cobrancaIds.length };
      }),

    // Upload de PDF de boleto vinculado a uma cobrança
    uploadBoleto: protectedProcedure
      .input(z.object({
        cobrancaId: z.number(),
        condominioId: z.number(),
        nomeArquivo: z.string(),
        conteudoBase64: z.string(), // arquivo em base64
        tamanhoBytes: z.number().optional(),
        mimeType: z.string().default("application/pdf"),
      }))
      .mutation(async ({ input, ctx }) => {
        const { storagePut } = await import("./storage");
        const { boletosUpload } = await import("../drizzle/schema");
        const db = await import("./db").then(m => m.getDb());
        if (!db) throw new Error("Database not available");
        // Converter base64 para Buffer
        const buffer = Buffer.from(input.conteudoBase64, "base64");
        const suffix = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
        const fileKey = `boletos/${input.condominioId}/${input.cobrancaId}/${suffix}-${input.nomeArquivo}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        const [result] = await db.insert(boletosUpload).values({
          cobrancaId: input.cobrancaId,
          condominioId: input.condominioId,
          nomeArquivo: input.nomeArquivo,
          urlS3: url,
          fileKey,
          tamanhoBytes: input.tamanhoBytes ?? buffer.length,
          mimeType: input.mimeType,
          uploadedBy: ctx.user.id,
          uploadedByName: ctx.user.name ?? ctx.user.email,
        });
        return { id: (result as any).insertId, url, fileKey };
      }),

    // Listar boletos de uma cobrança
    listarBoletos: protectedProcedure
      .input(z.object({ cobrancaId: z.number() }))
      .query(async ({ input }) => {
        const db = await import("./db").then(m => m.getDb());
        if (!db) return [];
        const { eq, desc } = await import("drizzle-orm");
        const { boletosUpload } = await import("../drizzle/schema");
        return db.select().from(boletosUpload)
          .where(eq(boletosUpload.cobrancaId, input.cobrancaId))
          .orderBy(desc(boletosUpload.createdAt));
      }),

    // Listar todos os boletos de um devedor (join com cobranças)
    listarBoletosPorDevedor: protectedProcedure
      .input(z.object({ devedorId: z.number() }))
      .query(async ({ input }) => {
        const db = await import("./db").then(m => m.getDb());
        if (!db) return [];
        const { eq, desc } = await import("drizzle-orm");
        const { boletosUpload, cobrancas } = await import("../drizzle/schema");
        // Buscar cobranças do devedor
        const cobsDoDevedor = await db.select({
          id: cobrancas.id,
          description: cobrancas.description,
          amount: cobrancas.amount,
          dueDate: cobrancas.dueDate,
          status: cobrancas.status,
          monthReference: cobrancas.monthReference,
          tipoCobranca: cobrancas.tipoCobranca,
        }).from(cobrancas)
          .where(eq(cobrancas.devedorId, input.devedorId));
        if (cobsDoDevedor.length === 0) return [];
        const cobrancaIds = cobsDoDevedor.map(c => c.id);
        // Buscar boletos dessas cobranças
        const { inArray } = await import("drizzle-orm");
        const boletos = await db.select().from(boletosUpload)
          .where(inArray(boletosUpload.cobrancaId, cobrancaIds))
          .orderBy(desc(boletosUpload.createdAt));
        // Enriquecer com dados da cobrança
        const cobsMap = new Map(cobsDoDevedor.map(c => [c.id, c]));
        return boletos.map(b => ({
          ...b,
          cobranca: cobsMap.get(b.cobrancaId) ?? null,
        }));
      }),

    // Deletar boleto
    deletarBoleto: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await import("./db").then(m => m.getDb());
        if (!db) throw new Error("Database not available");
        const { eq } = await import("drizzle-orm");
        const { boletosUpload } = await import("../drizzle/schema");
        await db.delete(boletosUpload).where(eq(boletosUpload.id, input.id));
        return { deleted: true };
      }),

    listarRemessas: protectedProcedure
      .input(z.object({ condominioId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { listarRemessasCNAB } = await import("./db-cnab");
        const condId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;
        return listarRemessasCNAB(condId);
      }),

    listarRetornos: protectedProcedure
      .input(z.object({ condominioId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { listarRetornosCNAB } = await import("./db-cnab");
        const condId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;
        return listarRetornosCNAB(condId);
      }),

    gerarRemessa: condominioAccessProcedure
      .input(z.object({
        condominioId: z.number(),
        cobrancaIds: z.array(z.number()).min(1).max(1000),
        // dadosBanco agora e opcional: se omitido, usa a configuracao salva do condominio
        dadosBanco: z.object({
          codigoBanco: z.string().default("208"),
          agencia: z.string(),
          digitoAgencia: z.string(),
          conta: z.string(),
          digitoConta: z.string(),
          convenio: z.string(),
          cedente: z.string(),
          cnpjCedente: z.string(),
        }).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await import("./db").then(m => m.getDb());
        if (!db) throw new Error("Database not available");
        const { eq, and, inArray } = await import("drizzle-orm");
        const { cobrancas, devedores, condominios } = await import("../drizzle/schema");
        const condId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;

        // Buscar configuracao de boleto salva
        const { getConfiguracaoBoleto, configParaDadosBanco, gerarNomeArquivoRemessa, incrementarSequencialArquivo } = await import("./db-configuracao-boleto");
        const configBoleto = await getConfiguracaoBoleto(condId);

        // Buscar nome do condominio para fallback
        const [cond] = await db.select().from(condominios).where(eq(condominios.id, condId)).limit(1);
        const nomeCondominio = cond?.name || "CONDOMINIO";

        // Resolver dados bancarios: prioridade = config salva > input manual
        const dadosBanco = configBoleto
          ? configParaDadosBanco(configBoleto, nomeCondominio)
          : input.dadosBanco;

        if (!dadosBanco) throw new Error("Dados bancarios nao configurados. Configure o portador bancario antes de gerar remessa.");

        // Validar CNPJ do beneficiario — obrigatorio para o BTG aceitar o arquivo
        const cnpjLimpo = dadosBanco.cnpjCedente?.replace(/[.\-\/]/g, "").trim();
        if (!cnpjLimpo || cnpjLimpo === "00000000000000" || cnpjLimpo.length < 11) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "CNPJ/CPF do beneficiario nao configurado. Acesse Banco > Configuracao de Boleto, aba Portador, e preencha o campo CNPJ/CPF Beneficiario antes de gerar a remessa.",
          });
        }

        const cobList = await db.select().from(cobrancas)
          .where(and(inArray(cobrancas.id, input.cobrancaIds), eq(cobrancas.condominioId, condId)));

        const devList = await db.select().from(devedores).where(eq(devedores.condominioId, condId));
        const devMap = new Map(devList.map(d => [d.id, d]));

        const { gerarArquivoRemessaCNAB240, criarRemessaCNAB } = await import("./db-cnab");

        // Incrementar sequencial e obter nosso numero inicial
        let nossoNumeroBase = 1000000001;
        let numeroRemessa = 1;
        if (configBoleto) {
          const seq = await incrementarSequencialArquivo(condId, cobList.length);
          nossoNumeroBase = seq.nossoNumeroInicio;
          numeroRemessa = seq.numeroSequencial;
        } else {
          const { listarRemessasCNAB: listRemessas } = await import("./db-cnab");
          const remessas = await listRemessas(condId);
          numeroRemessa = remessas.length + 1;
        }

        // Converter taxas da config para centavos
        const taxaJurosDia = configBoleto
          ? Math.round(parseFloat(configBoleto.taxaJurosDia) * 100)
          : 33; // 0,033% ao dia = 1% ao mes
        const taxaMulta = configBoleto
          ? Math.round(parseFloat(configBoleto.taxaMulta) * 100)
          : 200; // 2,00%
        const instrucoesCaixa = configBoleto?.instrucoesCaixa
          .replace("#MULTA#", `${configBoleto.taxaMulta}%`)
          .replace("#JUROS#", `${configBoleto.taxaJurosDia}% ao dia`)
          || "COBRAR JUROS DE 1% AO MES";

        const titulos = cobList.map((cob, idx) => {
          const dev = devMap.get(cob.devedorId);
          const nossoNum = cob.nossoNumero || String(nossoNumeroBase + idx).padStart(10, "0");
          return {
            cobrancaId: cob.id,
            nossoNumero: nossoNum,
            devedorNome: dev?.name || "NAO INFORMADO",
            devedorCpfCnpj: dev?.cpfCnpj || "00000000000",
            devedorEndereco: `Unidade ${dev?.unitNumber || "S/N"} ${dev?.bloco ? "Bloco " + dev.bloco : ""}`.trim(),
            devedorCidade: "SAO PAULO",
            devedorUF: "SP",
            devedorCEP: "01310100",
            valorNominal: cob.amount,
            dataVencimento: cob.dueDate ? new Date(cob.dueDate) : new Date(),
            dataEmissao: new Date(cob.createdAt),
            instrucao1: instrucoesCaixa,
            instrucao2: "",
            carteira: configBoleto?.carteira || "1",
            especieDocumento: configBoleto?.especieDocumento || "12",
            aceite: configBoleto?.aceite || "N",
            taxaJurosDia,
            taxaMulta,
            enviarProtesto: configBoleto ? configBoleto.enviarInstrucoesProtesto === 1 : false,
          };
        });

        const conteudo = gerarArquivoRemessaCNAB240(dadosBanco, titulos, numeroRemessa);
        const valorTotal = cobList.reduce((s, c) => s + c.amount, 0);

        // Nome do arquivo conforme padrao configurado
        const nomeArquivo = configBoleto
          ? gerarNomeArquivoRemessa(configBoleto.padraoNomeArquivo)
          : `remessa_cnab240_${condId}_${Date.now()}.rem`;

        await criarRemessaCNAB({
          condominioId: condId,
          usuarioId: ctx.user.id,
          banco: dadosBanco.codigoBanco,
          nomeArquivo,
          totalTitulos: titulos.length,
          valorTotal,
          nossoNumeroInicio: titulos[0]?.nossoNumero,
          nossoNumeroFim: titulos[titulos.length - 1]?.nossoNumero,
          status: "gerado",
        });

        // Salvar nossoNumero e marcar cobranças como "remessa_gerada"
        // IMPORTANTE: salvar o nossoNumero individualmente para cada cobrança
        // pois é necessário para gerar o PDF do boleto e processar o arquivo de retorno
        for (const titulo of titulos) {
          await db.update(cobrancas)
            .set({
              nossoNumero: titulo.nossoNumero,
              statusRemessa: "remessa_gerada",
            })
            .where(eq(cobrancas.id, titulo.cobrancaId));
        }

        return {
          nomeArquivo,
          conteudo,
          totalTitulos: titulos.length,
          valorTotal,
        };
      }),

    processarRetorno: condominioAccessProcedure
      .input(z.object({
        condominioId: z.number(),
        nomeArquivo: z.string(),
        conteudo: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const condId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;
        const { parseRetornoCNAB240, determinarNovoStatus } = await import("./db-cnab-retorno");
        const { criarRetornoCNAB } = await import("./db-cnab");
        const { gerarPixCopiaCola } = await import("./pix-emv");
        const { getConfiguracaoBoleto } = await import("./db-configuracao-boleto");
        const { getCondominioById } = await import("./db-condominios");
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { cobrancas, parcelasAcordo, acordos, retornoItens, retornosCNAB } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");

        // Parsear o arquivo de retorno com o layout real do BTG (Segmentos T e U)
        const retorno = parseRetornoCNAB240(input.conteudo);

        let pagos = 0;
        let entradas = 0;
        let cancelados = 0;
        let naoEncontrados = 0;
        let valorTotalPago = 0;

        // Criar registro do retorno no banco
        const [retornoResult] = await db.insert(retornosCNAB).values({
          condominioId: condId,
          usuarioId: ctx.user.id,
          banco: "BTG",
          nomeArquivo: input.nomeArquivo,
          totalTitulos: retorno.pares.length,
          titulosPagos: 0, // será atualizado ao final
          titulosRejeitados: 0,
          valorTotalPago: 0,
          detalhes: "{}",
        });
        const retornoId = (retornoResult as any).insertId as number;

        const itensParaInserir: any[] = [];

        for (const par of retorno.pares) {
          const { segmentoT, segmentoU } = par;
          const nossoNumero = segmentoT.nossoNumero;
          const novoStatus = determinarNovoStatus(segmentoT.codMovimento, segmentoT.codOcorrencia);
          const valorPago = segmentoU.valorPago || 0;
          const dataVencimento = segmentoT.dataVencimento ? new Date(segmentoT.dataVencimento) : null;
          const dataOcorrencia = segmentoU.dataOcorrencia ? new Date(segmentoU.dataOcorrencia) : null;
          const dataCredito = segmentoU.dataCredito ? new Date(segmentoU.dataCredito) : null;

          let cobrancaId: number | null = null;
          let statusAnterior: string | null = null;
          let statusProcessamento: "processado" | "nao_encontrado" | "erro" = "nao_encontrado";
          let observacao = "";

          // 1. Buscar cobrança avulsa pelo nosso número
          const [cobranca] = await db
            .select()
            .from(cobrancas)
            .where(and(
              eq(cobrancas.nossoNumero, nossoNumero),
              eq(cobrancas.condominioId, condId)
            ))
            .limit(1);

          if (cobranca) {
            cobrancaId = cobranca.id;
            statusAnterior = cobranca.status;

            if (novoStatus && cobranca.status !== novoStatus) {
              const updateData: Record<string, any> = { status: novoStatus };
              if (novoStatus === "pago") {
                updateData.paidAt = dataCredito || dataOcorrencia || new Date();
                updateData.paidAmount = valorPago || cobranca.amount;
                valorTotalPago += valorPago;
                pagos++;
              } else if (novoStatus === "em_cobranca") {
                entradas++;
              } else if (novoStatus === "cancelado") {
                cancelados++;
              }
              // Salvar Pix copia e cola do Bolepix (Segmento Y-04) se presente
              if (par.segmentoY04?.chavePix) {
                const configBoleto = await getConfiguracaoBoleto(condId);
                const condominio = await getCondominioById(condId);
                const nomeBenef = configBoleto?.nomeBeneficiario || condominio?.name || "Beneficiario";
                const pixEMV = gerarPixCopiaCola({
                  chavePix: par.segmentoY04.chavePix,
                  nomeBeneficiario: nomeBenef,
                  cidade: condominio?.city || "SAO PAULO",
                  valor: cobranca.amount,
                  txid: par.segmentoY04.txid || cobranca.nossoNumero || undefined,
                });
                updateData.pixCopiaCola = pixEMV;
              }
              await db.update(cobrancas).set(updateData).where(eq(cobrancas.id, cobranca.id));
              statusProcessamento = "processado";
              observacao = `Status alterado de '${statusAnterior}' para '${novoStatus}'`;
            } else if (cobranca.status === novoStatus) {
              // Mesmo sem mudar status, salvar Pix copia e cola se vier no retorno
              if (par.segmentoY04?.chavePix && !cobranca.pixCopiaCola) {
                const configBoleto = await getConfiguracaoBoleto(condId);
                const condominio = await getCondominioById(condId);
                const nomeBenef = configBoleto?.nomeBeneficiario || condominio?.name || "Beneficiario";
                const pixEMV = gerarPixCopiaCola({
                  chavePix: par.segmentoY04.chavePix,
                  nomeBeneficiario: nomeBenef,
                  cidade: condominio?.city || "SAO PAULO",
                  valor: cobranca.amount,
                  txid: par.segmentoY04.txid || cobranca.nossoNumero || undefined,
                });
                await db.update(cobrancas).set({ pixCopiaCola: pixEMV }).where(eq(cobrancas.id, cobranca.id));
              }
              statusProcessamento = "processado";
              observacao = `Status já era '${novoStatus}' — sem alteração`;
            } else {
              statusProcessamento = "processado";
              observacao = `Ocorrência '${segmentoT.descOcorrencia}' registrada`;
            }
          } else {
            // 2. Buscar parcela de acordo pelo nosso número
            const [parcela] = await db
              .select({
                id: parcelasAcordo.id,
                acordoId: parcelasAcordo.acordoId,
                amount: parcelasAcordo.amount,
                status: parcelasAcordo.status,
              })
              .from(parcelasAcordo)
              .innerJoin(acordos, eq(parcelasAcordo.acordoId, acordos.id))
              .where(and(
                eq(parcelasAcordo.nossoNumero, nossoNumero),
                eq(acordos.condominioId, condId)
              ))
              .limit(1);

            if (parcela) {
              statusAnterior = parcela.status;

              // Gerar e salvar Pix copia e cola do Bolepix (Segmento Y-04) se presente
              let pixEMVParcela: string | undefined;
              if (par.segmentoY04?.chavePix) {
                const configBoleto = await getConfiguracaoBoleto(condId);
                const condominio = await getCondominioById(condId);
                const nomeBenef = configBoleto?.nomeBeneficiario || condominio?.name || "Beneficiario";
                pixEMVParcela = gerarPixCopiaCola({
                  chavePix: par.segmentoY04.chavePix,
                  nomeBeneficiario: nomeBenef,
                  cidade: condominio?.city || "SAO PAULO",
                  valor: parcela.amount,
                  txid: par.segmentoY04.txid || nossoNumero || undefined,
                });
              }

              if (novoStatus === "pago" && parcela.status !== "pago") {
                const dataPag = dataCredito || dataOcorrencia || new Date();
                await db.update(parcelasAcordo).set({
                  status: "pago",
                  paymentDate: dataPag,
                  statusRemessa: "retorno_recebido",
                  ...(pixEMVParcela ? { pixCopiaCola: pixEMVParcela } : {}),
                }).where(eq(parcelasAcordo.id, parcela.id));

                // Verificar se todas as parcelas do acordo foram pagas
                const todasParcelas = await db
                  .select({ status: parcelasAcordo.status })
                  .from(parcelasAcordo)
                  .where(eq(parcelasAcordo.acordoId, parcela.acordoId));
                if (todasParcelas.every(p => p.status === "pago")) {
                  await db.update(acordos).set({ status: "pago" }).where(eq(acordos.id, parcela.acordoId));
                }

                valorTotalPago += valorPago;
                pagos++;
                statusProcessamento = "processado";
                observacao = "Parcela de acordo baixada";
              } else if (novoStatus === "em_cobranca") {
                await db.update(parcelasAcordo).set({
                  statusRemessa: "enviado",
                  ...(pixEMVParcela ? { pixCopiaCola: pixEMVParcela } : {}),
                }).where(eq(parcelasAcordo.id, parcela.id));
                entradas++;
                statusProcessamento = "processado";
                observacao = "Entrada confirmada para parcela de acordo";
              } else {
                if (pixEMVParcela) {
                  await db.update(parcelasAcordo).set({ pixCopiaCola: pixEMVParcela }).where(eq(parcelasAcordo.id, parcela.id));
                }
                statusProcessamento = "processado";
                observacao = `Ocorrência '${segmentoT.descOcorrencia}' registrada para parcela de acordo`;
              }
            } else {
              naoEncontrados++;
              statusProcessamento = "nao_encontrado";
              observacao = `Título com nosso número '${nossoNumero}' não encontrado no sistema`;
            }
          }

          // Extrair dados do Bolepix (Segmento Y-04), se presente
          const segY04 = par.segmentoY04;

          itensParaInserir.push({
            retornoId,
            cobrancaId,
            nossoNumero,
            codMovimento: segmentoT.codMovimento,
            descMovimento: segmentoT.descMovimento,
            codOcorrencia: segmentoT.codOcorrencia || null,
            descOcorrencia: segmentoT.descOcorrencia || null,
            dataVencimento,
            valorTitulo: segmentoT.valorTitulo,
            valorPago,
            dataOcorrencia,
            dataCredito,
            cpfCnpjPagador: segmentoT.cpfCnpjPagador || null,
            nomePagador: segmentoT.nomePagador || null,
            statusProcessamento,
            statusAnterior,
            statusNovo: novoStatus,
            observacao,
            // Dados do Bolepix (Segmento Y-04)
            pixTipoChave: segY04?.descTipoChavePix || null,
            pixChave: segY04?.chavePix || null,
            pixTxid: segY04?.txid || null,
          });
        }

        // Inserir todos os itens
        if (itensParaInserir.length > 0) {
          await db.insert(retornoItens).values(itensParaInserir);
        }

        // Atualizar totais do retorno
        await db.update(retornosCNAB).set({
          titulosPagos: pagos,
          titulosRejeitados: naoEncontrados,
          valorTotalPago,
          detalhes: JSON.stringify({ entradas, pagos, cancelados, naoEncontrados }),
        }).where(eq(retornosCNAB.id, retornoId));

        return {
          retornoId,
          totalTitulos: retorno.pares.length,
          entradas,
          pagos,
          cancelados,
          naoEncontrados,
          valorTotalPago,
          dataGeracao: retorno.header.dataGeracao,
          horaGeracao: retorno.header.horaGeracao,
        };
      }),

    listarItensRetorno: condominioAccessProcedure
      .input(z.object({ retornoId: z.number(), condominioId: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { retornoItens, retornosCNAB } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const condId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;

        // Verificar que o retorno pertence ao condomínio
        const [retorno] = await db.select().from(retornosCNAB)
          .where(and(eq(retornosCNAB.id, input.retornoId), eq(retornosCNAB.condominioId, condId)))
          .limit(1);
        if (!retorno) throw new TRPCError({ code: "NOT_FOUND", message: "Retorno não encontrado" });

        return db.select().from(retornoItens)
          .where(eq(retornoItens.retornoId, input.retornoId))
          .orderBy(retornoItens.id);
      }),

    // Lista parcelas de acordo pendentes de remessa (statusRemessa = nao_enviado)
    listarParcelasParaRemessa: condominioAccessProcedure
      .input(z.object({
        condominioId: z.number(),
        diasAVencer: z.number().min(1).max(365).default(30),
      }))
      .query(async ({ input, ctx }) => {
        const condId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { parcelasAcordo, acordos, devedores } = await import("../drizzle/schema");
        const { eq, and, lte, isNull, or } = await import("drizzle-orm");

        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() + input.diasAVencer);

        const rows = await db
          .select({
            parcelaId: parcelasAcordo.id,
            acordoId: parcelasAcordo.acordoId,
            installmentNumber: parcelasAcordo.installmentNumber,
            amount: parcelasAcordo.amount,
            dueDate: parcelasAcordo.dueDate,
            nossoNumero: parcelasAcordo.nossoNumero,
            statusRemessa: parcelasAcordo.statusRemessa,
            remessaId: parcelasAcordo.remessaId,
            statusParcela: parcelasAcordo.status,
            devedorId: devedores.id,
            devedorNome: devedores.name,
            devedorCpfCnpj: devedores.cpfCnpj,
            devedorPhone: devedores.phone,
            condominioId: acordos.condominioId,
          })
          .from(parcelasAcordo)
          .innerJoin(acordos, eq(parcelasAcordo.acordoId, acordos.id))
          .innerJoin(devedores, eq(acordos.devedorId, devedores.id))
          .where(
            and(
              eq(acordos.condominioId, condId),
              eq(acordos.status, "ativo"),
              eq(parcelasAcordo.status, "pendente"),
              or(
                isNull(parcelasAcordo.statusRemessa),
                eq(parcelasAcordo.statusRemessa, "nao_enviado")
              ),
              lte(parcelasAcordo.dueDate, dataLimite)
            )
          )
          .orderBy(parcelasAcordo.dueDate);

        return rows;
      }),

    // Gera arquivo de remessa CNAB 240 a partir de parcelas de acordo selecionadas
    gerarRemessaAcordos: condominioAccessProcedure
      .input(z.object({
        condominioId: z.number(),
        parcelaIds: z.array(z.number()).min(1).max(500),
      }))
      .mutation(async ({ input, ctx }) => {
        const condId = ctx.user.role === "admin" ? input.condominioId : ctx.user.condominioId!;
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { parcelasAcordo, acordos, devedores, condominios } = await import("../drizzle/schema");
        const { eq, and, inArray } = await import("drizzle-orm");

        // Buscar configuração BTG
        const { getConfiguracaoBoleto, configParaDadosBanco, gerarNomeArquivoRemessa, incrementarSequencialArquivo } = await import("./db-configuracao-boleto");
        const configBoleto = await getConfiguracaoBoleto(condId);
        if (!configBoleto) throw new TRPCError({ code: "BAD_REQUEST", message: "Configure o portador bancário antes de gerar remessa." });

        const [cond] = await db.select().from(condominios).where(eq(condominios.id, condId)).limit(1);
        const dadosBanco = configParaDadosBanco(configBoleto, cond?.name || "CONDOMINIO");

        // Validar CNPJ do beneficiario — obrigatorio para o BTG aceitar o arquivo
        const cnpjLimpoParcelas = dadosBanco.cnpjCedente?.replace(/[.\-\/]/g, "").trim();
        if (!cnpjLimpoParcelas || cnpjLimpoParcelas === "00000000000000" || cnpjLimpoParcelas.length < 11) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "CNPJ/CPF do beneficiario nao configurado. Acesse Banco > Configuracao de Boleto, aba Portador, e preencha o campo CNPJ/CPF Beneficiario antes de gerar a remessa.",
          });
        }

        // Buscar parcelas selecionadas com dados do devedor
        const rows = await db
          .select({
            parcelaId: parcelasAcordo.id,
            acordoId: parcelasAcordo.acordoId,
            installmentNumber: parcelasAcordo.installmentNumber,
            amount: parcelasAcordo.amount,
            dueDate: parcelasAcordo.dueDate,
            nossoNumero: parcelasAcordo.nossoNumero,
            devedorId: devedores.id,
            devedorNome: devedores.name,
            devedorCpfCnpj: devedores.cpfCnpj,
            devedorPhone: devedores.phone,
          })
          .from(parcelasAcordo)
          .innerJoin(acordos, eq(parcelasAcordo.acordoId, acordos.id))
          .innerJoin(devedores, eq(acordos.devedorId, devedores.id))
          .where(and(
            inArray(parcelasAcordo.id, input.parcelaIds),
            eq(acordos.condominioId, condId)
          ));

        if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma parcela encontrada." });

        // Atribuir nossoNumero para parcelas que ainda não têm
        const semNossoNumero = rows.filter(r => !r.nossoNumero);
        if (semNossoNumero.length > 0) {
          const seqExtra = await incrementarSequencialArquivo(condId, semNossoNumero.length);
          for (let i = 0; i < semNossoNumero.length; i++) {
            const nn = String(seqExtra.nossoNumeroInicio + i).padStart(10, '0');
            await db.update(parcelasAcordo)
              .set({ nossoNumero: nn })
              .where(eq(parcelasAcordo.id, semNossoNumero[i].parcelaId));
            semNossoNumero[i].nossoNumero = nn;
          }
        }

        // Montar títulos para CNAB (interface TituloRemessa)
        const taxaJurosDia = Math.round(parseFloat(configBoleto.taxaJurosDia) * 100);
        const taxaMulta = Math.round(parseFloat(configBoleto.taxaMulta) * 100);
        const instrucoesCaixa = (configBoleto.instrucoesCaixa || '')
          .replace('#MULTA#', configBoleto.taxaMulta + '%')
          .replace('#JUROS#', configBoleto.taxaJurosDia + '% ao dia');
        const hoje = new Date();

        const titulos = rows.map(r => ({
          cobrancaId: r.parcelaId,
          nossoNumero: r.nossoNumero || String(Date.now()),
          devedorNome: r.devedorNome || 'NAO INFORMADO',
          devedorCpfCnpj: r.devedorCpfCnpj || '',
          devedorEndereco: '',
          devedorCidade: '',
          devedorUF: '',
          devedorCEP: '',
          valorNominal: r.amount, // já em centavos no banco (int)
          dataVencimento: new Date(r.dueDate),
          dataEmissao: hoje,
          instrucao1: instrucoesCaixa,
          instrucao2: configBoleto.localPagamento || 'PAGAVEL EM QUALQUER BANCO ATE O VENCIMENTO',
          taxaJurosDia,
          taxaMulta,
          carteira: configBoleto.carteira || '1',
          especieDocumento: configBoleto.especieDocumento || '01',
          aceite: configBoleto.aceite || 'N',
          enviarProtesto: configBoleto.enviarInstrucoesProtesto === 1,
        }));

        const { gerarArquivoRemessaCNAB240, criarRemessaCNAB } = await import("./db-cnab");
        const numeroRemessa = configBoleto.numeroSequencialArquivo;
        const nomeArquivo = gerarNomeArquivoRemessa(configBoleto.padraoNomeArquivo || 'BTG_ddmmyyyy', new Date());

        const conteudo = gerarArquivoRemessaCNAB240(dadosBanco, titulos, numeroRemessa);

        // Salvar remessa no banco
        const remessaResult = await criarRemessaCNAB({
          condominioId: condId,
          usuarioId: ctx.user.id,
          banco: dadosBanco.codigoBanco,
          nomeArquivo,
          totalTitulos: titulos.length,
          nossoNumeroInicio: rows[0].nossoNumero || '',
          nossoNumeroFim: rows[rows.length - 1].nossoNumero || '',
        });
        const remessaId = Number((remessaResult as any)?.[0]?.insertId || 0);

        // Atualizar statusRemessa das parcelas
        await db.update(parcelasAcordo)
          .set({
            statusRemessa: "remessa_gerada",
            remessaId: remessaId || null,
          })
          .where(inArray(parcelasAcordo.id, input.parcelaIds));

        return {
          nomeArquivo,
          conteudo,
          totalParcelas: titulos.length,
          remessaId,
        };
      }),
  }),
  operacoes: router({
    // Cobrança Ativa: fila priorizada para o operador
    filaAtiva: protectedProcedure
      .input(z.object({
        condominioId: z.number().nullable().optional(),
        limite: z.number().min(1).max(200).default(50),
      }))
      .query(async ({ input, ctx }) => {
        const { buscarFilaAtiva } = await import("./db-operacoes");
        const condId = ctx.user.role === "admin"
          ? (input.condominioId ?? null)
          : (ctx.user.condominioId ?? null);
        return await buscarFilaAtiva(condId, input.limite);
      }),

    // Detalhes completos do devedor para o painel de atendimento
    devedorParaAtendimento: protectedProcedure
      .input(z.object({ devedorId: z.number() }))
      .query(async ({ input }) => {
        const { buscarDevedorParaAtendimento } = await import("./db-operacoes");
        return await buscarDevedorParaAtendimento(input.devedorId);
      }),

    // Registrar ação da cobrança ativa (tentativa)
    registrarAcaoAtiva: protectedProcedure
      .input(z.object({
        devedorId: z.number(),
        cobrancaId: z.number(),
        contactType: z.enum(["telefone", "email", "pessoal", "whatsapp"]),
        result: z.enum(["sem_resposta", "promessa_pagamento", "deseja_acordo", "recusa", "outro"]),
        notes: z.string().optional(),
        nextAttemptDate: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { tentativasCobranca: tc, devedores: dev } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        // Buscar condominioId do devedor
        const devedorResult = await db.select({ condominioId: dev.condominioId }).from(dev).where(eq(dev.id, input.devedorId)).limit(1);
        const condominioId = devedorResult[0]?.condominioId ?? 0;
        await db.insert(tc).values({
          devedorId: input.devedorId,
          cobrancaId: input.cobrancaId,
          condominioId,
          userId: ctx.user.id,
          contactType: input.contactType,
          result: input.result,
          notes: input.notes ?? null,
          nextAttemptDate: input.nextAttemptDate ?? null,
          attemptDate: new Date(),
        });
        return { ok: true };
      }),

    // Cobrança Passiva: busca devedor por CPF/nome/unidade
    buscarDevedorPassivo: protectedProcedure
      .input(z.object({
        termo: z.string().min(2),
        condominioId: z.number().nullable().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const { buscarDevedorPorIdentificador } = await import("./db-operacoes");
        const condId = ctx.user.role === "admin"
          ? (input.condominioId ?? null)
          : (ctx.user.condominioId ?? null);
        return await buscarDevedorPorIdentificador(input.termo, condId);
      }),

    // Registrar contato passivo (devedor ligou/veio ao escritório)
    registrarContatoPassivo: protectedProcedure
      .input(z.object({
        devedorId: z.number(),
        cobrancaId: z.number(),
        contactType: z.enum(["telefone", "email", "pessoal", "whatsapp"]),
        result: z.enum(["sem_resposta", "promessa_pagamento", "deseja_acordo", "recusa", "outro"]),
        propostaDevedor: z.string().optional(),
        notes: z.string().optional(),
        nextAttemptDate: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { tentativasCobranca: tc, devedores: dev } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const devedorResult = await db.select({ condominioId: dev.condominioId }).from(dev).where(eq(dev.id, input.devedorId)).limit(1);
        const condominioId = devedorResult[0]?.condominioId ?? 0;
        const notesCompleto = input.propostaDevedor
          ? `[CONTATO PASSIVO] Proposta do devedor: ${input.propostaDevedor}${input.notes ? ` | Obs: ${input.notes}` : ""}`
          : `[CONTATO PASSIVO]${input.notes ? ` ${input.notes}` : ""}`;
        await db.insert(tc).values({
          devedorId: input.devedorId,
          cobrancaId: input.cobrancaId,
          condominioId,
          userId: ctx.user.id,
          contactType: input.contactType,
          result: input.result,
          notes: notesCompleto,
          nextAttemptDate: input.nextAttemptDate ?? null,
          attemptDate: new Date(),
        });
        return { ok: true };
      }),
  }),

  // ===== PORTAL DE TRANSPARÊNCIA (SÍNDICO) =====
  portal: router({
    // KPIs executivos do condomínio
    kpis: protectedProcedure
      .input(z.object({ condominioId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { devedores: dev, cobrancas: cob, acordos: ac, parcelasAcordo: pa, tentativasCobranca: tc } = await import("../drizzle/schema");
        const { eq, and, gte, lt, sql, count, sum } = await import("drizzle-orm");

        const condId = ctx.user.role === "admin"
          ? (input.condominioId ?? ctx.user.condominioId ?? 0)
          : (ctx.user.condominioId ?? 0);

        const agora = new Date();
        const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
        const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
        const fimMesAnterior = new Date(agora.getFullYear(), agora.getMonth(), 0);

        // Total em aberto (cobranças ativas)
        const cobAberto = await db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
          .from(cob).where(and(eq(cob.condominioId, condId), eq(cob.status, "em_cobranca")));
        const valorEmAberto = Number(cobAberto[0]?.total ?? 0);

        // Cobranças pagas este mês
        const cobPagoMes = await db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
          .from(cob).where(and(eq(cob.condominioId, condId), eq(cob.status, "pago"), gte(cob.updatedAt, inicioMes)));
        const valorRecuperadoMes = Number(cobPagoMes[0]?.total ?? 0);

        // Cobranças pagas mês anterior
        const cobPagoMesAnt = await db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
          .from(cob).where(and(eq(cob.condominioId, condId), eq(cob.status, "pago"), gte(cob.updatedAt, inicioMesAnterior), lt(cob.updatedAt, inicioMes)));
        const valorRecuperadoMesAnterior = Number(cobPagoMesAnt[0]?.total ?? 0);

        // Total inadimplentes (devedores ativos)
        const devAtivos = await db.select({ total: count() })
          .from(dev).where(and(eq(dev.condominioId, condId), eq(dev.status, "ativo")));
        const totalInadimplentes = Number(devAtivos[0]?.total ?? 0);

        // Acordos ativos
        const acAtivos = await db.select({ total: count() })
          .from(ac).where(and(eq(ac.condominioId, condId), eq(ac.status, "ativo")));
        const acordosAtivos = Number(acAtivos[0]?.total ?? 0);

        // Acordos cancelados ("quebrados")
        const acQuebrados = await db.select({ total: count() })
          .from(ac).where(and(eq(ac.condominioId, condId), eq(ac.status, "cancelado")));
        const acordosQuebrados = Number(acQuebrados[0]?.total ?? 0);

        // Parcelas de acordo em atraso (vencidas e não pagas)
        const parcelasAtrasadas = await db.select({ total: count() })
          .from(pa)
          .where(and(eq(pa.status, "pendente"), lt(pa.dueDate, agora)));
        const acordosEmRisco = Number(parcelasAtrasadas[0]?.total ?? 0);

        // Cobranças em jurídico
        const cobJuridico = await db.select({ total: count() })
          .from(cob).where(and(eq(cob.condominioId, condId), eq(cob.status, "judicial")));
        const casosJuridico = Number(cobJuridico[0]?.total ?? 0);

        // Taxa de recuperação
        const totalCob = await db.select({ total: count() })
          .from(cob).where(eq(cob.condominioId, condId));
        const cobPagas = await db.select({ total: count() })
          .from(cob).where(and(eq(cob.condominioId, condId), eq(cob.status, "pago")));
        const taxaRecuperacao = Number(totalCob[0]?.total ?? 0) > 0
          ? Math.round((Number(cobPagas[0]?.total ?? 0) / Number(totalCob[0]?.total ?? 0)) * 100)
          : 0;

        // Variação mês a mês
        const variacaoRecuperacao = valorRecuperadoMesAnterior > 0
          ? Math.round(((valorRecuperadoMes - valorRecuperadoMesAnterior) / valorRecuperadoMesAnterior) * 100)
          : 0;

        // Tentativas últimos 30 dias
        const trintaDiasAtras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
        const tentativas30d = await db.select({ total: count() })
          .from(tc).where(and(eq(tc.condominioId, condId), gte(tc.attemptDate, trintaDiasAtras)));
        const tentativasUltimos30Dias = Number(tentativas30d[0]?.total ?? 0);

        return {
          valorEmAberto,
          valorRecuperadoMes,
          valorRecuperadoMesAnterior,
          variacaoRecuperacao,
          taxaRecuperacao,
          totalInadimplentes,
          acordosAtivos,
          acordosQuebrados,
          acordosEmRisco,
          casosJuridico,
          tentativasUltimos30Dias,
        };
      }),

    // Score de saúde financeira (0-100)
    score: protectedProcedure
      .input(z.object({ condominioId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { devedores: dev, cobrancas: cob, acordos: ac, parcelasAcordo: pa, tentativasCobranca: tc } = await import("../drizzle/schema");
        const { eq, and, gte, lt, sql, count } = await import("drizzle-orm");

        const condId = ctx.user.role === "admin"
          ? (input.condominioId ?? ctx.user.condominioId ?? 0)
          : (ctx.user.condominioId ?? 0);

        const agora = new Date();
        const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

        // Critério 1: Taxa de recuperação (peso 30)
        const totalCob = await db.select({ total: count() }).from(cob).where(eq(cob.condominioId, condId));
        const cobPagas = await db.select({ total: count() }).from(cob).where(and(eq(cob.condominioId, condId), eq(cob.status, "pago")));
        const taxaRec = Number(totalCob[0]?.total ?? 0) > 0
          ? (Number(cobPagas[0]?.total ?? 0) / Number(totalCob[0]?.total ?? 0))
          : 0;
        const pontoRecuperacao = Math.round(taxaRec * 30);

        // Critério 2: Acordos ativos vs cancelados (peso 20)
        const acAtivos = await db.select({ total: count() }).from(ac).where(and(eq(ac.condominioId, condId), eq(ac.status, "ativo")));
        const acQuebrados = await db.select({ total: count() }).from(ac).where(and(eq(ac.condominioId, condId), eq(ac.status, "cancelado")));
        const totalAc = Number(acAtivos[0]?.total ?? 0) + Number(acQuebrados[0]?.total ?? 0);
        const taxaAcordos = totalAc > 0 ? (Number(acAtivos[0]?.total ?? 0) / totalAc) : 0.5;
        const pontoAcordos = Math.round(taxaAcordos * 20);

        // Critério 3: Engajamento (tentativas nos últimos 30 dias) (peso 20)
        const trintaDiasAtras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
        const tentativas30d = await db.select({ total: count() }).from(tc).where(and(eq(tc.condominioId, condId), gte(tc.attemptDate, trintaDiasAtras)));
        const engajamento = Math.min(Number(tentativas30d[0]?.total ?? 0) / 20, 1);
        const pontoEngajamento = Math.round(engajamento * 20);

        // Critério 4: Inadimplência relativa (peso 30) — menos inadimplentes = melhor
        const devAtivos = await db.select({ total: count() }).from(dev).where(and(eq(dev.condominioId, condId), eq(dev.status, "ativo")));
        const devTotal = await db.select({ total: count() }).from(dev).where(eq(dev.condominioId, condId));
        const taxaInad = Number(devTotal[0]?.total ?? 0) > 0
          ? (Number(devAtivos[0]?.total ?? 0) / Number(devTotal[0]?.total ?? 0))
          : 0;
        const pontoInadimplencia = Math.round((1 - taxaInad) * 30);

        const score = pontoRecuperacao + pontoAcordos + pontoEngajamento + pontoInadimplencia;
        const scoreLabel = score >= 80 ? "Excelente" : score >= 60 ? "Bom" : score >= 40 ? "Moderado" : "Crítico";
        const scoreColor = score >= 80 ? "green" : score >= 60 ? "blue" : score >= 40 ? "yellow" : "red";

        return {
          score: Math.min(score, 100),
          label: scoreLabel,
          color: scoreColor,
          breakdown: {
            recuperacao: pontoRecuperacao,
            acordos: pontoAcordos,
            engajamento: pontoEngajamento,
            inadimplencia: pontoInadimplencia,
          },
          insights: [
            taxaRec < 0.3 ? "Taxa de recuperação abaixo do ideal — intensifique as ações de cobrança" : null,
            taxaAcordos < 0.5 ? "Muitos acordos quebrados — revise as condições de negociação" : null,
            engajamento < 0.5 ? "Baixo engajamento de cobrança nos últimos 30 dias" : null,
            taxaInad > 0.5 ? "Alta taxa de inadimplência — considere ação jurídica para casos críticos" : null,
          ].filter(Boolean) as string[],
        };
      }),

    // Alertas inteligentes automáticos
    alertas: protectedProcedure
      .input(z.object({ condominioId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { devedores: dev, cobrancas: cob, acordos: ac, parcelasAcordo: pa, tentativasCobranca: tc } = await import("../drizzle/schema");
        const { eq, and, gte, lt, sql, count, inArray } = await import("drizzle-orm");

        const condId = ctx.user.role === "admin"
          ? (input.condominioId ?? ctx.user.condominioId ?? 0)
          : (ctx.user.condominioId ?? 0);

        const agora = new Date();
        const trintaDiasAtras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
        const seteDiasAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
        const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
        const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);

        const alertas: Array<{ tipo: string; nivel: "critico" | "atencao" | "info"; mensagem: string; icone: string }> = [];

        // Alerta 1: Devedores sem contato há 30+ dias
        const devsAtivos = await db.select({ id: dev.id }).from(dev).where(and(eq(dev.condominioId, condId), eq(dev.status, "ativo")));
        const devsIds = devsAtivos.map(d => d.id);
        if (devsIds.length > 0) {
          const { inArray: inArr } = await import("drizzle-orm");
          const devsComContato = await db.select({ devedorId: tc.devedorId })
            .from(tc).where(and(inArr(tc.devedorId, devsIds), gte(tc.attemptDate, trintaDiasAtras)));
          const devsComContatoIds = new Set(devsComContato.map(d => d.devedorId));
          const semContato = devsIds.filter(id => !devsComContatoIds.has(id)).length;
          if (semContato > 0) {
            alertas.push({ tipo: "sem_contato", nivel: "atencao", mensagem: `${semContato} devedor(es) sem contato há mais de 30 dias`, icone: "⚠️" });
          }
        }

        // Alerta 2: Parcelas de acordo vencendo nos próximos 7 dias
        const seteDiasAFrente = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);
        const parcelasVencendo = await db.select({ total: count() })
          .from(pa).where(and(eq(pa.status, "pendente"), gte(pa.dueDate, agora), lt(pa.dueDate, seteDiasAFrente)));
        if (Number(parcelasVencendo[0]?.total ?? 0) > 0) {
          alertas.push({ tipo: "parcelas_vencendo", nivel: "atencao", mensagem: `${parcelasVencendo[0]?.total} parcela(s) de acordo vencendo nos próximos 7 dias`, icone: "📅" });
        }

        // Alerta 3: Parcelas de acordo em atraso
        const parcelasAtrasadas2 = await db.select({ total: count() })
          .from(pa).where(and(eq(pa.status, "pendente"), lt(pa.dueDate, agora)));
        if (Number(parcelasAtrasadas2[0]?.total ?? 0) > 0) {
          alertas.push({ tipo: "acordo_risco", nivel: "critico", mensagem: `${parcelasAtrasadas2[0]?.total} parcela(s) de acordo em atraso — acordos em risco`, icone: "🚨" });
        }

        // Alerta 4: Casos em jurídico
        const juridico = await db.select({ total: count() })
          .from(cob).where(and(eq(cob.condominioId, condId), eq(cob.status, "judicial")));
        if (Number(juridico[0]?.total ?? 0) > 0) {
          alertas.push({ tipo: "juridico", nivel: "critico", mensagem: `${juridico[0]?.total} caso(s) em fase jurídica`, icone: "⚖️" });
        }

        // Alerta 5: Comparativo de recuperação mês a mês
        const cobPagoMes = await db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
          .from(cob).where(and(eq(cob.condominioId, condId), eq(cob.status, "pago"), gte(cob.updatedAt, inicioMes)));
        const cobPagoMesAnt = await db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
          .from(cob).where(and(eq(cob.condominioId, condId), eq(cob.status, "pago"), gte(cob.updatedAt, inicioMesAnterior), lt(cob.updatedAt, inicioMes)));
        const recMes = Number(cobPagoMes[0]?.total ?? 0);
        const recAnt = Number(cobPagoMesAnt[0]?.total ?? 0);
        if (recAnt > 0 && recMes < recAnt * 0.8) {
          const queda = Math.round(((recAnt - recMes) / recAnt) * 100);
          alertas.push({ tipo: "queda_recuperacao", nivel: "atencao", mensagem: `Taxa de recuperação caiu ${queda}% em relação ao mês anterior`, icone: "📉" });
        } else if (recMes > recAnt * 1.1 && recAnt > 0) {
          const alta = Math.round(((recMes - recAnt) / recAnt) * 100);
          alertas.push({ tipo: "alta_recuperacao", nivel: "info", mensagem: `Recuperação aumentou ${alta}% em relação ao mês anterior`, icone: "📈" });
        }

        return alertas;
      }),

    // Pipeline de devedores por status
    pipeline: protectedProcedure
      .input(z.object({ condominioId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { devedores: dev, cobrancas: cob, tentativasCobranca: tc, acordos: ac } = await import("../drizzle/schema");
        const { eq, and, sql, count, max, desc } = await import("drizzle-orm");

        const condId = ctx.user.role === "admin"
          ? (input.condominioId ?? ctx.user.condominioId ?? 0)
          : (ctx.user.condominioId ?? 0);

        const devedoresList = await db.select({
          id: dev.id,
          name: dev.name,
          cpfCnpj: dev.cpfCnpj,
          unitNumber: dev.unitNumber,
          bloco: dev.bloco,
          status: dev.status,
          createdAt: dev.createdAt,
        }).from(dev).where(eq(dev.condominioId, condId));

        const result = await Promise.all(devedoresList.map(async (d) => {
          // Valor total em aberto
          const cobAtivas = await db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
            .from(cob).where(and(eq(cob.devedorId, d.id), eq(cob.status, "em_cobranca")));
          const valorDevido = Number(cobAtivas[0]?.total ?? 0);

          // Dias em atraso (desde a primeira cobrança ativa)
          const primeiraCob = await db.select({ dueDate: cob.dueDate })
            .from(cob).where(and(eq(cob.devedorId, d.id), eq(cob.status, "em_cobranca")))
            .orderBy(cob.dueDate).limit(1);
          const diasAtraso = primeiraCob[0]?.dueDate
            ? Math.floor((Date.now() - new Date(primeiraCob[0].dueDate).getTime()) / (1000 * 60 * 60 * 24))
            : 0;

          // Último contato
          const ultimoContato = await db.select({ attemptDate: tc.attemptDate })
            .from(tc).where(eq(tc.devedorId, d.id))
            .orderBy(desc(tc.attemptDate)).limit(1);

          // Score de recuperação (0-100 baseado em dias atraso e tentativas)
          const tentativasCount = await db.select({ total: count() }).from(tc).where(eq(tc.devedorId, d.id));
          const numTentativas = Number(tentativasCount[0]?.total ?? 0);
          const scoreBase = Math.max(0, 100 - Math.floor(diasAtraso / 3) - (numTentativas > 5 ? 20 : 0));

          // Status no pipeline
          const acordoAtivo = await db.select({ id: ac.id }).from(ac)
            .where(and(eq(ac.devedorId, d.id), eq(ac.status, "ativo"))).limit(1);
          const cobJuridico = await db.select({ id: cob.id }).from(cob)
            .where(and(eq(cob.devedorId, d.id), eq(cob.status, "judicial"))).limit(1);

          let pipelineStatus: string;
          if (d.status === "pago") pipelineStatus = "quitado";
          else if (cobJuridico.length > 0) pipelineStatus = "juridico";
          else if (acordoAtivo.length > 0) pipelineStatus = "acordo_fechado";
          else if (diasAtraso > 90) pipelineStatus = "inadimplente_critico";
          else if (numTentativas > 0) pipelineStatus = "em_negociacao";
          else pipelineStatus = "em_atraso_recente";

          return {
            id: d.id,
            name: d.name,
            cpfCnpj: d.cpfCnpj,
            unitNumber: d.unitNumber,
            bloco: d.bloco,
            status: d.status,
            createdAt: d.createdAt,
            valorDevido,
            diasAtraso,
            ultimoContato: ultimoContato[0]?.attemptDate ?? null,
            scoreRecuperacao: Math.min(Math.max(scoreBase, 0), 100),
            pipelineStatus,
          };
        }));

        return result;
      }),

    // Atualizar status do pipeline (drag-and-drop)
    atualizarPipelineStatus: protectedProcedure
      .input(z.object({
        devedorId: z.number(),
        novoStatus: z.enum(["em_atraso_recente", "em_negociacao", "acordo_fechado", "inadimplente_critico", "juridico", "quitado"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { devedores: dev, cobrancas: cob } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        // Mapear status do pipeline para status do devedor
        const statusDevedor: "pago" | "ativo" | "acordo" = input.novoStatus === "quitado" ? "pago" : "ativo";
        await db.update(dev).set({ status: statusDevedor, updatedAt: new Date() }).where(eq(dev.id, input.devedorId));

        // Se juridico, atualizar cobranças
        if (input.novoStatus === "juridico") {
          await db.update(cob).set({ status: "judicial", updatedAt: new Date() }).where(eq(cob.devedorId, input.devedorId));
        }

        return { ok: true };
      }),
  }),

  // ============================================================
  // ROUTER EXECUTIVO — Plataforma de Performance de Recuperação
  // ============================================================
  executivo: router({
    // KPIs estratégicos do dono da operação
    kpisEstrategicos: protectedProcedure
      .input(z.object({
        periodo: z.enum(["hoje", "semana", "mes", "trimestre"]).default("mes"),
      }))
      .query(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { devedores: dev, cobrancas: cob, acordos: ac, parcelasAcordo: pa, tentativasCobranca: tc, users } = await import("../drizzle/schema");
        const { eq, and, gte, lte, count, sum, avg, sql, inArray, isNotNull } = await import("drizzle-orm");

        const now = new Date();
        let dataInicio: Date;
        let dataInicioAnterior: Date;
        let dataFimAnterior: Date;

        if (input.periodo === "hoje") {
          dataInicio = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          dataInicioAnterior = new Date(dataInicio.getTime() - 86400000);
          dataFimAnterior = new Date(dataInicio.getTime() - 1);
        } else if (input.periodo === "semana") {
          const day = now.getDay();
          dataInicio = new Date(now.getTime() - day * 86400000);
          dataInicio.setHours(0, 0, 0, 0);
          dataInicioAnterior = new Date(dataInicio.getTime() - 7 * 86400000);
          dataFimAnterior = new Date(dataInicio.getTime() - 1);
        } else if (input.periodo === "trimestre") {
          const mesAtual = now.getMonth();
          const inicioTrimestre = Math.floor(mesAtual / 3) * 3;
          dataInicio = new Date(now.getFullYear(), inicioTrimestre, 1);
          dataInicioAnterior = new Date(now.getFullYear(), inicioTrimestre - 3, 1);
          dataFimAnterior = new Date(dataInicio.getTime() - 1);
        } else {
          // mes
          dataInicio = new Date(now.getFullYear(), now.getMonth(), 1);
          dataInicioAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          dataFimAnterior = new Date(dataInicio.getTime() - 1);
        }

        // Parcelas pagas no período atual
        const parcelasPagas = await db.select({ total: sum(pa.amount), qtd: count(pa.id) })
          .from(pa)
          .where(and(eq(pa.status, "pago"), gte(pa.createdAt, dataInicio)));
        const valorRecuperado = Number(parcelasPagas[0]?.total ?? 0);
        const qtdParcelas = Number(parcelasPagas[0]?.qtd ?? 0);

        // Período anterior para comparação
        const parcelasPagasAnt = await db.select({ total: sum(pa.amount) })
          .from(pa)
          .where(and(eq(pa.status, "pago"), gte(pa.createdAt, dataInicioAnterior), lte(pa.createdAt, dataFimAnterior)));
        const valorRecuperadoAnt = Number(parcelasPagasAnt[0]?.total ?? 0);
        const variacaoRecuperacao = valorRecuperadoAnt > 0
          ? Math.round(((valorRecuperado - valorRecuperadoAnt) / valorRecuperadoAnt) * 100)
          : 0;

        // Acordos fechados no período
        const acordosFechados = await db.select({ qtd: count(ac.id), total: sum(ac.agreedAmount) })
          .from(ac)
          .where(gte(ac.createdAt, dataInicio));
        const qtdAcordos = Number(acordosFechados[0]?.qtd ?? 0);
        const ticketMedio = qtdAcordos > 0 ? Math.round(Number(acordosFechados[0]?.total ?? 0) / qtdAcordos) : 0;

        // Acordos fechados período anterior
        const acordosFechadosAnt = await db.select({ qtd: count(ac.id) })
          .from(ac)
          .where(and(gte(ac.createdAt, dataInicioAnterior), lte(ac.createdAt, dataFimAnterior)));
        const variacaoAcordos = Number(acordosFechadosAnt[0]?.qtd ?? 0) > 0
          ? Math.round(((qtdAcordos - Number(acordosFechadosAnt[0]?.qtd ?? 0)) / Number(acordosFechadosAnt[0]?.qtd ?? 0)) * 100)
          : 0;

        // Total de devedores ativos
        const totalDevedores = await db.select({ qtd: count(dev.id) }).from(dev).where(eq(dev.status, "ativo"));
        const totalInadimplentes = Number(totalDevedores[0]?.qtd ?? 0);

        // Devedores pagos no período
        const devedoresPagos = await db.select({ qtd: count(dev.id) })
          .from(dev)
          .where(and(eq(dev.status, "pago"), gte(dev.updatedAt, dataInicio)));
        const qtdPagos = Number(devedoresPagos[0]?.qtd ?? 0);
        const taxaRecuperacao = totalInadimplentes + qtdPagos > 0
          ? Math.round((qtdPagos / (totalInadimplentes + qtdPagos)) * 100)
          : 0;

        // Tentativas no período
        const tentativas = await db.select({ qtd: count(tc.id) })
          .from(tc)
          .where(gte(tc.attemptDate, dataInicio));
        const qtdTentativas = Number(tentativas[0]?.qtd ?? 0);

        // Previsão de receita: parcelas pendentes de acordos ativos
        const parcelasPendentes = await db.select({ total: sum(pa.amount), qtd: count(pa.id) })
          .from(pa)
          .where(eq(pa.status, "pendente"));
        const previsaoReceita = Number(parcelasPendentes[0]?.total ?? 0);
        const qtdParcelasPendentes = Number(parcelasPendentes[0]?.qtd ?? 0);

        // Acordos em risco (atrasados)
        const acordosAtrasados = await db.select({ qtd: count(ac.id) })
          .from(ac)
          .where(eq(ac.status, "ativo"));
        // Parcelas atrasadas
        const parcelasAtrasadas = await db.select({ qtd: count(pa.id), total: sum(pa.amount) })
          .from(pa)
          .where(and(eq(pa.status, "atrasado")));
        const qtdParcelasAtrasadas = Number(parcelasAtrasadas[0]?.qtd ?? 0);
        const valorParcelasAtrasadas = Number(parcelasAtrasadas[0]?.total ?? 0);

        // Série histórica dos últimos 6 meses para mini gráfico
        const historico: { mes: string; valor: number }[] = [];
        for (let i = 5; i >= 0; i--) {
          const mesInicio = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const mesFim = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
          const res = await db.select({ total: sum(pa.amount) })
            .from(pa)
            .where(and(eq(pa.status, "pago"), gte(pa.createdAt, mesInicio), lte(pa.createdAt, mesFim)));
          historico.push({
            mes: mesInicio.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
            valor: Number(res[0]?.total ?? 0),
          });
        }

        return {
          valorRecuperado,
          variacaoRecuperacao,
          qtdAcordos,
          variacaoAcordos,
          ticketMedio,
          taxaRecuperacao,
          totalInadimplentes,
          qtdTentativas,
          previsaoReceita,
          qtdParcelasPendentes,
          qtdParcelasAtrasadas,
          valorParcelasAtrasadas,
          historico,
          periodo: input.periodo,
        };
      }),

    // Funil de cobrança
    funilCobranca: protectedProcedure
      .input(z.object({ condominioId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { devedores: dev, cobrancas: cob, acordos: ac, tentativasCobranca: tc } = await import("../drizzle/schema");
        const { eq, and, count, inArray, sql } = await import("drizzle-orm");

        const whereCondominio = input.condominioId ? eq(dev.condominioId, input.condominioId) : undefined;

        const totalDevedores = await db.select({ qtd: count(dev.id) }).from(dev)
          .where(whereCondominio);
        const total = Number(totalDevedores[0]?.qtd ?? 0);

        // Contatados: pelo menos 1 tentativa
        const contatados = await db.select({ qtd: sql<number>`COUNT(DISTINCT ${tc.devedorId})` })
          .from(tc)
          .innerJoin(dev, eq(tc.devedorId, dev.id))
          .where(whereCondominio ? eq(dev.condominioId, input.condominioId!) : sql`1=1`);
        const qtdContatados = Number(contatados[0]?.qtd ?? 0);

        // Em negociação: tentativa com resultado deseja_acordo
        const emNegociacao = await db.select({ qtd: sql<number>`COUNT(DISTINCT ${tc.devedorId})` })
          .from(tc)
          .innerJoin(dev, eq(tc.devedorId, dev.id))
          .where(and(
            eq(tc.result, "deseja_acordo"),
            whereCondominio ? eq(dev.condominioId, input.condominioId!) : sql`1=1`
          ));
        const qtdNegociacao = Number(emNegociacao[0]?.qtd ?? 0);

        // Proposta enviada: cobrança em_negociacao
        const proposta = await db.select({ qtd: sql<number>`COUNT(DISTINCT ${cob.devedorId})` })
          .from(cob)
          .innerJoin(dev, eq(cob.devedorId, dev.id))
          .where(and(
            eq(cob.status, "em_negociacao"),
            whereCondominio ? eq(dev.condominioId, input.condominioId!) : sql`1=1`
          ));
        const qtdProposta = Number(proposta[0]?.qtd ?? 0);

        // Acordo fechado: acordos ativos
        const acordoFechado = await db.select({ qtd: sql<number>`COUNT(DISTINCT ${ac.devedorId})` })
          .from(ac)
          .innerJoin(dev, eq(ac.devedorId, dev.id))
          .where(and(
            eq(ac.status, "ativo"),
            whereCondominio ? eq(dev.condominioId, input.condominioId!) : sql`1=1`
          ));
        const qtdAcordoFechado = Number(acordoFechado[0]?.qtd ?? 0);

        // Pagos: devedores com status pago
        const pagos = await db.select({ qtd: count(dev.id) }).from(dev)
          .where(and(
            eq(dev.status, "pago"),
            whereCondominio ? eq(dev.condominioId, input.condominioId!) : sql`1=1`
          ));
        const qtdPagos = Number(pagos[0]?.qtd ?? 0);

        // Perdidos: judicial
        const perdidos = await db.select({ qtd: sql<number>`COUNT(DISTINCT ${cob.devedorId})` })
          .from(cob)
          .innerJoin(dev, eq(cob.devedorId, dev.id))
          .where(and(
            eq(cob.status, "judicial"),
            whereCondominio ? eq(dev.condominioId, input.condominioId!) : sql`1=1`
          ));
        const qtdPerdidos = Number(perdidos[0]?.qtd ?? 0);

        const conv = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

        return [
          { etapa: "Total de Devedores", qtd: total,            conv: 100,                         cor: "#6366f1" },
          { etapa: "Contatados",         qtd: qtdContatados,   conv: conv(qtdContatados, total),   cor: "#3b82f6" },
          { etapa: "Em Negociação",      qtd: qtdNegociacao,   conv: conv(qtdNegociacao, qtdContatados), cor: "#f59e0b" },
          { etapa: "Proposta Enviada",   qtd: qtdProposta,     conv: conv(qtdProposta, qtdNegociacao),  cor: "#f97316" },
          { etapa: "Acordo Fechado",     qtd: qtdAcordoFechado,conv: conv(qtdAcordoFechado, qtdProposta), cor: "#22c55e" },
          { etapa: "Pagos",              qtd: qtdPagos,        conv: conv(qtdPagos, qtdAcordoFechado),  cor: "#10b981" },
          { etapa: "Perdidos/Judicial",  qtd: qtdPerdidos,     conv: conv(qtdPerdidos, total),     cor: "#ef4444" },
        ];
      }),

    // Produtividade da equipe
    produtividadeEquipe: protectedProcedure
      .input(z.object({
        periodo: z.enum(["hoje", "semana", "mes"]).default("mes"),
      }))
      .query(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { users, tentativasCobranca: tc, acordos: ac, parcelasAcordo: pa } = await import("../drizzle/schema");
        const { eq, and, gte, count, sum, sql } = await import("drizzle-orm");

        const now = new Date();
        let dataInicio: Date;
        if (input.periodo === "hoje") {
          dataInicio = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (input.periodo === "semana") {
          dataInicio = new Date(now.getTime() - 7 * 86400000);
        } else {
          dataInicio = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        // Buscar colaboradores
        const colaboradores = await db.select({ id: users.id, name: users.name, role: users.role })
          .from(users)
          .where(eq(users.role, "cobrador"));

        const resultado = await Promise.all(colaboradores.map(async (col) => {
          // Tentativas no período
          const tentativas = await db.select({
            total: count(tc.id),
            whatsapp: sql<number>`SUM(CASE WHEN ${tc.contactType} = 'whatsapp' THEN 1 ELSE 0 END)`,
            telefone: sql<number>`SUM(CASE WHEN ${tc.contactType} = 'telefone' THEN 1 ELSE 0 END)`,
            email: sql<number>`SUM(CASE WHEN ${tc.contactType} = 'email' THEN 1 ELSE 0 END)`,
            promessas: sql<number>`SUM(CASE WHEN ${tc.result} = 'promessa_pagamento' THEN 1 ELSE 0 END)`,
            acordos_desejados: sql<number>`SUM(CASE WHEN ${tc.result} = 'deseja_acordo' THEN 1 ELSE 0 END)`,
          })
            .from(tc)
            .where(and(eq(tc.userId, col.id), gte(tc.attemptDate, dataInicio)));

          const t = tentativas[0];
          const totalTentativas = Number(t?.total ?? 0);
          const qtdWhatsapp = Number(t?.whatsapp ?? 0);
          const qtdTelefone = Number(t?.telefone ?? 0);
          const qtdEmail = Number(t?.email ?? 0);
          const qtdPromessas = Number(t?.promessas ?? 0);
          const qtdAcordosDesejados = Number(t?.acordos_desejados ?? 0);

          // Acordos fechados no período
          const acordosFechados = await db.select({ qtd: count(ac.id), total: sum(ac.agreedAmount) })
            .from(ac)
            .innerJoin(tc, eq(ac.devedorId, tc.devedorId))
            .where(and(eq(tc.userId, col.id), gte(ac.createdAt, dataInicio)));
          const qtdAcordos = Number(acordosFechados[0]?.qtd ?? 0);
          const valorRecuperado = Number(acordosFechados[0]?.total ?? 0);

          // Taxa de conversão
          const taxaConversao = totalTentativas > 0 ? Math.round((qtdAcordos / totalTentativas) * 100) : 0;

          // Score gamificado (0-100)
          const score = Math.min(100, Math.round(
            (taxaConversao * 0.35) +
            (Math.min(totalTentativas / 50, 1) * 25) +
            (Math.min(qtdAcordos / 10, 1) * 25) +
            (Math.min(valorRecuperado / 1000000, 1) * 15)
          ));

          // Badge
          const badge = score >= 85 ? "🏆 Top Performer" :
            score >= 70 ? "⭐ Alta Performance" :
            score >= 50 ? "📈 Em Crescimento" :
            score >= 30 ? "⚠️ Precisa Melhorar" : "🔴 Baixa Produtividade";

          return {
            id: col.id,
            nome: col.name ?? "Colaborador",
            totalTentativas,
            qtdWhatsapp,
            qtdTelefone,
            qtdEmail,
            qtdPromessas,
            qtdAcordosDesejados,
            qtdAcordos,
            valorRecuperado,
            taxaConversao,
            score,
            badge,
          };
        }));

        return resultado.sort((a, b) => b.score - a.score);
      }),

    // Painel de perdas
    painelPerdas: protectedProcedure
      .input(z.object({ condominioId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { devedores: dev, cobrancas: cob, acordos: ac, parcelasAcordo: pa, tentativasCobranca: tc } = await import("../drizzle/schema");
        const { eq, and, count, sum, sql, lt, gte, isNull } = await import("drizzle-orm");

        const whereCondominio = input.condominioId ? eq(dev.condominioId, input.condominioId) : sql`1=1`;
        const agora = new Date();
        const limite90dias = new Date(agora.getTime() - 90 * 86400000);
        const limite30dias = new Date(agora.getTime() - 30 * 86400000);

        // Acordos cancelados (quebrados)
        const acordosQuebrados = await db.select({ qtd: count(ac.id), total: sum(ac.agreedAmount) })
          .from(ac)
          .innerJoin(dev, eq(ac.devedorId, dev.id))
          .where(and(eq(ac.status, "cancelado"), whereCondominio));

        // Parcelas atrasadas
        const parcelasAtrasadas = await db.select({ qtd: count(pa.id), total: sum(pa.amount) })
          .from(pa)
          .innerJoin(ac, eq(pa.acordoId, ac.id))
          .innerJoin(dev, eq(ac.devedorId, dev.id))
          .where(and(eq(pa.status, "atrasado"), whereCondominio));

        // Devedores sem contato nos últimos 30 dias
        const semContato = await db.select({ qtd: sql<number>`COUNT(DISTINCT ${dev.id})` })
          .from(dev)
          .where(and(eq(dev.status, "ativo"), whereCondominio));
        // Simplificado: devedores ativos sem tentativa recente
        const comContato = await db.select({ qtd: sql<number>`COUNT(DISTINCT ${tc.devedorId})` })
          .from(tc)
          .innerJoin(dev, eq(tc.devedorId, dev.id))
          .where(and(gte(tc.attemptDate, limite30dias), whereCondominio));
        const qtdSemContato = Math.max(0, Number(semContato[0]?.qtd ?? 0) - Number(comContato[0]?.qtd ?? 0));

        // Cobranças paradas (sem ação há mais de 90 dias)
        const cobParadas = await db.select({ qtd: sql<number>`COUNT(DISTINCT ${cob.devedorId})` })
          .from(cob)
          .innerJoin(dev, eq(cob.devedorId, dev.id))
          .where(and(
            eq(cob.status, "em_cobranca"),
            lt(cob.updatedAt, limite90dias),
            whereCondominio
          ));

        // Valor total em risco (devedores ativos)
        const valorEmRisco = await db.select({ total: sum(cob.amount) })
          .from(cob)
          .innerJoin(dev, eq(cob.devedorId, dev.id))
          .where(and(
            sql`${cob.status} IN ('em_cobranca', 'pendente', 'em_negociacao')`,
            whereCondominio
          ));

        return {
          acordosQuebrados: {
            qtd: Number(acordosQuebrados[0]?.qtd ?? 0),
            valor: Number(acordosQuebrados[0]?.total ?? 0),
          },
          parcelasAtrasadas: {
            qtd: Number(parcelasAtrasadas[0]?.qtd ?? 0),
            valor: Number(parcelasAtrasadas[0]?.total ?? 0),
          },
          devedoresSemContato: qtdSemContato,
          cobParadas: Number(cobParadas[0]?.qtd ?? 0),
          valorEmRisco: Number(valorEmRisco[0]?.total ?? 0),
        };
      }),

    // Performance por carteira (condomínio)
    performanceCarteira: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { condominios, devedores: dev, cobrancas: cob, acordos: ac, parcelasAcordo: pa } = await import("../drizzle/schema");
        const { eq, and, count, sum, sql } = await import("drizzle-orm");

        const lista = await db.select({ id: condominios.id, nome: condominios.name }).from(condominios);

        const resultado = await Promise.all(lista.map(async (cond) => {
          const totalDevedores = await db.select({ qtd: count(dev.id) }).from(dev).where(eq(dev.condominioId, cond.id));
          const devedoresAtivos = await db.select({ qtd: count(dev.id) }).from(dev)
            .where(and(eq(dev.condominioId, cond.id), eq(dev.status, "ativo")));
          const devedoresPagos = await db.select({ qtd: count(dev.id) }).from(dev)
            .where(and(eq(dev.condominioId, cond.id), eq(dev.status, "pago")));

          const parcelasPagas = await db.select({ total: sum(pa.amount) })
            .from(pa)
            .innerJoin(ac, eq(pa.acordoId, ac.id))
            .innerJoin(dev, eq(ac.devedorId, dev.id))
            .where(and(eq(dev.condominioId, cond.id), eq(pa.status, "pago")));

          const valorEmAberto = await db.select({ total: sum(cob.amount) })
            .from(cob)
            .innerJoin(dev, eq(cob.devedorId, dev.id))
            .where(and(eq(dev.condominioId, cond.id), sql`${cob.status} NOT IN ('pago', 'cancelado')`));

          const total = Number(totalDevedores[0]?.qtd ?? 0);
          const ativos = Number(devedoresAtivos[0]?.qtd ?? 0);
          const pagos = Number(devedoresPagos[0]?.qtd ?? 0);
          const receita = Number(parcelasPagas[0]?.total ?? 0);
          const emAberto = Number(valorEmAberto[0]?.total ?? 0);
          const taxaRecuperacao = total > 0 ? Math.round((pagos / total) * 100) : 0;

          return {
            id: cond.id,
            nome: cond.nome ?? cond.nome,
            totalDevedores: total,
            devedoresAtivos: ativos,
            devedoresPagos: pagos,
            receita,
            emAberto,
            taxaRecuperacao,
          };
        }));

        return resultado.sort((a, b) => b.receita - a.receita);
      }),
  }),

  // ─── Auditoria ────────────────────────────────────────────────────────────────
  auditoria: router({
    // Listar logs com filtros avançados
    listarLogs: adminProcedure
      .input(z.object({
        page: z.number().default(1),
        limit: z.number().min(10).max(100).default(20),
        action: z.string().optional(),
        entity: z.string().optional(),
        userId: z.number().optional(),
        condominioId: z.number().optional(),
        severity: z.enum(["info", "warning", "critical"]).optional(),
        success: z.boolean().optional(),
        search: z.string().optional(),
        dataInicio: z.date().optional(),
        dataFim: z.date().optional(),
      }))
      .query(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { auditLogs } = await import("../drizzle/schema");
        const { eq, and, gte, lte, like, desc, count, or } = await import("drizzle-orm");

        const conditions: ReturnType<typeof eq>[] = [];
        if (input.action) conditions.push(eq(auditLogs.action, input.action as any));
        if (input.entity) conditions.push(eq(auditLogs.entity, input.entity as any));
        if (input.userId) conditions.push(eq(auditLogs.userId, input.userId));
        if (input.condominioId) conditions.push(eq(auditLogs.condominioId, input.condominioId));
        if (input.severity) conditions.push(eq(auditLogs.severity, input.severity));
        if (input.success !== undefined) conditions.push(eq(auditLogs.success, input.success ? 1 : 0));
        if (input.dataInicio) conditions.push(gte(auditLogs.createdAt, input.dataInicio));
        if (input.dataFim) conditions.push(lte(auditLogs.createdAt, input.dataFim));
        if (input.search) {
          conditions.push(or(
            like(auditLogs.userName, `%${input.search}%`),
            like(auditLogs.entityLabel, `%${input.search}%`),
            like(auditLogs.ipAddress, `%${input.search}%`),
            like(auditLogs.errorMessage, `%${input.search}%`),
          ) as any);
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const offset = (input.page - 1) * input.limit;

        const [logs, totalResult] = await Promise.all([
          db.select().from(auditLogs)
            .where(where)
            .orderBy(desc(auditLogs.createdAt))
            .limit(input.limit)
            .offset(offset),
          db.select({ total: count() }).from(auditLogs).where(where),
        ]);

        return {
          logs,
          total: Number(totalResult[0]?.total ?? 0),
          page: input.page,
          totalPages: Math.ceil(Number(totalResult[0]?.total ?? 0) / input.limit),
        };
      }),

    // Estatísticas de auditoria
    estatisticas: adminProcedure.query(async () => {
      const db = await (await import("./db")).getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { auditLogs } = await import("../drizzle/schema");
      const { eq, gte, count, sql } = await import("drizzle-orm");

      const agora = new Date();
      const inicio24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
      const inicio7d = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [total, ultimas24h, criticos, falhas, porAcao] = await Promise.all([
        db.select({ total: count() }).from(auditLogs),
        db.select({ total: count() }).from(auditLogs).where(gte(auditLogs.createdAt, inicio24h)),
        db.select({ total: count() }).from(auditLogs).where(eq(auditLogs.severity, "critical")),
        db.select({ total: count() }).from(auditLogs).where(eq(auditLogs.success, 0)),
        db.select({ action: auditLogs.action, total: count() })
          .from(auditLogs)
          .where(gte(auditLogs.createdAt, inicio7d))
          .groupBy(auditLogs.action)
          .orderBy(sql`count(*) DESC`)
          .limit(10),
      ]);

      return {
        total: Number(total[0]?.total ?? 0),
        ultimas24h: Number(ultimas24h[0]?.total ?? 0),
        criticos: Number(criticos[0]?.total ?? 0),
        falhas: Number(falhas[0]?.total ?? 0),
        porAcao,
      };
    }),

    // Logs de um usuário específico (para painel de detalhes do usuário)
    logsUsuario: adminProcedure
      .input(z.object({ userId: z.number(), limit: z.number().default(10) }))
      .query(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return [];
        const { auditLogs } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");
        return db.select().from(auditLogs)
          .where(eq(auditLogs.userId, input.userId))
          .orderBy(desc(auditLogs.createdAt))
          .limit(input.limit);
      }),
  }),

  // ─── Modelos de Documentos ─────────────────────────────────────────────────
  modelosDocumento: router({
    list: protectedProcedure
      .input(z.object({ condominioId: z.number().nullable().optional() }))
      .query(async ({ ctx, input }) => {
        const { listModelosByCondominio } = await import("./db-modelos");
        const condId = input?.condominioId ?? (ctx.user?.condominioId ?? null);
        const rows = await listModelosByCondominio(condId);
        // Garantir que id seja number (não bigint) para serialização JSON correta
        return rows.map(r => ({ ...r, id: Number(r.id) }));
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getModeloById } = await import("./db-modelos");
        const modelo = await getModeloById(input.id);
        if (!modelo) throw new TRPCError({ code: "NOT_FOUND", message: "Modelo não encontrado" });
        return modelo;
      }),

    create: protectedProcedure
      .input(z.object({
        nome: z.string().min(1),
        tipo: z.enum(["proposta_acordo","termo_acordo","notificacao_debito","carta_cobranca","recibo_pagamento","contrato_parcelamento","outro"]),
        conteudoHtml: z.string(),
        condominioId: z.number().nullable().optional(),
        logoUrl: z.string().nullable().optional(),
        marcaDaguaUrl: z.string().nullable().optional(),
        logoAlinhamento: z.enum(["esquerda","centro","direita"]).optional(),
        margemSuperior: z.number().optional(),
        margemInferior: z.number().optional(),
        margemEsquerda: z.number().optional(),
        margemDireita: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createModelo } = await import("./db-modelos");
        const id = await createModelo({
          ...input,
          condominioId: input.condominioId ?? ctx.user?.condominioId ?? null,
          createdBy: ctx.user?.id,
        });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(1).optional(),
        tipo: z.enum(["proposta_acordo","termo_acordo","notificacao_debito","carta_cobranca","recibo_pagamento","contrato_parcelamento","outro"]).optional(),
        conteudoHtml: z.string().optional(),
        logoUrl: z.string().nullable().optional(),
        marcaDaguaUrl: z.string().nullable().optional(),
        logoAlinhamento: z.enum(["esquerda","centro","direita"]).optional(),
        margemSuperior: z.number().optional(),
        margemInferior: z.number().optional(),
        margemEsquerda: z.number().optional(),
        margemDireita: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { updateModelo } = await import("./db-modelos");
        const { id, ...data } = input;
        await updateModelo(id, data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteModelo } = await import("./db-modelos");
        await deleteModelo(input.id);
        return { success: true };
      }),

    // Upload de logo ou marca d'água para S3
    uploadImagem: protectedProcedure
      .input(z.object({
        nomeArquivo: z.string(),
        mimeType: z.string(),
        base64: z.string(), // imagem em base64
        tipo: z.enum(["logo", "marca_dagua"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.nomeArquivo.split(".").pop() || "png";
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `modelos/${input.tipo}/${ctx.user?.id ?? "anon"}-${randomSuffix}.${ext}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        return { url };
      }),

    // Gerar PDF de um modelo com variáveis preenchidas
    gerarPDF: protectedProcedure
      .input(z.object({
        modeloId: z.number(),
        variaveis: z.record(z.string(), z.string()).optional(),
        parcelas: z.array(z.object({
          numero: z.number(),
          vencimento: z.string(),
          valor: z.string(),
          status: z.string().optional(),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        const { getModeloById } = await import("./db-modelos");
        const { gerarPDFModelo, gerarHtmlTabelaParcelas } = await import("./modelo-pdf");
        const { storagePut } = await import("./storage");

        const modelo = await getModeloById(input.modeloId);
        if (!modelo) throw new TRPCError({ code: "NOT_FOUND", message: "Modelo não encontrado" });

        // Adicionar data atual nas variáveis se não fornecida
        const agora = new Date();
        const variaveis: Record<string, string> = {
          dataAtual: agora.toLocaleDateString("pt-BR"),
          dataAtualExtenso: agora.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
          ...(input.variaveis ?? {}),
        };

        // Gerar tabela de parcelas automaticamente se fornecidas
        if (input.parcelas && input.parcelas.length > 0) {
          variaveis.tabelaParcelas = gerarHtmlTabelaParcelas(input.parcelas);
          // Preencher variáveis derivadas das parcelas se não fornecidas
          if (!variaveis.numeroParcelas) variaveis.numeroParcelas = String(input.parcelas.length);
          if (!variaveis.valorParcela && input.parcelas[0]) variaveis.valorParcela = input.parcelas[0].valor;
          if (!variaveis.dataVencimentoPrimeiraParcela && input.parcelas[0]) variaveis.dataVencimentoPrimeiraParcela = input.parcelas[0].vencimento;
        }

        const pdfBuffer = await gerarPDFModelo({
          conteudoHtml: modelo.conteudoHtml,
          logoUrl: modelo.logoUrl,
          marcaDaguaUrl: modelo.marcaDaguaUrl,
          logoAlinhamento: (modelo.logoAlinhamento as any) ?? "esquerda",
          margemSuperior: modelo.margemSuperior ?? 40,
          margemInferior: modelo.margemInferior ?? 40,
          margemEsquerda: modelo.margemEsquerda ?? 50,
          margemDireita: modelo.margemDireita ?? 50,
          variaveis,
        });

        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `modelos/pdfs/doc-${input.modeloId}-${randomSuffix}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
        return { url };
      }),

    // Retorna lista de variáveis disponíveis para o editor
    listarVariaveis: protectedProcedure.query(async () => {
      const { VARIAVEIS_DISPONIVEIS } = await import("./modelo-pdf");
      return VARIAVEIS_DISPONIVEIS;
    }),
  }),
});
export type AppRouter = typeof appRouter;

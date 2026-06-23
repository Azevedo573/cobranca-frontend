import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { adminProcedure, condominioAccessProcedure } from "./middleware";
import { requirePermission } from "./rbac";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { logAudit, auditLoginSuccess, auditLoginFailed, auditLogout } from "./audit";
import { atendimentoRouter } from "./routers/atendimento";
import { fluxosRouter } from "./routers/fluxos";
import { btgRouter } from "./routers/btg";
import { processosRouter, prazosRouter } from "./routers/processos";
import { mniRouter } from "./routers/mni";
import { juridicoCondominiosRouter } from "./routers/juridico-condominios";
export const appRouter = router({

  system: systemRouter,
  atendimento: atendimentoRouter,
  fluxos: fluxosRouter,
  btg: btgRouter,
  processos: processosRouter,
  prazos: prazosRouter,
  mni: mniRouter,
  juridicoCondominios: juridicoCondominiosRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      if (!opts.ctx.user) return null;
      // Nunca retornar o hash da senha para o cliente
      const { passwordHash: _omit, ...safeUser } = opts.ctx.user;
      return safeUser;
    }),
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

  // Condominios (admin + advogado/colaborador para seleção em formulários)
  condominios: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getAllCondominios } = await import("./db-condominios");
      const todos = await getAllCondominios();
      // Admin vê todos; advogado/colaborador vêem apenas ativos (para seleção em formulários)
      if (ctx.user.role === "admin") return todos;
      return (todos as any[]).filter((c: any) => !c.statusCadastro || c.statusCadastro === "ativo");
    }),
    getById: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const { getCondominioById } = await import("./db-condominios");
      return await getCondominioById(input.id);
    }),
    // Retorna os módulos ativos do condomínio do usuário logado (ou de um id específico para admin)
    getModulosAtivos: protectedProcedure.input(z.object({ condominioId: z.number().optional() })).query(async ({ input, ctx }) => {
      const { getCondominioById } = await import("./db-condominios");
      const id = input.condominioId ?? ctx.user.condominioId;
      if (!id) return ["cobranca"]; // admin sem condomínio vê tudo
      const condominio = await getCondominioById(id);
      if (!condominio) return ["cobranca"];
      try {
        const mods = JSON.parse((condominio as any).modulosAtivos || '["cobranca"]');
        return Array.isArray(mods) ? mods as string[] : ["cobranca"];
      } catch {
        return ["cobranca"];
      }
    }),
    create: adminProcedure.input(z.object({
      tipo: z.enum(["condominio", "empresa"]).default("condominio"),
      name: z.string(),
      cnpj: z.string().optional(),
      address: z.string().optional(),
      addressNumber: z.string().optional(),
      addressComplement: z.string().optional(),
      neighborhood: z.string().optional(),
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
      modulosAtivos: z.string().optional(), // JSON array: '["cobranca","juridico"]'
      indiceCorrecao: z.enum(["NENHUM", "IPCA", "IGP-M", "INPC", "IGP-DI"]).default("IPCA"),
      aplicarCorrecaoAuto: z.number().default(1),
      maxParcelas: z.number().int().min(1).max(60).default(12),
      cancelamentoAutoAtivo: z.number().int().min(0).max(1).default(0),
      cancelamentoPrazoDias: z.number().int().min(1).max(90).default(20),
      modoBoleto: z.enum(["cnab240", "api_btg"]).default("cnab240"),
      // Campos jurídicos
      juridicoAdvogadoResponsavel: z.string().max(255).optional(),
      juridicoAdvogadoOAB: z.string().max(30).optional(),
      juridicoVaraCompetente: z.string().max(255).optional(),
      juridicoForoComarca: z.string().max(255).optional(),
      juridicoTribunalEstado: z.string().max(100).optional(),
      juridicoConvencaoUrl: z.string().max(500).optional(),
      juridicoRegimentoUrl: z.string().max(500).optional(),
      juridicoObservacoes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      // Validação: customBillingIssuer obrigatório quando billingIssuer = 'outro'
      if (input.billingIssuer === "outro" && !input.customBillingIssuer?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o nome do emissor personalizado." });
      }
      const { createCondominio } = await import("./db-condominios");
      // Garantir defaults de correção monetária para novos condomínios
      const payload = {
        ...input,
        indiceCorrecao: input.indiceCorrecao ?? "IPCA",
        aplicarCorrecaoAuto: input.aplicarCorrecaoAuto ?? 1,
        maxParcelas: input.maxParcelas ?? 12,
        cancelamentoAutoAtivo: input.cancelamentoAutoAtivo ?? 0,
        cancelamentoPrazoDias: input.cancelamentoPrazoDias ?? 20,
        modoBoleto: input.modoBoleto ?? "cnab240",
      };
      const result = await createCondominio(payload);
      await logAudit(ctx, { action: "create", entity: "condominio", entityLabel: input.name, afterData: { name: input.name, cnpj: input.cnpj }, severity: "info" });
      return result;
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      tipo: z.enum(["condominio", "empresa"]).optional(),
      name: z.string().optional(),
      cnpj: z.string().optional(),
      taxaJurosMensal: z.string().optional(),
      taxaMulta: z.string().optional(),
      taxaHonorarios: z.string().optional(),
      descontoMaximo: z.string().optional(),
      address: z.string().optional(),
      addressNumber: z.string().optional(),
      addressComplement: z.string().optional(),
      neighborhood: z.string().optional(),
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
      modulosAtivos: z.string().optional(), // JSON array: '["cobranca","juridico"]'
      indiceCorrecao: z.enum(["NENHUM", "IPCA", "IGP-M", "INPC", "IGP-DI"]).optional(),
      aplicarCorrecaoAuto: z.number().optional(),
      maxParcelas: z.number().int().min(1).max(60).optional(),
      cancelamentoAutoAtivo: z.number().int().min(0).max(1).optional(),
      cancelamentoPrazoDias: z.number().int().min(1).max(90).optional(),
      alertaParcela1Ativo: z.number().int().min(0).max(1).optional(),
      alertaParcela1Dias: z.number().int().min(1).max(365).optional(),
      alertaParcela2Ativo: z.number().int().min(0).max(1).optional(),
      alertaParcela2Dias: z.number().int().min(1).max(365).optional(),
      alertaParcela3Ativo: z.number().int().min(0).max(1).optional(),
      alertaParcela3Dias: z.number().int().min(1).max(365).optional(),
      modoBoleto: z.enum(["cnab240", "api_btg"]).optional(),
      // Campos jurídicos
      juridicoAdvogadoResponsavel: z.string().max(255).optional().nullable(),
      juridicoAdvogadoOAB: z.string().max(30).optional().nullable(),
      juridicoVaraCompetente: z.string().max(255).optional().nullable(),
      juridicoForoComarca: z.string().max(255).optional().nullable(),
      juridicoTribunalEstado: z.string().max(100).optional().nullable(),
      juridicoConvencaoUrl: z.string().max(500).optional().nullable(),
      juridicoRegimentoUrl: z.string().max(500).optional().nullable(),
      juridicoObservacoes: z.string().optional().nullable(),
      // Campos de arquivamento
      statusCadastro: z.enum(["ativo", "inativo", "arquivado"]).optional(),
      dataRescisao: z.string().max(10).optional().nullable(),
      motivoSaida: z.string().optional().nullable(),
      situacaoJuridica: z.enum(["sem_processos", "processos_ativos", "processos_encerrados"]).optional().nullable(),
      observacoesSaida: z.string().optional().nullable(),
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
    arquivar: adminProcedure.input(z.object({
      id: z.number(),
      statusCadastro: z.enum(["ativo", "inativo", "arquivado"]),
      dataRescisao: z.string().max(10).optional().nullable(),
      motivoSaida: z.string().optional().nullable(),
      situacaoJuridica: z.enum(["sem_processos", "processos_ativos", "processos_encerrados"]).optional().nullable(),
      observacoesSaida: z.string().optional().nullable(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const { updateCondominio } = await import("./db-condominios");
      await updateCondominio(id, data);
      await logAudit(ctx, { action: "update", entity: "condominio", entityId: String(id), afterData: data as Record<string, unknown>, severity: "warning" });
      return { success: true };
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

    // Upload de documento jurídico do condomínio (Convenção / Regimento)
    uploadDocumento: adminProcedure.input(z.object({
      condominioId: z.number().int().positive(),
      tipo: z.enum(["convencao", "regimento"]),
      fileBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const { storagePut } = await import("./storage");
      const { updateCondominio } = await import("./db-condominios");
      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.fileName.split(".").pop() ?? "pdf";
      const suffix = Math.random().toString(36).slice(2, 10);
      const fileKey = `condominios/${input.condominioId}/docs/${input.tipo}-${suffix}.${ext}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      // Atualizar URL no condomínio
      const field = input.tipo === "convencao" ? "juridicoConvencaoUrl" : "juridicoRegimentoUrl";
      await updateCondominio(input.condominioId, { [field]: url });
      await logAudit(ctx, { action: "update", entity: "condominio", entityId: String(input.condominioId), severity: "info" });
      return { url, fileName: input.fileName };
    }),
  }),
  // Devedores
  devedores: router({
    list: requirePermission("devedores", "visualizar").input(z.object({ condominioId: z.number() })).query(async ({ input, ctx }) => {
      const rolesComSeletorCondominio = ["admin", "advogado"];
      const condominioId = rolesComSeletorCondominio.includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId!;
      const { getDevedoresByCondominio } = await import("./db-devedores");
      return await getDevedoresByCondominio(condominioId);
    }),
    getById: requirePermission("devedores", "visualizar").input(z.object({ id: z.number() })).query(async ({ input }) => {
      const { getDevedorById } = await import("./db-devedores");
      return await getDevedorById(input.id);
    }),
    create: requirePermission("devedores", "criar").input(z.object({
      condominioId: z.number(),
      name: z.string(),
      unitNumber: z.string(),
      bloco: z.string().optional(),
      statusUnidade: z.enum(["padrao", "ajuizado"]).optional(),
      cpfCnpj: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      totalDue: z.number().default(0),
      // Endereço (necessário para boleto BTG)
      address: z.string().optional(),
      addressNumber: z.string().optional(),
      addressComplement: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { createDevedor } = await import("./db-devedores");
      const { statusUnidade, ...devedorData } = input;
      const result = await createDevedor(devedorData);
      const devedorId = Number((result as any).insertId || 0);
      // Se ajuizado, criar demanda de cobrança judicial automaticamente
      if (statusUnidade === "ajuizado" && devedorId) {
        try {
          const { createDemanda, getColunaEntrada } = await import("./db-demandas");
          const colunaEntrada = await getColunaEntrada();
          if (colunaEntrada) {
            await createDemanda({
              condominioId: input.condominioId,
              colunaId: colunaEntrada.id,
              assunto: `Cobrança Judicial — ${input.name || `Unidade ${input.unitNumber}`}`,
              descricao: `Demanda criada via cadastro de devedor. Unidade: ${input.bloco ? input.bloco + ' ' : ''}${input.unitNumber}.`,
              tipo: "cobranca_judicial",
              canal: "manual",
              prioridade: "alta",
              devedorId,
              criadoPorId: ctx.user.id,
              prazo: null,
            });
          }
        } catch (_e) { /* não bloquear cadastro */ }
      }
      await logAudit(ctx, { action: "create", entity: "devedor", entityLabel: input.name, condominioId: input.condominioId, afterData: { name: input.name, cpfCnpj: input.cpfCnpj, unitNumber: input.unitNumber }, severity: "info" });
      return result;
    }),
    update: requirePermission("devedores", "editar").input(z.object({
      id: z.number(),
      name: z.string().optional(),
      unitNumber: z.string().optional(),
      bloco: z.string().optional(),
      statusUnidade: z.enum(["padrao", "ajuizado"]).optional(),
      cpfCnpj: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      totalDue: z.number().optional(),
      status: z.enum(["ativo", "pago", "acordo"]).optional(),
      // Endereço (necessário para boleto BTG)
      address: z.string().optional(),
      addressNumber: z.string().optional(),
      addressComplement: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, statusUnidade, ...data } = input;
      const { updateDevedor, getDevedorById } = await import("./db-devedores");
      const result = await updateDevedor(id, data);
      // Sincronizar demanda judicial conforme statusUnidade
      if (statusUnidade !== undefined) {
        try {
          const devedorAtual = await getDevedorById(id);
          const { createDemanda, getColunaEntrada } = await import("./db-demandas");
          const { getDb } = await import("./db");
          const db = await getDb();
          if (!db) throw new Error("DB not available");
          const { demandas } = await import("../drizzle/schema");
          const { eq, and } = await import("drizzle-orm");
          // Verificar se já existe demanda judicial para este devedor
          const demandasExistentes = await db.select().from(demandas)
            .where(and(eq(demandas.devedorId, id), eq(demandas.tipo, "cobranca_judicial")));
          if (statusUnidade === "ajuizado" && demandasExistentes.length === 0) {
            // Criar demanda judicial
            const colunaEntrada = await getColunaEntrada();
            if (colunaEntrada && devedorAtual) {
              await createDemanda({
                condominioId: devedorAtual.condominioId,
                colunaId: colunaEntrada.id,
                assunto: `Cobrança Judicial — ${devedorAtual.name || `Unidade ${devedorAtual.unitNumber}`}`,
                descricao: `Demanda criada via edição de devedor. Unidade: ${devedorAtual.bloco ? devedorAtual.bloco + ' ' : ''}${devedorAtual.unitNumber}.`,
                tipo: "cobranca_judicial",
                canal: "manual",
                prioridade: "alta",
                devedorId: id,
                criadoPorId: ctx.user.id,
                prazo: null,
              });
            }
          } else if (statusUnidade === "padrao" && demandasExistentes.length > 0) {
            // Remover demandas judiciais ao voltar para padrão
            await db.delete(demandas)
              .where(and(eq(demandas.devedorId, id), eq(demandas.tipo, "cobranca_judicial")));
          }
        } catch (_e) { /* não bloquear atualização */ }
      }
      await logAudit(ctx, { action: "update", entity: "devedor", entityId: String(id), afterData: data as Record<string, unknown>, severity: "info" });
      return result;
    }),
    delete: requirePermission("devedores", "excluir").input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
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
    list: requirePermission("cobrancas", "visualizar").input(z.object({ condominioId: z.number() })).query(async ({ input, ctx }) => {
      const rolesComSeletorCondominio = ["admin", "advogado"];
      const condominioId = rolesComSeletorCondominio.includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId!;
      const { getCobrancasByCondominio } = await import("./db-cobrancas");
      return await getCobrancasByCondominio(condominioId);
    }),
    getByDevedor: requirePermission("cobrancas", "visualizar").input(z.object({ devedorId: z.number() })).query(async ({ input }) => {
      const { getCobrancasByDevedor } = await import("./db-cobrancas");
      return await getCobrancasByDevedor(input.devedorId);
    }),
    getComCalculos: requirePermission("cobrancas", "visualizar").input(z.object({ devedorId: z.number() })).query(async ({ input }) => {
      const { getCobrancasComCalculos } = await import("./db-cobrancas");
      return await getCobrancasComCalculos(input.devedorId);
    }),
    /**
     * Retorna cobranças normais (excluindo em_acordo) + parcelas de acordos ativos.
     * É a query principal usada na tela de Cobranças do devedor.
     */
    getComAcordos: requirePermission("cobrancas", "visualizar").input(z.object({ devedorId: z.number() })).query(async ({ input }) => {
      const { getCobrancasComCalculos, getParcelasAcordoAtivasByDevedor } = await import("./db-cobrancas");
      const [cobrancasComCalc, parcelasAcordoAtivas] = await Promise.all([
        getCobrancasComCalculos(input.devedorId),
        getParcelasAcordoAtivasByDevedor(input.devedorId),
      ]);
      return {
        cobrancas: cobrancasComCalc,
        parcelasAcordo: parcelasAcordoAtivas,
        temAcordoAtivo: parcelasAcordoAtivas.length > 0,
      };
    }),
    /**
     * Retorna cobranças em acordo (para histórico/auditoria)
     */
    getEmAcordo: requirePermission("cobrancas", "visualizar").input(z.object({ devedorId: z.number() })).query(async ({ input }) => {
      const { getCobrancasEmAcordoByDevedor } = await import("./db-cobrancas");
      return await getCobrancasEmAcordoByDevedor(input.devedorId);
    }),
    getById: requirePermission("cobrancas", "visualizar").input(z.object({ id: z.number() })).query(async ({ input }) => {
      const { getCobrancaById } = await import("./db-cobrancas");
      return await getCobrancaById(input.id);
    }),
    create: requirePermission("cobrancas", "criar").input(z.object({
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
    update: requirePermission("cobrancas", "editar").input(z.object({
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
    delete: requirePermission("cobrancas", "excluir").input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
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
    list: requirePermission("tentativas", "visualizar").input(z.object({ condominioId: z.number() })).query(async ({ input, ctx }) => {
      const condominioId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId!;
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
    getByDevedor: requirePermission("tentativas", "visualizar").input(z.object({ devedorId: z.number() })).query(async ({ input }) => {
      const { getTentativasByDevedor } = await import("./db-tentativas");
      return await getTentativasByDevedor(input.devedorId);
    }),
    create: requirePermission("tentativas", "criar").input(z.object({
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
    getEstatisticas: requirePermission("tentativas", "visualizar").input(z.object({ condominioId: z.number() })).query(async ({ input, ctx }) => {
      const condominioId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId!;
      const { getEstatisticasTentativas } = await import("./db-tentativas");
      return await getEstatisticasTentativas(condominioId);
    }),
  }),

  // Acordos
  acordos: router({
    list: requirePermission("acordos", "visualizar").input(z.object({ condominioId: z.number() })).query(async ({ input, ctx }) => {
      const condominioId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId!;
      const { getAcordosByCondominio } = await import("./db-acordos");
      return await getAcordosByCondominio(condominioId);
    }),
    getById: requirePermission("acordos", "visualizar").input(z.object({ id: z.number() })).query(async ({ input }) => {
      const { getAcordoById } = await import("./db-acordos");
      return await getAcordoById(input.id);
    }),
    getByCobranca: requirePermission("acordos", "visualizar").input(z.object({ cobrancaId: z.number() })).query(async ({ input }) => {
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
    getAtivosComParcelas: requirePermission("acordos", "visualizar").input(z.object({ devedorId: z.number() })).query(async ({ input }) => {
      const { getAcordosAtivosComParcelas } = await import("./db-acordos");
      return await getAcordosAtivosComParcelas(input.devedorId);
    }),
    // Buscar histórico de consolidações de um acordo
    getHistorico: requirePermission("acordos", "visualizar").input(z.object({ acordoId: z.number() })).query(async ({ input }) => {
      const { getHistoricoConsolidacoes } = await import("./db-acordos");
      return await getHistoricoConsolidacoes(input.acordoId);
    }),
    // Buscar todos os acordos de um devedor
    listByDevedor: requirePermission("acordos", "visualizar").input(z.object({ devedorId: z.number() })).query(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return [];
      const { acordos } = await import("../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      return await db.select().from(acordos).where(eq(acordos.devedorId, input.devedorId)).orderBy(desc(acordos.createdAt));
    }),
    create: requirePermission("acordos", "criar").input(z.object({
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
        // Snapshot de breakdown (valores em centavos) — capturado no momento do acordo
        snapshotPrincipal: z.number().optional(),
        snapshotJuros: z.number().optional(),
        snapshotMulta: z.number().optional(),
        snapshotCorrecao: z.number().optional(),
        snapshotHonorarios: z.number().optional(),
        snapshotValorAtualizado: z.number().optional(),
        snapshotDescricao: z.string().optional(),
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

      // Criar todas as parcelas com nossoNumero (se disponível) e snapshot de breakdown
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
        // Snapshot de breakdown capturado no momento do acordo
        snapshotPrincipal: p.snapshotPrincipal ?? null,
        snapshotJuros: p.snapshotJuros ?? null,
        snapshotMulta: p.snapshotMulta ?? null,
        snapshotCorrecao: p.snapshotCorrecao ?? null,
        snapshotHonorarios: p.snapshotHonorarios ?? null,
        snapshotValorAtualizado: p.snapshotValorAtualizado ?? null,
        snapshotDescricao: p.snapshotDescricao ?? null,
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

      // Vincular custas judiciais livres do devedor a este acordo
      // (evita cobrança duplicada em novo acordo enquanto este estiver ativo)
      try {
        const { vincularCustasAoAcordo } = await import("./db-custas");
        await vincularCustasAoAcordo(input.devedorId, acordoId);
      } catch (e) {
        console.warn('[ACORDO] Não foi possível vincular custas ao acordo:', e);
      }
      
      await logAudit(ctx, { action: "create", entity: "acordo", entityId: String(acordoId), condominioId: input.condominioId, afterData: { devedorId: input.devedorId, totalAmount: input.totalAmount, agreedAmount: input.agreedAmount, installments: input.installments }, severity: "info" });
      return { success: true, acordoId };
    }),
    getParcelas: requirePermission("acordos", "visualizar").input(z.object({ acordoId: z.number() })).query(async ({ input }) => {
      const { getParcelasByAcordo } = await import("./db-acordos");
      return await getParcelasByAcordo(input.acordoId);
    }),
    updateParcela: requirePermission("acordos", "editar").input(z.object({
      id: z.number(),
      paymentDate: z.date().optional(),
      status: z.enum(["pendente", "pago", "atrasado"]).optional(),
    })).mutation(async ({ input }) => {
      const { updateParcela } = await import("./db-acordos");
      return await updateParcela(input.id, input);
    }),
    darBaixaParcela: requirePermission("acordos", "aprovar").input(z.object({
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

      // Etapa 6: Se todas as parcelas foram pagas, quitar as cobranças originais vinculadas ao acordo
      if (todasPagas) {
        const { acordoCobrancas, cobrancas } = await import("../drizzle/schema");
        const { updateCobranca } = await import("./db-cobrancas");
        // Buscar todas as cobranças vinculadas a este acordo
        const cobrancasDoAcordo = await db
          .select({ cobrancaId: acordoCobrancas.cobrancaId })
          .from(acordoCobrancas)
          .where(eq(acordoCobrancas.acordoId, parcela[0].acordoId));
        // Atualizar cada cobrança para 'pago' com observação de quitação via acordo
        for (const { cobrancaId } of cobrancasDoAcordo) {
          await updateCobranca(cobrancaId, {
            status: "pago",
            description: `Quitado via Acordo #${parcela[0].acordoId}`,
          });
        }
      }
      
      await logAudit(ctx, { action: "pay_parcela", entity: "parcela", entityId: String(input.parcelaId), afterData: { acordoId: parcela[0].acordoId, valorPago: valorPagoTotal, statusAcordo: todasPagas ? "pago" : "ativo", cobrancasQuitadas: todasPagas }, severity: "info" });
      return { 
        success: true, 
        valorPagoTotal,
        statusAcordo: todasPagas ? "pago" : "ativo",
        cobrancasQuitadas: todasPagas,
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
    // Gerar boletos em lote para todas as parcelas de um acordo
    gerarBoletosLoteAcordo: requirePermission("acordos", "criar").input(z.object({
      acordoId: z.number(),
    })).mutation(async ({ input }) => {
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

      // Buscar acordo
      const acordoRows = await db.select().from(acordos).where(eq(acordos.id, input.acordoId)).limit(1);
      if (!acordoRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Acordo não encontrado" });
      const acordo = acordoRows[0];

      // Buscar todas as parcelas pendentes com nossoNumero
      const parcelas = await db.select().from(parcelasAcordo)
        .where(eq(parcelasAcordo.acordoId, input.acordoId));

      const parcelasComNossoNumero = parcelas.filter(p => !!p.nossoNumero && p.status !== "pago");
      const parcelasSemNossoNumero = parcelas.filter(p => !p.nossoNumero && p.status !== "pago");

      if (parcelasComNossoNumero.length === 0) {
        return {
          success: false,
          boletos: [],
          semNossoNumero: parcelasSemNossoNumero.length,
          mensagem: "Nenhuma parcela possui Nosso Número. Envie a remessa CNAB primeiro para gerar os boletos.",
        };
      }

      const devedor = await getDevedorById(acordo.devedorId);
      if (!devedor) throw new TRPCError({ code: "NOT_FOUND", message: "Devedor não encontrado" });

      const config = await getConfiguracaoBoleto(acordo.condominioId);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Configuração de boleto não encontrada" });

      const condominio = await getCondominioById(acordo.condominioId);
      if (!condominio) throw new TRPCError({ code: "NOT_FOUND", message: "Condomínio não encontrado" });

      const nomeSacado = devedor.name ||
        `${devedor.bloco ? `Bloco ${devedor.bloco} — ` : ""}Unidade ${devedor.unitNumber}`;

      const boletos: Array<{ parcelaId: number; numeroParcela: number; url: string; linhaDigitavel: string; valor: number; vencimento: string }> = [];

      for (const parcela of parcelasComNossoNumero) {
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

        let pixCopiaCola: string | undefined = parcela.pixCopiaCola || undefined;
        if (!pixCopiaCola && config.habilitarPix && config.chavePix) {
          pixCopiaCola = gerarPixCopiaCola({
            chavePix: config.chavePix,
            nomeBeneficiario: config.nomeBeneficiario || condominio.name,
            cidade: condominio.city || "SAO PAULO",
            valor: parcela.amount,
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
          nossoNumero: parcela.nossoNumero!,
          dataVencimento,
          dataEmissao,
          valor: parcela.amount,
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
          seuNumero: parcela.nossoNumero!,
          pixCopiaCola,
        };

        const pdfBuffer = await gerarBoletoPDF(dados);
        const fileKey = `boletos/${acordo.condominioId}/${parcela.nossoNumero}-lote-${Date.now()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
        const codigoBarras = calcularCodigoBarras(dados);
        const linhaDigitavel = formatarLinhaDigitavel(calcularLinhaDigitavel(codigoBarras));

        boletos.push({
          parcelaId: parcela.id,
          numeroParcela: parcela.installmentNumber,
          url,
          linhaDigitavel,
          valor: parcela.amount,
          vencimento: dataVencimento.toISOString(),
        });
      }

      return {
        success: true,
        boletos,
        semNossoNumero: parcelasSemNossoNumero.length,
        mensagem: `${boletos.length} boleto(s) gerado(s) com sucesso.${
          parcelasSemNossoNumero.length > 0
            ? ` ${parcelasSemNossoNumero.length} parcela(s) sem Nosso Número foram ignoradas.`
            : ""
        }`,
      };
    }),

    quebrarAcordo: requirePermission("acordos", "aprovar").input(z.object({
      acordoId: z.number(),
      motivo: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      const { acordos, acordoCobrancas, parcelasAcordo, cobrancas } = await import("../drizzle/schema");
      const { eq, and, inArray } = await import("drizzle-orm");

      // 1. Buscar o acordo
      const acordoRows = await db.select().from(acordos).where(eq(acordos.id, input.acordoId)).limit(1);
      if (!acordoRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Acordo não encontrado" });
      const acordo = acordoRows[0];

      if (acordo.status === "pago") throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível quebrar um acordo já quitado" });

      // 2. Buscar parcelas do acordo
      const parcelas = await db.select().from(parcelasAcordo).where(eq(parcelasAcordo.acordoId, input.acordoId));
      const parcelasPagas = parcelas.filter(p => p.status === "pago");
      const parcelasPendentes = parcelas.filter(p => p.status !== "pago");

      // 3. Calcular valor total já pago nas parcelas
      const valorJaPago = parcelasPagas.reduce((acc, p) => acc + p.amount, 0);

      // 4. Buscar cobranças originais vinculadas ao acordo
      const vinculadas = await db.select().from(acordoCobrancas).where(eq(acordoCobrancas.acordoId, input.acordoId));
      const cobrancaIds = vinculadas.map(v => v.cobrancaId);

      if (cobrancaIds.length > 0) {
        const cobsOriginais = await db.select().from(cobrancas).where(inArray(cobrancas.id, cobrancaIds));
        const totalOriginal = cobsOriginais.reduce((acc, c) => acc + c.amount, 0);

        if (parcelasPagas.length === 0) {
          // CASO 1: Nenhuma parcela paga → dívidas voltam para em_cobranca
          for (const cid of cobrancaIds) {
            await db.update(cobrancas)
              .set({ status: "em_cobranca" })
              .where(eq(cobrancas.id, cid));
          }
        } else {
          // CASO 2: Parcialmente pago → dívidas voltam com abatimento do valor já pago
          // Distribuir o abatimento proporcionalmente entre as cobranças originais
          const fatorAbatimento = valorJaPago / totalOriginal;
          for (const cob of cobsOriginais) {
            const abatimento = Math.round(cob.amount * fatorAbatimento);
            const novoValor = Math.max(0, cob.amount - abatimento);
            await db.update(cobrancas)
              .set({
                status: "em_cobranca",
                amount: novoValor,
                description: `${cob.description || ''} [Acordo #${input.acordoId} quebrado — abatimento R$ ${(abatimento / 100).toFixed(2)}]`.trim(),
              })
              .where(eq(cobrancas.id, cob.id));
          }
        }
      }

      // 5. Cancelar parcelas pendentes
      if (parcelasPendentes.length > 0) {
        const pendentesIds = parcelasPendentes.map(p => p.id);
        await db.update(parcelasAcordo)
          .set({ status: "cancelado" })
          .where(inArray(parcelasAcordo.id, pendentesIds));
      }

      // 6. Atualizar status do acordo
      const novoStatus = parcelasPagas.length === 0 ? "cancelado" : "inadimplente";
      await db.update(acordos)
        .set({
          status: novoStatus,
          motivoQuebra: input.motivo || (parcelasPagas.length === 0 ? "Nenhuma parcela paga" : "Parcialmente pago"),
          dataQuebra: new Date(),
          valorPagoAcordo: valorJaPago,
        })
        .where(eq(acordos.id, input.acordoId));

      // 7. Liberar custas judiciais vinculadas a este acordo
      // (ficam disponíveis para inclusão em novo acordo)
      try {
        const { liberarCustasDoAcordo } = await import("./db-custas");
        await liberarCustasDoAcordo(input.acordoId);
      } catch (e) {
        console.warn('[QUEBRA ACORDO] Não foi possível liberar custas do acordo:', e);
      }

      return {
        success: true,
        caso: parcelasPagas.length === 0 ? 1 : 2,
        novoStatus,
        parcelasPagas: parcelasPagas.length,
        parcelasCanceladas: parcelasPendentes.length,
        valorJaPago,
        cobrancasReativadas: cobrancaIds.length,
        mensagem: parcelasPagas.length === 0
          ? `Acordo cancelado. ${cobrancaIds.length} cobrança(s) original(is) reativada(s) em cobrança.`
          : `Acordo marcado como inadimplente. ${cobrancaIds.length} cobrança(s) original(is) reativada(s) com abatimento de R$ ${(valorJaPago / 100).toFixed(2)} já pago.`,
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
      role: z.enum(["admin", "sindico", "cobrador", "colaborador", "advogado"]),
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
      role: z.enum(["admin", "sindico", "cobrador", "colaborador", "advogado"]).optional(),
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
    inadimplencia: protectedProcedure.input(z.object({
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      condominioId: z.number().int().positive().optional(),
      devedorId: z.number().int().positive().optional(),
      atualizadoAte: z.string().optional(), // data base para cálculo de encargos
      tiposCobranca: z.array(z.string()).optional(), // filtro por tipo
      categoria: z.enum(["todos", "padrao", "ajuizada"]).optional(),
      honorariosPerc: z.number().min(0).max(100).optional(), // % adicional de honorários
      custasJudiciais: z.number().min(0).optional(), // R$ em centavos
      outrasDespesas: z.number().min(0).optional(), // R$ em centavos
    })).query(async ({ input }) => {
      const { getRelatorioInadimplenciaCompleto } = await import("./db-relatorios-extra");
      return await getRelatorioInadimplenciaCompleto(input);
    }),
    acordosPeriodo: protectedProcedure.input(z.object({
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      condominioId: z.number().int().positive().optional(),
    })).query(async ({ input }) => {
      const { getRelatorioAcordos } = await import("./db-relatorios-extra");
      return await getRelatorioAcordos(input);
    }),
    extrato: protectedProcedure.input(z.object({
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      condominioId: z.number().int().positive().optional(),
      devedorId: z.number().int().positive().optional(),
    })).query(async ({ input }) => {
      const { getRelatorioExtrato } = await import("./db-relatorios-extra");
      return await getRelatorioExtrato(input);
    }),
    recuperacao: protectedProcedure.input(z.object({
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      condominioId: z.number().int().positive().optional(),
    })).query(async ({ input }) => {
      const { getRelatorioRecuperacao } = await import("./db-relatorios-extra");
      return await getRelatorioRecuperacao(input);
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
        statusUnidade: z.enum(["padrao", "ajuizado"]).optional(),
        // Endereço (opcional — herdado do condomínio se não informado)
        zipCode: z.string().optional(),
        address: z.string().optional(),
        addressNumber: z.string().optional(),
        addressComplement: z.string().optional(),
        neighborhood: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        tipoCobranca: z.string().optional(),
        descricaoCobranca: z.string().optional(),
        mesReferencia: z.string().optional(),
        dataVencimento: z.string(),
        valorOriginal: z.number(),
      })),
    })).mutation(async ({ input, ctx }) => {
      const { createDevedor } = await import("./db-devedores");
      const { createCobranca } = await import("./db-cobrancas");
      const { converterData } = await import("./excel-import");
      const { createDemanda, getColunaEntrada } = await import("./db-demandas");
      const { getCondominioById } = await import("./db-condominios");
      
      const resultados = {
        devedoresCriados: 0,
        devedoresAtualizados: 0,
        cobrancasCriadas: 0,
        erros: [] as string[],
      };
      
      const { getDevedorByCpfCnpj, getDevedorById, getDevedorByBlocoUnidade } = await import("./db-devedores");

      // Buscar dados do condomínio para herdar endereço quando não informado na planilha
      const condominioData = await getCondominioById(input.condominioId);

      for (const dado of input.dados) {
        try {
          // 1º: tentar encontrar por CPF/CNPJ
          let devedor = null;
          if (dado.cpfCnpj) {
            devedor = await getDevedorByCpfCnpj(dado.cpfCnpj, input.condominioId);
          }

          // 2º: se não encontrou por CPF/CNPJ, tentar por Bloco + Unidade
          if (!devedor && dado.unidade) {
            devedor = await getDevedorByBlocoUnidade(dado.unidade, dado.bloco, input.condominioId);
          }
          
          if (!devedor) {
            // Criar novo devedor
            // Endereço: usar da planilha se informado, caso contrário herdar do condomínio
            const enderecoFinal = {
              address: dado.address || (condominioData as any)?.address || undefined,
              addressNumber: dado.addressNumber || (condominioData as any)?.addressNumber || undefined,
              addressComplement: dado.addressComplement || (condominioData as any)?.addressComplement || undefined,
              neighborhood: dado.neighborhood || (condominioData as any)?.neighborhood || undefined,
              city: dado.city || condominioData?.city || undefined,
              state: dado.state || condominioData?.state || undefined,
              zipCode: dado.zipCode || condominioData?.zipCode || undefined,
            };
            const devedorResult = await createDevedor({
              condominioId: input.condominioId,
              name: dado.nomeCompleto || null,
              cpfCnpj: dado.cpfCnpj || null,
              email: dado.email,
              phone: dado.telefone,
              unitNumber: dado.unidade,
              bloco: dado.bloco,
              ...enderecoFinal,
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

          // Se status da unidade for ajuizado, criar demanda de cobrança judicial
          if (dado.statusUnidade === "ajuizado" && devedor) {
            try {
              const colunaEntrada = await getColunaEntrada();
              if (colunaEntrada) {
                await createDemanda({
                  condominioId: input.condominioId,
                  colunaId: colunaEntrada.id,
                  assunto: `Cobrança Judicial — ${dado.nomeCompleto || `Unidade ${dado.unidade}`}`,
                  descricao: `Demanda criada automaticamente via importação de planilha. Unidade: ${dado.bloco ? dado.bloco + ' ' : ''}${dado.unidade}.`,
                  tipo: "cobranca_judicial",
                  canal: "manual",
                  prioridade: "alta",
                  devedorId: devedor.id,
                  criadoPorId: ctx.user.id,
                  prazo: null,
                });
              }
            } catch (_e) {
              // Não bloquear importação se a demanda falhar
            }
          }
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
      
      const condominioId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId;
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
      
      const condominioId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId;
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
      
      const condominioId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId;
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
      
      const condominioId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId;
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
      
      const condominioId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId;
      
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
      .input(z.object({}))
      .query(async () => {
        const { listReguasGlobal } = await import("./db-reguas");
        return listReguasGlobal();
      }),

    listByCondominio: protectedProcedure
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
        condominioId: z.number().optional().nullable(),
        nome: z.string().min(1),
        descricao: z.string().optional(),
        tipoCobranca: z.enum(["todos", "condominio", "salao_jogos", "churrasqueira", "cota_extra", "multa", "outros"]).optional(),
        ativa: z.number().optional(),
        // Abrangência
        abrangenciaCondominio: z.enum(["todos", "selecionados"]).optional(),
        condominiosSelecionados: z.string().optional().nullable(), // JSON
        abrangenciaCategoria: z.enum(["todos", "padrao", "ajuizada"]).optional(),
        // Finalidades, critérios e regras (JSON strings)
        finalidades: z.string().optional().nullable(),
        criterios: z.string().optional().nullable(),
        regrasBloqueio: z.string().optional().nullable(),
        prioridade: z.number().optional(),
        intervaloMinimoContatos: z.number().optional(),
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
        // Abrangência
        abrangenciaCondominio: z.enum(["todos", "selecionados"]).optional(),
        condominiosSelecionados: z.string().optional().nullable(),
        abrangenciaCategoria: z.enum(["todos", "padrao", "ajuizada"]).optional(),
        // Finalidades, critérios e regras (JSON strings)
        finalidades: z.string().optional().nullable(),
        criterios: z.string().optional().nullable(),
        regrasBloqueio: z.string().optional().nullable(),
        prioridade: z.number().optional(),
        intervaloMinimoContatos: z.number().optional(),
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
        loopAtivo: z.number().optional(),
        loopAlvoPosicaoId: z.number().nullable().optional(),
        loopIntervaloDias: z.number().optional(),
        loopMaxRepeticoes: z.number().optional(),
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
        loopAtivo: z.number().optional(),
        loopAlvoPosicaoId: z.number().nullable().optional(),
        loopIntervaloDias: z.number().optional(),
        loopMaxRepeticoes: z.number().optional(),
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
      .input(z.object({ reguaId: z.number(), condominioId: z.number().optional().nullable() }))
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
        const condId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId ?? undefined;
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
        const condId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId!;
        return alterarStatusEmLote(input.cobrancaIds, input.novoStatus as any, condId);
      }),
  }),

  // ===== CNAB 240 =====
  cnab: router({
    // ---- Configuração Global CNAB (dados bancários do portador — nível sistema) ----
    getCnabConfigGlobal: adminProcedure
      .query(async () => {
        const { getCnabConfigGlobal } = await import("./db-cnab-config-global");
        return await getCnabConfigGlobal();
      }),

    salvarCnabConfigGlobal: adminProcedure
      .input(z.object({
        banco: z.string().default("208"),
        nomeBanco: z.string().default("BTG PACTUAL"),
        agencia: z.string(),
        digitoAgencia: z.string().default("0"),
        conta: z.string(),
        digitoConta: z.string().default("0"),
        convenio: z.string().default(""),
        ativo: z.number().default(1),
        minimosDiasAntesVencimento: z.number().default(0),
        usarMinimoDias: z.number().default(0),
        enviarParcelasApenasPrimeiraPaga: z.number().default(0),
        enviarParcelasApenasAnteriorPaga: z.number().default(1),
        carteira: z.string().default("1"),
        especieDocumento: z.string().default("DD"),
        aceite: z.string().default("N"),
        localPagamento: z.string().default("PAGAVEL EM QUALQUER BANCO ATE O VENCIMENTO"),
        instrucoesCaixa: z.string().default("APOS VENCIMENTO COBRAR MULTA DE #MULTA# e MORA DIARIA DE #JUROS#"),
        taxaJurosDia: z.string().default("0.03330"),
        taxaMulta: z.string().default("2.00"),
        padraoNomeArquivo: z.string().default("REMESSA_ddmmyyyy.rem"),
        layoutArquivo: z.string().default("CNAB240"),
        enviarInstrucoesProtesto: z.number().default(0),
        habilitarBoleto: z.number().default(1),
        habilitarPix: z.number().default(1),
      }))
      .mutation(async ({ input }) => {
        const { upsertCnabConfigGlobal } = await import("./db-cnab-config-global");
        return await upsertCnabConfigGlobal(input);
      }),

    // ---- Configuração de Boleto por condomínio (beneficiário: nome, CNPJ, endereço, PIX) ----
    getConfiguracaoBoleto: condominioAccessProcedure
      .input(z.object({ condominioId: z.number() }))
      .query(async ({ input, ctx }) => {
        const condId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId!;
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
        const condId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId!;
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
        const condId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId!;
        return listarRemessasCNAB(condId);
      }),

    listarRetornos: protectedProcedure
      .input(z.object({ condominioId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { listarRetornosCNAB } = await import("./db-cnab");
        const condId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId!;
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
        const condId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId!;

        // Buscar configuracao global CNAB (dados bancarios do portador)
        const { getCnabConfigGlobal, cnabGlobalParaDadosBanco, gerarNomeArquivoRemessaGlobal, incrementarSequencialGlobal } = await import("./db-cnab-config-global");
        const configGlobal = await getCnabConfigGlobal();

        // Buscar configuracao por condominio (dados do beneficiario: nome, CNPJ, PIX)
        const { getConfiguracaoBoleto } = await import("./db-configuracao-boleto");
        const configBoleto = await getConfiguracaoBoleto(condId);

        // Buscar nome do condominio para fallback
        const [cond] = await db.select().from(condominios).where(eq(condominios.id, condId)).limit(1);
        const nomeCondominio = cond?.name || "CONDOMINIO";

        // Resolver dados bancarios: prioridade = config global > input manual
        const dadosBanco = configGlobal
          ? cnabGlobalParaDadosBanco(
              configGlobal,
              configBoleto?.nomeBeneficiario || nomeCondominio,
              configBoleto?.cnpjBeneficiario || ""
            )
          : input.dadosBanco;

        if (!dadosBanco) throw new Error("Dados bancarios nao configurados. Configure o portador bancario em Banco > Configuracao CNAB 240 antes de gerar remessa.");

        // Validar CNPJ do beneficiario — obrigatorio para o BTG aceitar o arquivo
        const cnpjLimpo = dadosBanco.cnpjCedente?.replace(/[.\-\/]/g, "").trim();
        if (!cnpjLimpo || cnpjLimpo === "00000000000000" || cnpjLimpo.length < 11) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "CNPJ/CPF do beneficiario nao configurado. Acesse Banco > Configuracao de Boleto, aba Dados do Beneficiario, e preencha o campo CNPJ/CPF Beneficiario antes de gerar a remessa.",
          });
        }

        const cobList = await db.select().from(cobrancas)
          .where(and(inArray(cobrancas.id, input.cobrancaIds), eq(cobrancas.condominioId, condId)));

        const devList = await db.select().from(devedores).where(eq(devedores.condominioId, condId));
        const devMap = new Map(devList.map(d => [d.id, d]));

        const { gerarArquivoRemessaCNAB240, criarRemessaCNAB } = await import("./db-cnab");

        // Incrementar sequencial global e obter nosso numero inicial
        let nossoNumeroBase = 1000000001;
        let numeroRemessa = 1;
        if (configGlobal) {
          const seq = await incrementarSequencialGlobal(cobList.length);
          nossoNumeroBase = seq.nossoNumeroInicio;
          numeroRemessa = seq.numeroSequencial;
        } else {
          const { listarRemessasCNAB: listRemessas } = await import("./db-cnab");
          const remessas = await listRemessas(condId);
          numeroRemessa = remessas.length + 1;
        }

        // Converter taxas da config global para centavos
        const taxaJurosDia = configGlobal
          ? Math.round(parseFloat(configGlobal.taxaJurosDia) * 100)
          : 33; // 0,033% ao dia = 1% ao mes
        const taxaMulta = configGlobal
          ? Math.round(parseFloat(configGlobal.taxaMulta) * 100)
          : 200; // 2,00%
        const instrucoesCaixa = configGlobal?.instrucoesCaixa
          ? configGlobal.instrucoesCaixa
              .replace("#MULTA#", `${configGlobal.taxaMulta}%`)
              .replace("#JUROS#", `${configGlobal.taxaJurosDia}% ao dia`)
          : "COBRAR JUROS DE 1% AO MES";

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
            valorNominal: Math.round(Number(cob.amount)),
            dataVencimento: cob.dueDate ? (() => { const raw = cob.dueDate; const iso = raw instanceof Date ? raw.toISOString() : String(raw); const [y, m, d] = iso.substring(0, 10).split('-').map(Number); return new Date(y, m - 1, d); })() : new Date(),
            dataEmissao: new Date(cob.createdAt),
            instrucao1: instrucoesCaixa,
            instrucao2: "",
            carteira: configGlobal?.carteira || "1",
            especieDocumento: configGlobal?.especieDocumento || "12",
            aceite: configGlobal?.aceite || "N",
            taxaJurosDia,
            taxaMulta,
            enviarProtesto: configGlobal ? configGlobal.enviarInstrucoesProtesto === 1 : false,
          };
        });

        const conteudo = gerarArquivoRemessaCNAB240(dadosBanco, titulos, numeroRemessa);
        const valorTotal = cobList.reduce((s, c) => s + c.amount, 0);

        // Nome do arquivo conforme padrao configurado
        const nomeArquivo = configGlobal
          ? gerarNomeArquivoRemessaGlobal(configGlobal.padraoNomeArquivo)
          : `remessa_cnab240_${condId}_${Date.now()}.rem`;

        // Salvar arquivo no S3 para permitir download posterior
        let urlArquivo: string | undefined;
        try {
          const { storagePut } = await import("./storage");
          const fileKey = `remessas-cnab/${condId}/${Date.now()}-${nomeArquivo}`;
          const { url } = await storagePut(fileKey, Buffer.from(conteudo, "utf-8"), "text/plain");
          urlArquivo = url;
        } catch (e) {
          console.error("[CNAB] Falha ao salvar remessa no S3:", e);
        }

        await criarRemessaCNAB({
          condominioId: condId,
          usuarioId: ctx.user.id,
          banco: dadosBanco.codigoBanco,
          nomeArquivo,
          urlArquivo,
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
        condominioId: z.number().optional(), // opcional — 0 ou omitido = global
        nomeArquivo: z.string(),
        conteudo: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        // condId = 0 significa global (todos os condomínios)
        const condId = ctx.user.role === "admin"
          ? (input.condominioId ?? 0)
          : (ctx.user.condominioId ?? 0);
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

        // Salvar arquivo de retorno no S3
        let urlArquivoRetorno: string | undefined;
        try {
          const { storagePut } = await import("./storage");
          const fileKey = `retornos-cnab/${condId}/${Date.now()}-${input.nomeArquivo}`;
          const { url } = await storagePut(fileKey, Buffer.from(input.conteudo, "utf-8"), "text/plain");
          urlArquivoRetorno = url;
        } catch (e) {
          console.error("[CNAB] Falha ao salvar retorno no S3:", e);
        }

        // Criar registro do retorno no banco
        const [retornoResult] = await db.insert(retornosCNAB).values({
          condominioId: condId,
          usuarioId: ctx.user.id,
          banco: "BTG",
          nomeArquivo: input.nomeArquivo,
          urlArquivo: urlArquivoRetorno,
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
          // O retorno BTG retorna o nosso número com zeros à esquerda (20 chars: '00000000001000000007')
          // mas o banco armazena sem zeros à esquerda ('1000000007').
          // Normalizar removendo zeros à esquerda para fazer o match correto.
          const nossoNumeroRaw = segmentoT.nossoNumero;
          const nossoNumero = nossoNumeroRaw.replace(/^0+/, '') || '0';
          const novoStatus = determinarNovoStatus(segmentoT.codMovimento, segmentoT.codOcorrencia);
          // Limitar ao máximo do MySQL INT para evitar overflow com arquivos externos
          const MAX_INT = 2147483647;
          const valorPago = Math.min(segmentoU.valorPago || 0, MAX_INT);
          const dataVencimento = segmentoT.dataVencimento ? new Date(segmentoT.dataVencimento) : null;
          const dataOcorrencia = segmentoU.dataOcorrencia ? new Date(segmentoU.dataOcorrencia) : null;
          const dataCredito = segmentoU.dataCredito ? new Date(segmentoU.dataCredito) : null;

          let cobrancaId: number | null = null;
          let statusAnterior: string | null = null;
          let statusProcessamento: "processado" | "nao_encontrado" | "erro" = "nao_encontrado";
          let observacao = "";

          // 1. Buscar cobrança avulsa pelo nosso número
          // Busca global: se condId=0 (remessa global), busca em todos os condomínios
          const cobrancaWhere = condId > 0
            ? and(eq(cobrancas.nossoNumero, nossoNumero), eq(cobrancas.condominioId, condId))
            : eq(cobrancas.nossoNumero, nossoNumero);
          const [cobranca] = await db
            .select()
            .from(cobrancas)
            .where(cobrancaWhere)
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
              .where(
                condId > 0
                  ? and(eq(parcelasAcordo.nossoNumero, nossoNumero), eq(acordos.condominioId, condId))
                  : eq(parcelasAcordo.nossoNumero, nossoNumero)
              )
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
            valorTitulo: Math.min(segmentoT.valorTitulo || 0, MAX_INT),
            valorPago,
            valorLiquido: Math.min(segmentoU.valorLiquido || 0, MAX_INT),
            jurosMora: Math.min(segmentoU.jurosMora || 0, MAX_INT),
            desconto: Math.min(segmentoU.desconto || 0, MAX_INT),
            abatimento: Math.min(segmentoU.abatimento || 0, MAX_INT),
            iof: Math.min(segmentoU.iof || 0, MAX_INT),
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
        const condId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId!;

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
        const condId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId!;
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
        const condId = ["admin","advogado"].includes(ctx.user.role) ? input.condominioId : ctx.user.condominioId!;
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { parcelasAcordo, acordos, devedores, condominios } = await import("../drizzle/schema");
        const { eq, and, inArray } = await import("drizzle-orm");

        // Buscar configuracao global CNAB (dados bancarios do portador)
        const { getCnabConfigGlobal, cnabGlobalParaDadosBanco, gerarNomeArquivoRemessaGlobal, incrementarSequencialGlobal } = await import("./db-cnab-config-global");
        const configGlobalAcordos = await getCnabConfigGlobal();
        if (!configGlobalAcordos) throw new TRPCError({ code: "BAD_REQUEST", message: "Configure o portador bancário global em Banco > Configuração CNAB 240 antes de gerar remessa." });

        // Buscar configuracao por condominio (dados do beneficiario)
        const { getConfiguracaoBoleto } = await import("./db-configuracao-boleto");
        const configBoletoAcordos = await getConfiguracaoBoleto(condId);

        const [cond] = await db.select().from(condominios).where(eq(condominios.id, condId)).limit(1);
        const dadosBanco = cnabGlobalParaDadosBanco(
          configGlobalAcordos,
          configBoletoAcordos?.nomeBeneficiario || cond?.name || "CONDOMINIO",
          configBoletoAcordos?.cnpjBeneficiario || ""
        );

        // Validar CNPJ do beneficiario — obrigatorio para o BTG aceitar o arquivo
        const cnpjLimpoParcelas = dadosBanco.cnpjCedente?.replace(/[.\-\/]/g, "").trim();
        if (!cnpjLimpoParcelas || cnpjLimpoParcelas === "00000000000000" || cnpjLimpoParcelas.length < 11) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "CNPJ/CPF do beneficiario nao configurado. Acesse Banco > Configuracao de Boleto, aba Dados do Beneficiario, e preencha o campo CNPJ/CPF Beneficiario antes de gerar a remessa.",
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
          const seqExtra = await incrementarSequencialGlobal(semNossoNumero.length);
          for (let i = 0; i < semNossoNumero.length; i++) {
            const nn = String(seqExtra.nossoNumeroInicio + i).padStart(10, '0');
            await db.update(parcelasAcordo)
              .set({ nossoNumero: nn })
              .where(eq(parcelasAcordo.id, semNossoNumero[i].parcelaId));
            semNossoNumero[i].nossoNumero = nn;
          }
        }

        // Montar títulos para CNAB (interface TituloRemessa)
        const taxaJurosDia = Math.round(parseFloat(configGlobalAcordos.taxaJurosDia) * 100);
        const taxaMulta = Math.round(parseFloat(configGlobalAcordos.taxaMulta) * 100);
        const instrucoesCaixa = (configGlobalAcordos.instrucoesCaixa || '')
          .replace('#MULTA#', configGlobalAcordos.taxaMulta + '%')
          .replace('#JUROS#', configGlobalAcordos.taxaJurosDia + '% ao dia');
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
          valorNominal: Math.round(Number(r.amount)), // converter string "1107.00" para inteiro 1107
          dataVencimento: (() => { const raw = r.dueDate; const iso = raw instanceof Date ? raw.toISOString() : String(raw); const [y, m, d] = iso.substring(0, 10).split('-').map(Number); return new Date(y, m - 1, d); })(),
          dataEmissao: hoje,
          instrucao1: instrucoesCaixa,
          instrucao2: configGlobalAcordos.localPagamento || 'PAGAVEL EM QUALQUER BANCO ATE O VENCIMENTO',
          taxaJurosDia,
          taxaMulta,
          carteira: configGlobalAcordos.carteira || '1',
          especieDocumento: configGlobalAcordos.especieDocumento || '01',
          aceite: configGlobalAcordos.aceite || 'N',
          enviarProtesto: configGlobalAcordos.enviarInstrucoesProtesto === 1,
        }));

        const { gerarArquivoRemessaCNAB240, criarRemessaCNAB } = await import("./db-cnab");
        const numeroRemessa = configGlobalAcordos.numeroSequencialArquivo;
        const nomeArquivo = gerarNomeArquivoRemessaGlobal(configGlobalAcordos.padraoNomeArquivo || 'REMESSA_ddmmyyyy.rem', new Date());

        const conteudo = gerarArquivoRemessaCNAB240(dadosBanco, titulos, numeroRemessa);

        // Salvar arquivo no S3 para permitir download posterior
        let urlArquivoAcordos: string | undefined;
        try {
          const { storagePut } = await import("./storage");
          const fileKey = `remessas-cnab/${condId}/acordos-${Date.now()}-${nomeArquivo}`;
          const { url } = await storagePut(fileKey, Buffer.from(conteudo, "utf-8"), "text/plain");
          urlArquivoAcordos = url;
        } catch (e) {
          console.error("[CNAB] Falha ao salvar remessa de acordos no S3:", e);
        }

        // Salvar remessa no banco
        const remessaResult = await criarRemessaCNAB({
          condominioId: condId,
          usuarioId: ctx.user.id,
          banco: dadosBanco.codigoBanco,
          nomeArquivo,
          urlArquivo: urlArquivoAcordos,
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

    // Lista TODAS as parcelas de acordo pendentes de remessa (todos os condomínios)
    listarParcelasParaRemessaGlobal: protectedProcedure
      .input(z.object({}))
      .query(async ({ ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { parcelasAcordo, acordos, devedores, condominios } = await import("../drizzle/schema");
        const { eq, and, isNull, or } = await import("drizzle-orm");

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
            condominioId: acordos.condominioId,
            condominioNome: condominios.name,
          })
          .from(parcelasAcordo)
          .innerJoin(acordos, eq(parcelasAcordo.acordoId, acordos.id))
          .innerJoin(devedores, eq(acordos.devedorId, devedores.id))
          .innerJoin(condominios, eq(acordos.condominioId, condominios.id))
          .where(
            and(
              eq(acordos.status, "ativo"),
              eq(parcelasAcordo.status, "pendente"),
              or(
                isNull(parcelasAcordo.statusRemessa),
                eq(parcelasAcordo.statusRemessa, "nao_enviado")
              )
            )
          )
          .orderBy(parcelasAcordo.dueDate);

        return rows;
      }),

    // Lista todos os acordos ativos com TODAS as suas parcelas (inclusive futuras/bloqueadas)
    listarAcordosComTodasParcelas: protectedProcedure
      .input(z.object({}))
      .query(async ({ ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { parcelasAcordo, acordos, devedores, condominios } = await import("../drizzle/schema");
        const { eq, and, ne } = await import("drizzle-orm");

        // Buscar todos os acordos ativos com dados do devedor e condomínio
        const acordosAtivos = await db
          .select({
            acordoId: acordos.id,
            acordoStatus: acordos.status,
            totalAmount: acordos.totalAmount,
            agreedAmount: acordos.agreedAmount,
            installments: acordos.installments,
            firstPaymentDate: acordos.firstPaymentDate,
            paymentFrequency: acordos.paymentFrequency,
            notes: acordos.notes,
            createdAt: acordos.createdAt,
            devedorId: devedores.id,
            devedorNome: devedores.name,
            devedorCpfCnpj: devedores.cpfCnpj,
            condominioId: condominios.id,
            condominioNome: condominios.name,
          })
          .from(acordos)
          .innerJoin(devedores, eq(acordos.devedorId, devedores.id))
          .innerJoin(condominios, eq(acordos.condominioId, condominios.id))
          .where(eq(acordos.status, "ativo"))
          .orderBy(acordos.createdAt);

        if (acordosAtivos.length === 0) return [];

        // Buscar todas as parcelas de todos os acordos ativos
        const acordoIds = acordosAtivos.map(a => a.acordoId);
        const { inArray } = await import("drizzle-orm");
        const todasParcelas = await db
          .select()
          .from(parcelasAcordo)
          .where(inArray(parcelasAcordo.acordoId, acordoIds))
          .orderBy(parcelasAcordo.acordoId, parcelasAcordo.installmentNumber);

        // Agrupar parcelas por acordo
        const parcelasPorAcordo = new Map<number, typeof todasParcelas>();
        for (const p of todasParcelas) {
          if (!parcelasPorAcordo.has(p.acordoId)) parcelasPorAcordo.set(p.acordoId, []);
          parcelasPorAcordo.get(p.acordoId)!.push(p);
        }

        // Montar resultado com parcelas enriquecidas com status de liberação
        return acordosAtivos.map(acordo => {
          const parcelas = (parcelasPorAcordo.get(acordo.acordoId) || []).map((p, idx, arr) => {
            // Determinar status de liberação da parcela
            const parcelaAnterior = idx > 0 ? arr[idx - 1] : null;
            const anteriorPaga = !parcelaAnterior || parcelaAnterior.status === "pago";
            const isVencida = new Date(p.dueDate) < new Date() && p.status === "pendente";

            let statusLiberacao: string;
            let motivoBloqueio: string | null = null;

            if (p.status === "pago") {
              statusLiberacao = "liquidada";
            } else if (p.status === "cancelado") {
              statusLiberacao = "cancelada";
            } else if (p.statusRemessa === "enviado" || p.statusRemessa === "retorno_recebido") {
              statusLiberacao = "enviada_banco";
            } else if (p.statusRemessa === "remessa_gerada") {
              statusLiberacao = "em_remessa";
            } else if (!anteriorPaga) {
              statusLiberacao = "aguardando_liberacao";
              motivoBloqueio = `Aguardando pagamento da parcela ${parcelaAnterior!.installmentNumber}`;
            } else if (isVencida) {
              statusLiberacao = "vencida";
            } else {
              statusLiberacao = "disponivel";
            }

            return {
              ...p,
              statusLiberacao,
              motivoBloqueio,
              parcelaAnteriorNumero: parcelaAnterior?.installmentNumber ?? null,
            };
          });

          const totalParcelas = parcelas.length;
          const parcelasPagas = parcelas.filter(p => p.status === "pago").length;
          const parcelasDisponiveis = parcelas.filter(p => p.statusLiberacao === "disponivel").length;
          const parcelasEmRemessa = parcelas.filter(p => p.statusLiberacao === "em_remessa" || p.statusLiberacao === "enviada_banco").length;
          const parcelasVencidas = parcelas.filter(p => p.statusLiberacao === "vencida").length;

          return {
            ...acordo,
            parcelas,
            totalParcelas,
            parcelasPagas,
            parcelasDisponiveis,
            parcelasEmRemessa,
            parcelasVencidas,
          };
        });
      }),

    // Gera remessa CNAB 240 global (todos os condomínios) a partir de parcelas selecionadas
    gerarRemessaAcordosGlobal: protectedProcedure
      .input(z.object({
        parcelaIds: z.array(z.number()).min(1).max(1000),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { parcelasAcordo, acordos, devedores, condominios } = await import("../drizzle/schema");
        const { eq, and, inArray } = await import("drizzle-orm");

        // Buscar configuracao global CNAB
        const { getCnabConfigGlobal, cnabGlobalParaDadosBanco, gerarNomeArquivoRemessaGlobal, incrementarSequencialGlobal } = await import("./db-cnab-config-global");
        const configGlobal = await getCnabConfigGlobal();
        if (!configGlobal) throw new TRPCError({ code: "BAD_REQUEST", message: "Configure o portador bancário global em Banco > Configuração CNAB 240 antes de gerar remessa." });

        // Para remessa global usamos os dados do portador sem beneficiário específico
        // O CNPJ do cedente vem da configuração global (campo cnpjCedente)
        const { getConfiguracaoBoleto } = await import("./db-configuracao-boleto");

        // Buscar parcelas com dados do devedor e condomínio
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
            condominioId: acordos.condominioId,
          })
          .from(parcelasAcordo)
          .innerJoin(acordos, eq(parcelasAcordo.acordoId, acordos.id))
          .innerJoin(devedores, eq(acordos.devedorId, devedores.id))
          .where(inArray(parcelasAcordo.id, input.parcelaIds));

        if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma parcela encontrada." });

        // Atribuir nossoNumero para parcelas que ainda não têm
        const semNossoNumero = rows.filter(r => !r.nossoNumero);
        if (semNossoNumero.length > 0) {
          const seqExtra = await incrementarSequencialGlobal(semNossoNumero.length);
          for (let i = 0; i < semNossoNumero.length; i++) {
            const nn = String(seqExtra.nossoNumeroInicio + i).padStart(10, '0');
            await db.update(parcelasAcordo)
              .set({ nossoNumero: nn })
              .where(eq(parcelasAcordo.id, semNossoNumero[i].parcelaId));
            semNossoNumero[i].nossoNumero = nn;
          }
        }

        // Buscar config do primeiro condomínio encontrado para dados do beneficiário
        // (ou usar o campo cedente da config global se disponível)
        const primeiroCondId = rows[0].condominioId;
        const configBoleto = await getConfiguracaoBoleto(primeiroCondId);
        const [primeiroCond] = await db.select().from(condominios).where(eq(condominios.id, primeiroCondId)).limit(1);
        const dadosBanco = cnabGlobalParaDadosBanco(
          configGlobal,
          configBoleto?.nomeBeneficiario || primeiroCond?.name || 'CEDENTE',
          configBoleto?.cnpjBeneficiario || ''
        );

        const cnpjLimpo = dadosBanco.cnpjCedente?.replace(/[.\-\/]/g, "").trim();
        if (!cnpjLimpo || cnpjLimpo === "00000000000000" || cnpjLimpo.length < 11) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "CNPJ/CPF do cedente não configurado. Acesse Banco > Configuração CNAB 240 e preencha o campo CNPJ/CPF Cedente.",
          });
        }

        const taxaJurosDia = Math.round(parseFloat(configGlobal.taxaJurosDia) * 100);
        const taxaMulta = Math.round(parseFloat(configGlobal.taxaMulta) * 100);
        const instrucoesCaixa = (configGlobal.instrucoesCaixa || '')
          .replace('#MULTA#', configGlobal.taxaMulta + '%')
          .replace('#JUROS#', configGlobal.taxaJurosDia + '% ao dia');
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
          valorNominal: Math.round(Number(r.amount)),
          dataVencimento: (() => { const raw = r.dueDate; const iso = raw instanceof Date ? raw.toISOString() : String(raw); const [y, m, d] = iso.substring(0, 10).split('-').map(Number); return new Date(y, m - 1, d); })(),
          dataEmissao: hoje,
          instrucao1: instrucoesCaixa,
          instrucao2: configGlobal.localPagamento || 'PAGAVEL EM QUALQUER BANCO ATE O VENCIMENTO',
          taxaJurosDia,
          taxaMulta,
          carteira: configGlobal.carteira || '1',
          especieDocumento: configGlobal.especieDocumento || '01',
          aceite: configGlobal.aceite || 'N',
          enviarProtesto: configGlobal.enviarInstrucoesProtesto === 1,
        }));

        const { gerarArquivoRemessaCNAB240, criarRemessaCNAB } = await import("./db-cnab");
        const nomeArquivo = gerarNomeArquivoRemessaGlobal(configGlobal.padraoNomeArquivo || 'REMESSA_ddmmyyyy.rem', new Date());
        const conteudo = gerarArquivoRemessaCNAB240(dadosBanco, titulos, configGlobal.numeroSequencialArquivo);

        // Salvar no S3
        let urlArquivo: string | undefined;
        try {
          const { storagePut } = await import("./storage");
          const fileKey = `remessas-cnab/global/${Date.now()}-${nomeArquivo}`;
          const { url } = await storagePut(fileKey, Buffer.from(conteudo, "utf-8"), "text/plain");
          urlArquivo = url;
        } catch (e) {
          console.error("[CNAB] Falha ao salvar remessa global no S3:", e);
        }

        // Salvar remessa no banco (condominioId = 0 para indicar global)
        const remessaResult = await criarRemessaCNAB({
          condominioId: 0,
          usuarioId: ctx.user.id,
          banco: dadosBanco.codigoBanco,
          nomeArquivo,
          urlArquivo,
          totalTitulos: titulos.length,
          nossoNumeroInicio: rows[0].nossoNumero || '',
          nossoNumeroFim: rows[rows.length - 1].nossoNumero || '',
        });
        const remessaId = Number((remessaResult as any)?.[0]?.insertId || 0);

        // Atualizar statusRemessa das parcelas
        await db.update(parcelasAcordo)
          .set({ statusRemessa: "remessa_gerada", remessaId: remessaId || null })
          .where(inArray(parcelasAcordo.id, input.parcelaIds));

        return { nomeArquivo, conteudo, totalParcelas: titulos.length, remessaId };
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
        cobrancaId: z.number().nullable().optional(),
        contactType: z.enum(["telefone", "email", "pessoal", "whatsapp"]),
        result: z.enum(["sem_resposta", "promessa_pagamento", "deseja_acordo", "recusa", "outro"]),
        notes: z.string().optional(),
        nextAttemptDate: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { tentativasCobranca: tc, devedores: dev, cobrancas } = await import("../drizzle/schema");
        const { eq, and, inArray } = await import("drizzle-orm");
        // Buscar condominioId do devedor
        const devedorResult = await db.select({ condominioId: dev.condominioId }).from(dev).where(eq(dev.id, input.devedorId)).limit(1);
        const condominioId = devedorResult[0]?.condominioId ?? 0;
        // Se cobrancaId não fornecido, usar a cobrança pendente mais antiga
        let cobrancaId = input.cobrancaId ?? null;
        if (!cobrancaId) {
          const pendentes = await db.select({ id: cobrancas.id, dueDate: cobrancas.dueDate })
            .from(cobrancas)
            .where(and(eq(cobrancas.devedorId, input.devedorId), inArray(cobrancas.status, ["pendente", "em_cobranca"])))
            .limit(10);
          if (pendentes.length > 0) {
            const mais = pendentes.reduce((a, b) => (a.dueDate ?? 0) < (b.dueDate ?? 0) ? a : b);
            cobrancaId = mais.id;
          }
        }
        await db.insert(tc).values({
          devedorId: input.devedorId,
          cobrancaId: cobrancaId ?? null,
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
        tipo: z.enum(["proposta_acordo","termo_acordo","notificacao_debito","carta_cobranca","recibo_pagamento","contrato_parcelamento","procuracao","carta_preposto","ata_audiencia","notificacao_juridica","outro"]),
        conteudoHtml: z.string(),
        condominioId: z.number().nullable().optional(),
        logoUrl: z.string().nullable().optional(),
        logoAlinhamento: z.enum(["esquerda","centro","direita"]).optional(),
        logoPosicaoVertical: z.enum(["topo","rodape"]).optional(),
        logoLargura: z.number().min(40).max(400).optional(),
        marcaDaguaUrl: z.string().nullable().optional(),
        marcaDaguaOpacidade: z.number().min(1).max(50).optional(),
        marcaDaguaPosicao: z.enum(["diagonal","centro","topo","rodape"]).optional(),
        margemSuperior: z.number().optional(),
        margemInferior: z.number().optional(),
        margemEsquerda: z.number().optional(),
        margemDireita: z.number().optional(),
        canvasElements: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createModelo } = await import("./db-modelos");
        const rawId = await createModelo({
          ...input,
          condominioId: input.condominioId ?? ctx.user?.condominioId ?? null,
          createdBy: ctx.user?.id,
        });
        // Garantir que id seja number primitivo (não bigint) para serialização JSON
        const id = typeof rawId === 'bigint' ? Number(rawId) : (rawId as number);
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        nome: z.string().min(1).optional(),
        tipo: z.enum(["proposta_acordo","termo_acordo","notificacao_debito","carta_cobranca","recibo_pagamento","contrato_parcelamento","procuracao","carta_preposto","ata_audiencia","notificacao_juridica","outro"]).optional(),
        conteudoHtml: z.string().optional(),
        logoUrl: z.string().nullable().optional(),
        logoAlinhamento: z.enum(["esquerda","centro","direita"]).optional(),
        logoPosicaoVertical: z.enum(["topo","rodape"]).optional(),
        logoLargura: z.number().min(40).max(400).optional(),
        marcaDaguaUrl: z.string().nullable().optional(),
        marcaDaguaOpacidade: z.number().min(1).max(50).optional(),
        marcaDaguaPosicao: z.enum(["diagonal","centro","topo","rodape"]).optional(),
        margemSuperior: z.number().optional(),
        margemInferior: z.number().optional(),
        margemEsquerda: z.number().optional(),
        margemDireita: z.number().optional(),
        canvasElements: z.string().nullable().optional(),
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
          numero: z.number().optional(),
          descricao: z.string().optional(),
          vencimento: z.string(),
          valorOriginal: z.string().optional(),
          juros: z.string().optional(),
          multa: z.string().optional(),
          honorarios: z.string().optional(),
          correcao: z.string().optional(),
          valorAtualizado: z.string().optional(),
          valor: z.string().optional(), // compat. retroativa
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
          if (!variaveis.valorParcela && input.parcelas[0]) variaveis.valorParcela = input.parcelas[0].valorAtualizado || input.parcelas[0].valor || "";
          if (!variaveis.dataVencimentoPrimeiraParcela && input.parcelas[0]) variaveis.dataVencimentoPrimeiraParcela = input.parcelas[0].vencimento;
        }

        // Buscar anexos do modelo
        const { listAnexosByModelo } = await import("./db-modelos");
        const anexos = await listAnexosByModelo(input.modeloId);

        const pdfBuffer = await gerarPDFModelo({
          conteudoHtml: modelo.conteudoHtml,
          logoUrl: modelo.logoUrl,
          marcaDaguaUrl: modelo.marcaDaguaUrl,
          logoAlinhamento: (modelo.logoAlinhamento as any) ?? "esquerda",
          logoPosicaoVertical: (modelo.logoPosicaoVertical as any) ?? "topo",
          logoLargura: modelo.logoLargura ?? 120,
          marcaDaguaOpacidade: modelo.marcaDaguaOpacidade ?? 8,
          marcaDaguaPosicao: (modelo.marcaDaguaPosicao as any) ?? "diagonal",
          margemSuperior: modelo.margemSuperior ?? 40,
          margemInferior: modelo.margemInferior ?? 40,
          margemEsquerda: modelo.margemEsquerda ?? 50,
          margemDireita: modelo.margemDireita ?? 50,
          variaveis,
          anexos: anexos.map(a => ({ url: a.url, largura: a.largura ?? 400, alinhamento: (a.alinhamento as any) ?? "centro", legenda: a.legenda ?? undefined })),
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

    // ─── Gerenciamento de Anexos ────────────────────────────────────────────
    listAnexos: protectedProcedure
      .input(z.object({ modeloId: z.number() }))
      .query(async ({ input }) => {
        const { listAnexosByModelo } = await import("./db-modelos");
        const rows = await listAnexosByModelo(input.modeloId);
        return rows.map(r => ({ ...r, id: Number(r.id), modeloId: Number(r.modeloId) }));
      }),

    addAnexo: protectedProcedure
      .input(z.object({
        modeloId: z.number(),
        nomeArquivo: z.string(),
        mimeType: z.string(),
        base64: z.string(),
        legenda: z.string().optional(),
        largura: z.number().min(40).max(800).optional(),
        alinhamento: z.enum(["esquerda","centro","direita"]).optional(),
        ordem: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { storagePut } = await import("./storage");
        const { createAnexo, listAnexosByModelo } = await import("./db-modelos");
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.nomeArquivo.split(".").pop() || "jpg";
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `modelos/anexos/${input.modeloId}-${randomSuffix}.${ext}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        // Calcular próxima ordem
        const existentes = await listAnexosByModelo(input.modeloId);
        const proximaOrdem = input.ordem ?? existentes.length;
        const id = await createAnexo({
          modeloId: input.modeloId,
          url,
          nomeOriginal: input.nomeArquivo,
          mimeType: input.mimeType,
          tamanhoBytes: buffer.length,
          legenda: input.legenda,
          largura: input.largura ?? 400,
          alinhamento: input.alinhamento ?? "centro",
          ordem: proximaOrdem,
        });
        return { id, url };
      }),

    updateAnexo: protectedProcedure
      .input(z.object({
        id: z.number(),
        legenda: z.string().optional(),
        largura: z.number().min(40).max(800).optional(),
        alinhamento: z.enum(["esquerda","centro","direita"]).optional(),
        ordem: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { updateAnexo } = await import("./db-modelos");
        const { id, ...data } = input;
        await updateAnexo(id, data);
        return { success: true };
      }),

    deleteAnexo: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteAnexo } = await import("./db-modelos");
        await deleteAnexo(input.id);
        return { success: true };
      }),

    reordenarAnexos: protectedProcedure
      .input(z.object({
        modeloId: z.number(),
        ids: z.array(z.number()), // IDs na nova ordem
      }))
      .mutation(async ({ input }) => {
        const { reordenarAnexos } = await import("./db-modelos");
        await reordenarAnexos(input.modeloId, input.ids);
        return { success: true };
      }),
  }),

  // ─── Módulo Jurídico ────────────────────────────────────────────────────────
  juridico: router({
    // Listar tickets (admin vê todos; síndico vê apenas do seu condomínio)
    listTickets: requirePermission("juridico_demandas", "visualizar")
      .input(z.object({ condominioId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const { getAllTickets, getTicketsByCondominio } = await import("./db-juridico");
        if (ctx.user.role === "admin") {
          const tickets = await getAllTickets();
          return tickets.map((t) => ({ ...t, id: Number(t.id) }));
        }
        const condId = ctx.user.condominioId;
        if (!condId) return [];
        const tickets = await getTicketsByCondominio(condId);
        return tickets.map((t) => ({ ...t, id: Number(t.id) }));
      }),

    getTicket: requirePermission("juridico_demandas", "visualizar")
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getTicketById } = await import("./db-juridico");
        const ticket = await getTicketById(input.id);
        if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });
        // Sindico só pode ver tickets do seu condomínio
        if (ctx.user.role !== "admin" && ticket.condominioId !== ctx.user.condominioId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return { ...ticket, id: Number(ticket.id) };
      }),

    createTicket: requirePermission("juridico_demandas", "criar")
      .input(z.object({
        titulo: z.string().min(3).max(255),
        descricao: z.string().min(10),
        categoria: z.enum(["consultoria", "notificacao", "acao_judicial", "cobranca_judicial", "assembleia", "contrato", "outro"]),
        prioridade: z.enum(["baixa", "media", "alta", "urgente"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const condominioId = ctx.user.condominioId;
        if (!condominioId && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário não vinculado a um condomínio" });
        }
        const { createTicket } = await import("./db-juridico");
        const result = await createTicket({
          condominioId: condominioId ?? 0,
          titulo: input.titulo,
          descricao: input.descricao,
          categoria: input.categoria,
          prioridade: input.prioridade,
          criadoPorId: ctx.user.id,
        });
        return result;
      }),

    // Criação de ticket pelo admin (escolhe o condomínio manualmente)
    createTicketAdmin: adminProcedure
      .input(z.object({
        condominioId: z.number().int().positive(),
        titulo: z.string().min(3).max(255),
        descricao: z.string().min(10),
        categoria: z.enum(["consultoria", "notificacao", "acao_judicial", "cobranca_judicial", "assembleia", "contrato", "outro"]),
        prioridade: z.enum(["baixa", "media", "alta", "urgente"]),
        responsavelId: z.number().nullable().optional(),
        mensagemInicial: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { createTicket, createMensagem } = await import("./db-juridico");
        const ticket = await createTicket({
          condominioId: input.condominioId,
          titulo: input.titulo,
          descricao: input.descricao,
          categoria: input.categoria,
          prioridade: input.prioridade,
          criadoPorId: ctx.user.id,
          responsavelId: input.responsavelId ?? null,
        });
        // Se houver mensagem inicial, adicioná-la como primeira mensagem do escritório
        if (input.mensagemInicial?.trim()) {
          await createMensagem({
            ticketId: Number(ticket.id),
            autorId: ctx.user.id,
            conteudo: input.mensagemInicial.trim(),
            tipoAutor: "escritorio",
          });
        }
        return { ...ticket, id: Number(ticket.id) };
      }),

    updateTicket: requirePermission("juridico_demandas", "editar")
      .input(z.object({
        id: z.number(),
        status: z.enum(["aberto", "em_andamento", "aguardando_cliente", "resolvido", "cancelado"]).optional(),
        prioridade: z.enum(["baixa", "media", "alta", "urgente"]).optional(),
        responsavelId: z.number().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getTicketById, updateTicket, createMensagem } = await import("./db-juridico");
        const ticket = await getTicketById(input.id);
        if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });
        if (ctx.user.role !== "admin" && ticket.condominioId !== ctx.user.condominioId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const { id, ...data } = input;
        const updateData: any = { ...data };
        if (data.status === "resolvido") updateData.resolvidoEm = new Date();

        // Se o responsável está sendo alterado, registrar mensagem de sistema no chat
        if ("responsavelId" in data && data.responsavelId !== undefined) {
          const responsavelAnteriorId = ticket.responsavelId ? Number(ticket.responsavelId) : null;
          const novoResponsavelId = data.responsavelId;
          const mudou = responsavelAnteriorId !== novoResponsavelId;
          if (mudou) {
            // Busca nomes para compor a mensagem
            const db = await getDb();
            let nomeAnterior = "Ninguém";
            let nomeNovo = "Ninguém";
            if (db) {
              const { users } = await import("../drizzle/schema");
              const { eq } = await import("drizzle-orm");
              if (responsavelAnteriorId) {
                const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, responsavelAnteriorId));
                if (u?.name) nomeAnterior = u.name;
              }
              if (novoResponsavelId) {
                const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, novoResponsavelId));
                if (u?.name) nomeNovo = u.name;
              }
            }
            const quemAlterou = ctx.user.name ?? ctx.user.email ?? "Admin";
            const conteudo = novoResponsavelId
              ? `🔄 **${quemAlterou}** reatribuiu o ticket de **${nomeAnterior}** para **${nomeNovo}**.`
              : `🔄 **${quemAlterou}** removeu o responsável **${nomeAnterior}** do ticket.`;
            await createMensagem({
              ticketId: id,
              autorId: ctx.user.id,
              conteudo,
              tipoAutor: "sistema",
            });
          }
        }

        return await updateTicket(id, updateData);
      }),

    // Mensagens do ticket
    getMensagens: protectedProcedure
      .input(z.object({ ticketId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getTicketById, getMensagensByTicket } = await import("./db-juridico");
        const ticket = await getTicketById(input.ticketId);
        if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });
        if (ctx.user.role !== "admin" && ticket.condominioId !== ctx.user.condominioId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return getMensagensByTicket(input.ticketId);
      }),

    sendMensagem: protectedProcedure
      .input(z.object({
        ticketId: z.number(),
        conteudo: z.string().min(1),
        anexos: z.array(z.object({
          nome: z.string(),
          url: z.string(),
          tipo: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getTicketById, createMensagem } = await import("./db-juridico");
        const ticket = await getTicketById(input.ticketId);
        if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });
        if (ctx.user.role !== "admin" && ticket.condominioId !== ctx.user.condominioId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const tipoAutor: "cliente" | "escritorio" = ctx.user.role === "admin" ? "escritorio" : "cliente";
        // Se admin responde, muda status para em_andamento automaticamente
        if (ctx.user.role === "admin" && ticket.status === "aberto") {
          const { updateTicket } = await import("./db-juridico");
          await updateTicket(input.ticketId, { status: "em_andamento" });
        }
        return createMensagem({
          ticketId: input.ticketId,
          autorId: ctx.user.id,
          conteudo: input.conteudo,
          tipoAutor,
          anexos: input.anexos,
        });
      }),

    // Upload de anexo para S3
    uploadAnexo: protectedProcedure
      .input(z.object({
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "bin";
        const key = `juridico/anexos/${ctx.user.id}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        return { url, nome: input.fileName, tipo: input.mimeType };
      }),

    // Estatísticas de produtividade por responsável (admin only)
    statsResponsaveis: adminProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) return [];
        const { juridicoTickets } = await import("../drizzle/schema");
        const { users } = await import("../drizzle/schema");
        const { eq, and, isNotNull, sql, count } = await import("drizzle-orm");

        // Busca todos os tickets com responsavel
        const rows = await db
          .select({
            responsavelId: juridicoTickets.responsavelId,
            responsavelNome: users.name,
            status: juridicoTickets.status,
            resolvidoEm: juridicoTickets.resolvidoEm,
            createdAt: juridicoTickets.createdAt,
          })
          .from(juridicoTickets)
          .leftJoin(users, eq(juridicoTickets.responsavelId, users.id))
          .where(isNotNull(juridicoTickets.responsavelId));

        // Agrupa por responsável
        const mapa = new Map<number, {
          id: number;
          nome: string;
          total: number;
          aberto: number;
          emAndamento: number;
          aguardando: number;
          resolvido: number;
          cancelado: number;
          tempoMedioMs: number | null;
          temposResolucao: number[];
        }>();

        for (const r of rows) {
          if (!r.responsavelId) continue;
          const id = Number(r.responsavelId);
          if (!mapa.has(id)) {
            mapa.set(id, {
              id,
              nome: r.responsavelNome ?? "Desconhecido",
              total: 0,
              aberto: 0,
              emAndamento: 0,
              aguardando: 0,
              resolvido: 0,
              cancelado: 0,
              tempoMedioMs: null,
              temposResolucao: [],
            });
          }
          const entry = mapa.get(id)!;
          entry.total++;
          if (r.status === "aberto") entry.aberto++;
          else if (r.status === "em_andamento") entry.emAndamento++;
          else if (r.status === "aguardando_cliente") entry.aguardando++;
          else if (r.status === "resolvido") entry.resolvido++;
          else if (r.status === "cancelado") entry.cancelado++;

          if (r.status === "resolvido" && r.resolvidoEm && r.createdAt) {
            const ms = new Date(r.resolvidoEm).getTime() - new Date(r.createdAt).getTime();
            if (ms > 0) entry.temposResolucao.push(ms);
          }
        }

        return Array.from(mapa.values()).map((e) => ({
          id: e.id,
          nome: e.nome,
          total: e.total,
          aberto: e.aberto,
          emAndamento: e.emAndamento,
          aguardando: e.aguardando,
          resolvido: e.resolvido,
          cancelado: e.cancelado,
          taxaResolucao: e.total > 0 ? Math.round((e.resolvido / e.total) * 100) : 0,
          tempoMedioDias: e.temposResolucao.length > 0
            ? Math.round(e.temposResolucao.reduce((a, b) => a + b, 0) / e.temposResolucao.length / (1000 * 60 * 60 * 24))
            : null,
        })).sort((a, b) => b.total - a.total);
      }),
  }),

  // ─── Módulo de Perfis e Permissões (RBAC) ────────────────────────────────────
  profiles: router({

    // Listar todos os perfis com contagem de usuários
    list: adminProcedure.query(async () => {
      const { getProfileStats } = await import("./db-profiles");
      return getProfileStats();
    }),

    // Buscar perfil por ID com suas permissões
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getProfileById, getPermissionsByProfile } = await import("./db-profiles");
        const profile = await getProfileById(input.id);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
        const permissions = await getPermissionsByProfile(input.id);
        return { ...profile, permissions };
      }),

    // Criar novo perfil
    create: adminProcedure
      .input(z.object({
        nome: z.string().min(2).max(100),
        descricao: z.string().optional(),
        cor: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { createProfile } = await import("./db-profiles");
        return createProfile(input);
      }),

    // Atualizar dados do perfil
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(2).max(100).optional(),
        descricao: z.string().optional(),
        cor: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { updateProfile, getProfileById } = await import("./db-profiles");
        const profile = await getProfileById(input.id);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
        if (profile.isSystem) throw new TRPCError({ code: "FORBIDDEN", message: "Perfis do sistema não podem ser editados" });
        const { id, ...data } = input;
        return updateProfile(id, data);
      }),

    // Excluir perfil
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteProfile, getProfileById } = await import("./db-profiles");
        const profile = await getProfileById(input.id);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
        if (profile.isSystem) throw new TRPCError({ code: "FORBIDDEN", message: "Perfis do sistema não podem ser excluídos" });
        return deleteProfile(input.id);
      }),

    // Salvar permissões de um perfil (substitui todas)
    setPermissions: adminProcedure
      .input(z.object({
        profileId: z.number(),
        permissions: z.array(z.object({
          modulo: z.string(),
          acao: z.string(),
          permitido: z.number(),
        })),
      }))
      .mutation(async ({ input }) => {
        const { setPermissions, getProfileById } = await import("./db-profiles");
        const { invalidatePermCacheForProfile } = await import("./rbac");
        const profile = await getProfileById(input.profileId);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
        const result = await setPermissions(input.profileId, input.permissions);
        // Invalidar cache de todos os usuários com este perfil
        await invalidatePermCacheForProfile(input.profileId);
        return result;
      }),

    // Atribuir perfil a um usuário
    assignToUser: adminProcedure
      .input(z.object({
        userId: z.number(),
        profileId: z.number().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { assignProfileToUser } = await import("./db-profiles");
        const { invalidatePermCache } = await import("./rbac");
        const result = await assignProfileToUser(input.userId, input.profileId, ctx.user.id);
        // Invalidar cache de permissões do usuário afetado
        invalidatePermCache(input.userId);
        return result;
      }),

    // Listar módulos e ações disponíveis (para o editor de permissões)
    getModulosAcoes: adminProcedure.query(async () => {
      const { MODULOS, ACOES } = await import("./db-profiles");
      return { modulos: MODULOS, acoes: ACOES };
    }),

    // Listar usuários com seus perfis atribuídos
    listUsersWithProfiles: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const { users, profiles } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const rows = await db
        .select({
          userId: users.id,
          userName: users.name,
          userEmail: users.email,
          userRole: users.role,
          isActive: users.isActive,
          condominioId: users.condominioId,
          profileId: users.profileId,
          profileNome: profiles.nome,
          profileCor: profiles.cor,
        })
        .from(users)
        .leftJoin(profiles, eq(users.profileId, profiles.id))
        .orderBy(users.name);
      // Converter BigInt para Number para serialização JSON correta
      return rows.map((r) => ({
        ...r,
        userId: Number(r.userId),
        condominioId: r.condominioId ? Number(r.condominioId) : null,
        profileId: r.profileId ? Number(r.profileId) : null,
      }));
    }),

    // Criar perfis padrão do sistema (idempotente)
    seedDefaultProfiles: adminProcedure.mutation(async () => {
      const { PERFIS_PADRAO, MODULOS, ACOES } = await import("./db-profiles");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { profiles: profilesTable, profilePermissions: ppTable } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const resultados: string[] = [];
      for (const p of PERFIS_PADRAO) {
        // Verificar se já existe
        const existing = await db.select({ id: profilesTable.id }).from(profilesTable).where(eq(profilesTable.nome, p.nome)).limit(1);
        if (existing.length) {
          resultados.push(`Já existe: ${p.nome}`);
          continue;
        }
        const inserted = await db.insert(profilesTable).values({
          nome: p.nome,
          descricao: p.descricao,
          cor: p.cor,
          isSystem: p.nome === "Administrador Master" ? 1 : 0,
        });
        const profileId = Number((inserted as any).insertId);

        // Inserir permissões
        const perms: Array<{ profileId: number; modulo: string; acao: string; permitido: number }> = [];
        if (p.permissoes === "all") {
          for (const m of MODULOS) {
            for (const a of ACOES) {
              perms.push({ profileId, modulo: m.id, acao: a.id, permitido: 1 });
            }
          }
        } else {
          for (const perm of p.permissoes as readonly string[]) {
            const [modulo, acao] = perm.split(":");
            perms.push({ profileId, modulo, acao, permitido: 1 });
          }
        }
        if (perms.length > 0) await db.insert(ppTable).values(perms);
        resultados.push(`Criado: ${p.nome} (${perms.length} permissões)`);
      }
      return { resultados };
    }),

    // Buscar permissões do usuário logado (para colaborador filtrar o menu)
    getMyPermissions: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { modulos: [], permissoes: {} as Record<string, Record<string, boolean>> };
      const { users, profilePermissions, profiles } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      // Buscar profileId do usuário logado
      const userRow = await db.select({ profileId: users.profileId }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const profileId = userRow[0]?.profileId ? Number(userRow[0].profileId) : null;

      if (!profileId) {
        // Sem perfil: retorna permissões vazias
        return { profileId: null, profileNome: null, permissoes: {} as Record<string, Record<string, boolean>> };
      }

      const perms = await db.select().from(profilePermissions).where(eq(profilePermissions.profileId, profileId));
      const profileRow = await db.select({ nome: profiles.nome, cor: profiles.cor }).from(profiles).where(eq(profiles.id, profileId)).limit(1);

      // Montar mapa { modulo: { acao: boolean } }
      const permissoes: Record<string, Record<string, boolean>> = {};
      for (const p of perms) {
        if (!permissoes[p.modulo]) permissoes[p.modulo] = {};
        permissoes[p.modulo][p.acao] = p.permitido === 1;
      }

      return {
        profileId,
        profileNome: profileRow[0]?.nome ?? null,
        profileCor: profileRow[0]?.cor ?? null,
        permissoes,
      };
    }),
  }),
  // ─── E-mail Microsoft 365 ─────────────────────────────────────────────────
  emailConfig: router({
    get: protectedProcedure.query(async () => {
      const { getEmailConfig } = await import("./email-service");
      const config = await getEmailConfig();
      if (!config) return null;
      // Nunca retornar o clientSecret completo — mascarar
      return {
        id: config.id,
        tenantId: config.tenantId,
        clientId: config.clientId,
        clientSecretMasked: config.clientSecret ? "***" + config.clientSecret.slice(-4) : "",
        emailRemetente: config.emailRemetente,
        nomeRemetente: config.nomeRemetente,
        ativo: config.ativo,
      };
    }),

    save: protectedProcedure
      .input(z.object({
        tenantId: z.string().min(1),
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        emailRemetente: z.string().email(),
        nomeRemetente: z.string().min(1).default("Sistema de Cobranças"),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
        const { emailConfig } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        // Verificar se já existe uma config
        const [existing] = await db.select({ id: emailConfig.id }).from(emailConfig).limit(1);
        if (existing) {
          await db.update(emailConfig).set({ ...input, updatedAt: new Date() }).where(eq(emailConfig.id, existing.id));
          return { id: existing.id };
        } else {
          const [result] = await db.insert(emailConfig).values(input);
          const id = typeof (result as any).insertId === "bigint" ? Number((result as any).insertId) : (result as any).insertId;
          return { id };
        }
      }),

    testar: protectedProcedure.mutation(async () => {
      const { testarConexaoEmail } = await import("./email-service");
      return testarConexaoEmail();
    }),
  }),

  email: router({
    enviar: protectedProcedure
      .input(z.object({
        devedorId: z.number().int().positive(),
        destinatario: z.string().email(),
        nomeDestinatario: z.string().optional(),
        assunto: z.string().min(1),
        corpoHtml: z.string().min(1),
        condominioId: z.number().optional(),
        modeloId: z.number().optional(),
        // Anexos: cada item pode ser URL pública ou base64 direto
        anexos: z.array(z.object({
          nome: z.string().min(1),
          url: z.string().optional(),          // URL pública (boleto S3, etc.)
          conteudoBase64: z.string().optional(), // base64 direto
          mimeType: z.string().default("application/pdf"),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { enviarEmailMicrosoft365, urlParaBase64 } = await import("./email-service");

        // Resolver anexos: baixar URLs e converter para base64
        const anexosResolvidos: { nome: string; conteudoBase64: string; mimeType: string }[] = [];
        if (input.anexos && input.anexos.length > 0) {
          for (const anexo of input.anexos) {
            if (anexo.conteudoBase64) {
              anexosResolvidos.push({
                nome: anexo.nome,
                conteudoBase64: anexo.conteudoBase64,
                mimeType: anexo.mimeType,
              });
            } else if (anexo.url) {
              const { base64, mimeType, nome } = await urlParaBase64(anexo.url);
              anexosResolvidos.push({
                nome: anexo.nome || nome,
                conteudoBase64: base64,
                mimeType: anexo.mimeType || mimeType,
              });
            }
          }
        }

        return enviarEmailMicrosoft365({
          devedorId: input.devedorId,
          destinatario: input.destinatario,
          nomeDestinatario: input.nomeDestinatario,
          assunto: input.assunto,
          corpoHtml: input.corpoHtml,
          condominioId: input.condominioId,
          modeloId: input.modeloId,
          enviadoPorId: ctx.user.id,
          anexos: anexosResolvidos.length > 0 ? anexosResolvidos : undefined,
        });
      }),

    listarPorDevedor: protectedProcedure
      .input(z.object({ devedorId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const { emailsEnviados } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");
        return db
          .select()
          .from(emailsEnviados)
          .where(eq(emailsEnviados.devedorId, input.devedorId))
          .orderBy(desc(emailsEnviados.createdAt))
          .limit(50);
      }),
  }),

  // ─── WhatsApp Z-API ──────────────────────────────────────────────────────────
  whatsapp: router({
    // ── Instâncias ──────────────────────────────────────────────────────────
    listarInstancias: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const { whatsappInstancias } = await import("../drizzle/schema");
      const { asc } = await import("drizzle-orm");
      return db.select().from(whatsappInstancias).orderBy(asc(whatsappInstancias.nome));
    }),

    salvarInstancia: protectedProcedure
      .input(z.object({
        id: z.number().int().positive().optional(),
        nome: z.string().min(1),
        setor: z.enum(["cobranca", "juridico", "geral"]),
        instanceId: z.string().min(1),
        token: z.string().min(1),
        clientToken: z.string().min(1),
        ativo: z.number().int().min(0).max(1).default(1),
        // Cadência anti-ban
        delayMinSegundos: z.number().int().min(1).max(300).default(8),
        delayMaxSegundos: z.number().int().min(1).max(600).default(25),
        limiteHora: z.number().int().min(1).max(500).default(20),
        limiteDia: z.number().int().min(1).max(5000).default(150),
        horarioInicioEnvio: z.string().default("08:00"),
        horarioFimEnvio: z.string().default("20:00"),
        diasSemana: z.string().default("1,2,3,4,5"),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB indisponível");
        const { whatsappInstancias } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const cadenciaFields = {
          delayMinSegundos: input.delayMinSegundos,
          delayMaxSegundos: input.delayMaxSegundos,
          limiteHora: input.limiteHora,
          limiteDia: input.limiteDia,
          horarioInicioEnvio: input.horarioInicioEnvio,
          horarioFimEnvio: input.horarioFimEnvio,
          diasSemana: input.diasSemana,
        };
        if (input.id) {
          await db.update(whatsappInstancias)
            .set({ nome: input.nome, setor: input.setor, instanceId: input.instanceId, token: input.token, clientToken: input.clientToken, ativo: input.ativo, ...cadenciaFields })
            .where(eq(whatsappInstancias.id, input.id));
          return { success: true, id: input.id };
        } else {
          const [res] = await db.insert(whatsappInstancias).values({
            nome: input.nome, setor: input.setor, instanceId: input.instanceId,
            token: input.token, clientToken: input.clientToken, ativo: input.ativo, ...cadenciaFields,
          });
          return { success: true, id: (res as any).insertId };
        }
      }),

    deletarInstancia: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB indisponível");
        const { whatsappInstancias } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.delete(whatsappInstancias).where(eq(whatsappInstancias.id, input.id));
        return { success: true };
      }),

    statusInstancia: protectedProcedure
      .input(z.object({ instanciaId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { connected: false, smartphoneConnected: false, session: "disconnected" };
        const { whatsappInstancias } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const [inst] = await db.select().from(whatsappInstancias).where(eq(whatsappInstancias.id, input.instanciaId));
        if (!inst) throw new Error("Instância não encontrada");
        const { getInstanceStatus } = await import("./zapi-service");
        return getInstanceStatus({ instanceId: inst.instanceId, token: inst.token, clientToken: inst.clientToken });
      }),

    qrCode: protectedProcedure
      .input(z.object({ instanciaId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB indisponível");
        const { whatsappInstancias } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const [inst] = await db.select().from(whatsappInstancias).where(eq(whatsappInstancias.id, input.instanciaId));
        if (!inst) throw new Error("Instância não encontrada");
        const { getQRCode } = await import("./zapi-service");
        return getQRCode({ instanceId: inst.instanceId, token: inst.token, clientToken: inst.clientToken });
      }),

    // ── Conversas ────────────────────────────────────────────────────────────
    listarConversas: protectedProcedure
      .input(z.object({
        instanciaId: z.number().int().positive().optional(),
        busca: z.string().optional(),
        status: z.enum(["aberta", "fechada", "aguardando"]).optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const { whatsappConversas, whatsappInstancias } = await import("../drizzle/schema");
        const { eq, desc, like, and } = await import("drizzle-orm");
        const conditions: any[] = [];
        if (input.instanciaId) conditions.push(eq(whatsappConversas.instanciaId, input.instanciaId));
        if (input.status) conditions.push(eq(whatsappConversas.status, input.status));
        if (input.busca) conditions.push(like(whatsappConversas.nomeContato, `%${input.busca}%`));
        const rows = await db
          .select({
            conversa: whatsappConversas,
            instancia: { nome: whatsappInstancias.nome, setor: whatsappInstancias.setor },
          })
          .from(whatsappConversas)
          .leftJoin(whatsappInstancias, eq(whatsappConversas.instanciaId, whatsappInstancias.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(whatsappConversas.ultimaMensagemEm));
        return rows;
      }),

    listarConversasSemAtendimento: protectedProcedure
      .input(z.object({
        instanciaId: z.number().int().positive().optional(),
        busca: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const { whatsappConversas, whatsappInstancias, atendimentos } = await import("../drizzle/schema");
        const { eq, desc, like, and, notInArray, inArray } = await import("drizzle-orm");
        // Buscar IDs de conversas com atendimento ativo
        const atendimentosAtivos = await db
          .select({ conversaId: atendimentos.conversaId })
          .from(atendimentos)
          .where(
            (atendimentos.status as any).__enumValues
              ? undefined
              : undefined
          );
        // Usar subquery manual: buscar conversaIds com status ativo
        const idsAtivos = await db
          .selectDistinct({ conversaId: atendimentos.conversaId })
          .from(atendimentos)
          .where(
            (await import("drizzle-orm")).or(
              eq(atendimentos.status, "aguardando"),
              eq(atendimentos.status, "em_atendimento"),
              eq(atendimentos.status, "transferido"),
            )
          );
        const conversaIdsAtivos = idsAtivos.map((r) => r.conversaId).filter(Boolean) as number[];
        const conditions: any[] = [];
        if (input.instanciaId) conditions.push(eq(whatsappConversas.instanciaId, input.instanciaId));
        if (input.busca) conditions.push(like(whatsappConversas.nomeContato, `%${input.busca}%`));
        if (conversaIdsAtivos.length > 0) {
          conditions.push(notInArray(whatsappConversas.id, conversaIdsAtivos));
        }
        const rows = await db
          .select({
            conversa: whatsappConversas,
            instancia: { nome: whatsappInstancias.nome, setor: whatsappInstancias.setor },
          })
          .from(whatsappConversas)
          .leftJoin(whatsappInstancias, eq(whatsappConversas.instanciaId, whatsappInstancias.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(whatsappConversas.ultimaMensagemEm));
        return rows;
      }),

    buscarOuCriarConversa: protectedProcedure
      .input(z.object({
        instanciaId: z.number().int().positive(),
        telefone: z.string().min(8),
        nomeContato: z.string().optional(),
        devedorId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB indisponível");
        const { whatsappConversas } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const { formatPhone } = await import("./zapi-service");
        const telefone = formatPhone(input.telefone);
        const [existing] = await db.select().from(whatsappConversas)
          .where(and(eq(whatsappConversas.instanciaId, input.instanciaId), eq(whatsappConversas.telefone, telefone)));
        if (existing) return existing;
        const [res] = await db.insert(whatsappConversas).values({
          instanciaId: input.instanciaId,
          telefone,
          nomeContato: input.nomeContato,
          devedorId: input.devedorId,
          status: "aberta",
          naoLidas: 0,
        });
        const [nova] = await db.select().from(whatsappConversas).where(eq(whatsappConversas.id, (res as any).insertId));
        return nova;
      }),

    criarConversa: protectedProcedure
      .input(z.object({
        instanciaId: z.number().int().positive(),
        telefone: z.string().min(8),
        nomeContato: z.string().optional(),
        devedorId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB indisponível");
        const { whatsappConversas } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const { formatPhone } = await import("./zapi-service");
        const telefoneFormatado = formatPhone(input.telefone);
        // Verificar se já existe conversa com esse número nessa instância
        const [existente] = await db.select().from(whatsappConversas)
          .where(and(
            eq(whatsappConversas.instanciaId, input.instanciaId),
            eq(whatsappConversas.telefone, telefoneFormatado)
          ));
        if (existente) return existente;
        // Criar nova conversa
        const [res] = await db.insert(whatsappConversas).values({
          instanciaId: input.instanciaId,
          telefone: telefoneFormatado,
          nomeContato: input.nomeContato ?? null,
          devedorId: input.devedorId ?? null,
          status: "aberta",
          naoLidas: 0,
        });
        const [nova] = await db.select().from(whatsappConversas).where(eq(whatsappConversas.id, (res as any).insertId));
        return nova;
      }),

    vincularDevedor: protectedProcedure
      .input(z.object({ conversaId: z.number().int().positive(), devedorId: z.number().int().positive().nullable() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB indisponível");
        const { whatsappConversas } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(whatsappConversas).set({ devedorId: input.devedorId }).where(eq(whatsappConversas.id, input.conversaId));
        return { success: true };
      }),

    // ── Mensagens ────────────────────────────────────────────────────────────
    listarMensagens: protectedProcedure
      .input(z.object({
        conversaId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).default(50),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const { whatsappMensagens } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");
        const rows = await db.select().from(whatsappMensagens)
          .where(eq(whatsappMensagens.conversaId, input.conversaId))
          .orderBy(desc(whatsappMensagens.createdAt))
          .limit(input.limit);
        return rows.reverse();
      }),

    // ─── Upload de mídia para S3 e retorno de URL pública ──────────────────────
    uploadMidia: protectedProcedure
      .input(z.object({
        base64: z.string(),          // conteudo base64 sem prefixo data:...
        mimeType: z.string(),        // ex: "image/jpeg", "application/pdf", "audio/ogg"
        nomeArquivo: z.string(),     // ex: "foto.jpg"
      }))
      .mutation(async ({ input }) => {
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.nomeArquivo.split(".").pop() ?? "bin";
        const key = `whatsapp-media/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        return { url, key };
      }),

    enviarMensagem: protectedProcedure
      .input(z.object({
        conversaId: z.number().int().positive(),
        tipo: z.enum(["text", "document", "image", "audio"]).default("text"),
        conteudo: z.string().optional(),
        mediaUrl: z.string().url().optional(),
        nomeArquivo: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB indisponível");
        const { whatsappConversas, whatsappInstancias, whatsappMensagens } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { sendText, sendDocument, sendImage, sendAudio, formatPhone } = await import("./zapi-service");

        const [conversa] = await db.select().from(whatsappConversas).where(eq(whatsappConversas.id, input.conversaId));
        if (!conversa) throw new Error("Conversa não encontrada");

        const [inst] = await db.select().from(whatsappInstancias).where(eq(whatsappInstancias.id, conversa.instanciaId));
        if (!inst) throw new Error("Instância não encontrada");

        const zapiConfig = { instanceId: inst.instanceId, token: inst.token, clientToken: inst.clientToken };
        const phone = formatPhone(conversa.telefone);

        let zapiResult: { zaapId: string; messageId: string };
        if (input.tipo === "document" && input.mediaUrl) {
          zapiResult = await sendDocument(zapiConfig, phone, input.mediaUrl, input.nomeArquivo ?? "documento.pdf", input.conteudo);
        } else if (input.tipo === "image" && input.mediaUrl) {
          zapiResult = await sendImage(zapiConfig, phone, input.mediaUrl, input.conteudo);
        } else if (input.tipo === "audio" && input.mediaUrl) {
          zapiResult = await sendAudio(zapiConfig, phone, input.mediaUrl);
        } else {
          if (!input.conteudo) throw new Error("Conteúdo obrigatório para mensagem de texto");
          zapiResult = await sendText(zapiConfig, phone, input.conteudo);
        }

        // Salvar mensagem no banco
        await db.insert(whatsappMensagens).values({
          conversaId: input.conversaId,
          instanciaId: inst.id,
          direction: "out",
          tipo: input.tipo,
          conteudo: input.conteudo,
          mediaUrl: input.mediaUrl,
          nomeArquivo: input.nomeArquivo,
          status: "enviada",
          zApiMessageId: zapiResult.messageId,
          enviadoPorId: ctx.user.id,
        });

        // Atualizar última mensagem da conversa
        await db.update(whatsappConversas).set({
          ultimaMensagem: input.conteudo ?? input.nomeArquivo ?? "[arquivo]",
          ultimaMensagemEm: new Date(),
        }).where(eq(whatsappConversas.id, input.conversaId));

        return { success: true, messageId: zapiResult.messageId };
      }),

    marcarLida: protectedProcedure
      .input(z.object({ conversaId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB indisponível");
        const { whatsappConversas } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(whatsappConversas).set({ naoLidas: 0 }).where(eq(whatsappConversas.id, input.conversaId));
        return { success: true };
      }),

    // ─── Monitoramento da Fila de Envio ────────────────────────────────────────
    estatisticasFila: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      const { whatsappFilaEnvio } = await import("../drizzle/schema");
      const { sql, eq } = await import("drizzle-orm");
      const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0);
      const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000);
      const [stats] = await db.select({
        aguardando: sql<number>`SUM(CASE WHEN status = 'aguardando' THEN 1 ELSE 0 END)`,
        enviando: sql<number>`SUM(CASE WHEN status = 'enviando' THEN 1 ELSE 0 END)`,
        enviado: sql<number>`SUM(CASE WHEN status = 'enviado' THEN 1 ELSE 0 END)`,
        erro: sql<number>`SUM(CASE WHEN status = 'erro' THEN 1 ELSE 0 END)`,
        cancelado: sql<number>`SUM(CASE WHEN status = 'cancelado' THEN 1 ELSE 0 END)`,
        total: sql<number>`COUNT(*)`,
        enviadosHoje: sql<number>`SUM(CASE WHEN status = 'enviado' AND enviadoEm >= ${inicioDia} THEN 1 ELSE 0 END)`,
        enviadosUltimaHora: sql<number>`SUM(CASE WHEN status = 'enviado' AND enviadoEm >= ${umaHoraAtras} THEN 1 ELSE 0 END)`,
      }).from(whatsappFilaEnvio);
      return {
        aguardando: Number(stats?.aguardando ?? 0),
        enviando: Number(stats?.enviando ?? 0),
        enviado: Number(stats?.enviado ?? 0),
        erro: Number(stats?.erro ?? 0),
        cancelado: Number(stats?.cancelado ?? 0),
        total: Number(stats?.total ?? 0),
        enviadosHoje: Number(stats?.enviadosHoje ?? 0),
        enviadosUltimaHora: Number(stats?.enviadosUltimaHora ?? 0),
      };
    }),

    listarFila: protectedProcedure
      .input(z.object({
        status: z.enum(["aguardando", "enviando", "enviado", "erro", "cancelado", "todos"]).default("todos"),
        pagina: z.number().int().min(1).default(1),
        porPagina: z.number().int().min(1).max(100).default(30),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB indisponível");
        const { whatsappFilaEnvio } = await import("../drizzle/schema");
        const { eq, desc, sql } = await import("drizzle-orm");
        const offset = (input.pagina - 1) * input.porPagina;
        const where = input.status !== "todos" ? eq(whatsappFilaEnvio.status, input.status) : undefined;
        const items = await db.select().from(whatsappFilaEnvio)
          .where(where)
          .orderBy(desc(whatsappFilaEnvio.createdAt))
          .limit(input.porPagina)
          .offset(offset);
        const [{ total }] = await db.select({ total: sql<number>`COUNT(*)` }).from(whatsappFilaEnvio).where(where);
        return { items, total: Number(total), pagina: input.pagina, porPagina: input.porPagina };
      }),

    reprocessarErros: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      const { whatsappFilaEnvio } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(whatsappFilaEnvio)
        .set({ status: "aguardando", tentativas: 0, erro: null, proximaTentativa: new Date() })
        .where(eq(whatsappFilaEnvio.status, "erro"));
      return { success: true };
    }),

    cancelarAguardando: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      const { whatsappFilaEnvio } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(whatsappFilaEnvio)
        .set({ status: "cancelado" })
        .where(eq(whatsappFilaEnvio.status, "aguardando"));
      return { success: true };
    }),

    cancelarItem: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB indisponível");
        const { whatsappFilaEnvio } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(whatsappFilaEnvio)
          .set({ status: "cancelado" })
          .where(eq(whatsappFilaEnvio.id, input.id));
        return { success: true };
      }),
  }),

  // ─── Custas Judiciais ───────────────────────────────────────────────────────
  custas: router({
    getByDevedor: protectedProcedure
      .input(z.object({ devedorId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const { getCustasByDevedor } = await import("./db-custas");
        return getCustasByDevedor(input.devedorId);
      }),

    /** Custas livres (sem acordo ativo vinculado) — usadas no modal de novo acordo */
    getLivresByDevedor: protectedProcedure
      .input(z.object({ devedorId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const { getCustasLivresByDevedor } = await import("./db-custas");
        return getCustasLivresByDevedor(input.devedorId);
      }),

    create: protectedProcedure
      .input(z.object({
        devedorId: z.number().int().positive(),
        condominioId: z.number().int().positive(),
        descricao: z.string().min(1).max(255),
        valor: z.number().positive(),
        data: z.string(),
        tipo: z.enum(["distribuicao", "citacao", "pericia", "honorarios_periciais", "diligencia", "outros"]).default("outros"),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { createCusta } = await import("./db-custas");
        await createCusta({
          devedorId: input.devedorId,
          condominioId: input.condominioId,
          descricao: input.descricao,
          valor: Math.round(input.valor * 100),
          data: new Date(input.data),
          tipo: input.tipo,
          observacoes: input.observacoes ?? null,
          createdBy: ctx.user.id,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { deleteCusta } = await import("./db-custas");
        await deleteCusta(input.id);
        return { success: true };
      }),

    getTotal: protectedProcedure
      .input(z.object({ devedorId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const { getTotalCustasByDevedor } = await import("./db-custas");
        const total = await getTotalCustasByDevedor(input.devedorId);
        return { total };
      }),

    /** Total de custas livres (não vinculadas a acordo ativo) */
    getTotalLivres: protectedProcedure
      .input(z.object({ devedorId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const { getTotalCustasLivresByDevedor } = await import("./db-custas");
        const total = await getTotalCustasLivresByDevedor(input.devedorId);
        return { total };
      }),
  }),

  // ─── Módulo Jurídico — Central de Demandas ────────────────────────────────────
  juridicoDemandas: router({
    seedColunas: protectedProcedure
      .input(z.object({ targetUserId: z.number().int().positive().optional() }).optional())
      .mutation(async ({ input, ctx }) => {
        const { seedColunasPadrao } = await import("./db-demandas");
        // Admin pode fazer seed para outro usuário
        const targetId = (ctx.user.role === "admin" && input?.targetUserId) ? input.targetUserId : ctx.user.id;
        await seedColunasPadrao(targetId);
        return { success: true };
      }),
    getColunas: protectedProcedure
      .input(z.object({ targetUserId: z.number().int().positive().optional() }).optional())
      .query(async ({ input, ctx }) => {
        const { getColunasDemanda } = await import("./db-demandas");
        // Admin pode ver colunas de outro usuário
        const targetId = (ctx.user.role === "admin" && input?.targetUserId) ? input.targetUserId : ctx.user.id;
        return getColunasDemanda(targetId);
      }),
    getColunaEntrada: protectedProcedure.query(async () => {
      const { getColunaEntrada } = await import("./db-demandas");
      return getColunaEntrada();
    }),
    createColuna: protectedProcedure
      .input(z.object({
        nome: z.string().min(1).max(100),
        icone: z.string().optional(),
        cor: z.string().optional(),
        targetUserId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { createColunaDemanda } = await import("./db-demandas");
        const { targetUserId, ...data } = input;
        const targetId = (ctx.user.role === "admin" && targetUserId) ? targetUserId : ctx.user.id;
        await createColunaDemanda({ ...data, userId: targetId });
        return { success: true };
      }),
    updateColuna: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        nome: z.string().min(1).max(100).optional(),
        icone: z.string().optional(),
        cor: z.string().optional(),
        targetUserId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateColunaDemanda } = await import("./db-demandas");
        const { id, targetUserId, ...data } = input;
        const targetId = (ctx.user.role === "admin" && targetUserId) ? targetUserId : ctx.user.id;
        await updateColunaDemanda(id, targetId, data);
        return { success: true };
      }),
    deleteColuna: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        targetUserId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { deleteColunaDemanda } = await import("./db-demandas");
        const targetId = (ctx.user.role === "admin" && input.targetUserId) ? input.targetUserId : ctx.user.id;
        await deleteColunaDemanda(input.id, targetId);
        return { success: true };
      }),
    reordenarColunas: protectedProcedure
      .input(z.object({
        colunaIds: z.array(z.number().int().positive()),
        targetUserId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { reordenarColunas } = await import("./db-demandas");
        const targetId = (ctx.user.role === "admin" && input.targetUserId) ? input.targetUserId : ctx.user.id;
        await reordenarColunas(input.colunaIds, targetId);
        return { success: true };
      }),
    listar: protectedProcedure
      .input(z.object({
        condominioId: z.number().int().positive().optional(),
        colunaId: z.number().int().positive().optional(),
        responsavelId: z.number().int().positive().optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const { getDemandas } = await import("./db-demandas");
        return getDemandas({
          ...input,
          viewerRole: ctx.user.role,
          viewerUserId: ctx.user.id,
        });
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const { getDemandaById } = await import("./db-demandas");
        return getDemandaById(input.id, { role: ctx.user.role, userId: ctx.user.id });
      }),
    create: protectedProcedure
      .input(z.object({
        condominioId: z.number().int().positive().optional().nullable(),
        colunaId: z.number().int().positive().optional(), // se omitido, usa a coluna de entrada automaticamente
        solicitante: z.string().optional(),
        solicitanteTipo: z.string().optional(),
        canal: z.enum(["whatsapp", "email", "portal", "telefone", "presencial", "assembleia", "processo_interno", "manual"]),
        assunto: z.string().min(1).max(255),
        descricao: z.string().optional(),
        tipo: z.enum(["parecer", "convencao", "assembleia", "multa", "notificacao", "contratos", "cobranca_judicial", "processo", "audiencia", "execucao", "acompanhamento", "documentacao", "relatorio", "cadastro", "outro"]),
        prioridade: z.enum(["baixa", "media", "alta", "urgente"]).optional(),
        prazo: z.string().optional().nullable(),
        responsavelId: z.number().int().positive().optional().nullable(),
        responsavelNome: z.string().optional(),
        devedorId: z.number().int().positive().optional().nullable(),
        cobrancaId: z.number().int().positive().optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { createDemanda, getColunaEntrada } = await import("./db-demandas");
        // Toda nova demanda entra automaticamente na coluna de entrada
        let colunaId = input.colunaId;
        if (!colunaId) {
          const colunaEntrada = await getColunaEntrada();
          if (!colunaEntrada) throw new Error("Coluna de entrada n\u00e3o configurada. Execute a migra\u00e7\u00e3o de colunas.");
          colunaId = colunaEntrada.id;
        }
        const result = await createDemanda({
          ...input,
          colunaId,
          prazo: input.prazo ? new Date(input.prazo) : null,
          criadoPorId: ctx.user.id,
        });
        return result;
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        colunaId: z.number().int().positive().optional(),
        solicitante: z.string().optional(),
        solicitanteTipo: z.string().optional(),
        canal: z.enum(["whatsapp", "email", "portal", "telefone", "presencial", "assembleia", "processo_interno", "manual"]).optional(),
        assunto: z.string().min(1).max(255).optional(),
        descricao: z.string().optional(),
        tipo: z.enum(["parecer", "convencao", "assembleia", "multa", "notificacao", "contratos", "cobranca_judicial", "processo", "audiencia", "execucao", "acompanhamento", "documentacao", "relatorio", "cadastro", "outro"]).optional(),
        prioridade: z.enum(["baixa", "media", "alta", "urgente"]).optional(),
        prazo: z.string().optional().nullable(),
        responsavelId: z.number().int().positive().optional().nullable(),
        responsavelNome: z.string().optional().nullable(),
        condominioId: z.number().int().positive().optional().nullable(),
      }))
      .mutation(async ({ input }) => {
        const { updateDemanda } = await import("./db-demandas");
        const { id, prazo, ...rest } = input;
        await updateDemanda(id, {
          ...rest,
          ...(prazo !== undefined ? { prazo: prazo ? new Date(prazo) : null } : {}),
        });
        return { success: true };
      }),
    mover: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        novaColunaId: z.number().int().positive(),
        novaOrdem: z.number().int().min(0).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { moverDemanda } = await import("./db-demandas");
        await moverDemanda(input.id, input.novaColunaId, input.novaOrdem, ctx.user.id, ctx.user.name ?? undefined);
        return { success: true };
      }),
    reordenarDemandas: protectedProcedure
      .input(z.object({
        ids: z.array(z.number().int().positive()),
      }))
      .mutation(async ({ input }) => {
        const { reordenarDemandas } = await import("./db-demandas");
        await reordenarDemandas(input.ids);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { deleteDemanda } = await import("./db-demandas");
        await deleteDemanda(input.id);
        return { success: true };
      }),
    getTimeline: protectedProcedure
      .input(z.object({ demandaId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const { getTimelineDemanda } = await import("./db-demandas");
        return getTimelineDemanda(input.demandaId);
      }),
    addComentario: protectedProcedure
      .input(z.object({
        demandaId: z.number().int().positive(),
        descricao: z.string().min(1),
        tipo: z.enum(["criacao", "atribuicao", "movimentacao", "comentario", "anexo", "email", "whatsapp", "conclusao", "cancelamento", "outro"]).default("comentario"),
      }))
      .mutation(async ({ input, ctx }) => {
        const { addTimelineEvento } = await import("./db-demandas");
        await addTimelineEvento({
          demandaId: input.demandaId,
          tipo: input.tipo,
          descricao: input.descricao,
          usuarioId: ctx.user.id,
          usuarioNome: ctx.user.name ?? undefined,
        });
        return { success: true };
      }),
    listarAssembleias: protectedProcedure
      .input(z.object({
        condominioId: z.number().int().positive().optional(),
        status: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const { getAssembleias } = await import("./db-demandas");
        return getAssembleias(input);
      }),
    getAssembleiaById: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input }) => {
        const { getAssembleiaById } = await import("./db-demandas");
        return getAssembleiaById(input.id);
      }),
    createAssembleia: protectedProcedure
      .input(z.object({
        condominioId: z.number().int().positive().optional().nullable(),
        tipo: z.enum(["ordinaria", "extraordinaria", "prestacao_contas", "eleicao", "outro"]),
        data: z.string(),
        hora: z.string().regex(/^\d{2}:\d{2}$/),
        endereco: z.string().optional(),
        advogadoResponsavelId: z.number().int().positive().optional().nullable(),
        advogadoNome: z.string().optional(),
        pauta: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { createAssembleia } = await import("./db-demandas");
        await createAssembleia({
          ...input,
          data: new Date(input.data),
          criadoPorId: ctx.user.id,
        });
        return { success: true };
      }),
    updateAssembleia: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        tipo: z.enum(["ordinaria", "extraordinaria", "prestacao_contas", "eleicao", "outro"]).optional(),
        data: z.string().optional(),
        hora: z.string().optional(),
        endereco: z.string().optional(),
        advogadoResponsavelId: z.number().int().positive().optional().nullable(),
        advogadoNome: z.string().optional(),
        status: z.enum(["agendada", "realizada", "cancelada"]).optional(),
        pauta: z.string().optional(),
        ata: z.string().optional(),
        horasGastas: z.string().optional(),
        observacoes: z.string().optional(),
        condominioId: z.number().int().positive().optional().nullable(),
      }))
      .mutation(async ({ input }) => {
        const { updateAssembleia } = await import("./db-demandas");
        const { id, data, ...rest } = input;
        await updateAssembleia(id, {
          ...rest,
          ...(data ? { data: new Date(data) } : {}),
        });
        return { success: true };
      }),
    deleteAssembleia: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { deleteAssembleia } = await import("./db-demandas");
        await deleteAssembleia(input.id);
        return { success: true };
      }),
    dashboard: protectedProcedure.query(async () => {
      const { getDashboardJuridico } = await import("./db-demandas");
      return getDashboardJuridico();
    }),
    // Listar todos os usuários com role "advogado" para usar como responsáveis
    getAdvogados: protectedProcedure.query(async () => {
      const { getAdvogados } = await import("./db-demandas");
      return getAdvogados();
    }),
    // Escalar devedor inadimplente para o jurídico
    escalarParaJuridico: protectedProcedure
      .input(z.object({
        devedorId: z.number().int().positive(),
        condominioId: z.number().int().positive().optional(),
        nomeDevedor: z.string().min(1),
        cpfDevedor: z.string().optional(),
        unidadeDevedor: z.string().min(1),
        valorDivida: z.number().int().min(0),
        qtdCobrancas: z.number().int().min(0),
        assunto: z.string().min(1).max(255),
        descricao: z.string().optional(),
        prioridade: z.enum(["baixa", "media", "alta", "urgente"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { escalarParaJuridico } = await import("./db-demandas");
        const result = await escalarParaJuridico({
          ...input,
          criadoPorId: ctx.user.id,
          criadoPorNome: ctx.user.name ?? undefined,
        });
        return { demandaId: result.demandaId, numero: result.numero };
      }),
        // Obter dados do devedor vinculado a uma demanda
    getCobrancasVinculadas: protectedProcedure
      .input(z.object({ demandaId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const { getCobrancasVinculadas } = await import("./db-demandas");
        return getCobrancasVinculadas(input.demandaId);
      }),

    // ── Anexos de Demandas ────────────────────────────────────────────────────
    getAnexos: protectedProcedure
      .input(z.object({ demandaId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const { anexosDemanda } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");
        return db.select().from(anexosDemanda)
          .where(eq(anexosDemanda.demandaId, input.demandaId))
          .orderBy(desc(anexosDemanda.createdAt));
      }),

    uploadAnexoDemanda: protectedProcedure
      .input(z.object({
        demandaId: z.number().int().positive(),
        fileBase64: z.string(),
        fileName: z.string().max(255),
        mimeType: z.string().max(100),
        tamanho: z.number().int().positive(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { storagePut } = await import("./storage");
        const { anexosDemanda } = await import("../drizzle/schema");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "bin";
        const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const fileKey = `juridico/demandas/${input.demandaId}/anexos/${suffix}.${ext}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        const [result] = await db.insert(anexosDemanda).values({
          demandaId: input.demandaId,
          nome: input.fileName,
          fileKey,
          url,
          mimeType: input.mimeType,
          tamanho: input.tamanho,
          uploadadoPorId: ctx.user.id,
          uploadadoPorNome: ctx.user.name ?? ctx.user.email ?? undefined,
        });
        return { id: (result as any).insertId, url, nome: input.fileName };
      }),

    deleteAnexoDemanda: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { anexosDemanda } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const [anexo] = await db.select().from(anexosDemanda).where(eq(anexosDemanda.id, input.id));
        if (!anexo) throw new TRPCError({ code: "NOT_FOUND", message: "Anexo não encontrado" });
        if (ctx.user.role !== "admin" && anexo.uploadadoPorId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para excluir este anexo" });
        }
        await db.delete(anexosDemanda).where(eq(anexosDemanda.id, input.id));
        return { ok: true };
      }),
  }),
  // ─── Publicações Jurídicas ────────────────────────────────────────────────────────────────────
  publicacoes: router({
    // Dashboard com contadores
    dashboard: protectedProcedure.query(async () => {
      const { getDashboardPublicacoes } = await import("./db-publicacoes");
      return getDashboardPublicacoes();
    }),

    // Listagem de publicações com filtros
    listar: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        monitoramentoId: z.number().int().positive().optional(),
        lida: z.number().int().min(0).max(1).optional(),
        limit: z.number().int().positive().max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }).optional())
      .query(async ({ input }) => {
        const { listarPublicacoes } = await import("./db-publicacoes");
        return listarPublicacoes(input ?? undefined);
      }),

    // Detalhe de uma publicação
    getById: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input }) => {
        const { getPublicacao } = await import("./db-publicacoes");
        return getPublicacao(input.id);
      }),

    // Criar publicação manual
    criarManual: protectedProcedure
      .input(z.object({
        monitoramentoId: z.number().int().positive().optional(),
        tribunal: z.string().max(100).optional(),
        comarca: z.string().max(100).optional(),
        vara: z.string().max(150).optional(),
        dataPublicacao: z.string().optional(),
        tipo: z.enum(["intimacao", "sentenca", "despacho", "audiencia", "decisao", "outro"]),
        textoCompleto: z.string().min(1),
        numeroCNJ: z.string().max(30).optional(),
        responsavelNome: z.string().max(255).optional(),
      }))
      .mutation(async ({ input }) => {
        const { createPublicacaoManual } = await import("./db-publicacoes");
        return createPublicacaoManual({
          ...input,
          dataPublicacao: input.dataPublicacao ? new Date(input.dataPublicacao) : null,
        });
      }),

    // Atualizar status
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        status: z.enum(["nova", "analisando", "aguardando_providencia", "providenciada", "arquivada"]),
      }))
      .mutation(async ({ input }) => {
        const { updatePublicacaoStatus, marcarPublicacaoLida } = await import("./db-publicacoes");
        await updatePublicacaoStatus(input.id, input.status);
        await marcarPublicacaoLida(input.id);
      }),

    // Atualizar campos da publicação
    update: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        status: z.enum(["nova", "analisando", "aguardando_providencia", "providenciada", "arquivada"]).optional(),
        lida: z.number().int().min(0).max(1).optional(),
        observacoes: z.string().optional(),
        responsavelNome: z.string().max(255).optional(),
        numeroCNJ: z.string().max(30).optional(),
      }))
      .mutation(async ({ input }) => {
        const { updatePublicacao } = await import("./db-publicacoes");
        const { id, ...rest } = input;
        await updatePublicacao(id, rest);
      }),

    // Marcar como lida
    marcarLida: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { marcarPublicacaoLida } = await import("./db-publicacoes");
        await marcarPublicacaoLida(input.id);
      }),

    // ─── Monitoramentos ────────────────────────────────────────────────────────────────────
    monitoramentos: router({
      listar: protectedProcedure.query(async () => {
        const { listarMonitoramentos } = await import("./db-publicacoes");
        return listarMonitoramentos();
      }),

      create: protectedProcedure
        .input(z.object({
          advogadoNome: z.string().min(1).max(255),
          oab: z.string().max(30).optional(),
          uf: z.string().max(2).optional(),
          palavrasChave: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          const { createMonitoramento } = await import("./db-publicacoes");
          return createMonitoramento(input);
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number().int().positive(),
          advogadoNome: z.string().min(1).max(255).optional(),
          oab: z.string().max(30).optional(),
          uf: z.string().max(2).optional(),
          palavrasChave: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          const { updateMonitoramento } = await import("./db-publicacoes");
          const { id, ...rest } = input;
          await updateMonitoramento(id, rest);
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .mutation(async ({ input }) => {
          const { deleteMonitoramento } = await import("./db-publicacoes");
          await deleteMonitoramento(input.id);
        }),

      toggle: protectedProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .mutation(async ({ input }) => {
          const { toggleMonitoramento } = await import("./db-publicacoes");
          await toggleMonitoramento(input.id);
        }),
    }),
  }),

  // ─── Alertas de Inadimplência de Acordos ─────────────────────────────────────
  alertasAcordo: router({
    // Listar alertas com filtros
    list: protectedProcedure
      .input(z.object({
        status: z.enum(["pendente", "em_tratativa", "resolvido", "ignorado"]).optional(),
        nivel: z.number().optional(),
        condominioId: z.number().optional(),
        page: z.number().default(1),
        limit: z.number().default(50),
      }))
      .query(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { alertasInadimplenciaAcordo, acordos, devedores, condominios } = await import("../drizzle/schema");
        const { eq, and, desc, count } = await import("drizzle-orm");

        const conditions: any[] = [];
        if (input.status) conditions.push(eq(alertasInadimplenciaAcordo.status, input.status));
        if (input.nivel !== undefined) conditions.push(eq(alertasInadimplenciaAcordo.nivel, input.nivel));
        if (input.condominioId) conditions.push(eq(alertasInadimplenciaAcordo.condominioId, input.condominioId));
        // Cobrador só vê alertas do seu condomínio
        if (ctx.user.role !== "admin" && ctx.user.condominioId) {
          conditions.push(eq(alertasInadimplenciaAcordo.condominioId, ctx.user.condominioId));
        }

        const offset = (input.page - 1) * input.limit;
        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const [rows, totalRows] = await Promise.all([
          db.select({
            id: alertasInadimplenciaAcordo.id,
            acordoId: alertasInadimplenciaAcordo.acordoId,
            parcelaId: alertasInadimplenciaAcordo.parcelaId,
            condominioId: alertasInadimplenciaAcordo.condominioId,
            devedorId: alertasInadimplenciaAcordo.devedorId,
            nivel: alertasInadimplenciaAcordo.nivel,
            diasAtraso: alertasInadimplenciaAcordo.diasAtraso,
            valorParcela: alertasInadimplenciaAcordo.valorParcela,
            dataVencimento: alertasInadimplenciaAcordo.dataVencimento,
            installmentNumber: alertasInadimplenciaAcordo.installmentNumber,
            totalParcelas: alertasInadimplenciaAcordo.totalParcelas,
            statusBoleto: alertasInadimplenciaAcordo.statusBoleto,
            temBoletoAtualizado: alertasInadimplenciaAcordo.temBoletoAtualizado,
            status: alertasInadimplenciaAcordo.status,
            resolvidoEm: alertasInadimplenciaAcordo.resolvidoEm,
            observacao: alertasInadimplenciaAcordo.observacao,
            createdAt: alertasInadimplenciaAcordo.createdAt,
            // Joins
            devedorNome: devedores.name,
            devedorUnidade: devedores.unitNumber,
            devedorBloco: devedores.bloco,
            condominioNome: condominios.name,
          })
          .from(alertasInadimplenciaAcordo)
          .innerJoin(devedores, eq(alertasInadimplenciaAcordo.devedorId, devedores.id))
          .innerJoin(condominios, eq(alertasInadimplenciaAcordo.condominioId, condominios.id))
          .where(where)
          .orderBy(desc(alertasInadimplenciaAcordo.nivel), desc(alertasInadimplenciaAcordo.diasAtraso))
          .limit(input.limit)
          .offset(offset),
          db.select({ total: count() }).from(alertasInadimplenciaAcordo).where(where),
        ]);

        return { rows, total: Number(totalRows[0]?.total ?? 0) };
      }),

    // Atualizar status de um alerta
    atualizarStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pendente", "em_tratativa", "resolvido", "ignorado"]),
        observacao: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { alertasInadimplenciaAcordo } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        await db.update(alertasInadimplenciaAcordo)
          .set({
            status: input.status,
            observacao: input.observacao,
            resolvidoPor: ["resolvido", "ignorado"].includes(input.status) ? ctx.user.id : undefined,
            resolvidoEm: ["resolvido", "ignorado"].includes(input.status) ? new Date() : undefined,
            updatedAt: new Date(),
          })
          .where(eq(alertasInadimplenciaAcordo.id, input.id));

        return { ok: true };
      }),

    // Contagem de alertas pendentes (para badge no menu)
    contarPendentes: protectedProcedure.query(async ({ ctx }) => {
      const db = await (await import("./db")).getDb();
      if (!db) return { total: 0, criticos: 0 };
      const { alertasInadimplenciaAcordo } = await import("../drizzle/schema");
      const { eq, and, count } = await import("drizzle-orm");

      const conditions: any[] = [eq(alertasInadimplenciaAcordo.status, "pendente")];
      if (ctx.user.role !== "admin" && ctx.user.condominioId) {
        conditions.push(eq(alertasInadimplenciaAcordo.condominioId, ctx.user.condominioId));
      }

      const [total, criticos] = await Promise.all([
        db.select({ total: count() }).from(alertasInadimplenciaAcordo).where(and(...conditions)),
        db.select({ total: count() }).from(alertasInadimplenciaAcordo)
          .where(and(...conditions, eq(alertasInadimplenciaAcordo.nivel, 3))),
      ]);

      return { total: Number(total[0]?.total ?? 0), criticos: Number(criticos[0]?.total ?? 0) };
    }),
  }),
});
export type AppRouter = typeof appRouter;

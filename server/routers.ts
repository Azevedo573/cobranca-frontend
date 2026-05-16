import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { adminProcedure, condominioAccessProcedure } from "./middleware";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";

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
    })).mutation(async ({ input }) => {
      const { createDevedor } = await import("./db-devedores");
      return await createDevedor(input);
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
        };

        const pdfBuffer = await gerarBoletoPDF(dados);

        // Salvar no S3
        const fileKey = `boletos/${cobranca.condominioId}/${cobranca.nossoNumero}-${Date.now()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        // Calcular linha digitável para retornar ao frontend
        const codigoBarras = calcularCodigoBarras(dados);
        const linhaDigitavel = formatarLinhaDigitavel(calcularLinhaDigitavel(codigoBarras));

        // Gerar Pix copia e cola (se a configuração tiver chave Pix)
        let pixCopiaCola: string | null = null;
        if (config.habilitarPix && config.chavePix) {
          pixCopiaCola = gerarPixCopiaCola({
            chavePix: config.chavePix,
            nomeBeneficiario: config.nomeBeneficiario || condominio.name,
            cidade: "SAO PAULO",
            valor: cobranca.amount,
            txid: cobranca.nossoNumero || undefined,
            descricao: `Cobranca ${cobranca.nossoNumero}`,
          });
        }

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
    })).mutation(async ({ input }) => {
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
          valor: Number(parcela.amount) * 100, // parcela.amount está em reais, converter para centavos
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
        };

        const pdfBuffer = await gerarBoletoPDF(dados);

        const fileKey = `boletos/${acordo.condominioId}/${parcela.nossoNumero}-${Date.now()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        const codigoBarras = calcularCodigoBarras(dados);
        const linhaDigitavel = formatarLinhaDigitavel(calcularLinhaDigitavel(codigoBarras));

        let pixCopiaCola: string | null = null;
        if (config.habilitarPix && config.chavePix) {
          pixCopiaCola = gerarPixCopiaCola({
            chavePix: config.chavePix,
            nomeBeneficiario: config.nomeBeneficiario || condominio.name,
            cidade: "SAO PAULO",
            valor: Number(parcela.amount) * 100,
            txid: parcela.nossoNumero || undefined,
            descricao: `Parcela ${parcela.nossoNumero}`,
          });
        }

        return {
          url,
          linhaDigitavel,
          codigoBarras,
          pixCopiaCola,
          nossoNumero: parcela.nossoNumero,
          valor: Number(parcela.amount) * 100,
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
              await db.update(cobrancas).set(updateData).where(eq(cobrancas.id, cobranca.id));
              statusProcessamento = "processado";
              observacao = `Status alterado de '${statusAnterior}' para '${novoStatus}'`;
            } else if (cobranca.status === novoStatus) {
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
              if (novoStatus === "pago" && parcela.status !== "pago") {
                const dataPag = dataCredito || dataOcorrencia || new Date();
                await db.update(parcelasAcordo).set({
                  status: "pago",
                  paymentDate: dataPag,
                  statusRemessa: "retorno_recebido",
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
                await db.update(parcelasAcordo).set({ statusRemessa: "enviado" }).where(eq(parcelasAcordo.id, parcela.id));
                entradas++;
                statusProcessamento = "processado";
                observacao = "Entrada confirmada para parcela de acordo";
              } else {
                statusProcessamento = "processado";
                observacao = `Ocorrência '${segmentoT.descOcorrencia}' registrada para parcela de acordo`;
              }
            } else {
              naoEncontrados++;
              statusProcessamento = "nao_encontrado";
              observacao = `Título com nosso número '${nossoNumero}' não encontrado no sistema`;
            }
          }

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
          valorNominal: Math.round(Number(r.amount) * 100), // reais → centavos para o CNAB
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
});
export type AppRouter = typeof appRouter;

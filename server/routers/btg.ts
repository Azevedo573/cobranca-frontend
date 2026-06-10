/**
 * Router tRPC para integração BTG Pactual
 * Configuração global (nível escritório) via variáveis de ambiente.
 * Procedures: getConfig, saveConfig, testarConexao, emitirBoleto, emitirBoletoParcela,
 *             cancelarBoleto, sincronizarStatus, listarCobrancasBtg, conciliarTodas,
 *             listarCobrancasComBtg
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  btgConfig,
  cobrancas,
  devedores,
  condominios,
  parcelasAcordo,
  acordos,
} from "../../drizzle/schema";
import { eq, and, isNotNull, desc } from "drizzle-orm";
import {
  criarCobrancaBtg,
  cancelarCobrancaBtg,
  buscarCobrancaBtg,
  listarCobrancasBtg,
  montarPayloadCobranca,
  getBtgAccessToken,
  getBtgExtraConfig,
} from "../btg-service";

// ─── Router ───────────────────────────────────────────────────────────────────

export const btgRouter = router({

  // ── Configuração Global ──────────────────────────────────────────────────────

  /**
   * Retorna a configuração extra do BTG (instrucoes, diasVencimento, webhookSecret).
   * As credenciais (clientId, clientSecret, companyId) vêm das env vars e nunca
   * são expostas ao frontend — apenas indicamos se estão configuradas.
   */
  getConfig: protectedProcedure
    .query(async () => {
      const extra = await getBtgExtraConfig();

      // Indicar se as env vars estão configuradas (sem expor os valores)
      const clientIdConfigured = !!process.env.BTG_CLIENT_ID;
      const clientSecretConfigured = !!process.env.BTG_CLIENT_SECRET;
      const companyIdConfigured = !!process.env.BTG_COMPANY_ID;

      return {
        credenciaisConfiguradas: clientIdConfigured && clientSecretConfigured && companyIdConfigured,
        clientIdConfigured,
        clientSecretConfigured,
        companyIdConfigured,
        companyIdMasked: process.env.BTG_COMPANY_ID
          ? `***${process.env.BTG_COMPANY_ID.slice(-4)}`
          : null,
        ...extra,
      };
    }),

  /**
   * Salva configurações extras do BTG (instrucoes, diasVencimento, webhookSecret).
   * Credenciais são gerenciadas via env vars, não por esta tela.
   */
  saveConfig: protectedProcedure
    .input(z.object({
      webhookSecret: z.string().optional(),
      diasVencimentoPadrao: z.number().min(1).max(365).default(30),
      diasLimitePagamento: z.number().min(1).max(365).default(60),
      instrucoes: z.string().optional(),
      ativo: z.number().default(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco não disponível");

      // Verificar se já existe registro global (id=1)
      const existing = await db.select({ id: btgConfig.id })
        .from(btgConfig)
        .limit(1);

      if (existing.length) {
        await db.update(btgConfig)
          .set({
            webhookSecret: input.webhookSecret ?? null,
            diasVencimentoPadrao: input.diasVencimentoPadrao,
            diasLimitePagamento: input.diasLimitePagamento,
            instrucoes: input.instrucoes ?? null,
            ativo: input.ativo,
            updatedAt: new Date(),
          })
          .where(eq(btgConfig.id, existing[0].id));
      } else {
        // Criar registro global com condominioId=0 (global)
        await db.insert(btgConfig).values({
          condominioId: 0,
          clientId: process.env.BTG_CLIENT_ID ?? "",
          clientSecret: process.env.BTG_CLIENT_SECRET ?? "",
          companyId: process.env.BTG_COMPANY_ID ?? "",
          webhookSecret: input.webhookSecret ?? null,
          diasVencimentoPadrao: input.diasVencimentoPadrao,
          diasLimitePagamento: input.diasLimitePagamento,
          instrucoes: input.instrucoes ?? null,
          ativo: input.ativo,
        });
      }

      return { success: true };
    }),

  /**
   * Testa a conexão com a API BTG usando as credenciais das env vars.
   */
  testarConexao: protectedProcedure
    .mutation(async () => {
      try {
        const token = await getBtgAccessToken();
        return { success: true, message: "Conexão com BTG estabelecida com sucesso!", tokenObtido: !!token };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, message: `Falha na conexão: ${msg}`, tokenObtido: false };
      }
    }),

  // ── Emissão de Boleto (Cobrança) ─────────────────────────────────────────────

  emitirBoleto: protectedProcedure
    .input(z.object({
      cobrancaId: z.number(),
      // Dados do pagador podem ser sobrescritos manualmente
      payerName: z.string().optional(),
      payerDocument: z.string().optional(),
      payerEmail: z.string().optional(),
      payerPhone: z.string().optional(),
      payerAddress: z.string().optional(),
      payerAddressNumber: z.string().optional(),
      payerAddressComplement: z.string().optional(),
      payerNeighborhood: z.string().optional(),
      payerCity: z.string().optional(),
      payerState: z.string().optional(),
      payerZipCode: z.string().optional(),
      dueDate: z.string().optional(), // YYYY-MM-DD
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco não disponível");

      // Buscar cobrança
      const cobrancaRows = await db.select().from(cobrancas)
        .where(eq(cobrancas.id, input.cobrancaId))
        .limit(1);

      if (!cobrancaRows.length) throw new Error("Cobrança não encontrada");
      const cobranca = cobrancaRows[0];

      // Verificar se já tem boleto BTG ativo
      if (cobranca.btgCollectionId && cobranca.btgStatus && !["CANCELED", "EXPIRED"].includes(cobranca.btgStatus)) {
        throw new Error(`Cobrança já possui boleto BTG ativo (ID: ${cobranca.btgCollectionId}, Status: ${cobranca.btgStatus})`);
      }

      // Buscar devedor
      const devedorRows = await db.select().from(devedores)
        .where(eq(devedores.id, cobranca.devedorId))
        .limit(1);

      if (!devedorRows.length) throw new Error("Devedor não encontrado");
      const devedor = devedorRows[0];

      // Buscar configuração extra BTG
      const cfg = await getBtgExtraConfig();

      // Buscar dados do condomínio para juros/multa
      const condRows = await db.select().from(condominios)
        .where(eq(condominios.id, cobranca.condominioId))
        .limit(1);
      const cond = condRows[0];

      // Determinar data de vencimento
      const dueDateStr = input.dueDate ?? (cobranca.dueDate ? cobranca.dueDate.toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);
      const dueDate = new Date(dueDateStr + "T12:00:00");

      // Montar dados do pagador
      const payerName = input.payerName || devedor.name || `Unidade ${devedor.unitNumber}`;
      const payerDocument = input.payerDocument || devedor.cpfCnpj || "";

      if (!payerDocument.replace(/\D/g, "")) {
        throw new Error("CPF/CNPJ do devedor é obrigatório para emissão de boleto BTG");
      }

      const payload = montarPayloadCobranca({
        amount: cobranca.amount,
        dueDate,
        overDueDays: cfg.diasLimitePagamento,
        description: cfg.instrucoes || `Cobrança condominial - ${cobranca.description || ""}`.trim(),
        externalId: `cobranca-${cobranca.id}`,
        payer: {
          name: payerName,
          cpfCnpj: payerDocument,
          email: input.payerEmail || devedor.email || undefined,
          phone: input.payerPhone || devedor.phone || undefined,
          address: input.payerAddress || devedor.address || undefined,
          addressNumber: input.payerAddressNumber || devedor.addressNumber || undefined,
          addressComplement: input.payerAddressComplement || devedor.addressComplement || undefined,
          neighborhood: input.payerNeighborhood || devedor.neighborhood || undefined,
          city: input.payerCity || devedor.city || undefined,
          state: input.payerState || devedor.state || undefined,
          zipCode: input.payerZipCode || devedor.zipCode || undefined,
        },
        jurosPercentualAoDia: cond?.taxaJurosMensal
          ? parseFloat(cond.taxaJurosMensal) / 30
          : 0.033,
        multaPercentual: cond?.taxaMulta
          ? parseFloat(cond.taxaMulta)
          : 2.0,
      });

      // Emitir no BTG
      const resultado = await criarCobrancaBtg(payload);

      // Salvar resultado na cobrança
      await db.update(cobrancas)
        .set({
          btgCollectionId: resultado.collectionId,
          btgBankSlipUrl: resultado.bankSlipUrl ?? null,
          btgPixQrCode: resultado.pixQrCode ?? null,
          btgPixCopiaECola: resultado.pixCopyPaste ?? null,
          btgStatus: resultado.status,
          btgEmitidoEm: new Date(),
          status: "em_cobranca",
          updatedAt: new Date(),
        })
        .where(eq(cobrancas.id, input.cobrancaId));

      return {
        success: true,
        collectionId: resultado.collectionId,
        bankSlipUrl: resultado.bankSlipUrl,
        pixQrCode: resultado.pixQrCode,
        pixCopyPaste: resultado.pixCopyPaste,
        barCode: resultado.barCode,
        digitableLine: resultado.digitableLine,
        status: resultado.status,
        dueDate: resultado.dueDate,
      };
    }),

  // ── Emissão de Boleto (Parcela de Acordo) ────────────────────────────────────

  emitirBoletoParcela: protectedProcedure
    .input(z.object({
      parcelaId: z.number(),
      payerName: z.string().optional(),
      payerDocument: z.string().optional(),
      payerEmail: z.string().optional(),
      payerPhone: z.string().optional(),
      payerAddress: z.string().optional(),
      payerAddressNumber: z.string().optional(),
      payerAddressComplement: z.string().optional(),
      payerNeighborhood: z.string().optional(),
      payerCity: z.string().optional(),
      payerState: z.string().optional(),
      payerZipCode: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco não disponível");

      const parcelaRows = await db.select().from(parcelasAcordo)
        .where(eq(parcelasAcordo.id, input.parcelaId))
        .limit(1);

      if (!parcelaRows.length) throw new Error("Parcela não encontrada");
      const parcela = parcelaRows[0];

      if (parcela.btgCollectionId && parcela.btgStatus && !["CANCELED", "EXPIRED"].includes(parcela.btgStatus)) {
        throw new Error(`Parcela já possui boleto BTG ativo (Status: ${parcela.btgStatus})`);
      }

      const acordoRows = await db.select().from(acordos)
        .where(eq(acordos.id, parcela.acordoId))
        .limit(1);

      if (!acordoRows.length) throw new Error("Acordo não encontrado");
      const acordo = acordoRows[0];

      const devedorRows = await db.select().from(devedores)
        .where(eq(devedores.id, acordo.devedorId))
        .limit(1);

      if (!devedorRows.length) throw new Error("Devedor não encontrado");
      const devedor = devedorRows[0];

      const cfg = await getBtgExtraConfig();

      const condRows = await db.select().from(condominios)
        .where(eq(condominios.id, acordo.condominioId))
        .limit(1);
      const cond = condRows[0];

      const payerName = input.payerName || devedor.name || `Unidade ${devedor.unitNumber}`;
      const payerDocument = input.payerDocument || devedor.cpfCnpj || "";

      if (!payerDocument.replace(/\D/g, "")) {
        throw new Error("CPF/CNPJ do devedor é obrigatório para emissão de boleto BTG");
      }

      const payload = montarPayloadCobranca({
        amount: parcela.amount,
        dueDate: new Date(parcela.dueDate),
        overDueDays: cfg.diasLimitePagamento,
        description: `Parcela ${parcela.installmentNumber} do acordo #${acordo.id}`,
        externalId: `parcela-${parcela.id}`,
        payer: {
          name: payerName,
          cpfCnpj: payerDocument,
          email: input.payerEmail || devedor.email || undefined,
          phone: input.payerPhone || devedor.phone || undefined,
          address: input.payerAddress || devedor.address || undefined,
          addressNumber: input.payerAddressNumber || devedor.addressNumber || undefined,
          addressComplement: input.payerAddressComplement || devedor.addressComplement || undefined,
          neighborhood: input.payerNeighborhood || devedor.neighborhood || undefined,
          city: input.payerCity || devedor.city || undefined,
          state: input.payerState || devedor.state || undefined,
          zipCode: input.payerZipCode || devedor.zipCode || undefined,
        },
        jurosPercentualAoDia: cond?.taxaJurosMensal
          ? parseFloat(cond.taxaJurosMensal) / 30
          : 0.033,
        multaPercentual: cond?.taxaMulta
          ? parseFloat(cond.taxaMulta)
          : 2.0,
      });

      const resultado = await criarCobrancaBtg(payload);

      await db.update(parcelasAcordo)
        .set({
          btgCollectionId: resultado.collectionId,
          btgBankSlipUrl: resultado.bankSlipUrl ?? null,
          btgPixQrCode: resultado.pixQrCode ?? null,
          btgPixCopiaECola: resultado.pixCopyPaste ?? null,
          btgStatus: resultado.status,
          btgEmitidoEm: new Date(),
        })
        .where(eq(parcelasAcordo.id, input.parcelaId));

      return {
        success: true,
        collectionId: resultado.collectionId,
        bankSlipUrl: resultado.bankSlipUrl,
        pixQrCode: resultado.pixQrCode,
        pixCopyPaste: resultado.pixCopyPaste,
        status: resultado.status,
        dueDate: resultado.dueDate,
      };
    }),

  // ── Cancelamento ─────────────────────────────────────────────────────────────

  cancelarBoleto: protectedProcedure
    .input(z.object({ cobrancaId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco não disponível");

      const cobrancaRows = await db.select().from(cobrancas)
        .where(eq(cobrancas.id, input.cobrancaId))
        .limit(1);

      if (!cobrancaRows.length) throw new Error("Cobrança não encontrada");
      const cobranca = cobrancaRows[0];

      if (!cobranca.btgCollectionId) throw new Error("Cobrança não possui boleto BTG");

      await cancelarCobrancaBtg(cobranca.btgCollectionId);

      await db.update(cobrancas)
        .set({ btgStatus: "CANCELED", updatedAt: new Date() })
        .where(eq(cobrancas.id, input.cobrancaId));

      return { success: true };
    }),

  // ── Sincronização de Status ──────────────────────────────────────────────────

  sincronizarStatus: protectedProcedure
    .input(z.object({ cobrancaId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco não disponível");

      const cobrancaRows = await db.select().from(cobrancas)
        .where(eq(cobrancas.id, input.cobrancaId))
        .limit(1);

      if (!cobrancaRows.length) throw new Error("Cobrança não encontrada");
      const cobranca = cobrancaRows[0];

      if (!cobranca.btgCollectionId) throw new Error("Cobrança não possui boleto BTG");

      const resultado = await buscarCobrancaBtg(cobranca.btgCollectionId);

      const updates: Record<string, unknown> = {
        btgStatus: resultado.status,
        updatedAt: new Date(),
      };

      if (resultado.status === "PAID") {
        updates.status = "pago";
        updates.paidAt = new Date();
        updates.paidAmount = cobranca.amount;
      }

      await db.update(cobrancas)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .set(updates as any)
        .where(eq(cobrancas.id, input.cobrancaId));

      return {
        btgStatus: resultado.status,
        pago: resultado.status === "PAID",
        amount: resultado.amount,
      };
    }),

  // ── Listagem e Conciliação ───────────────────────────────────────────────────

  /**
   * Lista cobranças diretamente na API BTG (visão do banco)
   */
  listarCobrancasBtg: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      pageSize: z.number().default(20),
      status: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return listarCobrancasBtg({
        page: input.page,
        pageSize: input.pageSize,
        status: input.status,
        startDate: input.startDate,
        endDate: input.endDate,
      });
    }),

  /**
   * Concilia todas as cobranças BTG ativas no sistema com o status real na API BTG.
   * Dá baixa automática nas cobranças pagas.
   */
  conciliarTodas: protectedProcedure
    .input(z.object({
      condominioId: z.number().optional(),
      limit: z.number().default(50),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco não disponível");

      // Buscar cobranças com BTG ativo que não estão pagas/canceladas no sistema
      const whereConditions = [isNotNull(cobrancas.btgCollectionId)];
      if (input.condominioId) {
        whereConditions.push(eq(cobrancas.condominioId, input.condominioId));
      }

      const cobrancasPendentes = await db.select({
        id: cobrancas.id,
        btgCollectionId: cobrancas.btgCollectionId,
        btgStatus: cobrancas.btgStatus,
        status: cobrancas.status,
        amount: cobrancas.amount,
      }).from(cobrancas)
        .where(and(...whereConditions))
        .limit(input.limit);

      let atualizadas = 0;
      let pagas = 0;
      const erros: string[] = [];

      for (const cob of cobrancasPendentes) {
        if (!cob.btgCollectionId) continue;
        if (["pago", "cancelado"].includes(cob.status)) continue;

        try {
          const resultado = await buscarCobrancaBtg(cob.btgCollectionId);

          const updates: Record<string, unknown> = {
            btgStatus: resultado.status,
            updatedAt: new Date(),
          };

          if (resultado.status === "PAID" && cob.status !== "pago") {
            updates.status = "pago";
            updates.paidAt = new Date();
            updates.paidAmount = cob.amount;
            pagas++;
          }

          await db.update(cobrancas)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .set(updates as any)
            .where(eq(cobrancas.id, cob.id));

          atualizadas++;
        } catch (err) {
          erros.push(`Cobrança ${cob.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return {
        success: true,
        total: cobrancasPendentes.length,
        atualizadas,
        pagas,
        erros,
      };
    }),

  /**
   * Lista cobranças do sistema que têm boleto BTG emitido
   */
  listarCobrancasComBtg: protectedProcedure
    .input(z.object({
      condominioId: z.number().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
      btgStatus: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco não disponível");

      const whereConditions = [isNotNull(cobrancas.btgCollectionId)];
      if (input.condominioId) {
        whereConditions.push(eq(cobrancas.condominioId, input.condominioId));
      }
      if (input.btgStatus) {
        whereConditions.push(eq(cobrancas.btgStatus, input.btgStatus));
      }

      const rows = await db.select({
        id: cobrancas.id,
        devedorId: cobrancas.devedorId,
        condominioId: cobrancas.condominioId,
        description: cobrancas.description,
        amount: cobrancas.amount,
        dueDate: cobrancas.dueDate,
        status: cobrancas.status,
        btgCollectionId: cobrancas.btgCollectionId,
        btgBankSlipUrl: cobrancas.btgBankSlipUrl,
        btgPixCopiaECola: cobrancas.btgPixCopiaECola,
        btgStatus: cobrancas.btgStatus,
        btgEmitidoEm: cobrancas.btgEmitidoEm,
        devedorNome: devedores.name,
        devedorUnidade: devedores.unitNumber,
        devedorBloco: devedores.bloco,
      }).from(cobrancas)
        .leftJoin(devedores, eq(devedores.id, cobrancas.devedorId))
        .where(and(...whereConditions))
        .orderBy(desc(cobrancas.btgEmitidoEm))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return rows;
    }),
});

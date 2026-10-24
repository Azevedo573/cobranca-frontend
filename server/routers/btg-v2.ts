import { TRPCError } from "@trpc/server";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { logAudit } from "../audit";
import { getBtgOAuthConfig, getStatusOAuthBtg } from "../btg-oauth";
import { getDb } from "../db";
import {
  btgContaRecebedoraCondominios,
  btgContasRecebedoras,
  btgCobrancasEmitidas,
  btgIntegracoes,
  btgRemessaItens,
  btgRemessas,
  btgWebhookEntregas,
  condominios,
} from "../../drizzle/schema";
import { adminProcedure, router } from "../_core/trpc";
import {
  BtgV2ConfigurationError,
  consultarContasRecebedorasBtg,
  getBtgV2ServerConfig,
  mascararNumeroConta,
  normalizarContaManualSandbox,
  validarCadastroManualSandbox,
} from "../btg-v2/config";
import { emitirParcelasAcordoBtgV2, prepararEmissaoParcelasAcordoBtgV2 } from "../btg-v2/issuance";
import { executarRemessaBtgV2, listarFilaRemessaBtgV2, validarSelecaoRemessaBtgV2 } from "../btg-v2/remessas";
import { cancelarEmissaoBolePixV2, conciliarEmissaoBolePixV2 } from "../btg-v2/settlement";

function toTrpcError(error: unknown): TRPCError {
  if (error instanceof BtgV2ConfigurationError) {
    return new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
  }
  if (error instanceof Error && error.name === "BtgOAuthError") {
    return new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
  }
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir a operação BTG agora." });
}

async function getIntegracaoAtual() {
  const serverConfig = getBtgV2ServerConfig();
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco não disponível" });

  const rows = await db.select().from(btgIntegracoes)
    .where(eq(btgIntegracoes.ambiente, serverConfig.ambiente))
    .limit(1);
  return { db, serverConfig, integracao: rows[0] ?? null };
}

async function getOrCreateIntegracaoAtual() {
  const { db, serverConfig, integracao } = await getIntegracaoAtual();
  if (integracao) return { db, serverConfig, integracao };

  await db.insert(btgIntegracoes).values({
    ambiente: serverConfig.ambiente,
    companyId: serverConfig.companyId,
    ativo: 1,
    emissaoHabilitada: 0,
  });
  const rows = await db.select().from(btgIntegracoes)
    .where(eq(btgIntegracoes.ambiente, serverConfig.ambiente))
    .limit(1);
  if (!rows[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível preparar a integração BTG." });

  return { db, serverConfig, integracao: rows[0] };
}

function serializeConta(conta: {
  id: number;
  accountId: string;
  agencia: string;
  numero: string;
  documentoBeneficiario: string | null;
  nomeBeneficiario: string | null;
  rotulo: string | null;
  ativo: number;
  origemCadastro: "api" | "manual_sandbox";
  ultimaSincronizacaoEm: Date;
}) {
  return {
    id: conta.id,
    accountId: conta.accountId,
    agencia: conta.agencia,
    numeroMascarado: mascararNumeroConta(conta.numero),
    documentoBeneficiarioMascarado: conta.documentoBeneficiario
      ? `***${conta.documentoBeneficiario.slice(-4)}`
      : null,
    nomeBeneficiario: conta.nomeBeneficiario,
    rotulo: conta.rotulo,
    ativo: conta.ativo === 1,
    origemCadastro: conta.origemCadastro,
    ultimaSincronizacaoEm: conta.ultimaSincronizacaoEm,
  };
}

export const btgV2Router = router({
  /** Estado seguro e somente leitura que alimenta a nova página administrativa. */
  painel: adminProcedure.query(async () => {
    const oauth = await getStatusOAuthBtg();
    let configuracao: ReturnType<typeof getBtgOAuthConfig> | null = null;
    try {
      configuracao = getBtgOAuthConfig();
    } catch {
      return {
        oauth,
        integracao: null,
        contas: [],
        prontoParaHomologacao: false,
        emissaoHabilitada: false,
      };
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco não disponível" });
    const integracoes = await db.select().from(btgIntegracoes)
      .where(eq(btgIntegracoes.ambiente, configuracao.ambiente))
      .limit(1);
    const integracao = integracoes[0] ?? null;
    const contas = integracao
      ? await db.select().from(btgContasRecebedoras)
        .where(eq(btgContasRecebedoras.btgIntegracaoId, integracao.id))
        .orderBy(desc(btgContasRecebedoras.ativo), btgContasRecebedoras.agencia, btgContasRecebedoras.numero)
      : [];

    return {
      oauth,
      integracao: integracao ? {
        id: integracao.id,
        ambiente: integracao.ambiente,
        companyIdMascarado: `***${integracao.companyId.slice(-4)}`,
        ativo: integracao.ativo === 1,
        emissaoHabilitada: integracao.emissaoHabilitada === 1,
        diasLimitePagamento: integracao.diasLimitePagamento,
        instrucoes: integracao.instrucoes,
        ultimaConsultaContasEm: integracao.ultimaConsultaContasEm,
      } : null,
      contas: contas.map(serializeConta),
      prontoParaHomologacao: oauth.status === "conectado" && Boolean(integracao?.ativo) && contas.some((conta) => conta.ativo === 1),
      emissaoHabilitada: integracao?.emissaoHabilitada === 1,
    };
  }),

  salvarPoliticaHomologacao: adminProcedure
    .input(z.object({
      diasLimitePagamento: z.number().int().min(1).max(365),
      instrucoes: z.string().trim().max(300).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const { db, serverConfig, integracao } = await getOrCreateIntegracaoAtual();
        await db.update(btgIntegracoes).set({
          diasLimitePagamento: input.diasLimitePagamento,
          instrucoes: input.instrucoes || null,
          updatedAt: new Date(),
        }).where(eq(btgIntegracoes.id, integracao.id));
        await logAudit(ctx, {
          action: "config_change",
          entity: "configuracao",
          entityId: `btg-v2:${integracao.ambiente}`,
          metadata: { integracao: "btg-v2", evento: "politica_homologacao_atualizada" },
        });
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw toTrpcError(error);
      }
    }),

  habilitarEmissaoSandbox: adminProcedure
    .input(z.object({ confirmacao: z.literal("HOMOLOGAR") }))
    .mutation(async ({ input: _input, ctx }) => {
      try {
        const oauth = await getStatusOAuthBtg();
        const { db, serverConfig, integracao } = await getOrCreateIntegracaoAtual();
        if (serverConfig.ambiente !== "sandbox" || oauth.status !== "conectado") {
          throw new BtgV2ConfigurationError("Conecte a conta BTG Sandbox antes de habilitar a emissão de homologação.");
        }
        const contas = await db.select({ id: btgContasRecebedoras.id }).from(btgContasRecebedoras)
          .where(and(eq(btgContasRecebedoras.btgIntegracaoId, integracao.id), eq(btgContasRecebedoras.ativo, 1)))
          .limit(1);
        if (!contas[0]) {
          throw new BtgV2ConfigurationError("Sincronize ao menos uma conta recebedora antes de habilitar a homologação.");
        }
        await db.update(btgIntegracoes).set({ emissaoHabilitada: 1, updatedAt: new Date() })
          .where(eq(btgIntegracoes.id, integracao.id));
        await logAudit(ctx, {
          action: "config_change",
          entity: "configuracao",
          entityId: `btg-v2:${integracao.ambiente}`,
          metadata: { integracao: "btg-v2", evento: "emissao_sandbox_habilitada" },
          severity: "warning",
        });
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw toTrpcError(error);
      }
    }),

  desabilitarEmissaoSandbox: adminProcedure.mutation(async ({ ctx }) => {
    try {
      const { db, serverConfig, integracao } = await getIntegracaoAtual();
      if (serverConfig.ambiente !== "sandbox" || !integracao) return { success: true };
      await db.update(btgIntegracoes).set({ emissaoHabilitada: 0, updatedAt: new Date() })
        .where(eq(btgIntegracoes.id, integracao.id));
      await logAudit(ctx, {
        action: "config_change",
        entity: "configuracao",
        entityId: `btg-v2:${integracao.ambiente}`,
        metadata: { integracao: "btg-v2", evento: "emissao_sandbox_desabilitada" },
        severity: "warning",
      });
      return { success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw toTrpcError(error);
    }
  }),

  habilitarEmissaoProducao: adminProcedure
    .input(z.object({ confirmacao: z.literal("LIBERAR PRODUCAO") }))
    .mutation(async ({ input: _input, ctx }) => {
      try {
        const oauth = await getStatusOAuthBtg();
        const { db, serverConfig, integracao } = await getOrCreateIntegracaoAtual();
        if (serverConfig.ambiente !== "producao") {
          throw new BtgV2ConfigurationError("A liberação de Produção só pode ocorrer quando o servidor estiver configurado para Produção.");
        }
        if (oauth.status !== "conectado") {
          throw new BtgV2ConfigurationError("Conecte a conta BTG de Produção antes de liberar emissões.");
        }
        if (!process.env.BTG_WEBHOOK_SECRET?.trim()) {
          throw new BtgV2ConfigurationError("Configure o segredo HMAC do webhook BTG antes de liberar emissões de Produção.");
        }
        const [vinculoOficial] = await db.select({ id: btgContaRecebedoraCondominios.id })
          .from(btgContaRecebedoraCondominios)
          .innerJoin(btgContasRecebedoras, eq(btgContasRecebedoras.id, btgContaRecebedoraCondominios.btgContaRecebedoraId))
          .where(and(
            eq(btgContaRecebedoraCondominios.btgIntegracaoId, integracao.id),
            eq(btgContaRecebedoraCondominios.ativo, 1),
            eq(btgContasRecebedoras.ativo, 1),
            eq(btgContasRecebedoras.origemCadastro, "api"),
          ))
          .limit(1);
        if (!vinculoOficial) {
          throw new BtgV2ConfigurationError("Vincule ao menos uma conta oficial retornada pela API BTG antes de liberar Produção.");
        }
        await db.update(btgIntegracoes).set({ emissaoHabilitada: 1, updatedAt: new Date() })
          .where(eq(btgIntegracoes.id, integracao.id));
        await logAudit(ctx, {
          action: "config_change",
          entity: "configuracao",
          entityId: `btg-v2:${integracao.ambiente}`,
          metadata: { integracao: "btg-v2", evento: "emissao_producao_habilitada" },
          severity: "warning",
        });
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw toTrpcError(error);
      }
    }),

  /** Consulta explícita da API Accounts; não é acionada no carregamento da página. */
  sincronizarContas: adminProcedure.mutation(async ({ ctx }) => {
    try {
      const { db, integracao } = await getOrCreateIntegracaoAtual();
      const contas = await consultarContasRecebedorasBtg();
      const now = new Date();

      for (const conta of contas) {
        await db.insert(btgContasRecebedoras).values({
          btgIntegracaoId: integracao.id,
          accountId: conta.accountId,
          origemCadastro: "api",
          agencia: conta.agencia,
          numero: conta.numero,
          documentoBeneficiario: conta.documentoBeneficiario,
          nomeBeneficiario: conta.nomeBeneficiario,
          rotulo: conta.nomeBeneficiario,
          ativo: 1,
          ultimaSincronizacaoEm: now,
        }).onDuplicateKeyUpdate({
          set: {
            origemCadastro: "api",
            agencia: conta.agencia,
            numero: conta.numero,
            documentoBeneficiario: conta.documentoBeneficiario,
            nomeBeneficiario: conta.nomeBeneficiario,
            rotulo: conta.nomeBeneficiario,
            ativo: 1,
            ultimaSincronizacaoEm: now,
          },
        });
      }

      await db.update(btgIntegracoes)
        .set({ ativo: 1, ultimaConsultaContasEm: now, updatedAt: now })
        .where(eq(btgIntegracoes.id, integracao.id));

      await logAudit(ctx, {
        action: "config_change",
        entity: "configuracao",
        entityId: `btg-v2:${integracao.ambiente}`,
        metadata: { integracao: "btg-v2", evento: "contas_sincronizadas", quantidade: contas.length },
      });

      return { success: true, quantidade: contas.length };
    } catch (error) {
      throw toTrpcError(error);
    }
    }),

  cadastrarContaManualSandbox: adminProcedure
    .input(z.object({
      rotulo: z.string().trim().min(3).max(255),
      agencia: z.string().trim().min(1).max(30),
      numero: z.string().trim().min(1).max(50),
      documentoBeneficiario: z.string().trim().max(20).optional(),
      nomeBeneficiario: z.string().trim().max(255).optional(),
      confirmacao: z.literal("CADASTRAR"),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const oauth = await getStatusOAuthBtg();
        const { db, serverConfig, integracao } = await getOrCreateIntegracaoAtual();
        validarCadastroManualSandbox({ ambiente: serverConfig.ambiente, oauthConectado: oauth.status === "conectado" });
        const conta = normalizarContaManualSandbox(input);
        const now = new Date();
        await db.insert(btgContasRecebedoras).values({
          btgIntegracaoId: integracao.id,
          accountId: conta.accountId,
          origemCadastro: "manual_sandbox",
          agencia: conta.agencia,
          numero: conta.numero,
          documentoBeneficiario: conta.documentoBeneficiario,
          nomeBeneficiario: conta.nomeBeneficiario,
          rotulo: conta.rotulo,
          ativo: 1,
          ultimaSincronizacaoEm: now,
        }).onDuplicateKeyUpdate({
          set: {
            origemCadastro: "manual_sandbox",
            agencia: conta.agencia,
            numero: conta.numero,
            documentoBeneficiario: conta.documentoBeneficiario,
            nomeBeneficiario: conta.nomeBeneficiario,
            rotulo: conta.rotulo,
            ativo: 1,
            updatedAt: now,
          },
        });
        const rows = await db.select().from(btgContasRecebedoras)
          .where(and(
            eq(btgContasRecebedoras.btgIntegracaoId, integracao.id),
            eq(btgContasRecebedoras.accountId, conta.accountId),
          ))
          .limit(1);
        const registrada = rows[0];
        if (!registrada) throw new BtgV2ConfigurationError("Não foi possível registrar a conta manual no Sandbox.");

        await logAudit(ctx, {
          action: "config_change",
          entity: "configuracao",
          entityId: `btg-v2:${integracao.ambiente}`,
          metadata: {
            integracao: "btg-v2",
            evento: "conta_recebedora_manual_cadastrada",
            ambiente: "sandbox",
            contaId: registrada.id,
            agencia: conta.agencia,
            contaFinal: conta.numero.slice(-4),
          },
          severity: "warning",
        });
        return serializeConta(registrada);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw toTrpcError(error);
      }
    }),

  vinculoCondominio: adminProcedure
    .input(z.object({ condominioId: z.number().int().positive() }))
    .query(async ({ input }) => {
      let current: Awaited<ReturnType<typeof getIntegracaoAtual>>;
      try {
        current = await getIntegracaoAtual();
      } catch (error) {
        throw toTrpcError(error);
      }
      if (!current.integracao) return null;

      const rows = await current.db.select({
        vinculoId: btgContaRecebedoraCondominios.id,
        ativo: btgContaRecebedoraCondominios.ativo,
        conta: btgContasRecebedoras,
      }).from(btgContaRecebedoraCondominios)
        .innerJoin(
          btgContasRecebedoras,
          eq(btgContasRecebedoras.id, btgContaRecebedoraCondominios.btgContaRecebedoraId),
        )
        .where(and(
          eq(btgContaRecebedoraCondominios.btgIntegracaoId, current.integracao.id),
          eq(btgContaRecebedoraCondominios.condominioId, input.condominioId),
        ))
        .limit(1);
      const row = rows[0];
      return row ? { id: row.vinculoId, ativo: row.ativo === 1, conta: serializeConta(row.conta) } : null;
    }),

  vincularContaCondominio: adminProcedure
    .input(z.object({
      condominioId: z.number().int().positive(),
      contaRecebedoraId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const { db, integracao } = await getOrCreateIntegracaoAtual();
        const [condominio] = await db.select({ id: condominios.id, name: condominios.name })
          .from(condominios)
          .where(eq(condominios.id, input.condominioId))
          .limit(1);
        if (!condominio) throw new TRPCError({ code: "NOT_FOUND", message: "Condomínio não encontrado." });

        const [conta] = await db.select().from(btgContasRecebedoras)
          .where(and(
            eq(btgContasRecebedoras.id, input.contaRecebedoraId),
            eq(btgContasRecebedoras.btgIntegracaoId, integracao.id),
            eq(btgContasRecebedoras.ativo, 1),
          ))
          .limit(1);
        if (!conta) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A conta selecionada não está disponível nesta integração BTG." });
        }

        await db.insert(btgContaRecebedoraCondominios).values({
          btgIntegracaoId: integracao.id,
          condominioId: input.condominioId,
          btgContaRecebedoraId: conta.id,
          ativo: 1,
        }).onDuplicateKeyUpdate({
          set: { btgContaRecebedoraId: conta.id, ativo: 1, updatedAt: new Date() },
        });

        await logAudit(ctx, {
          action: "config_change",
          entity: "condominio",
          entityId: String(condominio.id),
          entityLabel: condominio.name,
          condominioId: condominio.id,
          metadata: {
            integracao: "btg-v2",
            evento: "conta_recebedora_vinculada",
            ambiente: integracao.ambiente,
            contaId: conta.id,
            accountId: conta.accountId,
          },
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw toTrpcError(error);
      }
    }),

  filaRemessa: adminProcedure
    .input(z.object({ condominioId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        const { db, integracao } = await getIntegracaoAtual();
        if (!integracao) throw new BtgV2ConfigurationError("Configure a integração BTG antes de montar uma remessa.");
        const [contaVinculada] = await db.select({
          id: btgContasRecebedoras.id,
          agencia: btgContasRecebedoras.agencia,
          numero: btgContasRecebedoras.numero,
          rotulo: btgContasRecebedoras.rotulo,
          nomeBeneficiario: btgContasRecebedoras.nomeBeneficiario,
        }).from(btgContaRecebedoraCondominios)
          .innerJoin(btgContasRecebedoras, eq(btgContasRecebedoras.id, btgContaRecebedoraCondominios.btgContaRecebedoraId))
          .where(and(
            eq(btgContaRecebedoraCondominios.btgIntegracaoId, integracao.id),
            eq(btgContaRecebedoraCondominios.condominioId, input.condominioId),
            eq(btgContaRecebedoraCondominios.ativo, 1),
            eq(btgContasRecebedoras.ativo, 1),
          ))
          .limit(1);
        const parcelas = await listarFilaRemessaBtgV2({ db, condominioId: input.condominioId, btgIntegracaoId: integracao.id });
        return {
          conta: contaVinculada ? {
            id: contaVinculada.id,
            rotulo: contaVinculada.rotulo || contaVinculada.nomeBeneficiario || "Conta BTG",
            agencia: contaVinculada.agencia,
            numeroMascarado: mascararNumeroConta(contaVinculada.numero),
          } : null,
          parcelas,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw toTrpcError(error);
      }
    }),

  criarEEnviarRemessa: adminProcedure
    .input(z.object({
      condominioId: z.number().int().positive(),
      parcelaIds: z.array(z.number().int().positive()).min(1).max(50),
      observacao: z.string().trim().max(500).optional(),
      confirmacao: z.literal("ENVIAR REMESSA"),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const { db, integracao } = await getIntegracaoAtual();
        if (!integracao || integracao.ativo !== 1 || integracao.emissaoHabilitada !== 1) {
          throw new BtgV2ConfigurationError("A emissão BTG não está habilitada para este ambiente.");
        }
        const [contaVinculada] = await db.select({ id: btgContasRecebedoras.id })
          .from(btgContaRecebedoraCondominios)
          .innerJoin(btgContasRecebedoras, eq(btgContasRecebedoras.id, btgContaRecebedoraCondominios.btgContaRecebedoraId))
          .where(and(
            eq(btgContaRecebedoraCondominios.btgIntegracaoId, integracao.id),
            eq(btgContaRecebedoraCondominios.condominioId, input.condominioId),
            eq(btgContaRecebedoraCondominios.ativo, 1),
            eq(btgContasRecebedoras.ativo, 1),
          ))
          .limit(1);
        if (!contaVinculada) throw new BtgV2ConfigurationError("Vincule uma conta recebedora BTG ativa a este condomínio antes de enviar a remessa.");

        const fila = await listarFilaRemessaBtgV2({ db, condominioId: input.condominioId, btgIntegracaoId: integracao.id });
        const selecionadas = validarSelecaoRemessaBtgV2({ condominioId: input.condominioId, parcelaIds: input.parcelaIds, fila });
        const valorTotalCentavos = selecionadas.reduce((total, parcela) => total + parcela.amount, 0);
        const now = new Date();
        const result = await db.insert(btgRemessas).values({
          btgIntegracaoId: integracao.id,
          btgContaRecebedoraId: contaVinculada.id,
          condominioId: input.condominioId,
          status: "rascunho",
          totalSelecionado: selecionadas.length,
          valorTotalCentavos,
          usuarioCriadorId: ctx.user.id,
          observacao: input.observacao || null,
          criadaEm: now,
          createdAt: now,
          updatedAt: now,
        });
        const remessaId = Number((result as { insertId?: number })?.insertId ?? 0);
        if (!remessaId) throw new BtgV2ConfigurationError("Não foi possível registrar a remessa BTG antes do envio.");

        await db.insert(btgRemessaItens).values(selecionadas.map((parcela) => ({
          btgRemessaId: remessaId,
          parcelaAcordoId: parcela.id,
          installmentNumber: parcela.installmentNumber,
          valorCentavos: parcela.amount,
          resultado: "pendente" as const,
        })));

        const resumo = await executarRemessaBtgV2({ db, remessaId, parcelas: selecionadas });
        await logAudit(ctx, {
          action: "generate_boleto",
          entity: "configuracao",
          entityId: `btg-remessa:${remessaId}`,
          condominioId: input.condominioId,
          metadata: { integracao: "btg-v2", evento: "remessa_enviada", remessaId, ...resumo },
          severity: resumo.totalFalha ? "warning" : "info",
        });
        return { id: remessaId, ...resumo };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw toTrpcError(error);
      }
    }),

  listarRemessas: adminProcedure
    .input(z.object({
      condominioId: z.number().int().positive().optional(),
      status: z.enum(["rascunho", "enviando", "processada", "processada_parcialmente", "falha", "cancelada"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      const { db, integracao } = await getIntegracaoAtual();
      if (!integracao) return [];
      const filtros = [eq(btgRemessas.btgIntegracaoId, integracao.id)];
      if (input?.condominioId) filtros.push(eq(btgRemessas.condominioId, input.condominioId));
      if (input?.status) filtros.push(eq(btgRemessas.status, input.status));
      const rows = await db.select({ remessa: btgRemessas, condominioNome: condominios.name })
        .from(btgRemessas)
        .innerJoin(condominios, eq(condominios.id, btgRemessas.condominioId))
        .where(and(...filtros))
        .orderBy(desc(btgRemessas.criadaEm))
        .limit(100);
      return rows.map(({ remessa, condominioNome }) => ({ ...remessa, condominioNome }));
    }),

  detalheRemessa: adminProcedure
    .input(z.object({ remessaId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const { db, integracao } = await getIntegracaoAtual();
      if (!integracao) throw new TRPCError({ code: "NOT_FOUND", message: "Remessa não encontrada." });
      const [remessa] = await db.select({ remessa: btgRemessas, condominioNome: condominios.name })
        .from(btgRemessas)
        .innerJoin(condominios, eq(condominios.id, btgRemessas.condominioId))
        .where(and(eq(btgRemessas.id, input.remessaId), eq(btgRemessas.btgIntegracaoId, integracao.id)))
        .limit(1);
      if (!remessa) throw new TRPCError({ code: "NOT_FOUND", message: "Remessa não encontrada." });
      const itens = await db.select({ item: btgRemessaItens, emissao: btgCobrancasEmitidas })
        .from(btgRemessaItens)
        .leftJoin(btgCobrancasEmitidas, eq(btgCobrancasEmitidas.id, btgRemessaItens.btgCobrancaEmitidaId))
        .where(eq(btgRemessaItens.btgRemessaId, input.remessaId))
        .orderBy(btgRemessaItens.installmentNumber);
      return { ...remessa, itens: itens.map(({ item, emissao }) => ({ ...item, emissao })) };
    }),

  prepararEmissaoAcordo: adminProcedure
    .input(z.object({ acordoId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco não disponível" });
        return await prepararEmissaoParcelasAcordoBtgV2({ db, acordoId: input.acordoId });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw toTrpcError(error);
      }
    }),

  emitirParcelasAcordo: adminProcedure
    .input(z.object({
      acordoId: z.number().int().positive(),
      parcelaIds: z.array(z.number().int().positive()).min(1).max(50),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const config = getBtgV2ServerConfig();
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco não disponível" });
        const resultado = await emitirParcelasAcordoBtgV2({ db, ...input });
        const resumo = resultado.resultados.reduce((acumulado, item) => {
          acumulado[item.resultado] += 1;
          return acumulado;
        }, { simulada: 0, emitida: 0, ja_existia: 0, falha: 0 });
        await logAudit(ctx, {
          action: "generate_boleto",
          entity: "acordo",
          entityId: String(input.acordoId),
          metadata: {
            integracao: "btg-v2",
            instrumento: "bolepix",
            evento: "emissao_parcelas_acordo_solicitada",
            ambiente: config.ambiente,
            parcelasSelecionadas: input.parcelaIds.length,
            ...resumo,
          },
          severity: "warning",
        });
        return resultado;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw toTrpcError(error);
      }
    }),

  listarEmissoes: adminProcedure
    .input(z.object({ condominioId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => {
      const { db, integracao } = await getIntegracaoAtual();
      if (!integracao) return [];
      const base = db.select({
        emissao: btgCobrancasEmitidas,
        condominioNome: condominios.name,
      }).from(btgCobrancasEmitidas)
        .innerJoin(condominios, eq(condominios.id, btgCobrancasEmitidas.condominioId));
      const rows = input?.condominioId
        ? await base.where(and(
          eq(btgCobrancasEmitidas.btgIntegracaoId, integracao.id),
          eq(btgCobrancasEmitidas.condominioId, input.condominioId),
        )).orderBy(desc(btgCobrancasEmitidas.createdAt)).limit(100)
        : await base.where(eq(btgCobrancasEmitidas.btgIntegracaoId, integracao.id))
          .orderBy(desc(btgCobrancasEmitidas.createdAt)).limit(100);
      return rows.map(({ emissao, condominioNome }) => ({
        id: emissao.id,
        condominioId: emissao.condominioId,
        condominioNome,
        origemTipo: emissao.origemTipo,
        origemId: emissao.origemId,
        status: emissao.status,
        amount: emissao.amount,
        dueDate: emissao.dueDate,
        collectionId: emissao.btgCollectionId,
        bankSlipUrl: emissao.bankSlipUrl,
        pixCopiaECola: emissao.pixCopiaECola,
        linhaDigitavel: emissao.linhaDigitavel,
        nossoNumero: emissao.nossoNumero,
        emitidaEm: emissao.emitidaEm,
        erroCodigo: emissao.erroCodigo,
      }));
    }),

  listarEntregasWebhook: adminProcedure.query(async () => {
    let current: Awaited<ReturnType<typeof getIntegracaoAtual>>;
    try {
      current = await getIntegracaoAtual();
    } catch {
      // A página de configuração deve continuar exibindo o checklist quando as
      // variáveis ainda não foram cadastradas no cofre seguro.
      return [];
    }
    const { db, integracao } = current;
    if (!integracao) return [];
    const rows = await db.select({
      id: btgWebhookEntregas.id,
      evento: btgWebhookEntregas.evento,
      collectionId: btgWebhookEntregas.btgCollectionId,
      assinaturaValida: btgWebhookEntregas.assinaturaValida,
      statusProcessamento: btgWebhookEntregas.statusProcessamento,
      erroCodigo: btgWebhookEntregas.erroCodigo,
      recebidoEm: btgWebhookEntregas.recebidoEm,
      processadoEm: btgWebhookEntregas.processadoEm,
    }).from(btgWebhookEntregas)
      .where(eq(btgWebhookEntregas.btgIntegracaoId, integracao.id))
      .orderBy(desc(btgWebhookEntregas.recebidoEm))
      .limit(20);
    return rows.map((row) => ({ ...row, assinaturaValida: row.assinaturaValida === 1 }));
  }),

  conciliarEmissao: adminProcedure
    .input(z.object({ emissaoId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco não disponível" });
        const resultado = await conciliarEmissaoBolePixV2(db, input.emissaoId);
        await logAudit(ctx, {
          action: "config_change",
          entity: "boleto",
          entityId: String(input.emissaoId),
          metadata: { integracao: "btg-v2", evento: "conciliacao_manual", ...resultado },
          severity: resultado.pagamentoAplicado ? "warning" : "info",
        });
        return resultado;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw toTrpcError(error);
      }
    }),

  conciliarPendentes: adminProcedure
    .input(z.object({ condominioId: z.number().int().positive().optional() }).optional())
    .mutation(async ({ input, ctx }) => {
      try {
        const { db, integracao } = await getIntegracaoAtual();
        if (!integracao) return { processadas: 0, pagas: 0, erros: [] as string[] };
        const filters = [
          eq(btgCobrancasEmitidas.btgIntegracaoId, integracao.id),
          notInArray(btgCobrancasEmitidas.status, ["paga", "cancelada", "expirada"]),
        ];
        if (input?.condominioId) filters.push(eq(btgCobrancasEmitidas.condominioId, input.condominioId));
        const pendentes = await db.select({ id: btgCobrancasEmitidas.id })
          .from(btgCobrancasEmitidas)
          .where(and(...filters))
          .orderBy(btgCobrancasEmitidas.createdAt)
          .limit(50);
        let pagas = 0;
        const erros: string[] = [];
        for (const item of pendentes) {
          try {
            const resultado = await conciliarEmissaoBolePixV2(db, item.id);
            if (resultado.pagamentoAplicado) pagas += 1;
          } catch (error) {
            erros.push(`Emissão #${item.id}: ${error instanceof Error ? error.message : "falha desconhecida"}`);
          }
        }
        await logAudit(ctx, {
          action: "config_change",
          entity: "configuracao",
          entityId: `btg-v2:${integracao.ambiente}`,
          metadata: { integracao: "btg-v2", evento: "conciliacao_lote", processadas: pendentes.length, pagas, erros: erros.length },
          severity: erros.length ? "warning" : "info",
        });
        return { processadas: pendentes.length, pagas, erros };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw toTrpcError(error);
      }
    }),

  cancelarEmissao: adminProcedure
    .input(z.object({ emissaoId: z.number().int().positive(), confirmacao: z.literal("CANCELAR") }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco não disponível" });
        const resultado = await cancelarEmissaoBolePixV2(db, input.emissaoId);
        await logAudit(ctx, {
          action: "config_change",
          entity: "boleto",
          entityId: String(input.emissaoId),
          metadata: { integracao: "btg-v2", evento: "cancelamento_confirmado", ...resultado },
          severity: "warning",
        });
        return resultado;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw toTrpcError(error);
      }
    }),
});

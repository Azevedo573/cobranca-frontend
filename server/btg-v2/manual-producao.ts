import { auditLogs, btgIntegracoes } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import type { TrpcContext } from "../_core/context";
import { BtgV2ConfigurationError, validarIntegracaoRuntimeBtg, type BtgV2ServerConfig } from "./config";

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;
export type BtgTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Ordem de locks compartilhada: integração -> conta/vínculo -> reserva. */
export async function bloquearIntegracaoBtg(tx: BtgTransaction, config: BtgV2ServerConfig, criar = false) {
  let [integracao] = await tx.select().from(btgIntegracoes)
    .where(eq(btgIntegracoes.ambiente, config.ambiente)).limit(1).for("update");
  if (!integracao && criar) {
    await tx.insert(btgIntegracoes).values({ ambiente: config.ambiente, companyId: config.companyId, ativo: 1, emissaoHabilitada: 0 });
    [integracao] = await tx.select().from(btgIntegracoes)
      .where(eq(btgIntegracoes.ambiente, config.ambiente)).limit(1).for("update");
  }
  if (!integracao) throw new BtgV2ConfigurationError("Configure a integração BTG antes de utilizar uma conta recebedora.");
  validarIntegracaoRuntimeBtg(integracao, config);
  return integracao;
}

/** Não usa logAudit (best-effort/global): falha aqui deve desfazer a própria operação. */
export async function auditarContaBtgTransacional(tx: BtgTransaction, ctx: TrpcContext, input: {
  evento: string;
  ambiente: string;
  integracaoId: number;
  contaId?: number;
  condominioId?: number;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const forwarded = ctx.req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || ctx.req.socket?.remoteAddress || ctx.req.ip || "unknown";
  await tx.insert(auditLogs).values({
    userId: ctx.user?.id ?? null, userName: ctx.user?.name ?? null,
    userRole: ctx.user?.role ?? null, userEmail: ctx.user?.email ?? null,
    action: "config_change", entity: "configuracao", entityId: `btg-v2:${input.ambiente}`,
    condominioId: input.condominioId ?? null,
    beforeData: input.beforeData ? JSON.stringify(input.beforeData) : null,
    afterData: input.afterData ? JSON.stringify(input.afterData) : null,
    metadata: JSON.stringify({ integracao: "btg-v2", evento: input.evento, ambiente: input.ambiente,
      integracaoId: input.integracaoId, contaId: input.contaId, ...input.metadata }),
    ipAddress: ip.substring(0, 45), userAgent: String(ctx.req.headers["user-agent"] ?? "").substring(0, 500),
    severity: "warning", success: 1,
  });
}

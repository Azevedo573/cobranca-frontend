/**
 * audit.ts — Módulo de Auditoria e Rastreabilidade
 *
 * Princípios de design:
 * - Fire-and-forget: nunca bloqueia a operação principal (erros de log não propagam)
 * - Imutável: registros de auditoria nunca são atualizados ou deletados
 * - Contextual: captura IP, userAgent, userId, role e condomínio automaticamente
 * - Seguro: sanitiza dados sensíveis antes de persistir (senhas, tokens)
 *
 * Uso:
 *   await logAudit(ctx, {
 *     action: "create",
 *     entity: "devedor",
 *     entityId: String(devedor.id),
 *     entityLabel: devedor.nome,
 *     afterData: devedor,
 *     severity: "info",
 *   });
 */

import { getDb } from "./db";
import { auditLogs } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import type { Request } from "express";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type AuditAction =
  | "login_success"
  | "login_failed"
  | "logout"
  | "create"
  | "update"
  | "delete"
  | "view"
  | "export"
  | "generate_boleto"
  | "generate_remessa"
  | "process_retorno"
  | "password_reset_request"
  | "password_reset_success"
  | "role_change"
  | "define_primary_admin"
  | "bulk_action"
  | "access_denied"
  | "config_change"
  | "cancel_acordo"
  | "pay_parcela"
  | "upload_boleto"
  | "import_data";

export type AuditEntity =
  | "user"
  | "condominio"
  | "devedor"
  | "cobranca"
  | "acordo"
  | "parcela"
  | "boleto"
  | "remessa"
  | "retorno"
  | "configuracao"
  | "regua"
  | "importacao"
  | "session"
  | "password";

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditPayload {
  action: AuditAction;
  entity?: AuditEntity;
  entityId?: string;
  entityLabel?: string;
  condominioId?: number;
  condominioNome?: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  severity?: AuditSeverity;
  success?: boolean;
  errorMessage?: string;
  // Para ações anônimas (login_failed antes de autenticar)
  anonymousUserId?: string;
  anonymousUserName?: string;
  anonymousUserRole?: string;
  anonymousUserEmail?: string;
}

// ─── Campos sensíveis a sanitizar ────────────────────────────────────────────

const SENSITIVE_FIELDS = new Set([
  "password", "senha", "passwordHash", "hash", "token", "tokenHash",
  "secret", "apiKey", "privateKey", "accessToken", "refreshToken",
  "creditCard", "cvv", "pin",
]);

function sanitize(obj: Record<string, unknown> | null | undefined): string | null {
  if (!obj) return null;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key)) {
      clean[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      clean[key] = JSON.parse(sanitize(value as Record<string, unknown>) ?? "{}");
    } else {
      clean[key] = value;
    }
  }
  return JSON.stringify(clean);
}

// ─── Extração de IP ───────────────────────────────────────────────────────────

function extractIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? req.ip ?? "unknown";
}

// ─── Helper principal ─────────────────────────────────────────────────────────

/**
 * Registra um evento de auditoria de forma assíncrona e não-bloqueante.
 * Nunca lança exceção — erros de auditoria são silenciados para não
 * interromper o fluxo principal da aplicação.
 */
export async function logAudit(
  ctx: TrpcContext,
  payload: AuditPayload
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const req = ctx.req;
    const user = ctx.user;

    const ipAddress = extractIp(req);
    const userAgent = (req.headers["user-agent"] ?? "").substring(0, 500);

    await db.insert(auditLogs).values({
      // Quem
      userId: user?.id ?? null,
      userName: payload.anonymousUserName ?? user?.name ?? null,
      userRole: payload.anonymousUserRole ?? user?.role ?? null,
      userEmail: payload.anonymousUserEmail ?? user?.email ?? null,
      // O que
      action: payload.action,
      entity: payload.entity ?? null,
      entityId: payload.entityId ?? null,
      entityLabel: payload.entityLabel ?? null,
      // Contexto
      condominioId: payload.condominioId ?? user?.condominioId ?? null,
      condominioNome: payload.condominioNome ?? null,
      // Dados
      beforeData: sanitize(payload.beforeData ?? null),
      afterData: sanitize(payload.afterData ?? null),
      metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
      // Segurança
      ipAddress,
      userAgent,
      // Classificação
      severity: payload.severity ?? "info",
      success: payload.success !== false ? 1 : 0,
      errorMessage: payload.errorMessage ?? null,
    });
  } catch {
    // Auditoria nunca deve quebrar a operação principal
    // Em produção, considerar enviar para um serviço externo como fallback
  }
}

/**
 * Versão para uso fora do contexto tRPC (ex: auth handlers, webhooks).
 * Aceita req diretamente em vez de ctx.
 */
export async function logAuditRaw(
  req: Request,
  userId: number | null,
  userName: string | null,
  userRole: string | null,
  userEmail: string | null,
  payload: AuditPayload
): Promise<void> {
  const fakeCtx: TrpcContext = {
    req,
    res: {} as never,
    user: userId ? {
      id: userId,
      name: userName ?? "",
      role: (userRole ?? "cobrador") as "admin" | "sindico" | "cobrador",
      email: userEmail ?? "",
      openId: "",
      loginMethod: null,
      condominioId: null,
      passwordHash: null,
      isPrimaryAdmin: 0,
      isActive: 1,
      profileId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } : null,
  };
  await logAudit(fakeCtx, payload);
}

// ─── Helpers de ação específica ───────────────────────────────────────────────

/** Registra login bem-sucedido */
export async function auditLoginSuccess(
  ctx: TrpcContext,
  extra?: { condominioId?: number; condominioNome?: string }
): Promise<void> {
  await logAudit(ctx, {
    action: "login_success",
    entity: "session",
    severity: "info",
    success: true,
    condominioId: extra?.condominioId,
    condominioNome: extra?.condominioNome,
    metadata: { authType: "custom" },
  });
}

/** Registra tentativa de login falha */
export async function auditLoginFailed(
  ctx: TrpcContext,
  username: string,
  reason: string
): Promise<void> {
  await logAudit(ctx, {
    action: "login_failed",
    entity: "session",
    severity: "warning",
    success: false,
    errorMessage: reason,
    anonymousUserName: username,
    metadata: { attemptedUsername: username },
  });
}

/** Registra logout */
export async function auditLogout(ctx: TrpcContext): Promise<void> {
  await logAudit(ctx, {
    action: "logout",
    entity: "session",
    severity: "info",
    success: true,
  });
}

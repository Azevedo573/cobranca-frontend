/**
 * BTG Pactual Empresas API Service
 * Integração com a API de Cobranças do BTG Pactual
 * Documentação: https://developers.empresas.btgpactual.com/reference/collection
 *
 * Fluxo de autenticação: Authorization Code (BTG Id)
 * Endpoint base: https://api.empresas.btgpactual.com/{companyId}/banking/collections
 */

import { getDb } from "./db";
import { btgConfig } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const BTG_AUTH_URL = "https://id.btgpactual.com/auth/realms/btg-empresas/protocol/openid-connect/token";
const BTG_API_BASE = "https://api.empresas.btgpactual.com";

// ─── Tipos da API BTG ──────────────────────────────────────────────────────────

export type BtgCollectionType = "BANKSLIP" | "BANKSLIP_PIX" | "DUE_DATE_PIX" | "IMMEDIATE_PIX";

export type BtgPayerPersonType = "F" | "J"; // F = Física, J = Jurídica

export interface BtgPayer {
  personType: BtgPayerPersonType;
  name: string;
  document: string; // CPF ou CNPJ (apenas dígitos)
  email?: string;
  phone?: string;
  address?: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string; // UF (2 letras)
    zipCode: string; // apenas dígitos
  };
}

export interface BtgInterest {
  startDate?: string; // YYYY-MM-DD
  type: "FIXED_VALUE" | "FIXED_VALUE_PER_DAY" | "PERCENTAGE" | "PERCENTAGE_PER_DAY";
  value: number; // centavos (FIXED_VALUE) ou percentual (PERCENTAGE)
}

export interface BtgFine {
  startDate?: string; // YYYY-MM-DD
  type: "FIXED_VALUE" | "PERCENTAGE";
  value: number;
}

export interface BtgDiscount {
  limitDate: string; // YYYY-MM-DD
  type: "FIXED_VALUE" | "PERCENTAGE";
  value: number;
}

export interface BtgCreateCollectionRequest {
  type: BtgCollectionType;
  amount: number; // em centavos
  dueDate: string; // YYYY-MM-DD
  overDueDate?: string; // YYYY-MM-DD — data limite para pagamento após vencimento
  batchId?: string; // UUID para agrupar cobranças em lote
  description?: string;
  externalId?: string; // ID externo (nosso ID interno)
  deliveryMediums?: ("Sms" | "Email" | "WhatsApp")[];
  payer: BtgPayer;
  interest?: BtgInterest;
  fine?: BtgFine;
  discounts?: BtgDiscount[];
}

export interface BtgCollectionResponse {
  collectionId: string;
  dueDate: string;
  overDueDate?: string;
  createdAt: string;
  amount: number;
  batchId?: string;
  deliveryMediums?: string[];
  interest?: BtgInterest;
  fine?: BtgFine;
  discounts?: BtgDiscount[];
  payer?: BtgPayer;
  status: string; // CREATED | PAID | CANCELED | EXPIRED | PROCESSING | FAILED | ...
  bankSlipUrl?: string; // URL do boleto PDF
  pixQrCode?: string; // QR Code PIX (base64)
  pixCopyPaste?: string; // PIX copia e cola (EMV)
  barCode?: string; // Código de barras do boleto
  digitableLine?: string; // Linha digitável
}

export interface BtgWebhookPayload {
  event: string; // collections.paid | collections.expired | collections.cancelled | ...
  data: {
    collectionId: string;
    externalId?: string;
    status: string;
    amount?: number;
    paidAmount?: number;
    paidAt?: string;
    dueDate?: string;
  };
}

// ─── Autenticação ──────────────────────────────────────────────────────────────

/**
 * Obtém token de acesso BTG via Client Credentials.
 * Usa cache na tabela btgConfig para evitar reautenticação desnecessária.
 */
export async function getBtgAccessToken(condominioId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  const config = await db.select().from(btgConfig)
    .where(eq(btgConfig.condominioId, condominioId))
    .limit(1);

  if (!config.length) {
    throw new Error("Configuração BTG não encontrada para este condomínio");
  }

  const cfg = config[0];

  // Verificar cache do token
  if (cfg.accessToken && cfg.tokenExpiresAt) {
    const now = new Date();
    const expiresAt = new Date(cfg.tokenExpiresAt);
    // Usar token em cache se ainda válido (com 5 min de margem)
    if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
      return cfg.accessToken;
    }
  }

  // Solicitar novo token
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: "brn:btg:empresas:banking:collections openid",
  });

  const response = await fetch(BTG_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha na autenticação BTG: ${response.status} - ${errorText}`);
  }

  const tokenData = await response.json() as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  // Calcular expiração
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

  // Salvar token em cache
  await db.update(btgConfig)
    .set({
      accessToken: tokenData.access_token,
      tokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(btgConfig.condominioId, condominioId));

  return tokenData.access_token;
}

// ─── Funções de Cobrança ───────────────────────────────────────────────────────

/**
 * Cria uma cobrança (boleto híbrido BANKSLIP_PIX) no BTG Pactual
 */
export async function criarCobrancaBtg(
  condominioId: number,
  payload: BtgCreateCollectionRequest
): Promise<BtgCollectionResponse> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  const config = await db.select().from(btgConfig)
    .where(eq(btgConfig.condominioId, condominioId))
    .limit(1);

  if (!config.length) {
    throw new Error("Configuração BTG não encontrada para este condomínio");
  }

  const cfg = config[0];
  const token = await getBtgAccessToken(condominioId);

  const url = `${BTG_API_BASE}/${cfg.companyId}/banking/collections`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro ao criar cobrança BTG: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<BtgCollectionResponse>;
}

/**
 * Busca uma cobrança pelo ID no BTG Pactual
 */
export async function buscarCobrancaBtg(
  condominioId: number,
  collectionId: string
): Promise<BtgCollectionResponse> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  const config = await db.select().from(btgConfig)
    .where(eq(btgConfig.condominioId, condominioId))
    .limit(1);

  if (!config.length) {
    throw new Error("Configuração BTG não encontrada para este condomínio");
  }

  const cfg = config[0];
  const token = await getBtgAccessToken(condominioId);

  const url = `${BTG_API_BASE}/${cfg.companyId}/banking/collections/${collectionId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro ao buscar cobrança BTG: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<BtgCollectionResponse>;
}

/**
 * Cancela uma cobrança no BTG Pactual
 */
export async function cancelarCobrancaBtg(
  condominioId: number,
  collectionId: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  const config = await db.select().from(btgConfig)
    .where(eq(btgConfig.condominioId, condominioId))
    .limit(1);

  if (!config.length) {
    throw new Error("Configuração BTG não encontrada para este condomínio");
  }

  const cfg = config[0];
  const token = await getBtgAccessToken(condominioId);

  const url = `${BTG_API_BASE}/${cfg.companyId}/banking/collections/${collectionId}`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro ao cancelar cobrança BTG: ${response.status} - ${errorText}`);
  }
}

/**
 * Lista cobranças no BTG Pactual com filtros opcionais
 */
export async function listarCobrancasBtg(
  condominioId: number,
  params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<{ items: BtgCollectionResponse[]; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  const config = await db.select().from(btgConfig)
    .where(eq(btgConfig.condominioId, condominioId))
    .limit(1);

  if (!config.length) {
    throw new Error("Configuração BTG não encontrada para este condomínio");
  }

  const cfg = config[0];
  const token = await getBtgAccessToken(condominioId);

  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.set("page", params.page.toString());
  if (params?.pageSize) queryParams.set("pageSize", params.pageSize.toString());
  if (params?.status) queryParams.set("status", params.status);
  if (params?.startDate) queryParams.set("startDate", params.startDate);
  if (params?.endDate) queryParams.set("endDate", params.endDate);

  const url = `${BTG_API_BASE}/${cfg.companyId}/banking/collections?${queryParams.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro ao listar cobranças BTG: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<{ items: BtgCollectionResponse[]; total: number }>;
}

/**
 * Valida a assinatura HMAC de um webhook BTG
 * O BTG envia um header X-BTG-Signature com HMAC-SHA256 do body
 */
export function validarAssinaturaBtg(
  body: string,
  signature: string,
  webhookSecret: string
): boolean {
  try {
    const crypto = require("crypto");
    const expectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");
    return signature === expectedSig || signature === `sha256=${expectedSig}`;
  } catch {
    return false;
  }
}

/**
 * Monta o payload para criar cobrança BTG a partir dos dados do sistema
 */
export function montarPayloadCobranca(params: {
  amount: number; // em centavos
  dueDate: Date;
  overDueDays?: number; // dias após vencimento para aceitar pagamento
  description?: string;
  externalId?: string;
  payer: {
    name: string;
    cpfCnpj: string;
    email?: string;
    phone?: string;
    address?: string;
    addressNumber?: string;
    addressComplement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  jurosPercentualAoDia?: number; // ex: 0.033 para 1% ao mês
  multaPercentual?: number; // ex: 2 para 2%
}): BtgCreateCollectionRequest {
  const dueDateStr = params.dueDate.toISOString().split("T")[0];
  const overDueDays = params.overDueDays ?? 60;
  const overDueDate = new Date(params.dueDate);
  overDueDate.setDate(overDueDate.getDate() + overDueDays);
  const overDueDateStr = overDueDate.toISOString().split("T")[0];

  // Determinar tipo de pessoa pelo CPF/CNPJ
  const cpfCnpjDigits = params.payer.cpfCnpj.replace(/\D/g, "");
  const personType: BtgPayerPersonType = cpfCnpjDigits.length <= 11 ? "F" : "J";

  const payload: BtgCreateCollectionRequest = {
    type: "BANKSLIP_PIX",
    amount: params.amount,
    dueDate: dueDateStr,
    overDueDate: overDueDateStr,
    description: params.description,
    externalId: params.externalId,
    payer: {
      personType,
      name: params.payer.name,
      document: cpfCnpjDigits,
      email: params.payer.email,
      phone: params.payer.phone ? params.payer.phone.replace(/\D/g, "") : undefined,
    },
  };

  // Adicionar endereço se disponível
  if (params.payer.address && params.payer.city && params.payer.state && params.payer.zipCode) {
    payload.payer.address = {
      street: params.payer.address,
      number: params.payer.addressNumber || "S/N",
      complement: params.payer.addressComplement,
      neighborhood: params.payer.neighborhood || "",
      city: params.payer.city,
      state: params.payer.state,
      zipCode: params.payer.zipCode.replace(/\D/g, ""),
    };
  }

  // Juros (mora) após vencimento
  if (params.jurosPercentualAoDia && params.jurosPercentualAoDia > 0) {
    payload.interest = {
      startDate: dueDateStr,
      type: "PERCENTAGE_PER_DAY",
      value: params.jurosPercentualAoDia,
    };
  }

  // Multa após vencimento
  if (params.multaPercentual && params.multaPercentual > 0) {
    payload.fine = {
      startDate: dueDateStr,
      type: "PERCENTAGE",
      value: params.multaPercentual,
    };
  }

  return payload;
}

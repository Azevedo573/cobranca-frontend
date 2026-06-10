/**
 * BTG Pactual Empresas API Service
 * Integração com a API de Cobranças do BTG Pactual
 * Documentação: https://developers.empresas.btgpactual.com/reference/collection
 *
 * Configuração: usa variáveis de ambiente globais do escritório
 *   BTG_CLIENT_ID, BTG_CLIENT_SECRET, BTG_COMPANY_ID
 *
 * Configurações adicionais (instrucoes, diasVencimento, etc.) ficam na tabela
 * btgConfig com id=1 (registro único global).
 */

import { getDb } from "./db";
import { btgConfig } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// Detectar ambiente: sandbox ou produção
// Defina BTG_SANDBOX=true nas env vars para usar o ambiente de sandbox
const IS_SANDBOX = process.env.BTG_SANDBOX === "true";

const BTG_AUTH_URL = IS_SANDBOX
  ? "https://id.sandbox.btgpactual.com/oauth2/token"
  : "https://id.btgpactual.com/oauth2/token";

const BTG_API_BASE = IS_SANDBOX
  ? "https://api.sandbox.empresas.btgpactual.com"
  : "https://api.empresas.btgpactual.com";

// No sandbox, o companyId é sempre este valor fixo (empresa dedicada do sandbox)
const BTG_SANDBOX_COMPANY_ID = "30306294000145";

// ─── Cache de token em memória ─────────────────────────────────────────────────
let _cachedToken: string | null = null;
let _tokenExpiresAt: number = 0; // timestamp ms

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

// ─── Configuração Global ───────────────────────────────────────────────────────

/**
 * Retorna as credenciais BTG das variáveis de ambiente globais.
 * Lança erro se não estiverem configuradas.
 */
function getBtgCredentials(): { clientId: string; clientSecret: string; companyId: string } {
  const clientId = process.env.BTG_CLIENT_ID;
  const clientSecret = process.env.BTG_CLIENT_SECRET;
  const companyId = process.env.BTG_COMPANY_ID;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Credenciais BTG não configuradas. Defina BTG_CLIENT_ID e BTG_CLIENT_SECRET nas variáveis de ambiente."
    );
  }

  if (!IS_SANDBOX && !companyId) {
    throw new Error(
      "BTG_COMPANY_ID não configurado. Defina BTG_COMPANY_ID nas variáveis de ambiente."
    );
  }

  // No sandbox, o companyId é sempre o fixo da empresa dedicada do sandbox
  const effectiveCompanyId = IS_SANDBOX ? BTG_SANDBOX_COMPANY_ID : companyId!;

  return { clientId, clientSecret, companyId: effectiveCompanyId };
}

/**
 * Retorna configurações extras do BTG (instrucoes, diasVencimento, etc.)
 * da tabela btgConfig (registro único global, id=1).
 * Retorna defaults se não existir.
 */
export async function getBtgExtraConfig(): Promise<{
  diasVencimentoPadrao: number;
  diasLimitePagamento: number;
  instrucoes: string | null;
  webhookSecret: string | null;
  ativo: boolean;
  isSandbox: boolean;
}> {
  try {
    const db = await getDb();
    if (!db) return { diasVencimentoPadrao: 30, diasLimitePagamento: 60, instrucoes: null, webhookSecret: null, ativo: true, isSandbox: IS_SANDBOX };

    const config = await db.select().from(btgConfig).limit(1);
    if (!config.length) {
      return { diasVencimentoPadrao: 30, diasLimitePagamento: 60, instrucoes: null, webhookSecret: null, ativo: true, isSandbox: IS_SANDBOX };
    }

    const cfg = config[0];
    return {
      diasVencimentoPadrao: cfg.diasVencimentoPadrao ?? 30,
      diasLimitePagamento: cfg.diasLimitePagamento ?? 60,
      instrucoes: cfg.instrucoes ?? null,
      webhookSecret: cfg.webhookSecret ?? null,
      ativo: cfg.ativo === 1,
      isSandbox: IS_SANDBOX,
    };
  } catch {
    return { diasVencimentoPadrao: 30, diasLimitePagamento: 60, instrucoes: null, webhookSecret: null, ativo: true, isSandbox: IS_SANDBOX };
  }
}

// ─── Autenticação ──────────────────────────────────────────────────────────────

/**
 * Obtém token de acesso BTG via Client Credentials.
 * Usa cache em memória para evitar reautenticação desnecessária.
 */
export async function getBtgAccessToken(): Promise<string> {
  // Verificar cache em memória (com 5 min de margem)
  if (_cachedToken && Date.now() < _tokenExpiresAt - 5 * 60 * 1000) {
    return _cachedToken;
  }

  const { clientId, clientSecret } = getBtgCredentials();

  // BTG usa Basic Auth: Base64(client_id:client_secret) no header Authorization
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "collections",
  });

  const response = await fetch(BTG_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
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

  // Salvar em cache
  _cachedToken = tokenData.access_token;
  _tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;

  return _cachedToken;
}

// ─── Funções de Cobrança ───────────────────────────────────────────────────────

/**
 * Cria uma cobrança (boleto híbrido BANKSLIP_PIX) no BTG Pactual
 */
export async function criarCobrancaBtg(
  payload: BtgCreateCollectionRequest
): Promise<BtgCollectionResponse> {
  const { companyId } = getBtgCredentials();
  const token = await getBtgAccessToken();

  const url = `${BTG_API_BASE}/${companyId}/banking/collections`;

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
  collectionId: string
): Promise<BtgCollectionResponse> {
  const { companyId } = getBtgCredentials();
  const token = await getBtgAccessToken();

  const url = `${BTG_API_BASE}/${companyId}/banking/collections/${collectionId}`;

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
  collectionId: string
): Promise<void> {
  const { companyId } = getBtgCredentials();
  const token = await getBtgAccessToken();

  const url = `${BTG_API_BASE}/${companyId}/banking/collections/${collectionId}`;

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
  params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<{ items: BtgCollectionResponse[]; total: number }> {
  const { companyId } = getBtgCredentials();
  const token = await getBtgAccessToken();

  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.set("page", params.page.toString());
  if (params?.pageSize) queryParams.set("pageSize", params.pageSize.toString());
  if (params?.status) queryParams.set("status", params.status);
  if (params?.startDate) queryParams.set("startDate", params.startDate);
  if (params?.endDate) queryParams.set("endDate", params.endDate);

  const url = `${BTG_API_BASE}/${companyId}/banking/collections?${queryParams.toString()}`;

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

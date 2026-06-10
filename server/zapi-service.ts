/**
 * Serviço de integração com a Z-API
 * Documentação: https://developer.z-api.io/
 */

const ZAPI_BASE = "https://api.z-api.io/instances";

export interface ZApiConfig {
  instanceId: string;
  token: string;
  clientToken: string;
}

async function zapiRequest(
  config: ZApiConfig,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<unknown> {
  const url = `${ZAPI_BASE}/${config.instanceId}/token/${config.token}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Client-Token": config.clientToken,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Z-API error ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── Status da instância ──────────────────────────────────────────────────────
export async function getInstanceStatus(config: ZApiConfig): Promise<{
  connected: boolean;
  smartphoneConnected: boolean;
  session: string;
}> {
  const data = await zapiRequest(config, "GET", "/status") as any;
  return {
    connected: data?.connected ?? false,
    smartphoneConnected: data?.smartphoneConnected ?? false,
    session: data?.session ?? "disconnected",
  };
}

// ─── QR Code para conectar ────────────────────────────────────────────────────
export async function getQRCode(config: ZApiConfig): Promise<{ qrcode: string }> {
  const data = await zapiRequest(config, "GET", "/qr-code") as any;
  return { qrcode: data?.value ?? "" };
}

// ─── Enviar mensagem de texto ─────────────────────────────────────────────────
export async function sendText(
  config: ZApiConfig,
  phone: string,
  message: string
): Promise<{ zaapId: string; messageId: string }> {
  const data = await zapiRequest(config, "POST", "/send-text", {
    phone,
    message,
  }) as any;
  return {
    zaapId: data?.zaapId ?? "",
    messageId: data?.messageId ?? "",
  };
}

// ─── Enviar documento ─────────────────────────────────────────────────────────
export async function sendDocument(
  config: ZApiConfig,
  phone: string,
  documentUrl: string,
  fileName: string,
  caption?: string
): Promise<{ zaapId: string; messageId: string }> {
  // Detectar extensão para escolher o endpoint correto
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "pdf";
  const endpoint = ext === "pdf" ? "/send-document/pdf" : "/send-document/doc";
  const data = await zapiRequest(config, "POST", endpoint, {
    phone,
    document: documentUrl,
    fileName,
    caption: caption ?? "",
  }) as any;
  return {
    zaapId: data?.zaapId ?? "",
    messageId: data?.messageId ?? "",
  };
}

// ─── Enviar imagem ────────────────────────────────────────────────────────────
export async function sendImage(
  config: ZApiConfig,
  phone: string,
  imageUrl: string,
  caption?: string
): Promise<{ zaapId: string; messageId: string }> {
  const data = await zapiRequest(config, "POST", "/send-image", {
    phone,
    image: imageUrl,
    caption: caption ?? "",
  }) as any;
  return {
    zaapId: data?.zaapId ?? "",
    messageId: data?.messageId ?? "",
  };
}

// ─── Enviar áudio ─────────────────────────────────────────────────────────────
export async function sendAudio(
  config: ZApiConfig,
  phone: string,
  audioUrl: string
): Promise<{ zaapId: string; messageId: string }> {
  // Z-API aceita áudio via /send-audio com campo "audio" contendo a URL
  const data = await zapiRequest(config, "POST", "/send-audio", {
    phone,
    audio: audioUrl,
  }) as any;
  return {
    zaapId: data?.zaapId ?? "",
    messageId: data?.messageId ?? "",
  };
}

// ─── Enviar lista de opções ──────────────────────────────────────────────────
export interface OptionListItem {
  title: string;
  description?: string;
  id: string;
}

export async function sendOptionList(
  config: ZApiConfig,
  phone: string,
  message: string,
  optionList: {
    title: string;
    buttonLabel: string;
    options: OptionListItem[];
  }
): Promise<{ zaapId: string; messageId: string }> {
  const data = await zapiRequest(config, "POST", "/send-option-list", {
    phone,
    message,
    optionList,
  }) as any;
  return {
    zaapId: data?.zaapId ?? "",
    messageId: data?.messageId ?? "",
  };
}

// ─── Formatar telefone para padrão Z-API ─────────────────────────────────────
export function formatPhone(phone: string): string {
  // Remove tudo que não é número
  const digits = phone.replace(/\D/g, "");
  // Se já começa com 55 (Brasil), retorna como está
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  // Adiciona DDI do Brasil
  return `55${digits}`;
}

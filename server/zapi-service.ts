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
  method: "GET" | "POST" | "DELETE" | "PUT",
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

// ─── Grupos ──────────────────────────────────────────────────────────────────

export interface ZApiGroup {
  phone: string;
  name: string;
  isGroup: boolean;
  unread: string;
  lastMessageTime: string;
  isMuted: string;
  archived: boolean;
  pinned: boolean;
}

export interface ZApiGroupParticipant {
  phone: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  name?: string;
  short?: string;
}

export interface ZApiGroupMetadata {
  phone: string;
  description: string;
  owner: string;
  subject: string;
  creation: number;
  invitationLink: string;
  adminOnlyMessage: boolean;
  adminOnlySettings: boolean;
  requireAdminApproval: boolean;
  isGroupAnnouncement: boolean;
  participants: ZApiGroupParticipant[];
}

/** Listar todos os grupos da instância (paginado) */
export async function getGroups(
  config: ZApiConfig,
  page = 1,
  pageSize = 100
): Promise<ZApiGroup[]> {
  const data = await zapiRequest(
    config, "GET",
    `/groups?page=${page}&pageSize=${pageSize}`
  ) as any;
  return Array.isArray(data) ? data : [];
}

/** Metadados completos de um grupo (inclui participantes) */
export async function getGroupMetadata(
  config: ZApiConfig,
  groupPhone: string
): Promise<ZApiGroupMetadata> {
  const data = await zapiRequest(config, "GET", `/group-metadata/${groupPhone}`) as any;
  return data;
}

/** Criar um novo grupo */
export async function createGroup(
  config: ZApiConfig,
  groupName: string,
  phones: string[],
  autoInvite = false
): Promise<{ phone: string; invitationLink: string; phonesNotAdded: string[] }> {
  const data = await zapiRequest(config, "POST", "/create-group", {
    groupName,
    phones,
    autoInvite,
  }) as any;
  return {
    phone: data?.phone ?? "",
    invitationLink: data?.invitationLink ?? "",
    phonesNotAdded: data?.phonesNotAdded ?? [],
  };
}

/** Enviar texto para um grupo */
export async function sendTextToGroup(
  config: ZApiConfig,
  groupPhone: string,
  message: string
): Promise<{ zaapId: string; messageId: string }> {
  const data = await zapiRequest(config, "POST", "/send-text", {
    phone: groupPhone,
    message,
  }) as any;
  return {
    zaapId: data?.zaapId ?? "",
    messageId: data?.messageId ?? "",
  };
}

/** Adicionar participantes ao grupo */
export async function addParticipants(
  config: ZApiConfig,
  groupPhone: string,
  phones: string[]
): Promise<{ success: boolean }> {
  await zapiRequest(config, "POST", "/add-participant", {
    phone: groupPhone,
    phones,
  });
  return { success: true };
}

/** Remover participantes do grupo */
export async function removeParticipants(
  config: ZApiConfig,
  groupPhone: string,
  phones: string[]
): Promise<{ success: boolean }> {
  await zapiRequest(config, "POST", "/remove-participant", {
    phone: groupPhone,
    phones,
  });
  return { success: true };
}

/** Atualizar nome do grupo */
export async function updateGroupName(
  config: ZApiConfig,
  groupPhone: string,
  groupName: string
): Promise<{ success: boolean }> {
  await zapiRequest(config, "POST", "/update-group-name", {
    phone: groupPhone,
    groupName,
  });
  return { success: true };
}

/** Atualizar descrição do grupo */
export async function updateGroupDescription(
  config: ZApiConfig,
  groupPhone: string,
  description: string
): Promise<{ success: boolean }> {
  await zapiRequest(config, "POST", "/update-group-description", {
    phone: groupPhone,
    description,
  });
  return { success: true };
}

/** Obter link de convite do grupo */
export async function getGroupInviteLink(
  config: ZApiConfig,
  groupPhone: string
): Promise<{ invitationLink: string }> {
  const data = await zapiRequest(config, "GET", `/invitation-link/${groupPhone}`) as any;
  return { invitationLink: data?.invitationLink ?? data?.value ?? "" };
}

/** Sair do grupo */
export async function leaveGroup(
  config: ZApiConfig,
  groupPhone: string
): Promise<{ success: boolean }> {
  await zapiRequest(config, "POST", "/leave-group", { phone: groupPhone });
  return { success: true };
}

/** Promover participante a admin */
export async function promoteToAdmin(
  config: ZApiConfig,
  groupPhone: string,
  phones: string[]
): Promise<{ success: boolean }> {
  await zapiRequest(config, "POST", "/add-admin", {
    phone: groupPhone,
    phones,
  });
  return { success: true };
}

/** Remover admin do grupo */
export async function removeAdmin(
  config: ZApiConfig,
  groupPhone: string,
  phones: string[]
): Promise<{ success: boolean }> {
  await zapiRequest(config, "POST", "/remove-admin", {
    phone: groupPhone,
    phones,
  });
  return { success: true };
}

// ─── Configurar Webhook de recebimento ───────────────────────────────────────
/**
 * Registra a URL de webhook "on-receive" na instância Z-API.
 * Deve ser chamado sempre que uma instância for criada ou editada.
 */
export async function configurarWebhookRecebimento(
  config: ZApiConfig,
  webhookUrl: string
): Promise<{ success: boolean }> {
  await zapiRequest(config, "PUT", "/update-webhook-received", { value: webhookUrl });
  return { success: true };
}

// ─── Formatar telefone para padrão Z-API ─────────────────────────────────────
export function formatPhone(phone: string): string {
  // Preservar formato de grupos WhatsApp (@g.us) — padrão Z-API
  if (phone.includes("@g.us")) return phone; // ex: 120363408829748974@g.us
  // Normalizar formato legado -group para @g.us
  if (phone.includes("-group")) {
    return phone.replace("-group", "") + "@g.us";
  }
  // Remove tudo que não é número para contatos normais
  const digits = phone.replace(/\D/g, "");
  // Se já começa com 55 (Brasil), retorna como está
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  // Adiciona DDI do Brasil
  return `55${digits}`;
}

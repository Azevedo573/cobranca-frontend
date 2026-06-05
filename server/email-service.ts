/**
 * Serviço de envio de e-mails via Microsoft Graph API (Microsoft 365)
 * Usa Client Credentials Flow (sem interação do usuário)
 * Permissão necessária no Azure AD: Mail.Send (Application permission)
 */

import { ConfidentialClientApplication } from "@azure/msal-node";
import { getDb } from "./db";
import { emailConfig, emailsEnviados } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface EnviarEmailParams {
  destinatario: string;         // e-mail do destinatário
  nomeDestinatario?: string;    // nome do destinatário (opcional)
  assunto: string;
  corpoHtml: string;            // HTML do e-mail
  devedorId: number;
  condominioId?: number;
  enviadoPorId?: number;
  modeloId?: number;
}

export interface ResultadoEnvio {
  sucesso: boolean;
  erro?: string;
  emailEnviadoId?: number;
}

// ─── Buscar configuração ativa ────────────────────────────────────────────────

export async function getEmailConfig() {
  const db = await getDb();
  if (!db) return null;
  const [config] = await db
    .select()
    .from(emailConfig)
    .where(eq(emailConfig.ativo, 1))
    .limit(1);
  return config ?? null;
}

// ─── Obter token de acesso via MSAL ──────────────────────────────────────────

async function getAccessToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const msalApp = new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  });

  const result = await msalApp.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });

  if (!result?.accessToken) {
    throw new Error("Não foi possível obter o token de acesso do Microsoft 365. Verifique as credenciais.");
  }

  return result.accessToken;
}

// ─── Enviar e-mail via Microsoft Graph ───────────────────────────────────────

export async function enviarEmailMicrosoft365(params: EnviarEmailParams): Promise<ResultadoEnvio> {
  const db = await getDb();
  if (!db) return { sucesso: false, erro: "Banco de dados indisponível" };

  // Registrar tentativa no banco
  const [insertResult] = await db.insert(emailsEnviados).values({
    devedorId: params.devedorId,
    condominioId: params.condominioId,
    enviadoPorId: params.enviadoPorId,
    destinatario: params.destinatario,
    assunto: params.assunto,
    corpo: params.corpoHtml,
    modeloId: params.modeloId,
    status: "pendente",
  });

  const emailId = typeof (insertResult as any).insertId === "bigint"
    ? Number((insertResult as any).insertId)
    : (insertResult as any).insertId as number;

  try {
    // Buscar configuração
    const config = await getEmailConfig();
    if (!config) {
      throw new Error("Configuração de e-mail não encontrada. Configure o Microsoft 365 em Configurações → E-mail.");
    }

    // Obter token
    const accessToken = await getAccessToken(config.tenantId, config.clientId, config.clientSecret);

    // Montar payload do Graph API
    const emailPayload = {
      message: {
        subject: params.assunto,
        body: {
          contentType: "HTML",
          content: params.corpoHtml,
        },
        toRecipients: [
          {
            emailAddress: {
              address: params.destinatario,
              name: params.nomeDestinatario ?? params.destinatario,
            },
          },
        ],
        from: {
          emailAddress: {
            address: config.emailRemetente,
            name: config.nomeRemetente,
          },
        },
      },
      saveToSentItems: true,
    };

    // Enviar via Graph API
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.emailRemetente)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailPayload),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Graph API retornou ${response.status}: ${errorBody}`);
    }

    // Atualizar status para enviado
    if (db) await db
      .update(emailsEnviados)
      .set({ status: "enviado", enviadoEm: new Date() })
      .where(eq(emailsEnviados.id, emailId));

    return { sucesso: true, emailEnviadoId: emailId };
  } catch (err: any) {
    const mensagemErro = err?.message ?? "Erro desconhecido";

    // Atualizar status para erro
    if (db) await db
      .update(emailsEnviados)
      .set({ status: "erro", erro: mensagemErro })
      .where(eq(emailsEnviados.id, emailId));

    return { sucesso: false, erro: mensagemErro, emailEnviadoId: emailId };
  }
}

// ─── Testar conexão ───────────────────────────────────────────────────────────

export async function testarConexaoEmail(): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    const config = await getEmailConfig();
    if (!config) {
      return { sucesso: false, erro: "Nenhuma configuração de e-mail encontrada." };
    }
    await getAccessToken(config.tenantId, config.clientId, config.clientSecret);
    return { sucesso: true };
  } catch (err: any) {
    return { sucesso: false, erro: err?.message ?? "Erro ao conectar" };
  }
}

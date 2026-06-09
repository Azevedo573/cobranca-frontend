import type { Request, Response } from "express";
import { getDb } from "./db";
import {
  whatsappInstancias,
  whatsappConversas,
  whatsappMensagens,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { formatPhone } from "./zapi-service";

/**
 * Webhook Z-API — recebe mensagens e atualizações de status
 * URL: POST /api/webhook/whatsapp/:instanciaId
 *
 * Payload de mensagem recebida (Z-API):
 * {
 *   type: "ReceivedCallback",
 *   phone: "5521999999999",
 *   fromMe: false,
 *   messageId: "...",
 *   text: { message: "..." },
 *   image: { imageUrl: "...", caption: "..." },
 *   document: { documentUrl: "...", fileName: "..." },
 *   senderName: "Nome do Contato",
 *   ...
 * }
 */
export async function webhookWhatsappHandler(req: Request, res: Response) {
  // Responde imediatamente para não bloquear a Z-API
  res.status(200).json({ ok: true });

  try {
    const instanciaId = parseInt(req.params.instanciaId);
    if (isNaN(instanciaId)) return;

    const db = await getDb();
    if (!db) return;

    const payload = req.body;
    if (!payload) return;

    // Ignorar mensagens enviadas por nós mesmos (fromMe: true) que já são salvas pelo tRPC
    // mas processar atualizações de status
    if (payload.type === "DeliveryCallback" || payload.type === "ReadCallback") {
      // Atualizar status da mensagem
      if (payload.messageId) {
        const novoStatus = payload.type === "ReadCallback" ? "lida" : "entregue";
        await db
          .update(whatsappMensagens)
          .set({ status: novoStatus })
          .where(eq(whatsappMensagens.zApiMessageId, payload.messageId));
      }
      return;
    }

    // Processar mensagem recebida
    if (payload.type !== "ReceivedCallback") return;
    if (payload.fromMe) return; // ignorar eco de mensagens enviadas

    const phone = formatPhone(payload.phone ?? payload.chatId ?? "");
    if (!phone) return;

    const senderName: string = payload.senderName ?? payload.pushName ?? null;

    // Buscar ou criar conversa
    let [conversa] = await db
      .select()
      .from(whatsappConversas)
      .where(
        and(
          eq(whatsappConversas.instanciaId, instanciaId),
          eq(whatsappConversas.telefone, phone)
        )
      );

    if (!conversa) {
      const [res] = await db.insert(whatsappConversas).values({
        instanciaId,
        telefone: phone,
        nomeContato: senderName,
        status: "aberta",
        naoLidas: 1,
      });
      const [nova] = await db
        .select()
        .from(whatsappConversas)
        .where(eq(whatsappConversas.id, (res as any).insertId));
      conversa = nova;
    } else {
      // Atualizar nome do contato se disponível
      await db
        .update(whatsappConversas)
        .set({
          nomeContato: senderName || conversa.nomeContato,
          naoLidas: (conversa.naoLidas ?? 0) + 1,
          ultimaMensagemEm: new Date(),
        })
        .where(eq(whatsappConversas.id, conversa.id));
    }

    // Determinar tipo e conteúdo da mensagem
    let tipo: "text" | "image" | "document" | "audio" | "video" | "sticker" = "text";
    let conteudo: string | null = null;
    let mediaUrl: string | null = null;
    let nomeArquivo: string | null = null;

    if (payload.text?.message) {
      tipo = "text";
      conteudo = payload.text.message;
    } else if (payload.image) {
      tipo = "image";
      mediaUrl = payload.image.imageUrl ?? null;
      conteudo = payload.image.caption ?? null;
    } else if (payload.document) {
      tipo = "document";
      mediaUrl = payload.document.documentUrl ?? null;
      nomeArquivo = payload.document.fileName ?? "documento";
      conteudo = payload.document.caption ?? null;
    } else if (payload.audio) {
      tipo = "audio";
      mediaUrl = payload.audio.audioUrl ?? null;
    } else if (payload.video) {
      tipo = "video";
      mediaUrl = payload.video.videoUrl ?? null;
      conteudo = payload.video.caption ?? null;
    } else if (payload.sticker) {
      tipo = "sticker";
      mediaUrl = payload.sticker.stickerUrl ?? null;
    } else {
      // Tipo desconhecido — ignorar
      return;
    }

    // Salvar mensagem
    await db.insert(whatsappMensagens).values({
      conversaId: conversa.id,
      instanciaId,
      direction: "in",
      tipo,
      conteudo,
      mediaUrl,
      nomeArquivo,
      status: "entregue",
      zApiMessageId: payload.messageId ?? null,
    });

    // Atualizar última mensagem da conversa
    await db
      .update(whatsappConversas)
      .set({
        ultimaMensagem: conteudo ?? nomeArquivo ?? `[${tipo}]`,
        ultimaMensagemEm: new Date(),
      })
      .where(eq(whatsappConversas.id, conversa.id));
  } catch (err) {
    console.error("[Webhook WhatsApp] Erro:", err);
  }
}

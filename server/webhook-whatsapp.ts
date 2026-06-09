import type { Request, Response } from "express";
import { getDb } from "./db";
import {
  whatsappConversas,
  whatsappMensagens,
  whatsappInstancias,
  atendimentos,
} from "../drizzle/schema";
import { eq, and, or } from "drizzle-orm";
import { formatPhone } from "./zapi-service";
import { processarMensagemBot } from "./bot-engine";

/**
 * Webhook Z-API — recebe mensagens e atualizações de status
 * URL: POST /api/webhook/whatsapp/:instanciaId
 *
 * Ao receber uma mensagem de um contato externo:
 *  1. Busca ou cria a conversa
 *  2. Salva a mensagem
 *  3. Se houver fluxo de bot ativo para a instância, processa pelo motor do bot
 *  4. Se não houver bot (ou bot finalizou), cria atendimento na fila
 */

function gerarProtocolo(): string {
  const now = new Date();
  const ano = now.getFullYear();
  const rand = Math.floor(Math.random() * 99999).toString().padStart(5, "0");
  return `ATD-${ano}-${rand}`;
}

function calcularSlaLimite(slaMinutos: number): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + slaMinutos);
  return d;
}

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

    // ── Atualização de status de mensagem ──────────────────────────────────────
    if (payload.type === "DeliveryCallback" || payload.type === "ReadCallback") {
      if (payload.messageId) {
        const novoStatus = payload.type === "ReadCallback" ? "lida" : "entregue";
        await db
          .update(whatsappMensagens)
          .set({ status: novoStatus })
          .where(eq(whatsappMensagens.zApiMessageId, payload.messageId));
      }
      return;
    }

    // ── Processar mensagem recebida ────────────────────────────────────────────
    if (payload.type !== "ReceivedCallback") return;
    if (payload.fromMe) return; // ignorar eco de mensagens enviadas por nós

    const phone = formatPhone(payload.phone ?? payload.chatId ?? "");
    if (!phone) return;

    const senderName: string = payload.senderName ?? payload.pushName ?? null;

    // ── Buscar instância para obter token ─────────────────────────────────────
    const [instancia] = await db
      .select()
      .from(whatsappInstancias)
      .where(eq(whatsappInstancias.id, instanciaId));

    // ── Buscar ou criar conversa ───────────────────────────────────────────────
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
      const [insertResult] = await db.insert(whatsappConversas).values({
        instanciaId,
        telefone: phone,
        nomeContato: senderName,
        status: "aberta",
        naoLidas: 1,
      });
      const [nova] = await db
        .select()
        .from(whatsappConversas)
        .where(eq(whatsappConversas.id, (insertResult as any).insertId));
      conversa = nova;
    } else {
      await db
        .update(whatsappConversas)
        .set({
          nomeContato: senderName || conversa.nomeContato,
          naoLidas: (conversa.naoLidas ?? 0) + 1,
          ultimaMensagemEm: new Date(),
        })
        .where(eq(whatsappConversas.id, conversa.id));
    }

    if (!conversa) return;

    // ── Determinar tipo e conteúdo da mensagem ────────────────────────────────
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
      return; // tipo desconhecido
    }

    // ── Salvar mensagem ────────────────────────────────────────────────────────
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

    // ── Atualizar última mensagem da conversa ─────────────────────────────────
    await db
      .update(whatsappConversas)
      .set({
        ultimaMensagem: conteudo ?? nomeArquivo ?? `[${tipo}]`,
        ultimaMensagemEm: new Date(),
      })
      .where(eq(whatsappConversas.id, conversa.id));

    // ── Verificar se há atendimento humano ativo (não processar bot) ──────────
    const [atendimentoHumano] = await db
      .select({ id: atendimentos.id })
      .from(atendimentos)
      .where(
        and(
          eq(atendimentos.conversaId, conversa.id),
          eq(atendimentos.status, "em_atendimento")
        )
      )
      .limit(1);

    if (atendimentoHumano) {
      // Operador humano está atendendo — não processar bot
      return;
    }

    // ── Tentar processar pelo motor do bot ────────────────────────────────────
    if (instancia) {
      const botProcessou = await processarMensagemBot({
        instanciaId,
        conversaId: conversa.id,
        telefone: phone,
        texto: conteudo ?? "",
        instanceToken: instancia.token,
        instanceId: instancia.instanceId,
      });

      if (botProcessou) {
        // Bot processou a mensagem — não criar atendimento na fila
        console.log(`[Webhook] Bot processou mensagem da conversa ${conversa.id}`);
        return;
      }
    }

    // ── Criar atendimento na fila se não houver um ativo ──────────────────────
    const [atendimentoExistente] = await db
      .select({ id: atendimentos.id })
      .from(atendimentos)
      .where(
        and(
          eq(atendimentos.conversaId, conversa.id),
          or(
            eq(atendimentos.status, "aguardando"),
            eq(atendimentos.status, "transferido"),
          )
        )
      )
      .limit(1);

    if (!atendimentoExistente) {
      const slaMinutos = 60;
      const protocolo = gerarProtocolo();
      const slaLimite = calcularSlaLimite(slaMinutos);

      await db.insert(atendimentos).values({
        conversaId: conversa.id,
        protocolo,
        status: "aguardando",
        prioridade: "normal",
        slaLimite,
        iniciadoEm: new Date(),
      });

      console.log(`[Webhook] Novo atendimento criado na fila: ${protocolo} para conversa ${conversa.id} (${phone})`);
    }
  } catch (err) {
    console.error("[Webhook WhatsApp] Erro:", err);
  }
}

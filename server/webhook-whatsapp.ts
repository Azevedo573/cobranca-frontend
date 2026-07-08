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

    const rawPhone = payload.phone ?? payload.chatId ?? "";
    const phone = formatPhone(rawPhone);
    if (!phone) return;

    // Detectar se é mensagem de grupo (chatId termina em @g.us ou phone contém -group)
    const isGroup = rawPhone.includes("@g.us") || rawPhone.includes("-group") || phone.includes("-group");

    const senderName: string = payload.senderName ?? payload.pushName ?? null;
    const groupName: string | null = isGroup ? (payload.chatName ?? payload.senderName ?? null) : null;

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
        nomeContato: isGroup ? null : senderName,
        nomeGrupo: groupName,
        isGroup: isGroup ? 1 : 0,
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
          nomeContato: isGroup ? conversa.nomeContato : (senderName || conversa.nomeContato),
          nomeGrupo: isGroup ? (groupName || conversa.nomeGrupo) : conversa.nomeGrupo,
          naoLidas: (conversa.naoLidas ?? 0) + 1,
          ultimaMensagemEm: new Date(),
        })
        .where(eq(whatsappConversas.id, conversa.id));
    }

    if (!conversa) return;

    // ── Determinar tipo e conteúdo da mensagem ────────────────────────────────
    let tipo: "text" | "image" | "document" | "audio" | "video" | "sticker" = "text";
    let conteudo: string | null = null;         // conteúdo salvo na mensagem (exibido ao usuário)
    let textoBotEngine: string | null = null;   // texto enviado ao bot-engine (pode ser selectedRowId)
    let mediaUrl: string | null = null;
    let nomeArquivo: string | null = null;

    // DEBUG: logar payload completo para tipos especiais
    if (!payload.text?.message) {
      console.log("[Webhook DEBUG] Payload tipo especial:", JSON.stringify(payload).substring(0, 500));
    }

    if (payload.text?.message) {
      tipo = "text";
      conteudo = payload.text.message;
    } else if (payload.listResponseMessage) {
      // Resposta de lista interativa (Z-API): campo title = texto da opção selecionada
      tipo = "text";
      const listTitle = payload.listResponseMessage.title ?? payload.listResponseMessage.message ?? null;
      const selectedRowId = payload.listResponseMessage.selectedRowId ?? null;
      // Exibir o título legível na conversa (ex: "Cobrança")
      conteudo = listTitle ?? selectedRowId;
      // Enviar selectedRowId ao bot-engine para identificar a opção com precisão
      textoBotEngine = selectedRowId ?? listTitle;
      console.log(`[Webhook] Lista interativa recebida: selectedRowId="${selectedRowId}", title="${listTitle}", exibido="${conteudo}", bot="${textoBotEngine}"`);
    
    } else if (payload.buttonResponseMessage) {
      // Resposta de botão interativo (Z-API)
      tipo = "text";
      conteudo = payload.buttonResponseMessage.buttonText ?? payload.buttonResponseMessage.message ?? null;
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

    // ── Verificar se há operador humano ativo (em_atendimento) ──────────────
    // Regra: bot só é bloqueado quando há operador HUMANO ativo (em_atendimento).
    // Se o atendimento está aguardando ou transferido, o bot ainda pode responder.
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
      console.log(`[Webhook] Operador humano ativo para conversa ${conversa.id} — bot ignorado`);
      return;
    }

    // ── Verificar horário de atendimento ─────────────────────────────────────
    if (instancia) {
      const horarioInicio = (instancia as any).horarioAtendimentoInicio ?? "00:00";
      const horarioFim = (instancia as any).horarioAtendimentoFim ?? "23:59";
      const diasAtendimento = (instancia as any).diasAtendimento ?? "0,1,2,3,4,5,6";
      const mensagemForaHorario = (instancia as any).mensagemForaHorario ?? null;

      // Usar fuso horário de Brasília (America/Sao_Paulo) para comparação de horário
      const agora = new Date();
      const fusoOptions: Intl.DateTimeFormatOptions = { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false };
      const horaAtual = new Intl.DateTimeFormat("pt-BR", fusoOptions).format(agora).replace(":", ":"); // HH:MM
      const diaOptions: Intl.DateTimeFormatOptions = { timeZone: "America/Sao_Paulo", weekday: "short" };
      // Obter dia da semana no fuso de Brasília (0=dom, 1=seg, ..., 6=sab)
      const dataEmBrasilia = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const diaSemana = String(dataEmBrasilia.getDay());
      const diasPermitidos = diasAtendimento.split(",").map((d: string) => d.trim());

      const dentroHorario = horaAtual >= horarioInicio && horaAtual <= horarioFim;
      const diaPermitido = diasPermitidos.includes(diaSemana);

      if (!dentroHorario || !diaPermitido) {
        console.log(`[Webhook] Fora do horário de atendimento (${horarioInicio}–${horarioFim}, dias=${diasAtendimento}). Hora atual (BRT): ${horaAtual}, dia: ${diaSemana}`);
        // Enviar mensagem de fora do horário apenas se não foi enviada nas últimas 8 horas
        if (mensagemForaHorario && mensagemForaHorario.trim()) {
          try {
            const { gt } = await import("drizzle-orm");
            const oitoHorasAtras = new Date(Date.now() - 8 * 60 * 60 * 1000);
            const [ultimaAusencia] = await db
              .select({ id: whatsappMensagens.id })
              .from(whatsappMensagens)
              .where(
                and(
                  eq(whatsappMensagens.conversaId, conversa.id),
                  eq(whatsappMensagens.direction, "out"),
                  eq(whatsappMensagens.conteudo, mensagemForaHorario),
                  gt(whatsappMensagens.createdAt, oitoHorasAtras)
                )
              )
              .limit(1);

            if (!ultimaAusencia) {
              const { sendText } = await import("./zapi-service");
              await sendText(
                { token: instancia.token, instanceId: instancia.instanceId, clientToken: instancia.clientToken },
                phone,
                mensagemForaHorario
              );
              // Salvar a mensagem de ausência no banco para controle
              await db.insert(whatsappMensagens).values({
                conversaId: conversa.id,
                instanciaId,
                direction: "out",
                tipo: "text",
                conteudo: mensagemForaHorario,
                status: "enviada",
              });
              console.log(`[Webhook] Mensagem de ausência enviada para ${phone}`);
            } else {
              console.log(`[Webhook] Mensagem de ausência já enviada nas últimas 8h para ${phone} — ignorando`);
            }
          } catch (e) {
            console.error("[Webhook] Erro ao enviar mensagem fora do horário:", e);
          }
        }
        return;
      }
    }

    // ── Tentar processar pelo motor do bot ────────────────────────────────────
    let botDepartamentoId: number | null = null;
    let botAtendenteId: number | null = null;
    if (instancia) {
      const botResultado = await processarMensagemBot({
        instanciaId,
        conversaId: conversa.id,
        telefone: phone,
        texto: textoBotEngine ?? conteudo ?? "",
        instanceToken: instancia.token,
        instanceId: instancia.instanceId,
        clientToken: instancia.clientToken,
      });

      if (botResultado === "automatico") {
        // Bot está respondendo automaticamente — criar/manter atendimento como 'automatico'
        const [atendAuto] = await db
          .select({ id: atendimentos.id })
          .from(atendimentos)
          .where(and(eq(atendimentos.conversaId, conversa.id), eq(atendimentos.status, "automatico")))
          .limit(1);
        if (!atendAuto) {
          const protocolo = gerarProtocolo();
          await db.insert(atendimentos).values({
            conversaId: conversa.id,
            protocolo,
            status: "automatico",
            prioridade: "normal",
            iniciadoEm: new Date(),
          });
          console.log(`[Webhook] Atendimento automático criado: ${protocolo} para conversa ${conversa.id}`);
        }
        return;
      }

      if (botResultado && typeof botResultado === "object" && botResultado.tipo === "transferir") {
        // Bot transferiu para fila humana — mudar atendimento automatico para aguardando
        botDepartamentoId = botResultado.departamentoId ?? null;
        botAtendenteId = botResultado.atendenteId ?? null;
        await db
          .update(atendimentos)
          .set({
            status: "aguardando",
            departamentoId: botDepartamentoId ?? undefined,
            operadorId: botAtendenteId ?? undefined,
            updatedAt: new Date(),
          })
          .where(and(eq(atendimentos.conversaId, conversa.id), eq(atendimentos.status, "automatico")));
        console.log(`[Webhook] Atendimento automático transferido para fila humana: conversa ${conversa.id}, departamento=${botDepartamentoId}, atendente=${botAtendenteId}`);
        // Cair no bloco abaixo para garantir que existe atendimento na fila
      }
      // botResultado === "sem_fluxo": não há fluxo ativo → criar atendimento normal na fila
    }

    // ── Grupos não entram na fila de atendimento ─────────────────────────────
    if (isGroup) {
      console.log(`[Webhook] Mensagem de grupo recebida para conversa ${conversa?.id} — não criar atendimento`);
      return;
    }

    // ── Criar atendimento na fila se não houver um aguardando/transferido ─────
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
        departamentoId: botDepartamentoId ?? undefined,
        operadorId: botAtendenteId ?? undefined,
      });

      console.log(`[Webhook] Novo atendimento criado na fila: ${protocolo} para conversa ${conversa.id} (${phone}), departamento=${botDepartamentoId}`);
    } else {
      console.log(`[Webhook] Atendimento já existe na fila para conversa ${conversa.id} — não duplicar`);
    }
  } catch (err) {
    console.error("[Webhook WhatsApp] Erro:", err);
  }
}

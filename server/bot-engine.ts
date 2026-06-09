/**
 * Motor de execução dos Fluxos de Atendimento (Chatbot)
 *
 * Responsável por:
 * 1. Verificar se existe fluxo ativo para a instância/conversa
 * 2. Iniciar sessão do bot ao receber primeira mensagem
 * 3. Avançar o fluxo com base na resposta do usuário (texto ou botão)
 * 4. Enviar mensagens/botões via Z-API
 * 5. Encerrar sessão e criar atendimento na fila quando o fluxo terminar
 */

import { getDb } from "./db";
import { botFluxos, botNos, botSessoes, whatsappConversas, whatsappInstancias, atendimentos } from "../drizzle/schema";
import { eq, and, isNull, or } from "drizzle-orm";
import { sendText, formatPhone } from "./zapi-service";

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface ConteudoMensagem {
  tipo: "mensagem";
  texto: string;
}

interface ConteudoBotoes {
  tipo: "botoes";
  texto: string;
  botoes: Array<{ label: string; proximoNoId: number | null }>;
}

interface ConteudoTransferir {
  tipo: "transferir";
  mensagem?: string;
  departamentoId?: number | null;
}

interface ConteudoEncerrar {
  tipo: "encerrar";
  mensagem?: string;
}

interface ConteudoInicio {
  tipo: "inicio";
  texto?: string;
}

type ConteudoNo = ConteudoMensagem | ConteudoBotoes | ConteudoTransferir | ConteudoEncerrar | ConteudoInicio;

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Processa uma mensagem recebida e executa o fluxo do bot se aplicável.
 * Retorna true se o bot processou a mensagem (e o webhook não deve criar atendimento manual).
 * Retorna false se não há bot ativo (webhook deve criar atendimento normalmente).
 */
export async function processarMensagemBot(params: {
  conversaId: number;
  instanciaId: number;
  telefone: string; // número do contato (para enviar resposta)
  texto: string;    // texto da mensagem recebida
  instanceToken: string;
  instanceId: string;
}): Promise<boolean> {
  const db = (await getDb())!;
  const { conversaId, instanciaId, telefone, texto, instanceToken, instanceId } = params;

  // 1. Verificar se há sessão ativa para esta conversa
  const [sessaoAtiva] = await db
    .select()
    .from(botSessoes)
    .where(and(eq(botSessoes.conversaId, conversaId), eq(botSessoes.status, "ativa")));

  if (sessaoAtiva) {
    // Continuar sessão existente
    return await avancarFluxo({ db, sessao: sessaoAtiva, texto, telefone, instanceToken, instanceId });
  }

  // 2. Verificar se existe fluxo ativo para esta instância
  const fluxos = await db
    .select()
    .from(botFluxos)
    .where(
      and(
        eq(botFluxos.ativo, true),
        or(
          isNull(botFluxos.instanciaId),
          eq(botFluxos.instanciaId, instanciaId)
        )
      )
    );

  if (fluxos.length === 0) return false; // Nenhum fluxo ativo → atendimento normal

  // Pegar o primeiro fluxo compatível (prioridade: específico da instância > global)
  const fluxo = fluxos.find(f => f.instanciaId === instanciaId) || fluxos[0];

  // Verificar gatilho
  if (fluxo.gatilho === "palavra_chave" && fluxo.palavraChave) {
    const textoLower = texto.toLowerCase().trim();
    const palavraLower = fluxo.palavraChave.toLowerCase().trim();
    if (!textoLower.includes(palavraLower)) return false; // Não ativou o gatilho
  }

  // 3. Buscar nó de início do fluxo
  const [noInicio] = await db
    .select()
    .from(botNos)
    .where(and(eq(botNos.fluxoId, fluxo.id), eq(botNos.tipo, "inicio")));

  if (!noInicio) return false;

  // 4. Criar sessão
  const [r] = await db.insert(botSessoes).values({
    conversaId,
    fluxoId: fluxo.id,
    noAtualId: noInicio.id,
    status: "ativa",
    dados: {},
  });
  const sessaoId = (r as any).insertId;

  const sessao = {
    id: sessaoId,
    conversaId,
    fluxoId: fluxo.id,
    noAtualId: noInicio.id,
    status: "ativa" as const,
    dados: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 5. Executar o nó de início (que pode ter texto e avançar para o próximo)
  return await avancarFluxo({ db, sessao, texto, telefone, instanceToken, instanceId, isInicio: true });
}

// ─── Avançar fluxo ────────────────────────────────────────────────────────────

async function avancarFluxo(params: {
  db: any;
  sessao: any;
  texto: string;
  telefone: string;
  instanceToken: string;
  instanceId: string;
  isInicio?: boolean;
}): Promise<boolean> {
  const { db, sessao, texto, telefone, instanceToken, instanceId, isInicio } = params;

  // Buscar nó atual
  const [noAtual] = await db.select().from(botNos).where(eq(botNos.id, sessao.noAtualId));
  if (!noAtual) {
    await encerrarSessao(db, sessao.id, sessao.conversaId, sessao.fluxoId);
    return false;
  }

  const conteudo = noAtual.conteudo as ConteudoNo;

  // Se é o nó de início, avançar para o próximo nó sem processar entrada do usuário
  if (isInicio || conteudo.tipo === "inicio") {
    // Buscar próximo nó (ordem = 1)
    const [proximoNo] = await db
      .select()
      .from(botNos)
      .where(and(eq(botNos.fluxoId, sessao.fluxoId), eq(botNos.ordem, 1)));

    if (!proximoNo) {
      await encerrarSessao(db, sessao.id, sessao.conversaId, sessao.fluxoId);
      return true;
    }

    await db.update(botSessoes).set({ noAtualId: proximoNo.id, updatedAt: new Date() }).where(eq(botSessoes.id, sessao.id));
    return await executarNo({ db, sessao: { ...sessao, noAtualId: proximoNo.id }, no: proximoNo, telefone, instanceToken, instanceId });
  }

  // Processar resposta do usuário para nó de botões
  if (conteudo.tipo === "botoes") {
    const textoLower = texto.toLowerCase().trim();
    // Tentar encontrar botão pelo texto ou número
    let botaoSelecionado: { label: string; proximoNoId: number | null } | undefined;

    for (let i = 0; i < conteudo.botoes.length; i++) {
      const botao = conteudo.botoes[i];
      if (
        textoLower === botao.label.toLowerCase() ||
        textoLower === String(i + 1) ||
        textoLower.includes(botao.label.toLowerCase())
      ) {
        botaoSelecionado = botao;
        break;
      }
    }

    if (!botaoSelecionado) {
      // Resposta inválida — reenviar o menu
      await enviarNo(conteudo, telefone, instanceToken, instanceId);
      return true;
    }

    if (botaoSelecionado.proximoNoId === null) {
      // Encerrar fluxo
      await encerrarSessao(db, sessao.id, sessao.conversaId, sessao.fluxoId);
      return true;
    }

    // Avançar para o próximo nó
    const [proximoNo] = await db.select().from(botNos).where(eq(botNos.id, botaoSelecionado.proximoNoId));
    if (!proximoNo) {
      await encerrarSessao(db, sessao.id, sessao.conversaId, sessao.fluxoId);
      return true;
    }

    await db.update(botSessoes).set({ noAtualId: proximoNo.id, updatedAt: new Date() }).where(eq(botSessoes.id, sessao.id));
    return await executarNo({ db, sessao: { ...sessao, noAtualId: proximoNo.id }, no: proximoNo, telefone, instanceToken, instanceId });
  }

  // Para nós de mensagem, executar diretamente
  return await executarNo({ db, sessao, no: noAtual, telefone, instanceToken, instanceId });
}

// ─── Executar nó ─────────────────────────────────────────────────────────────

async function executarNo(params: {
  db: any;
  sessao: any;
  no: any;
  telefone: string;
  instanceToken: string;
  instanceId: string;
}): Promise<boolean> {
  const { db, sessao, no, telefone, instanceToken, instanceId } = params;
  const conteudo = no.conteudo as ConteudoNo;

  await enviarNo(conteudo, telefone, instanceToken, instanceId);

  if (conteudo.tipo === "encerrar") {
    await encerrarSessao(db, sessao.id, sessao.conversaId, sessao.fluxoId);
    return true;
  }

  if (conteudo.tipo === "transferir") {
    // Encerrar sessão do bot e criar atendimento na fila
    await db.update(botSessoes).set({ status: "transferida", noAtualId: null, updatedAt: new Date() }).where(eq(botSessoes.id, sessao.id));
    // O webhook vai criar o atendimento normalmente após isso
    return false; // Deixar o webhook criar o atendimento
  }

  if (conteudo.tipo === "mensagem") {
    // Após mensagem simples, buscar próximo nó em sequência
    const [proximoNo] = await db
      .select()
      .from(botNos)
      .where(and(eq(botNos.fluxoId, sessao.fluxoId), eq(botNos.ordem, no.ordem + 1)));

    if (!proximoNo) {
      await encerrarSessao(db, sessao.id, sessao.conversaId, sessao.fluxoId);
      return true;
    }

    await db.update(botSessoes).set({ noAtualId: proximoNo.id, updatedAt: new Date() }).where(eq(botSessoes.id, sessao.id));
    return await executarNo({ db, sessao: { ...sessao, noAtualId: proximoNo.id }, no: proximoNo, telefone, instanceToken, instanceId });
  }

  // Nó de botões: aguardar resposta do usuário
  return true;
}

// ─── Enviar nó via Z-API ──────────────────────────────────────────────────────

async function enviarNo(conteudo: ConteudoNo, telefone: string, instanceToken: string, instanceId: string, clientToken?: string) {
  const config = { token: instanceToken, instanceId, clientToken: clientToken || instanceToken };
  const phone = formatPhone(telefone);
  try {
    if (conteudo.tipo === "mensagem" && conteudo.texto) {
      await sendText(config, phone, conteudo.texto);
    } else if (conteudo.tipo === "botoes") {
      // Enviar como texto numerado (Z-API lista de botões)
      const textoNumerado = conteudo.texto + "\n\n" + conteudo.botoes.map((b, i) => `${i + 1}. ${b.label}`).join("\n");
      await sendText(config, phone, textoNumerado);
    } else if (conteudo.tipo === "transferir" && conteudo.mensagem) {
      await sendText(config, phone, conteudo.mensagem);
    } else if (conteudo.tipo === "encerrar" && conteudo.mensagem) {
      await sendText(config, phone, conteudo.mensagem);
    }
  } catch (err) {
    console.error("[BotEngine] Erro ao enviar mensagem:", err);
  }
}

// ─── Encerrar sessão ──────────────────────────────────────────────────────────

async function encerrarSessao(db: any, sessaoId: number, conversaId: number, fluxoId: number) {
  await db.update(botSessoes).set({ status: "encerrada", noAtualId: null, updatedAt: new Date() }).where(eq(botSessoes.id, sessaoId));
}

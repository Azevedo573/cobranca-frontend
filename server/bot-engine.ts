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
import { botFluxos, botNos, botSessoes } from "../drizzle/schema";
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

  console.log(`[BotEngine] Processando mensagem: conversaId=${conversaId}, instanciaId=${instanciaId}, texto="${texto}"`);

  // 1. Verificar se há sessão ativa para esta conversa
  const [sessaoAtiva] = await db
    .select()
    .from(botSessoes)
    .where(and(eq(botSessoes.conversaId, conversaId), eq(botSessoes.status, "ativa")));

  if (sessaoAtiva) {
    console.log(`[BotEngine] Sessão ativa encontrada: id=${sessaoAtiva.id}, noAtualId=${sessaoAtiva.noAtualId}`);
    return await avancarFluxo({ db, sessao: sessaoAtiva, texto, telefone, instanceToken, instanceId });
  }

  // 2. Verificar se existe fluxo ativo para esta instância
  // ATENÇÃO: MySQL retorna 1/0 para boolean, não true/false
  // Usamos comparação com 1 para garantir compatibilidade
  const todosFluxos = await db
    .select()
    .from(botFluxos)
    .where(
      or(
        isNull(botFluxos.instanciaId),
        eq(botFluxos.instanciaId, instanciaId)
      )
    );

  // Filtrar apenas os ativos (MySQL retorna 1 para true)
  const fluxos = todosFluxos.filter(f => f.ativo === true || (f.ativo as unknown as number) === 1);

  console.log(`[BotEngine] Fluxos encontrados: ${todosFluxos.length} total, ${fluxos.length} ativos`);

  if (fluxos.length === 0) {
    console.log(`[BotEngine] Nenhum fluxo ativo para instância ${instanciaId}`);
    return false; // Nenhum fluxo ativo → atendimento normal
  }

  // Pegar o primeiro fluxo compatível (prioridade: específico da instância > global)
  const fluxo = fluxos.find(f => f.instanciaId === instanciaId) || fluxos[0];
  console.log(`[BotEngine] Fluxo selecionado: id=${fluxo.id}, nome="${fluxo.nome}", gatilho="${fluxo.gatilho}"`);

  // Verificar gatilho
  if (fluxo.gatilho === "palavra_chave" && fluxo.palavraChave) {
    const textoLower = texto.toLowerCase().trim();
    const palavraLower = fluxo.palavraChave.toLowerCase().trim();
    if (!textoLower.includes(palavraLower)) {
      console.log(`[BotEngine] Gatilho palavra_chave não ativado: "${palavraLower}" não encontrado em "${textoLower}"`);
      return false; // Não ativou o gatilho
    }
  }

  // 3. Buscar todos os nós do fluxo ordenados
  const nosDoFluxo = await db
    .select()
    .from(botNos)
    .where(eq(botNos.fluxoId, fluxo.id))
    .orderBy(botNos.ordem);

  console.log(`[BotEngine] Nós do fluxo: ${nosDoFluxo.map(n => `${n.id}(${n.tipo},ordem=${n.ordem})`).join(', ')}`);

  if (nosDoFluxo.length === 0) {
    console.log(`[BotEngine] Fluxo sem nós`);
    return false;
  }

  // Buscar nó de início
  const noInicio = nosDoFluxo.find(n => n.tipo === "inicio") || nosDoFluxo[0];
  if (!noInicio) {
    console.log(`[BotEngine] Nó de início não encontrado`);
    return false;
  }

  // 4. Criar sessão
  const [r] = await db.insert(botSessoes).values({
    conversaId,
    fluxoId: fluxo.id,
    noAtualId: noInicio.id,
    status: "ativa",
    dados: {},
  });
  const sessaoId = (r as any).insertId;
  console.log(`[BotEngine] Sessão criada: id=${sessaoId}`);

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

  // 5. Executar o nó de início
  // O nó de início pode ter uma mensagem de boas-vindas no conteúdo
  const conteudoInicio = noInicio.conteudo as ConteudoInicio;
  if (conteudoInicio.texto && conteudoInicio.texto.trim()) {
    // Enviar mensagem de boas-vindas do nó de início
    console.log(`[BotEngine] Enviando mensagem de boas-vindas do nó início`);
    await enviarTexto(conteudoInicio.texto, telefone, instanceToken, instanceId);
  }

  // Avançar para o próximo nó (após o início)
  const proximosNos = nosDoFluxo.filter(n => n.tipo !== "inicio").sort((a, b) => a.ordem - b.ordem);
  if (proximosNos.length === 0) {
    // Fluxo só tem o nó de início — encerrar
    await encerrarSessao(db, sessaoId, conversaId, fluxo.id);
    return true;
  }

  const proximoNo = proximosNos[0];
  console.log(`[BotEngine] Avançando para próximo nó: id=${proximoNo.id}, tipo=${proximoNo.tipo}`);
  await db.update(botSessoes).set({ noAtualId: proximoNo.id, updatedAt: new Date() }).where(eq(botSessoes.id, sessaoId));

  return await executarNo({
    db,
    sessao: { ...sessao, noAtualId: proximoNo.id },
    no: proximoNo,
    telefone,
    instanceToken,
    instanceId,
    nosDoFluxo,
  });
}

// ─── Avançar fluxo ────────────────────────────────────────────────────────────

async function avancarFluxo(params: {
  db: any;
  sessao: any;
  texto: string;
  telefone: string;
  instanceToken: string;
  instanceId: string;
}): Promise<boolean> {
  const { db, sessao, texto, telefone, instanceToken, instanceId } = params;

  // Buscar nó atual
  const [noAtual] = await db.select().from(botNos).where(eq(botNos.id, sessao.noAtualId));
  if (!noAtual) {
    console.log(`[BotEngine] Nó atual não encontrado: ${sessao.noAtualId}`);
    await encerrarSessao(db, sessao.id, sessao.conversaId, sessao.fluxoId);
    return false;
  }

  console.log(`[BotEngine] Nó atual: id=${noAtual.id}, tipo=${noAtual.tipo}`);

  // Buscar todos os nós do fluxo para navegação
  const nosDoFluxo = await db
    .select()
    .from(botNos)
    .where(eq(botNos.fluxoId, sessao.fluxoId))
    .orderBy(botNos.ordem);

  const conteudo = noAtual.conteudo as ConteudoNo;

  // Processar resposta do usuário para nó de botões
  if (conteudo.tipo === "botoes") {
    const textoLower = texto.toLowerCase().trim();
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
      console.log(`[BotEngine] Resposta inválida para nó de botões, reenviando menu`);
      await enviarNo(conteudo, telefone, instanceToken, instanceId);
      return true;
    }

    if (botaoSelecionado.proximoNoId === null) {
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
    return await executarNo({ db, sessao: { ...sessao, noAtualId: proximoNo.id }, no: proximoNo, telefone, instanceToken, instanceId, nosDoFluxo });
  }

  // Para outros tipos de nó (mensagem, transferir, encerrar), executar diretamente
  return await executarNo({ db, sessao, no: noAtual, telefone, instanceToken, instanceId, nosDoFluxo });
}

// ─── Executar nó ─────────────────────────────────────────────────────────────

async function executarNo(params: {
  db: any;
  sessao: any;
  no: any;
  telefone: string;
  instanceToken: string;
  instanceId: string;
  nosDoFluxo: any[];
}): Promise<boolean> {
  const { db, sessao, no, telefone, instanceToken, instanceId, nosDoFluxo } = params;
  const conteudo = no.conteudo as ConteudoNo;

  console.log(`[BotEngine] Executando nó: id=${no.id}, tipo=${conteudo.tipo}`);

  await enviarNo(conteudo, telefone, instanceToken, instanceId);

  if (conteudo.tipo === "encerrar") {
    await encerrarSessao(db, sessao.id, sessao.conversaId, sessao.fluxoId);
    return true;
  }

  if (conteudo.tipo === "transferir") {
    // Encerrar sessão do bot e deixar o webhook criar o atendimento na fila
    await db.update(botSessoes)
      .set({ status: "transferida", noAtualId: null, updatedAt: new Date() })
      .where(eq(botSessoes.id, sessao.id));
    console.log(`[BotEngine] Sessão transferida para atendimento humano`);
    return false; // Retorna false para o webhook criar o atendimento
  }

  if (conteudo.tipo === "mensagem") {
    // Após mensagem simples, buscar próximo nó em sequência
    const nosRestantes = nosDoFluxo
      .filter(n => n.tipo !== "inicio" && n.ordem > no.ordem)
      .sort((a, b) => a.ordem - b.ordem);

    if (nosRestantes.length === 0) {
      await encerrarSessao(db, sessao.id, sessao.conversaId, sessao.fluxoId);
      return true;
    }

    const proximoNo = nosRestantes[0];
    await db.update(botSessoes).set({ noAtualId: proximoNo.id, updatedAt: new Date() }).where(eq(botSessoes.id, sessao.id));
    return await executarNo({ db, sessao: { ...sessao, noAtualId: proximoNo.id }, no: proximoNo, telefone, instanceToken, instanceId, nosDoFluxo });
  }

  // Nó de botões: aguardar resposta do usuário
  return true;
}

// ─── Enviar nó via Z-API ──────────────────────────────────────────────────────

async function enviarTexto(texto: string, telefone: string, instanceToken: string, instanceId: string) {
  const config = { token: instanceToken, instanceId, clientToken: instanceToken };
  const phone = formatPhone(telefone);
  try {
    await sendText(config, phone, texto);
  } catch (err) {
    console.error("[BotEngine] Erro ao enviar texto:", err);
  }
}

async function enviarNo(conteudo: ConteudoNo, telefone: string, instanceToken: string, instanceId: string) {
  const config = { token: instanceToken, instanceId, clientToken: instanceToken };
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
    console.error("[BotEngine] Erro ao enviar nó:", err);
  }
}

// ─── Encerrar sessão ──────────────────────────────────────────────────────────

async function encerrarSessao(db: any, sessaoId: number, conversaId: number, fluxoId: number) {
  console.log(`[BotEngine] Encerrando sessão: id=${sessaoId}`);
  await db.update(botSessoes)
    .set({ status: "encerrada", noAtualId: null, updatedAt: new Date() })
    .where(eq(botSessoes.id, sessaoId));
}

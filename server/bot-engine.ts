/**
 * Motor de execução dos Fluxos de Atendimento (Chatbot)
 *
 * Retorna:
 *  "automatico"  — bot processou e está aguardando próxima resposta do cliente
 *  "transferir"  — bot chegou em nó de transferência (deve ir para fila humana)
 *  "sem_fluxo"   — nenhum fluxo ativo encontrado (webhook cria atendimento normal)
 */

import { getDb } from "./db";
import { botFluxos, botNos, botSessoes } from "../drizzle/schema";
import { eq, and, isNull, or } from "drizzle-orm";
import { sendText, formatPhone } from "./zapi-service";

// ─── Tipos internos ───────────────────────────────────────────────────────────

type BotResultado = "automatico" | "transferir" | "sem_fluxo";

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

export async function processarMensagemBot(params: {
  conversaId: number;
  instanciaId: number;
  telefone: string;
  texto: string;
  instanceToken: string;
  instanceId: string;
  clientToken?: string | null;
}): Promise<BotResultado> {
  const db = (await getDb())!;
  const { conversaId, instanciaId, telefone, texto, instanceToken, instanceId, clientToken } = params;
  const zapiConfig = { token: instanceToken, instanceId, clientToken: clientToken || instanceToken };

  console.log(`[BotEngine] Processando: conversaId=${conversaId}, instanciaId=${instanciaId}, texto="${texto}"`);

  // 1. Verificar se há sessão ativa para esta conversa
  const [sessaoAtiva] = await db
    .select()
    .from(botSessoes)
    .where(and(eq(botSessoes.conversaId, conversaId), eq(botSessoes.status, "ativa")));

  if (sessaoAtiva) {
    console.log(`[BotEngine] Sessão ativa: id=${sessaoAtiva.id}, noAtualId=${sessaoAtiva.noAtualId}`);
    return await avancarFluxo({ db, sessao: sessaoAtiva, texto, telefone, zapiConfig });
  }

  // 2. Buscar fluxos ativos para esta instância
  // MySQL retorna 1/0 para boolean — filtrar manualmente
  const todosFluxos = await db
    .select()
    .from(botFluxos)
    .where(or(isNull(botFluxos.instanciaId), eq(botFluxos.instanciaId, instanciaId)));

  const fluxos = todosFluxos.filter(f => f.ativo === true || (f.ativo as unknown as number) === 1);

  console.log(`[BotEngine] Fluxos: ${todosFluxos.length} total, ${fluxos.length} ativos para instância ${instanciaId}`);

  if (fluxos.length === 0) return "sem_fluxo";

  // Prioridade: fluxo específico da instância > global
  const fluxo = fluxos.find(f => f.instanciaId === instanciaId) || fluxos[0];
  console.log(`[BotEngine] Fluxo selecionado: id=${fluxo.id}, nome="${fluxo.nome}", gatilho="${fluxo.gatilho}"`);

  // Verificar gatilho de palavra-chave
  if (fluxo.gatilho === "palavra_chave" && fluxo.palavraChave) {
    const textoLower = texto.toLowerCase().trim();
    const palavraLower = fluxo.palavraChave.toLowerCase().trim();
    if (!textoLower.includes(palavraLower)) {
      console.log(`[BotEngine] Gatilho palavra_chave não ativado`);
      return "sem_fluxo";
    }
  }

  // 3. Buscar nós do fluxo ordenados
  const nosDoFluxo = await db
    .select()
    .from(botNos)
    .where(eq(botNos.fluxoId, fluxo.id))
    .orderBy(botNos.ordem);

  if (nosDoFluxo.length === 0) return "sem_fluxo";

  const noInicio = nosDoFluxo.find(n => n.tipo === "inicio") || nosDoFluxo[0];

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

  const sessao = { id: sessaoId, conversaId, fluxoId: fluxo.id, noAtualId: noInicio.id, status: "ativa" as const, dados: {}, createdAt: new Date(), updatedAt: new Date() };

  // 5. Enviar mensagem de boas-vindas do nó início (se houver)
  const conteudoInicio = noInicio.conteudo as ConteudoInicio;
  if (conteudoInicio.texto && conteudoInicio.texto.trim()) {
    console.log(`[BotEngine] Enviando boas-vindas do nó início`);
    await enviarTexto(conteudoInicio.texto, telefone, zapiConfig);
  }

  // 6. Avançar para o primeiro nó após o início
  const proximosNos = nosDoFluxo.filter(n => n.tipo !== "inicio").sort((a, b) => a.ordem - b.ordem);
  if (proximosNos.length === 0) {
    await encerrarSessao(db, sessaoId);
    return "automatico";
  }

  const proximoNo = proximosNos[0];
  await db.update(botSessoes).set({ noAtualId: proximoNo.id, updatedAt: new Date() }).where(eq(botSessoes.id, sessaoId));

  return await executarNo({ db, sessao: { ...sessao, noAtualId: proximoNo.id }, no: proximoNo, telefone, zapiConfig, nosDoFluxo });
}

// ─── Avançar fluxo (sessão existente) ────────────────────────────────────────

async function avancarFluxo(params: {
  db: any;
  sessao: any;
  texto: string;
  telefone: string;
  zapiConfig: { token: string; instanceId: string; clientToken: string };
}): Promise<BotResultado> {
  const { db, sessao, texto, telefone, zapiConfig } = params;

  const [noAtual] = await db.select().from(botNos).where(eq(botNos.id, sessao.noAtualId));
  if (!noAtual) {
    await encerrarSessao(db, sessao.id);
    return "sem_fluxo";
  }

  const nosDoFluxo = await db.select().from(botNos).where(eq(botNos.fluxoId, sessao.fluxoId)).orderBy(botNos.ordem);
  const conteudo = noAtual.conteudo as ConteudoNo;

  console.log(`[BotEngine] Nó atual: id=${noAtual.id}, tipo=${conteudo.tipo}`);

  // Processar resposta do usuário para nó de botões
  if (conteudo.tipo === "botoes") {
    const textoLower = texto.toLowerCase().trim();
    let botaoSelecionado: { label: string; proximoNoId: number | null } | undefined;

    for (let i = 0; i < conteudo.botoes.length; i++) {
      const b = conteudo.botoes[i];
      if (textoLower === b.label.toLowerCase() || textoLower === String(i + 1) || textoLower.includes(b.label.toLowerCase())) {
        botaoSelecionado = b;
        break;
      }
    }

    if (!botaoSelecionado) {
      // Resposta inválida — reenviar menu
      await enviarNo(conteudo, telefone, zapiConfig);
      return "automatico";
    }

    if (botaoSelecionado.proximoNoId === null) {
      await encerrarSessao(db, sessao.id);
      return "automatico";
    }

    const [proximoNo] = await db.select().from(botNos).where(eq(botNos.id, botaoSelecionado.proximoNoId));
    if (!proximoNo) {
      await encerrarSessao(db, sessao.id);
      return "automatico";
    }

    await db.update(botSessoes).set({ noAtualId: proximoNo.id, updatedAt: new Date() }).where(eq(botSessoes.id, sessao.id));
    return await executarNo({ db, sessao: { ...sessao, noAtualId: proximoNo.id }, no: proximoNo, telefone, zapiConfig, nosDoFluxo });
  }

  // Para outros tipos de nó, executar diretamente
  return await executarNo({ db, sessao, no: noAtual, telefone, zapiConfig, nosDoFluxo });
}

// ─── Executar nó ─────────────────────────────────────────────────────────────

async function executarNo(params: {
  db: any;
  sessao: any;
  no: any;
  telefone: string;
  zapiConfig: { token: string; instanceId: string; clientToken: string };
  nosDoFluxo: any[];
}): Promise<BotResultado> {
  const { db, sessao, no, telefone, zapiConfig, nosDoFluxo } = params;
  const conteudo = no.conteudo as ConteudoNo;

  console.log(`[BotEngine] Executando nó: id=${no.id}, tipo=${conteudo.tipo}`);

  await enviarNo(conteudo, telefone, zapiConfig);

  if (conteudo.tipo === "encerrar") {
    await encerrarSessao(db, sessao.id);
    return "automatico";
  }

  if (conteudo.tipo === "transferir") {
    await db.update(botSessoes).set({ status: "transferida", noAtualId: null, updatedAt: new Date() }).where(eq(botSessoes.id, sessao.id));
    console.log(`[BotEngine] Sessão transferida para fila humana`);
    return "transferir";
  }

  if (conteudo.tipo === "mensagem") {
    // Buscar próximo nó em sequência
    const nosRestantes = nosDoFluxo.filter(n => n.tipo !== "inicio" && n.ordem > no.ordem).sort((a, b) => a.ordem - b.ordem);

    if (nosRestantes.length === 0) {
      await encerrarSessao(db, sessao.id);
      return "automatico";
    }

    const proximoNo = nosRestantes[0];
    await db.update(botSessoes).set({ noAtualId: proximoNo.id, updatedAt: new Date() }).where(eq(botSessoes.id, sessao.id));
    return await executarNo({ db, sessao: { ...sessao, noAtualId: proximoNo.id }, no: proximoNo, telefone, zapiConfig, nosDoFluxo });
  }

  // Nó de botões: aguardar resposta do usuário
  return "automatico";
}

// ─── Helpers de envio ─────────────────────────────────────────────────────────

async function enviarTexto(texto: string, telefone: string, zapiConfig: { token: string; instanceId: string; clientToken: string }) {
  const phone = formatPhone(telefone);
  try {
    await sendText(zapiConfig, phone, texto);
  } catch (err) {
    console.error("[BotEngine] Erro ao enviar texto:", err);
  }
}

async function enviarNo(conteudo: ConteudoNo, telefone: string, zapiConfig: { token: string; instanceId: string; clientToken: string }) {
  const phone = formatPhone(telefone);
  try {
    if (conteudo.tipo === "mensagem" && conteudo.texto) {
      await sendText(zapiConfig, phone, conteudo.texto);
    } else if (conteudo.tipo === "botoes") {
      const textoNumerado = conteudo.texto + "\n\n" + conteudo.botoes.map((b, i) => `${i + 1}. ${b.label}`).join("\n");
      await sendText(zapiConfig, phone, textoNumerado);
    } else if (conteudo.tipo === "transferir" && conteudo.mensagem) {
      await sendText(zapiConfig, phone, conteudo.mensagem);
    } else if (conteudo.tipo === "encerrar" && conteudo.mensagem) {
      await sendText(zapiConfig, phone, conteudo.mensagem);
    }
  } catch (err) {
    console.error("[BotEngine] Erro ao enviar nó:", err);
  }
}

// ─── Encerrar sessão ──────────────────────────────────────────────────────────

async function encerrarSessao(db: any, sessaoId: number) {
  console.log(`[BotEngine] Encerrando sessão: id=${sessaoId}`);
  await db.update(botSessoes).set({ status: "encerrada", noAtualId: null, updatedAt: new Date() }).where(eq(botSessoes.id, sessaoId));
}

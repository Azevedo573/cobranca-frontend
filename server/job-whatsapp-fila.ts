/**
 * Job de processamento da fila de envio WhatsApp
 * Implementa cadência anti-ban: delay aleatório, limite por hora/dia e janela de horário
 */

import { getDb } from "./db";
import { whatsappFilaEnvio, whatsappInstancias, whatsappConversas, whatsappMensagens } from "../drizzle/schema";
import { eq, and, lte, inArray, sql } from "drizzle-orm";
import { sendText, formatPhone } from "./zapi-service";

const LOG_PREFIX = "[WhatsAppFila]";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minSeg: number, maxSeg: number): number {
  return Math.floor(Math.random() * (maxSeg - minSeg + 1) + minSeg) * 1000;
}

function horaAtual(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function dentroJanelaHorario(inicio: string, fim: string): boolean {
  const agora = horaAtual();
  return agora >= inicio && agora <= fim;
}

function diaSemanaPermitido(diasPermitidos: string): boolean {
  const hoje = new Date().getDay(); // 0=dom, 1=seg, ..., 6=sab
  const dias = diasPermitidos.split(",").map((d) => parseInt(d.trim()));
  return dias.includes(hoje);
}

// ─── Enfileirar mensagem ──────────────────────────────────────────────────────

export async function enfileirarMensagemWhatsApp(params: {
  instanciaId: number;
  telefone: string;
  mensagem: string;
  reguaId?: number;
  posicaoId?: number;
  cobrancaId?: number;
  devedorId?: number;
  condominioId?: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");

  const [result] = await db.insert(whatsappFilaEnvio).values({
    instanciaId: params.instanciaId,
    telefone: formatPhone(params.telefone),
    mensagem: params.mensagem,
    reguaId: params.reguaId,
    posicaoId: params.posicaoId,
    cobrancaId: params.cobrancaId,
    devedorId: params.devedorId,
    condominioId: params.condominioId,
    status: "aguardando",
    proximaTentativa: new Date(),
  });

  return (result as any).insertId as number;
}

// ─── Processar fila ───────────────────────────────────────────────────────────

export async function processarFilaWhatsApp(): Promise<{
  processados: number;
  erros: number;
  ignorados: number;
}> {
  const db = await getDb();
  if (!db) return { processados: 0, erros: 0, ignorados: 0 };

  let processados = 0;
  let erros = 0;
  let ignorados = 0;

  // Buscar todas as instâncias ativas
  const instancias = await db
    .select()
    .from(whatsappInstancias)
    .where(eq(whatsappInstancias.ativo, 1));

  for (const instancia of instancias) {
    const delayMin = (instancia as any).delayMinSegundos ?? 8;
    const delayMax = (instancia as any).delayMaxSegundos ?? 25;
    const limiteHora = (instancia as any).limiteHora ?? 20;
    const limiteDia = (instancia as any).limiteDia ?? 150;
    const horarioInicio = (instancia as any).horarioInicioEnvio ?? "08:00";
    const horarioFim = (instancia as any).horarioFimEnvio ?? "20:00";
    const diasSemana = (instancia as any).diasSemana ?? "1,2,3,4,5";

    // Verificar janela de horário
    if (!dentroJanelaHorario(horarioInicio, horarioFim)) {
      console.log(`${LOG_PREFIX} Instância ${instancia.nome}: fora da janela de horário (${horarioInicio}–${horarioFim})`);
      ignorados++;
      continue;
    }

    // Verificar dia da semana
    if (!diaSemanaPermitido(diasSemana)) {
      console.log(`${LOG_PREFIX} Instância ${instancia.nome}: dia da semana não permitido`);
      ignorados++;
      continue;
    }

    // Contar envios na última hora
    const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000);
    const [{ countHora }] = await db
      .select({ countHora: sql<number>`COUNT(*)` })
      .from(whatsappFilaEnvio)
      .where(
        and(
          eq(whatsappFilaEnvio.instanciaId, instancia.id),
          eq(whatsappFilaEnvio.status, "enviado"),
          sql`enviadoEm >= ${umaHoraAtras}`
        )
      );

    if (Number(countHora) >= limiteHora) {
      console.log(`${LOG_PREFIX} Instância ${instancia.nome}: limite por hora atingido (${countHora}/${limiteHora})`);
      ignorados++;
      continue;
    }

    // Contar envios no dia
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const [{ countDia }] = await db
      .select({ countDia: sql<number>`COUNT(*)` })
      .from(whatsappFilaEnvio)
      .where(
        and(
          eq(whatsappFilaEnvio.instanciaId, instancia.id),
          eq(whatsappFilaEnvio.status, "enviado"),
          sql`enviadoEm >= ${inicioDia}`
        )
      );

    if (Number(countDia) >= limiteDia) {
      console.log(`${LOG_PREFIX} Instância ${instancia.nome}: limite diário atingido (${countDia}/${limiteDia})`);
      ignorados++;
      continue;
    }

    // Calcular quantas mensagens ainda podem ser enviadas nesta rodada
    const restanteHora = limiteHora - Number(countHora);
    const restanteDia = limiteDia - Number(countDia);
    const maxEstaRodada = Math.min(restanteHora, restanteDia, 5); // máx 5 por rodada para não travar o loop

    // Buscar mensagens aguardando para esta instância
    const agora = new Date();
    const pendentes = await db
      .select()
      .from(whatsappFilaEnvio)
      .where(
        and(
          eq(whatsappFilaEnvio.instanciaId, instancia.id),
          inArray(whatsappFilaEnvio.status, ["aguardando"]),
          lte(whatsappFilaEnvio.proximaTentativa, agora)
        )
      )
      .limit(maxEstaRodada);

    if (pendentes.length === 0) continue;

    console.log(`${LOG_PREFIX} Instância ${instancia.nome}: processando ${pendentes.length} mensagens (hora: ${countHora}/${limiteHora}, dia: ${countDia}/${limiteDia})`);

    const zapiConfig = {
      instanceId: instancia.instanceId,
      token: instancia.token,
      clientToken: instancia.clientToken,
    };

    for (const item of pendentes) {
      // Marcar como "enviando" para evitar processamento duplo
      await db
        .update(whatsappFilaEnvio)
        .set({ status: "enviando" })
        .where(eq(whatsappFilaEnvio.id, item.id));

      try {
        const zapiResult = await sendText(zapiConfig, item.telefone, item.mensagem);

        // Registrar na conversa WhatsApp
        const [conversaExistente] = await db
          .select()
          .from(whatsappConversas)
          .where(
            and(
              eq(whatsappConversas.instanciaId, instancia.id),
              eq(whatsappConversas.telefone, item.telefone)
            )
          )
          .limit(1);

        let conversaId: number;
        if (conversaExistente) {
          conversaId = conversaExistente.id;
        } else {
          const [novaConversa] = await db.insert(whatsappConversas).values({
            instanciaId: instancia.id,
            telefone: item.telefone,
            nomeContato: null,
            devedorId: item.devedorId ?? null,
            status: "aberta",
          });
          conversaId = (novaConversa as any).insertId;
        }

        await db.insert(whatsappMensagens).values({
          conversaId,
          instanciaId: instancia.id,
          direction: "out",
          tipo: "text",
          conteudo: item.mensagem,
          zApiMessageId: zapiResult.messageId,
          status: "enviada",
        });

        await db.update(whatsappConversas).set({
          ultimaMensagem: item.mensagem.substring(0, 100),
          ultimaMensagemEm: new Date(),
        }).where(eq(whatsappConversas.id, conversaId));

        // Marcar como enviado
        await db
          .update(whatsappFilaEnvio)
          .set({
            status: "enviado",
            enviadoEm: new Date(),
            messageId: zapiResult.messageId,
            tentativas: item.tentativas + 1,
          })
          .where(eq(whatsappFilaEnvio.id, item.id));

        processados++;
        console.log(`${LOG_PREFIX} ✓ Mensagem ${item.id} enviada para ${item.telefone}`);
      } catch (err: any) {
        const mensagemErro = err?.message ?? "Erro desconhecido";
        const novasTentativas = item.tentativas + 1;
        const maxTentativas = 3;

        if (novasTentativas >= maxTentativas) {
          // Marcar como erro definitivo
          await db
            .update(whatsappFilaEnvio)
            .set({
              status: "erro",
              erro: mensagemErro,
              tentativas: novasTentativas,
            })
            .where(eq(whatsappFilaEnvio.id, item.id));
          console.log(`${LOG_PREFIX} ✗ Mensagem ${item.id} falhou definitivamente: ${mensagemErro}`);
        } else {
          // Reagendar para daqui a 30 minutos
          const proxTentativa = new Date(Date.now() + 30 * 60 * 1000);
          await db
            .update(whatsappFilaEnvio)
            .set({
              status: "aguardando",
              erro: mensagemErro,
              tentativas: novasTentativas,
              proximaTentativa: proxTentativa,
            })
            .where(eq(whatsappFilaEnvio.id, item.id));
          console.log(`${LOG_PREFIX} ↻ Mensagem ${item.id} reagendada (tentativa ${novasTentativas}/${maxTentativas}): ${mensagemErro}`);
        }
        erros++;
      }

      // Delay aleatório entre mensagens (anti-ban)
      if (pendentes.indexOf(item) < pendentes.length - 1) {
        const delay = randomDelay(delayMin, delayMax);
        console.log(`${LOG_PREFIX} Aguardando ${Math.round(delay / 1000)}s antes da próxima mensagem...`);
        await sleep(delay);
      }
    }
  }

  return { processados, erros, ignorados };
}

// ─── Iniciar job periódico ────────────────────────────────────────────────────

export function iniciarJobFilaWhatsApp(intervalSegundos = 60) {
  console.log(`${LOG_PREFIX} Iniciando job com intervalo de ${intervalSegundos}s...`);

  const executar = async () => {
    try {
      const resultado = await processarFilaWhatsApp();
      if (resultado.processados > 0 || resultado.erros > 0) {
        console.log(`${LOG_PREFIX} Rodada concluída: ${resultado.processados} enviados, ${resultado.erros} erros, ${resultado.ignorados} ignorados`);
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Erro no job:`, err);
    }
    setTimeout(executar, intervalSegundos * 1000);
  };

  // Primeira execução após 10s
  setTimeout(executar, 10 * 1000);
  console.log(`${LOG_PREFIX} Job iniciado com sucesso.`);
}

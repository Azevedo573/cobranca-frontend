/**
 * Job de execução automática da Régua de Cobrança
 *
 * Este módulo agenda a execução periódica das réguas de cobrança ativas.
 * O job roda a cada hora e processa todas as réguas ativas de todos os condomínios.
 *
 * Para iniciar: chame startReguaJob() no bootstrap do servidor.
 * Para parar: chame stopReguaJob().
 */

import { getDb } from "./db";
import { reguasCobranca } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { executarRegua } from "./db-reguas";

let jobInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

/**
 * Executa todas as réguas ativas de todos os condomínios.
 * Chamado periodicamente pelo job agendado.
 */
export async function executarTodasReguas(): Promise<{
  totalReguas: number;
  totalDisparos: number;
  totalIgnorados: number;
  erros: string[];
}> {
  if (isRunning) {
    console.log("[ReguaJob] Execução anterior ainda em andamento, pulando...");
    return { totalReguas: 0, totalDisparos: 0, totalIgnorados: 0, erros: [] };
  }

  isRunning = true;
  const erros: string[] = [];
  let totalDisparos = 0;
  let totalIgnorados = 0;
  let totalReguas = 0;

  try {
    const db = await getDb();
    if (!db) {
      console.warn("[ReguaJob] Banco de dados não disponível.");
      return { totalReguas: 0, totalDisparos: 0, totalIgnorados: 0, erros: ["Banco de dados não disponível"] };
    }

    // Buscar todas as réguas ativas
    const reguas = await db
      .select()
      .from(reguasCobranca)
      .where(eq(reguasCobranca.ativa, 1));

    totalReguas = reguas.length;
    console.log(`[ReguaJob] Iniciando execução de ${totalReguas} régua(s) ativa(s)...`);

    for (const regua of reguas) {
      try {
        const resultado = await executarRegua(regua.id, regua.condominioId);
        totalDisparos += resultado.disparosRealizados;
        totalIgnorados += resultado.disparosIgnorados;
        if (resultado.erros.length > 0) {
          erros.push(...resultado.erros.map(e => `[Régua ${regua.id}] ${e}`));
        }
        if (resultado.disparosRealizados > 0) {
          console.log(`[ReguaJob] Régua "${regua.nome}" (id=${regua.id}): ${resultado.disparosRealizados} disparo(s).`);
        }
      } catch (err) {
        const msg = `Erro ao executar régua ${regua.id} (${regua.nome}): ${String(err)}`;
        erros.push(msg);
        console.error(`[ReguaJob] ${msg}`);
      }
    }

    console.log(`[ReguaJob] Concluído: ${totalDisparos} disparo(s), ${totalIgnorados} ignorado(s), ${erros.length} erro(s).`);
  } catch (err) {
    const msg = `Erro geral no job de régua: ${String(err)}`;
    erros.push(msg);
    console.error(`[ReguaJob] ${msg}`);
  } finally {
    isRunning = false;
  }

  return { totalReguas, totalDisparos, totalIgnorados, erros };
}

/**
 * Inicia o job agendado de execução da régua de cobrança.
 * Por padrão, executa a cada 1 hora.
 *
 * @param intervalMs Intervalo em milissegundos (padrão: 3600000 = 1 hora)
 */
export function startReguaJob(intervalMs = 60 * 60 * 1000): void {
  if (jobInterval) {
    console.log("[ReguaJob] Job já está em execução.");
    return;
  }

  console.log(`[ReguaJob] Iniciando job com intervalo de ${intervalMs / 1000}s...`);

  // Executar imediatamente na inicialização (com delay de 30s para o servidor estar pronto)
  setTimeout(() => {
    executarTodasReguas().catch(err => console.error("[ReguaJob] Erro na execução inicial:", err));
  }, 30_000);

  // Agendar execuções periódicas
  jobInterval = setInterval(() => {
    executarTodasReguas().catch(err => console.error("[ReguaJob] Erro na execução periódica:", err));
  }, intervalMs);

  console.log("[ReguaJob] Job iniciado com sucesso.");
}

/**
 * Para o job agendado.
 */
export function stopReguaJob(): void {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
    console.log("[ReguaJob] Job parado.");
  }
}

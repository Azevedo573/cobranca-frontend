/**
 * Sistema de Scoring e Priorização de Devedores
 * 
 * Calcula a prioridade de cobrança baseado em:
 * - Valor total devido (com juros, multa, honorários)
 * - Tempo de atraso (dias desde o vencimento mais antigo)
 * - Número de tentativas sem sucesso
 * - Histórico de promessas não cumpridas
 */

export type Prioridade = 'alta' | 'media' | 'baixa';

export interface ScoreResult {
  score: number; // 0-100
  prioridade: Prioridade;
  motivo: string;
  detalhes: {
    pontosPorValor: number;
    pontosPorTempo: number;
    pontosPorTentativas: number;
    pontosPorPromessas: number;
  };
}

export interface DadosParaScore {
  valorTotalDevido: number;
  diasEmAtraso: number;
  numeroTentativas: number;
  promessasNaoCumpridas: number;
}

/**
 * Calcula o score de prioridade de um devedor
 * Score de 0-100, onde 100 é prioridade máxima
 */
export function calcularScore(dados: DadosParaScore): ScoreResult {
  const { valorTotalDevido, diasEmAtraso, numeroTentativas, promessasNaoCumpridas } = dados;

  // Pontos por valor devido (0-30 pontos)
  // R$ 0-1000: 5 pts | R$ 1000-5000: 15 pts | R$ 5000-10000: 25 pts | R$ 10000+: 30 pts
  let pontosPorValor = 0;
  if (valorTotalDevido >= 10000) pontosPorValor = 30;
  else if (valorTotalDevido >= 5000) pontosPorValor = 25;
  else if (valorTotalDevido >= 1000) pontosPorValor = 15;
  else pontosPorValor = 5;

  // Pontos por tempo de atraso (0-35 pontos)
  // 0-30 dias: 5 pts | 31-60 dias: 15 pts | 61-90 dias: 25 pts | 90+ dias: 35 pts
  let pontosPorTempo = 0;
  if (diasEmAtraso >= 90) pontosPorTempo = 35;
  else if (diasEmAtraso >= 61) pontosPorTempo = 25;
  else if (diasEmAtraso >= 31) pontosPorTempo = 15;
  else pontosPorTempo = 5;

  // Pontos por tentativas sem sucesso (0-20 pontos)
  // 0-2 tentativas: 5 pts | 3-5 tentativas: 10 pts | 6-10 tentativas: 15 pts | 10+ tentativas: 20 pts
  let pontosPorTentativas = 0;
  if (numeroTentativas >= 10) pontosPorTentativas = 20;
  else if (numeroTentativas >= 6) pontosPorTentativas = 15;
  else if (numeroTentativas >= 3) pontosPorTentativas = 10;
  else pontosPorTentativas = 5;

  // Pontos por promessas não cumpridas (0-15 pontos)
  // 0 promessas: 0 pts | 1 promessa: 5 pts | 2 promessas: 10 pts | 3+ promessas: 15 pts
  let pontosPorPromessas = 0;
  if (promessasNaoCumpridas >= 3) pontosPorPromessas = 15;
  else if (promessasNaoCumpridas >= 2) pontosPorPromessas = 10;
  else if (promessasNaoCumpridas >= 1) pontosPorPromessas = 5;
  else pontosPorPromessas = 0;

  const score = pontosPorValor + pontosPorTempo + pontosPorTentativas + pontosPorPromessas;

  // Determinar prioridade
  let prioridade: Prioridade;
  let motivo: string;

  if (score >= 70) {
    prioridade = 'alta';
    motivo = 'Valor alto, atraso prolongado ou múltiplas tentativas sem sucesso';
  } else if (score >= 40) {
    prioridade = 'media';
    motivo = 'Valor moderado ou atraso significativo';
  } else {
    prioridade = 'baixa';
    motivo = 'Valor baixo e atraso recente';
  }

  return {
    score,
    prioridade,
    motivo,
    detalhes: {
      pontosPorValor,
      pontosPorTempo,
      pontosPorTentativas,
      pontosPorPromessas,
    },
  };
}

/**
 * Retorna a cor do badge baseado na prioridade
 */
export function getCorPrioridade(prioridade: Prioridade): string {
  switch (prioridade) {
    case 'alta':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'media':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'baixa':
      return 'bg-green-100 text-green-800 border-green-200';
  }
}

/**
 * Retorna o ícone baseado na prioridade
 */
export function getIconePrioridade(prioridade: Prioridade): string {
  switch (prioridade) {
    case 'alta':
      return '🔴';
    case 'media':
      return '🟡';
    case 'baixa':
      return '🟢';
  }
}

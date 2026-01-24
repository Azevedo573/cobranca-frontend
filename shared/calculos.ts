/**
 * Funções utilitárias para cálculo de valores devidos
 * Incluindo juros, multa e honorários
 */

export interface TaxasCondominio {
  taxaJurosMensal: number; // Percentual de juros por mês (ex: 1.0 = 1%)
  taxaMulta: number; // Percentual de multa (ex: 2.0 = 2%)
  taxaHonorarios: number; // Percentual de honorários (ex: 10.0 = 10%)
}

export interface BreakdownValor {
  valorOriginal: number;
  juros: number;
  multa: number;
  honorarios: number;
  valorTotal: number;
  mesesAtraso: number;
}

/**
 * Calcula o número de meses de atraso entre a data de vencimento e hoje
 */
export function calcularMesesAtraso(dataVencimento: Date): number {
  const hoje = new Date();
  const vencimento = new Date(dataVencimento);
  
  // Se ainda não venceu, retorna 0
  if (vencimento >= hoje) {
    return 0;
  }
  
  // Calcula diferença em meses
  const anos = hoje.getFullYear() - vencimento.getFullYear();
  const meses = hoje.getMonth() - vencimento.getMonth();
  const dias = hoje.getDate() - vencimento.getDate();
  
  let totalMeses = anos * 12 + meses;
  
  // Se passou do dia do mês, conta mais um mês
  if (dias > 0) {
    totalMeses += 1;
  }
  
  return Math.max(0, totalMeses);
}

/**
 * Calcula o valor total devido incluindo juros, multa e honorários
 */
export function calcularValorDevido(
  valorOriginal: number,
  dataVencimento: Date,
  taxas: TaxasCondominio
): BreakdownValor {
  const mesesAtraso = calcularMesesAtraso(dataVencimento);
  
  // Calcula juros (percentual mensal * meses de atraso)
  const juros = (valorOriginal * (taxas.taxaJurosMensal / 100)) * mesesAtraso;
  
  // Calcula multa (percentual fixo, aplicado apenas se houver atraso)
  const multa = mesesAtraso > 0 ? (valorOriginal * (taxas.taxaMulta / 100)) : 0;
  
  // Calcula honorários (percentual sobre valor original)
  const honorarios = valorOriginal * (taxas.taxaHonorarios / 100);
  
  // Valor total
  const valorTotal = valorOriginal + juros + multa + honorarios;
  
  return {
    valorOriginal,
    juros,
    multa,
    honorarios,
    valorTotal,
    mesesAtraso,
  };
}

/**
 * Formata valor monetário para exibição (R$ 1.234,56)
 */
export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);
}

/**
 * Calcula o total devido de múltiplas cobranças
 */
export function calcularTotalMultiplasCobrancas(
  cobrancas: Array<{ amount: number; dueDate: Date }>,
  taxas: TaxasCondominio
): BreakdownValor {
  const resultado: BreakdownValor = {
    valorOriginal: 0,
    juros: 0,
    multa: 0,
    honorarios: 0,
    valorTotal: 0,
    mesesAtraso: 0,
  };
  
  for (const cobranca of cobrancas) {
    const breakdown = calcularValorDevido(cobranca.amount, cobranca.dueDate, taxas);
    resultado.valorOriginal += breakdown.valorOriginal;
    resultado.juros += breakdown.juros;
    resultado.multa += breakdown.multa;
    resultado.honorarios += breakdown.honorarios;
    resultado.valorTotal += breakdown.valorTotal;
    resultado.mesesAtraso = Math.max(resultado.mesesAtraso, breakdown.mesesAtraso);
  }
  
  return resultado;
}

/**
 * Funções de cálculo para acordos e parcelamentos
 */

export interface ParcelaAcordo {
  numeroParcela: number;
  valor: number;
  dataVencimento: Date;
}

export interface PlanoAcordo {
  valorTotal: number;
  valorEntrada: number;
  valorParcelado: number;
  numeroParcelas: number;
  valorParcela: number;
  parcelas: ParcelaAcordo[];
  taxaJurosAplicada: number;
}

export interface ParametrosAcordo {
  valorTotal: number;
  valorEntrada: number;
  numeroParcelas: number;
  taxaJurosMensal: number; // Percentual (ex: 1.5 para 1.5%)
  dataInicio: Date;
}

/**
 * Calcula o plano completo de acordo com entrada e parcelas
 */
export function calcularPlanoAcordo(params: ParametrosAcordo): PlanoAcordo {
  const { valorTotal, valorEntrada, numeroParcelas, taxaJurosMensal, dataInicio } = params;

  // Valor que será parcelado (após entrada)
  const valorParcelado = valorTotal - valorEntrada;

  // Se não há parcelas, retorna apenas entrada
  if (numeroParcelas === 0) {
    return {
      valorTotal,
      valorEntrada,
      valorParcelado: 0,
      numeroParcelas: 0,
      valorParcela: 0,
      parcelas: [],
      taxaJurosAplicada: 0,
    };
  }

  // Calcula juros compostos sobre o valor parcelado
  const taxaDecimal = taxaJurosMensal / 100;
  const fatorJuros = Math.pow(1 + taxaDecimal, numeroParcelas);
  const valorParcelaComJuros = (valorParcelado * fatorJuros * taxaDecimal) / (fatorJuros - 1);

  // Gera as parcelas
  const parcelas: ParcelaAcordo[] = [];
  for (let i = 1; i <= numeroParcelas; i++) {
    const dataVencimento = new Date(dataInicio);
    dataVencimento.setMonth(dataVencimento.getMonth() + i);

    parcelas.push({
      numeroParcela: i,
      valor: Math.round(valorParcelaComJuros), // Arredonda para centavos
      dataVencimento,
    });
  }

  const valorTotalComJuros = valorEntrada + (valorParcelaComJuros * numeroParcelas);

  return {
    valorTotal: Math.round(valorTotalComJuros),
    valorEntrada,
    valorParcelado,
    numeroParcelas,
    valorParcela: Math.round(valorParcelaComJuros),
    parcelas,
    taxaJurosAplicada: taxaJurosMensal,
  };
}

/**
 * Calcula desconto por pagamento à vista
 */
export function calcularDescontoAVista(valorTotal: number, percentualDesconto: number): number {
  return Math.round(valorTotal * (1 - percentualDesconto / 100));
}

/**
 * Calcula valor total com juros (sem entrada)
 */
export function calcularValorTotalComJuros(
  valorBase: number,
  numeroParcelas: number,
  taxaJurosMensal: number
): number {
  if (numeroParcelas === 0) return valorBase;

  const taxaDecimal = taxaJurosMensal / 100;
  const fatorJuros = Math.pow(1 + taxaDecimal, numeroParcelas);
  const valorParcela = (valorBase * fatorJuros * taxaDecimal) / (fatorJuros - 1);

  return Math.round(valorParcela * numeroParcelas);
}

/**
 * Formata valor em reais para exibição
 */
export function formatarMoedaAcordo(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor / 100);
}

/**
 * Formata data para exibição
 */
export function formatarDataVencimento(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(data);
}

/**
 * Gera texto formatado do plano de acordo para compartilhar
 */
export function gerarTextoAcordo(plano: PlanoAcordo, nomeDevedor: string, condominio: string): string {
  const linhas: string[] = [];

  linhas.push("═══════════════════════════════════════");
  linhas.push("   PROPOSTA DE ACORDO DE PAGAMENTO");
  linhas.push("═══════════════════════════════════════");
  linhas.push("");
  linhas.push(`Devedor: ${nomeDevedor}`);
  linhas.push(`Condomínio: ${condominio}`);
  linhas.push(`Data: ${formatarDataVencimento(new Date())}`);
  linhas.push("");
  linhas.push("───────────────────────────────────────");
  linhas.push("RESUMO DO ACORDO");
  linhas.push("───────────────────────────────────────");
  linhas.push("");

  if (plano.valorEntrada > 0) {
    linhas.push(`💰 Entrada: ${formatarMoedaAcordo(plano.valorEntrada)}`);
  }

  if (plano.numeroParcelas > 0) {
    linhas.push(`📅 Parcelas: ${plano.numeroParcelas}x de ${formatarMoedaAcordo(plano.valorParcela)}`);
    linhas.push(`📊 Taxa de juros: ${plano.taxaJurosAplicada}% ao mês`);
  }

  linhas.push("");
  linhas.push(`💵 VALOR TOTAL: ${formatarMoedaAcordo(plano.valorTotal)}`);
  linhas.push("");

  if (plano.parcelas.length > 0) {
    linhas.push("───────────────────────────────────────");
    linhas.push("PLANO DE PAGAMENTO");
    linhas.push("───────────────────────────────────────");
    linhas.push("");

    if (plano.valorEntrada > 0) {
      linhas.push(`Entrada: ${formatarMoedaAcordo(plano.valorEntrada)} - Pagamento imediato`);
      linhas.push("");
    }

    plano.parcelas.forEach((parcela) => {
      linhas.push(
        `Parcela ${parcela.numeroParcela}/${plano.numeroParcelas}: ${formatarMoedaAcordo(parcela.valor)} - Vencimento: ${formatarDataVencimento(parcela.dataVencimento)}`
      );
    });
  }

  linhas.push("");
  linhas.push("═══════════════════════════════════════");
  linhas.push("");
  linhas.push("⚠️ Esta proposta tem validade de 7 dias.");
  linhas.push("📞 Entre em contato para formalizar o acordo.");
  linhas.push("");

  return linhas.join("\n");
}

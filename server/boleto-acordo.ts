export type StatusParcelaBoletoAcordo = "pendente" | "pago" | "atrasado" | "cancelado";

export interface ParcelaBoletoAcordo {
  id: number;
  installmentNumber: number;
  amount: number;
  dueDate: Date;
  status: StatusParcelaBoletoAcordo;
}

export interface LinhaPlanoBoletoAcordo {
  id: number;
  etapa: string;
  valor: number;
  vencimento: Date;
  situacao: string;
  documentoAtual: boolean;
}

export interface ContextoBoletoAcordo {
  acordoId: number;
  referenciaParcelaAtual: string;
  valorDocumento: number;
  valorOrigem: number;
  totalNegociado: number;
  saldoAposEstePagamento: number;
  parcelas: LinhaPlanoBoletoAcordo[];
}

function rotuloEtapa(parcela: ParcelaBoletoAcordo, totalParcelasRegulares: number): string {
  return parcela.installmentNumber === 0
    ? "Entrada"
    : `Parcela ${parcela.installmentNumber}/${totalParcelasRegulares}`;
}

function rotuloSituacao(parcela: ParcelaBoletoAcordo): string {
  switch (parcela.status) {
    case "pago":
      return "Pago";
    case "atrasado":
      return "Em atraso";
    case "cancelado":
      return "Cancelada";
    default:
      return "A vencer";
  }
}

/**
 * Monta exclusivamente o contexto de apresentação do boleto de uma parcela.
 * O valor bancário permanece externo e deve ser sempre igual a `valorDocumento`.
 */
export function montarContextoBoletoAcordo(input: {
  acordoId: number;
  valorOrigem?: number;
  totalNegociado: number;
  parcelaAtualId: number;
  parcelas: ParcelaBoletoAcordo[];
}): ContextoBoletoAcordo {
  const parcelasOrdenadas = [...input.parcelas].sort((a, b) => {
    if (a.installmentNumber !== b.installmentNumber) {
      return a.installmentNumber - b.installmentNumber;
    }
    return a.id - b.id;
  });

  const parcelaAtual = parcelasOrdenadas.find((parcela) => parcela.id === input.parcelaAtualId);
  if (!parcelaAtual) {
    throw new Error("Parcela atual não pertence ao acordo");
  }

  const totalParcelasRegulares = parcelasOrdenadas.filter((parcela) => parcela.installmentNumber > 0).length;
  const valorJaConsiderado = parcelasOrdenadas.reduce((total, parcela) => {
    const deveConsiderar = parcela.status === "pago" || parcela.id === parcelaAtual.id;
    return total + (deveConsiderar ? parcela.amount : 0);
  }, 0);

  const referenciaParcelaAtual = `${rotuloEtapa(parcelaAtual, totalParcelasRegulares)} do Acordo #${input.acordoId}`;

  return {
    acordoId: input.acordoId,
    referenciaParcelaAtual,
    valorDocumento: parcelaAtual.amount,
    valorOrigem: input.valorOrigem ?? input.totalNegociado,
    totalNegociado: input.totalNegociado,
    saldoAposEstePagamento: Math.max(0, input.totalNegociado - valorJaConsiderado),
    parcelas: parcelasOrdenadas.map((parcela) => ({
      id: parcela.id,
      etapa: rotuloEtapa(parcela, totalParcelasRegulares),
      valor: parcela.amount,
      vencimento: parcela.dueDate,
      situacao: parcela.id === parcelaAtual.id ? "Este boleto" : rotuloSituacao(parcela),
      documentoAtual: parcela.id === parcelaAtual.id,
    })),
  };
}

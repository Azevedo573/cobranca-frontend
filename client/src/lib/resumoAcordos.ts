export interface ParcelaParaResumoAcordo {
  id: number;
  acordoId: number;
  installmentNumber: number;
  amount: number;
  dueDate: Date | string;
  status: string;
}

export interface ResumoAcordo<T extends ParcelaParaResumoAcordo = ParcelaParaResumoAcordo> {
  acordoId: number;
  parcelas: T[];
  quantidadeParcelas: number;
  parcelasPagas: number;
  parcelasEmAberto: number;
  totalNegociado: number;
  saldoEmAberto: number;
  proximoVencimento: Date | null;
  status: "pendente" | "atrasado" | "pago" | "cancelado";
}

const statusEmAberto = (status: string) => status !== "pago" && status !== "cancelado";

/**
 * Consolida parcelas existentes apenas para a visualização do detalhe do devedor.
 * Cada parcela continua disponível no resultado para ações individuais de boleto e Pix.
 */
export function agruparParcelasPorAcordo<T extends ParcelaParaResumoAcordo>(parcelas: T[]): ResumoAcordo<T>[] {
  const porAcordo = new Map<number, T[]>();

  for (const parcela of parcelas) {
    const itens = porAcordo.get(parcela.acordoId) ?? [];
    itens.push(parcela);
    porAcordo.set(parcela.acordoId, itens);
  }

  return Array.from(porAcordo.entries())
    .map(([acordoId, itens]) => {
      const parcelasOrdenadas = [...itens].sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
      );
      const parcelasEmAberto = parcelasOrdenadas.filter((parcela) => statusEmAberto(parcela.status));
      const parcelasPagas = parcelasOrdenadas.filter((parcela) => parcela.status === "pago").length;
      const proximoVencimento = parcelasEmAberto[0]
        ? new Date(parcelasEmAberto[0].dueDate)
        : null;
      const status: ResumoAcordo<T>["status"] = parcelasEmAberto.some((parcela) => parcela.status === "atrasado")
        ? "atrasado"
        : parcelasEmAberto.length > 0
          ? "pendente"
          : parcelasPagas > 0
            ? "pago"
            : "cancelado";

      return {
        acordoId,
        parcelas: parcelasOrdenadas,
        quantidadeParcelas: parcelasOrdenadas.length,
        parcelasPagas,
        parcelasEmAberto: parcelasEmAberto.length,
        totalNegociado: parcelasOrdenadas.reduce((total, parcela) => total + parcela.amount, 0),
        saldoEmAberto: parcelasEmAberto.reduce((total, parcela) => total + parcela.amount, 0),
        proximoVencimento,
        status,
      };
    })
    .sort((a, b) => {
      const dataA = a.proximoVencimento?.getTime() ?? Number.POSITIVE_INFINITY;
      const dataB = b.proximoVencimento?.getTime() ?? Number.POSITIVE_INFINITY;
      return dataA - dataB || a.acordoId - b.acordoId;
    });
}

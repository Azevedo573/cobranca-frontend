export interface ValoresBaseAcordo {
  principal: number;
  juros: number;
  multa: number;
  correcao: number;
  honorarios: number;
  valorAtualizado: number;
  descricao?: string;
}

/**
 * O snapshot é memória da composição consolidada quando o acordo foi celebrado.
 * Ele não é uma composição proporcional da parcela e não altera o valor do título.
 */
export function criarSnapshotBaseAcordo(valores: ValoresBaseAcordo) {
  return {
    snapshotPrincipal: valores.principal,
    snapshotJuros: valores.juros,
    snapshotMulta: valores.multa,
    snapshotCorrecao: valores.correcao,
    snapshotHonorarios: valores.honorarios,
    snapshotValorAtualizado: valores.valorAtualizado,
    snapshotDescricao: valores.descricao,
  };
}

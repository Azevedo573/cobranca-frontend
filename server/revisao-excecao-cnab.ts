export const ACOES_REVISAO_MANUAL = ["em_revisao", "ignorada", "demanda_criada"] as const;
export type AcaoRevisaoManual = typeof ACOES_REVISAO_MANUAL[number];

export function validarDecisaoManual(acao: AcaoRevisaoManual, demandaId?: number): void {
  if (acao === "demanda_criada" && !demandaId) {
    throw new Error("A criação de demanda exige o identificador da demanda.");
  }
}

export function decisaoAlteraFinanceiro(): false {
  return false;
}

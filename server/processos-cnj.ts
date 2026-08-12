export function normalizarNumeroCNJ(numero: string): string {
  return numero.replace(/\D/g, "");
}

export function encontrarProcessoPorCNJ<T extends { numeroCNJ: string }>(
  processos: T[],
  numeroCNJ: string,
): T | undefined {
  const normalizado = normalizarNumeroCNJ(numeroCNJ);
  return processos.find((processo) => normalizarNumeroCNJ(processo.numeroCNJ) === normalizado);
}

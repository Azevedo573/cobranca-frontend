export interface AtualizadoresPosCriacaoDivida {
  cobrancasComAcordos: (devedorId: number) => Promise<unknown>;
  cobrancasPorDevedor: (devedorId: number) => Promise<unknown>;
  devedor: (devedorId: number) => Promise<unknown>;
  visao360: (devedorId: number) => Promise<unknown>;
}

/**
 * Atualiza a visão completa do devedor depois que uma dívida é persistida.
 * Não cria nem altera registros: apenas invalida os caches ativos do cliente.
 */
export async function atualizarConsultasAposCriarDivida(
  devedorId: number,
  atualizadores: AtualizadoresPosCriacaoDivida,
): Promise<void> {
  await Promise.all([
    atualizadores.cobrancasComAcordos(devedorId),
    atualizadores.cobrancasPorDevedor(devedorId),
    atualizadores.devedor(devedorId),
    atualizadores.visao360(devedorId),
  ]);
}

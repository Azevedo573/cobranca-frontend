import { trpc } from "./trpc";

/** Abrange filas, prévia, parcelas, acordo, resultados API e histórico CNAB; não navega nem reenvia. */
export async function invalidarCanaisBtg(
  utils: ReturnType<typeof trpc.useUtils>
) {
  await Promise.all([
    utils.btgV2.invalidate(),
    utils.btgBoletos.invalidate(),
    utils.btgCancelamento.invalidate(),
    utils.btgCanais.invalidate(),
    utils.cnab.invalidate(),
    utils.acordos.invalidate(),
    utils.cobrancas.getComAcordos.invalidate(),
    utils.devedores.visao360.invalidate(),
  ]);
}

export interface TituloBolePixV2Elegibilidade {
  status?: string | null;
  btgCollectionId?: string | null;
  nossoNumero?: string | null;
  remessaId?: number | null;
  statusRemessa?: string | null;
}

export interface ElegibilidadeBolePixV2 {
  elegivel: boolean;
  motivo: string | null;
}

/**
 * Regra somente de interface. A rotina de emissão no backend repete e reforça
 * essas barreiras antes de reservar qualquer título.
 */
export function verificarElegibilidadeBolePixV2(titulo: TituloBolePixV2Elegibilidade): ElegibilidadeBolePixV2 {
  if (titulo.status === "pago" || titulo.status === "cancelado") {
    return { elegivel: false, motivo: "Título pago ou cancelado" };
  }
  const possuiVinculoLegado = Boolean(
    titulo.btgCollectionId ||
    titulo.nossoNumero ||
    titulo.remessaId ||
    (titulo.statusRemessa && titulo.statusRemessa !== "nao_enviado"),
  );
  if (possuiVinculoLegado) {
    return { elegivel: false, motivo: "Título vinculado ao fluxo CNAB/BTG legado" };
  }
  return { elegivel: true, motivo: null };
}

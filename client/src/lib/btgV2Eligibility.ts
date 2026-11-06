import { avaliarElegibilidadeCanalParcela } from "@shared/btg-canais";
import type { ParcelaCanalUI } from "./btgCanaisUI";

export type TituloBolePixV2Elegibilidade = ParcelaCanalUI;
export interface ElegibilidadeBolePixV2 {
  elegivel: boolean;
  motivo: string | null;
}
/** Guarda visual compartilhado; o servidor revalida os vínculos e reserva atomicamente. */
export function verificarElegibilidadeBolePixV2(
  titulo: TituloBolePixV2Elegibilidade
): ElegibilidadeBolePixV2 {
  const resultado = avaliarElegibilidadeCanalParcela(
    { ...titulo, status: titulo.status ?? "desconhecido" },
    "api_btg_v2"
  );
  // Preservar mensagem pública do helper anterior para estados terminais.
  return {
    elegivel: resultado.elegivel,
    motivo:
      titulo.status === "pago" || titulo.status === "cancelado"
        ? "Título pago ou cancelado"
        : resultado.motivo,
  };
}

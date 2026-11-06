import {
  avaliarElegibilidadeCanalParcela,
  CONFIRMACAO_RESERVA_LOCAL,
} from "@shared/btg-canais";

export { CONFIRMACAO_RESERVA_LOCAL };

export interface ParcelaCanalUI {
  id?: number;
  parcelaId?: number;
  acordoId?: number;
  status?: string | null;
  statusParcela?: string | null;
  nossoNumero?: string | null;
  nossoNumeroOrigem?: string | null;
  canalBancario?: string | null;
  statusRemessa?: string | null;
  remessaId?: number | null;
  btgCollectionId?: string | null;
  btgEmissaoV2Existente?: boolean;
  btgBankSlipUrl?: string | null;
  btgPixCopiaECola?: string | null;
  pixCopiaCola?: string | null;
  btgStatus?: string | null;
  elegivel?: boolean;
  motivoBloqueio?: string | null;
  codigoBloqueio?: string | null;
  codigo?: string | null;
  podeConfirmarReserva?: boolean;
  elegivelCnab?: boolean;
  motivoBloqueioCnab?: string | null;
  codigoBloqueioCnab?: string | null;
  confirmarReservaDisponivel?: boolean;
}

export function rotuloCanalParcela(parcela: ParcelaCanalUI): string {
  if (
    parcela.canalBancario === "api_btg_v2" ||
    parcela.btgEmissaoV2Existente ||
    parcela.codigo === "api_vinculada" ||
    parcela.codigoBloqueio === "api_vinculada" ||
    parcela.codigoBloqueioCnab === "api_vinculada"
  )
    return "Reservada/enviada pela API BTG v2";
  if (
    parcela.canalBancario === "cnab240" ||
    parcela.remessaId ||
    parcela.pixCopiaCola ||
    parcela.codigo === "cnab_vinculado" ||
    parcela.codigoBloqueio === "cnab_vinculado" ||
    parcela.codigoBloqueioCnab === "cnab_vinculado" ||
    (parcela.statusRemessa && parcela.statusRemessa !== "nao_enviado")
  )
    return "Vinculada a remessa CNAB";
  if (
    parcela.canalBancario === "legado" ||
    parcela.btgCollectionId ||
    parcela.btgBankSlipUrl ||
    parcela.btgStatus ||
    parcela.btgPixCopiaECola ||
    parcela.codigo === "legado_vinculado" ||
    parcela.codigoBloqueio === "legado_vinculado" ||
    parcela.codigoBloqueioCnab === "legado_vinculado" ||
    parcela.nossoNumeroOrigem === "legado"
  )
    return "Vínculo bancário legado";
  if (parcela.canalBancario) return "Canal bancário não reconhecido · revisar";
  if (parcela.nossoNumeroOrigem === "reserva_local")
    return "Reserva local · sem canal bancário";
  if (
    parcela.nossoNumero ||
    parcela.codigoBloqueio === "numero_origem_desconhecida"
  )
    return "Numeração de origem não confirmada";
  return "Sem canal bancário reservado";
}

/** A fila/prévia API é a autoridade de elegibilidade, inclusive para vínculos não expostos. */
export function selecionavelApi(parcela: ParcelaCanalUI): boolean {
  return parcela.elegivel === true && !parcela.canalBancario;
}

/** CNAB reutiliza a política compartilhada e nunca sobrepõe um bloqueio retornado pelo servidor. */
export function elegibilidadeCnabUI(parcela: ParcelaCanalUI) {
  const avaliacao = avaliarElegibilidadeCanalParcela(
    {
      ...parcela,
      status: parcela.statusParcela ?? parcela.status ?? "desconhecido",
    },
    "cnab240"
  );
  if (parcela.elegivel === false || parcela.elegivelCnab === false)
    return {
      elegivel: false,
      motivo:
        parcela.motivoBloqueioCnab ||
        parcela.motivoBloqueio ||
        avaliacao.motivo ||
        "Parcela bloqueada pelo servidor",
    };
  return { elegivel: avaliacao.elegivel, motivo: avaliacao.motivo };
}

export function podeRevisarReservaLocal(
  parcela: ParcelaCanalUI,
  role?: string | null
): boolean {
  return (
    role === "admin" &&
    (parcela.podeConfirmarReserva === true ||
      parcela.confirmarReservaDisponivel === true) &&
    Boolean(parcela.nossoNumero) &&
    !parcela.canalBancario
  );
}

export function podeConfirmarReservaLocalUI(input: {
  parcela: ParcelaCanalUI;
  role?: string | null;
  confirmacao: string;
  declaracaoNaoEncaminhada: boolean;
  pendente?: boolean;
}): boolean {
  return (
    podeRevisarReservaLocal(input.parcela, input.role) &&
    input.confirmacao === CONFIRMACAO_RESERVA_LOCAL &&
    input.declaracaoNaoEncaminhada &&
    !input.pendente
  );
}

const idPositivo = (valor: string | null) => {
  if (!valor || !/^\d+$/.test(valor)) return null;
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export function contextoBancarioBusca(busca: string) {
  const params = new URLSearchParams(busca);
  return {
    acordoId: idPositivo(params.get("acordoId")),
    condominioId: idPositivo(params.get("condominioId")),
  };
}

export function caminhoCnabAcordo(
  acordoId: number,
  condominioId: number
): string {
  return `/admin/cnab240?acordoId=${acordoId}&condominioId=${condominioId}`;
}

/** Mantém apenas a seleção ainda elegível após revalidação; nunca inclui automaticamente uma reserva confirmada. */
export function preservarSelecaoElegivel(
  selecionadas: ReadonlySet<number>,
  parcelas: Array<{ id: number; elegivel: boolean }>
): Set<number> {
  return new Set(
    parcelas.filter(p => p.elegivel && selecionadas.has(p.id)).map(p => p.id)
  );
}

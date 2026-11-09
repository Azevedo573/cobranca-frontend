import type { ParcelaCanalUI } from "./btgCanaisUI";

/** Espelha a guarda de reapresentação existente. A autorização final continua no servidor. */
export function podeReapresentarCnabUI(parcela: ParcelaCanalUI): boolean {
  const evidenciaCnab = Boolean(
    (parcela.remessaId != null && ["remessa_gerada", "enviado", "retorno_recebido"].includes(parcela.statusRemessa ?? "")) ||
    parcela.pixCopiaCola?.trim()
  );
  return Boolean(
    !["pago", "cancelado"].includes(parcela.statusParcela ?? parcela.status ?? "") &&
    parcela.nossoNumero && evidenciaCnab &&
    (!parcela.canalBancario || parcela.canalBancario === "cnab240") &&
    !parcela.btgEmissaoV2Existente && !parcela.btgCollectionId &&
    !parcela.btgBankSlipUrl && !parcela.btgPixCopiaECola && !parcela.btgStatus &&
    parcela.codigoBloqueio !== "api_vinculada" && parcela.codigoBloqueioCnab !== "api_vinculada"
  );
}

export const CONFIRMACAO_CANCELAMENTO_BTG = "CANCELAR COBRANÇA BTG" as const;

/** Relógio local somente para expiração da prévia; o servidor revalida identidade e sessão. */
export function podeConfirmarCancelamentoUI(input: {
  elegivel: boolean;
  expiraEm: Date | string;
  motivo: string;
  confirmacao: string;
  ciente: boolean;
  busy: boolean;
  enviado: boolean;
  agora?: number;
}): boolean {
  const tamanho = input.motivo.trim().length;
  return input.elegivel && new Date(input.expiraEm).getTime() > (input.agora ?? Date.now()) &&
    tamanho >= 5 && tamanho <= 500 && input.confirmacao === CONFIRMACAO_CANCELAMENTO_BTG &&
    input.ciente && !input.busy && !input.enviado;
}

export function rotuloAmbienteBtg(ambiente: string | null | undefined): string {
  return ambiente === "producao" ? "PRODUÇÃO" : ambiente === "sandbox" ? "SANDBOX" : "AMBIENTE NÃO CONFIRMADO";
}

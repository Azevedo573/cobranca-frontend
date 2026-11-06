export type OrigemNossoNumero = 'reserva_local' | 'legado' | null;
export type CanalBancario = 'api_btg_v2' | 'cnab240' | 'legado' | null;
export type CanalEnvioBancario = Exclude<CanalBancario, null>;
export const CONFIRMACAO_RESERVA_LOCAL = 'CONFIRMAR RESERVA LOCAL';

export interface EstadoBancarioParcela {
  status?: string | null;
  nossoNumero?: string | null;
  nossoNumeroOrigem?: OrigemNossoNumero | string;
  canalBancario?: CanalBancario | string;
  statusRemessa?: string | null;
  remessaId?: number | null;
  pixCopiaCola?: string | null;
  btgCollectionId?: string | null;
  btgBankSlipUrl?: string | null;
  btgPixQrCode?: string | null;
  btgPixCopiaECola?: string | null;
  btgStatus?: string | null;
  btgEmitidoEm?: Date | string | null;
  btgEmissaoV2Existente?: boolean;
}

export type CodigoBloqueioCanal = 'parcela_paga_cancelada' | 'status_invalido' | 'api_vinculada' | 'cnab_vinculado' | 'legado_vinculado' | 'numero_origem_desconhecida' | 'estado_remessa_desconhecido';
export interface ElegibilidadeCanalParcela {
  elegivel: boolean;
  motivo: string | null;
  codigo: CodigoBloqueioCanal | null;
  confirmarReservaDisponivel: boolean;
}
const preenchido = (value?: string | null) => Boolean(value?.trim());
const bloqueio = (codigo: CodigoBloqueioCanal, motivo: string, confirmarReservaDisponivel = false): ElegibilidadeCanalParcela => ({ elegivel: false, codigo, motivo, confirmarReservaDisponivel });

/** Política para uma NOVA operação; reaproveitamento idempotente exige o registro canônico do emissor. */
export function avaliarElegibilidadeCanalParcela(parcela: EstadoBancarioParcela, _canal: CanalEnvioBancario): ElegibilidadeCanalParcela {
  if (parcela.status === 'pago' || parcela.status === 'cancelado') {
    return bloqueio('parcela_paga_cancelada', 'Parcela paga ou cancelada');
  }
  if (parcela.status !== 'pendente' && parcela.status !== 'atrasado') {
    return bloqueio('status_invalido', 'Status da parcela não permite envio');
  }
  if (parcela.canalBancario === 'api_btg_v2' || parcela.btgEmissaoV2Existente) {
    return bloqueio('api_vinculada', 'Parcela já reservada ou registrada na API BTG; revise a emissão existente');
  }
  if (parcela.canalBancario === 'cnab240' || parcela.remessaId != null || preenchido(parcela.pixCopiaCola) ||
      (parcela.statusRemessa != null && parcela.statusRemessa !== 'nao_enviado')) {
    return bloqueio('cnab_vinculado', 'Parcela já reservada ou vinculada a uma remessa CNAB');
  }
  if (parcela.canalBancario != null || parcela.nossoNumeroOrigem === 'legado' || preenchido(parcela.btgCollectionId) || preenchido(parcela.btgBankSlipUrl) ||
      preenchido(parcela.btgPixQrCode) || preenchido(parcela.btgPixCopiaECola) || preenchido(parcela.btgStatus) || parcela.btgEmitidoEm != null) {
    return bloqueio('legado_vinculado', 'Parcela vinculada ao fluxo bancário legado');
  }
  if (preenchido(parcela.nossoNumero)) {
    if (parcela.nossoNumeroOrigem === 'legado') return bloqueio('legado_vinculado', 'Numeração já vinculada ao fluxo bancário legado');
    if (parcela.statusRemessa !== 'nao_enviado') return bloqueio('estado_remessa_desconhecido', 'Situação da remessa não confirmada; revise a parcela');
    if (parcela.nossoNumeroOrigem !== 'reserva_local') {
      return bloqueio('numero_origem_desconhecida', 'Numeração de origem não confirmada; confirme a reserva local antes de escolher API ou CNAB', parcela.nossoNumeroOrigem == null);
    }
  }
  return { elegivel: true, motivo: null, codigo: null, confirmarReservaDisponivel: false };
}

export function rotuloCanalBancario(canal: CanalBancario | string | undefined): string {
  if (canal === 'api_btg_v2') return 'API BTG';
  if (canal === 'cnab240') return 'CNAB 240';
  if (canal === 'legado') return 'Legado';
  return 'Canal ainda não reservado';
}

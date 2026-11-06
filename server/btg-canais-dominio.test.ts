import { describe, expect, it } from 'vitest';
import { avaliarElegibilidadeCanalParcela } from '../shared/btg-canais';

const livre = { status: 'pendente', statusRemessa: 'nao_enviado', nossoNumero: null, canalBancario: null };

describe('política comum API/CNAB de parcelas', () => {
  it.each(['api_btg_v2', 'cnab240', 'legado'] as const)('permite parcela livre no canal %s', canal => {
    expect(avaliarElegibilidadeCanalParcela(livre, canal)).toMatchObject({ elegivel: true, motivo: null, confirmarReservaDisponivel: false });
  });
  it.each(['api_btg_v2', 'cnab240'] as const)('reserva local não escolhe o canal %s', canal => {
    expect(avaliarElegibilidadeCanalParcela({ ...livre, nossoNumero: '1000000018', nossoNumeroOrigem: 'reserva_local' }, canal).elegivel).toBe(true);
  });
  it('número antigo sem origem requer confirmação individual', () => {
    expect(avaliarElegibilidadeCanalParcela({ ...livre, nossoNumero: '1000000018' }, 'api_btg_v2')).toMatchObject({
      elegivel: false, codigo: 'numero_origem_desconhecida', confirmarReservaDisponivel: true,
    });
  });
  it('número legado nunca oferece confirmação local', () => {
    expect(avaliarElegibilidadeCanalParcela({ ...livre, nossoNumero: '123', nossoNumeroOrigem: 'legado' }, 'api_btg_v2')).toMatchObject({ elegivel: false, confirmarReservaDisponivel: false });
  });
  it('origem legada continua bloqueada mesmo sem número atual', () => {
    expect(avaliarElegibilidadeCanalParcela({ ...livre, nossoNumeroOrigem: 'legado' }, 'api_btg_v2')).toMatchObject({ elegivel: false, confirmarReservaDisponivel: false });
  });
  it.each(['api_btg_v2', 'cnab240', 'legado'] as const)('canal %s já adquirido impede nova operação', canalBancario => {
    for (const destino of ['api_btg_v2', 'cnab240', 'legado'] as const) {
      expect(avaliarElegibilidadeCanalParcela({ ...livre, canalBancario }, destino)).toMatchObject({ elegivel: false, confirmarReservaDisponivel: false });
    }
  });
  it.each([
    { remessaId: 4 }, { statusRemessa: 'remessa_gerada' }, { statusRemessa: 'enviado' },
    { statusRemessa: 'retorno_recebido' }, { btgCollectionId: 'legacy' }, { pixCopiaCola: 'pix' },
    { btgBankSlipUrl: 'https://example.test/old' }, { btgPixQrCode: 'qr' }, { btgPixCopiaECola: 'emv' },
    { btgStatus: 'FAILED' }, { btgEmitidoEm: new Date() }, { btgEmissaoV2Existente: true },
  ])('evidência bancária prevalece sobre reserva local: %j', dado => {
    expect(avaliarElegibilidadeCanalParcela({ ...livre, nossoNumero: '123', nossoNumeroOrigem: 'reserva_local', ...dado }, 'api_btg_v2')).toMatchObject({ elegivel: false, confirmarReservaDisponivel: false });
  });
  it.each(['pago', 'cancelado', 'desconhecido'])('recusa status %s', status => {
    expect(avaliarElegibilidadeCanalParcela({ ...livre, status }, 'cnab240').elegivel).toBe(false);
  });
  it('aceita atraso sem reemitir parcela paga', () => {
    expect(avaliarElegibilidadeCanalParcela({ ...livre, status: 'atrasado' }, 'api_btg_v2').elegivel).toBe(true);
  });
  it('número com status de remessa nulo não é comprovadamente livre', () => {
    expect(avaliarElegibilidadeCanalParcela({ ...livre, nossoNumero: '123', nossoNumeroOrigem: 'reserva_local', statusRemessa: null }, 'cnab240').elegivel).toBe(false);
  });
});

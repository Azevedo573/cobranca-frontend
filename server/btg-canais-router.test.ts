import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarDbCanaisEmMemoria, usuarioCanaisFixture } from './btg-canais-test-db';
import { btgCanaisRouter } from './routers/btg-canais';
import { bloquearParcelasParaCanal, exigirParcelaLivreParaCanal } from './btg-canais';
import { parcelasAcordo } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import type { TrpcContext } from './_core/context';
import { CONFIRMACAO_RESERVA_LOCAL } from '../shared/btg-canais';

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock('./db', () => ({ getDb: mocks.getDb }));
let fixture: ReturnType<typeof criarDbCanaisEmMemoria>;
const entrada = { parcelaId: 19, nossoNumeroEsperado: '1000000018', confirmacao: CONFIRMACAO_RESERVA_LOCAL, declaracaoNaoEncaminhada: true } as const;
function caller(role = 'admin') {
  return btgCanaisRouter.createCaller({
    user: { id: 10, name: 'Administrador de teste', email: 'test@example.test', role },
    req: { headers: {}, socket: {} }, res: {},
  } as unknown as TrpcContext);
}
beforeEach(() => {
  fixture = criarDbCanaisEmMemoria({
    users: [{ ...usuarioCanaisFixture(), name: 'Administrador de teste', email: 'test@example.test' }],
    acordos: [{ id: 5, condominioId: 1, devedorId: 9, status: 'ativo' }],
    parcelasAcordo: [{ id: 19, acordoId: 5, installmentNumber: 1, status: 'pendente', amount: 1400, dueDate: new Date('2026-12-01'),
      nossoNumero: '1000000018', nossoNumeroOrigem: null, canalBancario: null, statusRemessa: 'nao_enviado', remessaId: null }],
    btgCobrancasEmitidas: [], auditLogs: [],
  });
  mocks.getDb.mockResolvedValue(fixture.db);
});

describe('confirmação auditada de reserva local', () => {
  it('mostra bloqueio por origem e confirmação disponível sem alterar parcela', async () => {
    const situacao = await caller().situacaoAcordo({ acordoId: 5 });
    expect(situacao[0]).toMatchObject({ parcelaId: 19, podeConfirmarReserva: true, elegivel: false, codigoBloqueio: 'numero_origem_desconhecida' });
    expect(fixture.state.writes).toHaveLength(0);
  });
  it('confirma sem alterar número, valor, vencimento ou canal e audita antes/depois', async () => {
    expect(await caller().confirmarReservaLocal(entrada)).toMatchObject({ success: true, parcelaId: 19, nossoNumero: '1000000018' });
    expect(fixture.state.tables.parcelasAcordo[0]).toMatchObject({ nossoNumero: '1000000018', nossoNumeroOrigem: 'reserva_local', canalBancario: null, amount: 1400, statusRemessa: 'nao_enviado' });
    const audit = fixture.state.tables.auditLogs[0];
    expect(JSON.parse(audit.beforeData).nossoNumeroOrigem).toBeNull();
    expect(JSON.parse(audit.afterData).nossoNumeroOrigem).toBe('reserva_local');
    expect(audit).toMatchObject({ userId: 10, entity: 'parcela', entityId: '19', condominioId: 1 });
    expect(fixture.state.locks).toContain('parcelasAcordo:update');
    expect(fixture.state.tables.btgCobrancasEmitidas).toHaveLength(0);
  });
  it.each(['advogado', 'colaborador', 'sindico', 'cobrador'])('recusa perfil %s antes de escrita', async role => {
    fixture.state.tables.users[0].role = role;
    await expect(caller(role).confirmarReservaLocal(entrada)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(fixture.state.writes).toHaveLength(0);
  });
  it('recusa literal ou declaração inválidos', async () => {
    await expect(caller().confirmarReservaLocal({ ...entrada, confirmacao: 'confirmo' as typeof CONFIRMACAO_RESERVA_LOCAL })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller().confirmarReservaLocal({ ...entrada, declaracaoNaoEncaminhada: false as true })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(fixture.state.writes).toHaveLength(0);
  });
  it('numeração alterada não pode ser confirmada com formulário antigo', async () => {
    fixture.state.tables.parcelasAcordo[0].nossoNumero = 'outro';
    await expect(caller().confirmarReservaLocal(entrada)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(fixture.state.writes).toHaveLength(0);
  });
  it.each([
    { canalBancario: 'api_btg_v2' }, { canalBancario: 'cnab240' }, { canalBancario: 'legado' },
    { remessaId: 7 }, { statusRemessa: 'remessa_gerada' }, { btgCollectionId: 'collection' },
    { pixCopiaCola: 'pix' }, { btgBankSlipUrl: 'https://example.test/old' }, { nossoNumeroOrigem: 'legado' }, { status: 'pago' },
  ])('recusa vínculo/estado bancário antes de confirmação: %j', estado => {
    Object.assign(fixture.state.tables.parcelasAcordo[0], estado);
    return expect(caller().confirmarReservaLocal(entrada)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
  it('reserva v2 em outra integração/ambiente também bloqueia confirmação', async () => {
    fixture.state.tables.btgCobrancasEmitidas.push({ id: 88, origemTipo: 'parcela_acordo', origemId: 19, btgIntegracaoId: 999, status: 'incerta' });
    await expect(caller().confirmarReservaLocal(entrada)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(fixture.state.tables.auditLogs).toHaveLength(0);
  });
  it('emissão de outra parcela não é confundida com a parcela confirmada', async () => {
    fixture.state.tables.btgCobrancasEmitidas.push({ origemTipo: 'parcela_acordo', origemId: 999 });
    expect(await caller().confirmarReservaLocal(entrada)).toMatchObject({ success: true });
  });
  it('acordo inativo mantém reserva bloqueada', async () => {
    fixture.state.tables.acordos[0].status = 'cancelado';
    await expect(caller().confirmarReservaLocal(entrada)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
  it('falha de auditoria desfaz o marcador e não expõe erro SQL', async () => {
    fixture.state.failAudit = true;
    await expect(caller().confirmarReservaLocal(entrada)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(fixture.state.tables.parcelasAcordo[0].nossoNumeroOrigem).toBeNull();
    expect(fixture.state.writes).toHaveLength(0);
  });
  it('duas confirmações simultâneas não duplicam decisão auditada', async () => {
    const results = await Promise.allSettled([caller().confirmarReservaLocal(entrada), caller().confirmarReservaLocal(entrada)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(fixture.state.tables.auditLogs).toHaveLength(1);
  });
});

describe('lock/política compartilhados de canal', () => {
  it('recusa ID alheio/misturado ao condomínio antes de escrita', async () => {
    await expect(fixture.db.transaction((tx: any) => bloquearParcelasParaCanal(tx, [19], 2))).rejects.toThrow('contexto');
    await expect(fixture.db.transaction((tx: any) => bloquearParcelasParaCanal(tx, [19, 999], 1))).rejects.toThrow('contexto');
    expect(fixture.state.writes).toHaveLength(0);
  });
  it('API e CNAB disputando reserva local só adquirem um canal', async () => {
    fixture.state.tables.parcelasAcordo[0].nossoNumeroOrigem = 'reserva_local';
    const reservar = (canal: 'api_btg_v2' | 'cnab240') => fixture.db.transaction(async (tx: any) => {
      const [row] = await bloquearParcelasParaCanal(tx, [19], 1);
      exigirParcelaLivreParaCanal(row, canal);
      await tx.update(parcelasAcordo).set({ canalBancario: canal }).where(eq(parcelasAcordo.id, 19));
      return canal;
    });
    const results = await Promise.allSettled([reservar('api_btg_v2'), reservar('cnab240')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(fixture.state.writes).toHaveLength(1);
    expect(fixture.state.tables.parcelasAcordo[0].canalBancario).toBe('api_btg_v2');
  });
});

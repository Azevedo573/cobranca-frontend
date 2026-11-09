import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { acordos, auditLogs, btgCobrancasEmitidas, btgHttpDiagnosticos, btgIntegracoes, btgRemessaItens, btgRemessas, parcelasAcordo, users } from '../../drizzle/schema';
import { BtgV2ConfigurationError } from './config';
import { aadDiagnosticoBtg, cifrarDiagnosticoBtg, LIMITE_CAPTURA_BTG_BYTES } from './diagnosticos-crypto';
import { registrarSnapshotDoPedidoBtg } from './boleto-snapshot';

type Db = NonNullable<Awaited<ReturnType<typeof import('../db').getDb>>>;
type Executor = Pick<Db, 'select' | 'insert' | 'update'>;
export interface BtgHttpCaptura {
  readonly id: number | null;
  preparar(payloadSerializado: string): Promise<number>;
  iniciar(): Promise<void>;
  responder(httpStatus: number, bytes: Uint8Array, completa: boolean): Promise<void>;
  semResposta(): Promise<void>;
}
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const falha = () => new BtgV2ConfigurationError('Não foi possível registrar a evidência protegida da tentativa BTG. Nenhum reenvio automático será realizado.');

async function contexto(tx: Executor, emissaoId: number, usuarioId: number, paraPreparar: boolean) {
  const [usuario] = await tx.select().from(users).where(eq(users.id,usuarioId)).limit(1);
  if (!usuario || usuario.role !== 'admin' || usuario.isActive !== 1 || usuario.isDeleted !== 0) throw falha();
  const [emissao] = await tx.select().from(btgCobrancasEmitidas).where(eq(btgCobrancasEmitidas.id,emissaoId)).limit(1).for('update');
  if (!emissao || emissao.origemTipo !== 'parcela_acordo' || (paraPreparar && emissao.status !== 'enviando')) throw falha();
  const [integracao] = await tx.select().from(btgIntegracoes).where(eq(btgIntegracoes.id,emissao.btgIntegracaoId)).limit(1);
  const ambiente = process.env.BTG_SANDBOX === 'true' ? 'sandbox' : 'producao';
  if (!integracao || integracao.ambiente !== ambiente || integracao.ativo !== 1 || (paraPreparar && integracao.emissaoHabilitada !== 1)) throw falha();
  const [parcela] = await tx.select().from(parcelasAcordo).where(eq(parcelasAcordo.id,emissao.origemId)).limit(1);
  if (!parcela) throw falha();
  const [acordo] = await tx.select().from(acordos).where(eq(acordos.id,parcela.acordoId)).limit(1);
  if (!acordo || acordo.condominioId !== emissao.condominioId) throw falha();
  if (emissao.btgRemessaId !== null) {
    const [remessa] = await tx.select().from(btgRemessas).where(eq(btgRemessas.id,emissao.btgRemessaId)).limit(1);
    const [item] = await tx.select().from(btgRemessaItens).where(and(eq(btgRemessaItens.btgRemessaId,emissao.btgRemessaId),eq(btgRemessaItens.parcelaAcordoId,emissao.origemId))).limit(1);
    if (!remessa || !item || remessa.btgIntegracaoId !== emissao.btgIntegracaoId || remessa.condominioId !== emissao.condominioId || remessa.btgContaRecebedoraId !== emissao.btgContaRecebedoraId) throw falha();
  }
  return { emissao, integracao, parcela };
}

async function auditar(tx: Executor, usuarioId: number, id: number, condominioId: number, evento: string): Promise<void> {
  await tx.insert(auditLogs).values({userId:usuarioId,userRole:'admin',action:'config_change',entity:'configuracao',entityId:`btg-diagnostico:${id}`,condominioId,metadata:JSON.stringify({integracao:'btg-v2',evento,diagnosticoId:id}),success:1,severity:'info',ipAddress:'unknown'});
}

/** Factory sem efeitos. Preparar deve concluir antes de o cliente executar fetch. */
export function criarCapturaHttpBtg(input: {db: Db; emissaoId: number; usuarioId: number}): BtgHttpCaptura {
  let id: number | null = null;
  const chaveCaptura = randomUUID();
  async function registro(tx: Executor) {
    if (id === null) throw falha();
    const [row] = await tx.select().from(btgHttpDiagnosticos).where(eq(btgHttpDiagnosticos.id,id)).limit(1).for('update');
    if (!row || row.chaveCaptura !== chaveCaptura || row.btgCobrancaEmitidaId !== input.emissaoId || row.usuarioId !== input.usuarioId || row.conteudoExpurgadoEm !== null) throw falha();
    return row;
  }
  async function protegido<T>(acao: () => Promise<T>): Promise<T> {
    try { return await acao(); } catch { throw falha(); }
  }
  return {
    get id() { return id; },
    async preparar(body) {
      if (id !== null || typeof body !== 'string' || !Number.isSafeInteger(input.emissaoId) || input.emissaoId <= 0 || !Number.isSafeInteger(input.usuarioId) || input.usuarioId <= 0) throw falha();
      const bytes = Buffer.from(body,'utf8');
      if (!bytes.length || bytes.length > LIMITE_CAPTURA_BTG_BYTES) throw falha();
      return protegido(async()=>{
        const criado = await input.db.transaction(async tx=>{
          const {emissao,integracao,parcela} = await contexto(tx,input.emissaoId,input.usuarioId,true);
          const [existente] = await tx.select().from(btgHttpDiagnosticos).where(eq(btgHttpDiagnosticos.btgCobrancaEmitidaId,emissao.id)).limit(1);
          if (existente) throw falha();
          const payload = JSON.parse(body) as { detail?: {correlationId?:unknown;documentNumber?:unknown;externalId?:unknown} };
          if (payload?.detail?.correlationId !== `btgv2-${emissao.id}` || payload.detail.documentNumber !== `PA${parcela.id}R${emissao.revisao}` || payload.detail.externalId !== emissao.externalId) throw falha();
          const values = {chaveCaptura,ambiente:integracao.ambiente,btgIntegracaoId:integracao.id,btgCobrancaEmitidaId:emissao.id,btgRemessaId:emissao.btgRemessaId,parcelaAcordoId:parcela.id,condominioId:emissao.condominioId,usuarioId:input.usuarioId,correlationId:`btgv2-${emissao.id}`,payloadSha256:hash(bytes),payloadBytes:bytes.length,versaoCriptografia:'v1'};
          const payloadCifrado = cifrarDiagnosticoBtg(bytes,aadDiagnosticoBtg(values));
          const capturaCriadaEm = new Date();
          await tx.insert(btgHttpDiagnosticos).values({...values,payloadCifrado,estadoCaptura:'preparado',capturaCriadaEm,updatedAt:capturaCriadaEm});
          const [row] = await tx.select().from(btgHttpDiagnosticos).where(eq(btgHttpDiagnosticos.chaveCaptura,chaveCaptura)).limit(1);
          if (!row) throw falha();
          await auditar(tx,input.usuarioId,row.id,row.condominioId,'captura_preparada');
          await registrarSnapshotDoPedidoBtg(tx,emissao,body,input.usuarioId,row.id);
          return row.id;
        });
        id = criado;
        return criado;
      });
    },
    async iniciar() {
      await protegido(()=>input.db.transaction(async tx=>{
        await contexto(tx,input.emissaoId,input.usuarioId,true);
        const row = await registro(tx);
        if (row.estadoCaptura !== 'preparado') throw falha();
        await tx.update(btgHttpDiagnosticos).set({estadoCaptura:'enviando',updatedAt:new Date()}).where(eq(btgHttpDiagnosticos.id,row.id));
        await auditar(tx,input.usuarioId,row.id,row.condominioId,'captura_envio_iniciado');
      }));
    },
    async responder(httpStatus,bytes,completa) {
      if (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599 || !(bytes instanceof Uint8Array) || bytes.length > LIMITE_CAPTURA_BTG_BYTES || typeof completa !== 'boolean') throw falha();
      await protegido(()=>input.db.transaction(async tx=>{
        const row = await registro(tx);
        if (row.estadoCaptura !== 'enviando') throw falha();
        // Preservar retorno mesmo se o ator/integração foi revogado após o POST.
        // A futura leitura administrativa valida novamente todos os vínculos.
        await tx.update(btgHttpDiagnosticos).set({estadoCaptura:completa?'resposta_recebida':'resposta_incompleta',httpStatus,respostaCifrada:cifrarDiagnosticoBtg(bytes,aadDiagnosticoBtg(row,'resposta')),respostaSha256:hash(bytes),respostaBytes:bytes.length,respostaCompleta:completa?1:0,respostaRecebidaEm:new Date(),updatedAt:new Date()}).where(eq(btgHttpDiagnosticos.id,row.id));
        await auditar(tx,input.usuarioId,row.id,row.condominioId,'captura_resposta_recebida');
      }));
    },
    async semResposta() {
      await protegido(()=>input.db.transaction(async tx=>{
        const row = await registro(tx);
        if (row.estadoCaptura !== 'enviando') throw falha();
        await tx.update(btgHttpDiagnosticos).set({estadoCaptura:'sem_resposta',updatedAt:new Date()}).where(eq(btgHttpDiagnosticos.id,row.id));
        await auditar(tx,input.usuarioId,row.id,row.condominioId,'captura_transporte_sem_confirmacao');
      }));
    },
  };
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarDbCanaisEmMemoria } from './btg-canais-test-db';
import { criarCapturaHttpBtg } from './btg-v2/diagnosticos';
import { aadDiagnosticoBtg, decifrarDiagnosticoBtg } from './btg-v2/diagnosticos-crypto';
const body = JSON.stringify({ detail:{correlationId:'btgv2-2',documentNumber:'PA20R1',externalId:'v2:prd:parcela_acordo:20:r1'},payer:{name:'Exemplo fictício',taxId:'01234567890'},unknown:'\u0000🧪' });
function fixture(){ return criarDbCanaisEmMemoria({
 users:[{id:3,role:'admin',isActive:1,isDeleted:0}],
 btgCobrancasEmitidas:[{id:2,btgIntegracaoId:1,origemTipo:'parcela_acordo',origemId:20,revisao:1,status:'enviando',condominioId:1,btgRemessaId:null,externalId:'v2:prd:parcela_acordo:20:r1'}],
 btgIntegracoes:[{id:1,ambiente:'producao',ativo:1,emissaoHabilitada:1}],
 parcelasAcordo:[{id:20,acordoId:6}],acordos:[{id:6,condominioId:1}],btgHttpDiagnosticos:[],auditLogs:[]
 }); }
describe('repositório de captura BTG isolado',()=>{
 beforeEach(()=>{vi.stubEnv('BTG_SANDBOX','false');vi.stubEnv('BTG_TOKEN_ENCRYPTION_KEY',Buffer.alloc(32,3).toString('base64'));});
 it('grava e decifra bytes exatos de pedido/erro desconhecido e preserva canônica',async()=>{
  const {db,state}=fixture(), captura=criarCapturaHttpBtg({db,emissaoId:2,usuarioId:3});
  const antes=structuredClone(state.tables.btgCobrancasEmitidas);
  const id=await captura.preparar(body); expect(captura.id).toBe(id);
  await captura.iniciar(); const bytes=Buffer.from('{"invalidParams":[{"name":"nao_catalogado","value":"CPF_FICTICIO","reason":"falha exata"}]}');
  await captura.responder(400,bytes,true);
  const row=state.tables.btgHttpDiagnosticos[0];
  expect(decifrarDiagnosticoBtg(row.payloadCifrado,aadDiagnosticoBtg(row)).toString()).toBe(body);
  expect(decifrarDiagnosticoBtg(row.respostaCifrada,aadDiagnosticoBtg(row,'resposta'))).toEqual(bytes);
  expect(()=>decifrarDiagnosticoBtg(row.respostaCifrada,aadDiagnosticoBtg(row))).toThrow();
  expect(row.estadoCaptura).toBe('resposta_recebida');expect(row.httpStatus).toBe(400);
  expect(JSON.stringify(state.writes)).not.toContain('01234567890');expect(JSON.stringify(state.writes)).not.toContain('CPF_FICTICIO');
  expect(state.tables.btgCobrancasEmitidas).toEqual(antes); expect(state.locks).toContain('btgCobrancasEmitidas:update');
 });
 it('auditoria indisponível reverte captura e não deixa ID confirmado',async()=>{
  const {db,state}=fixture();state.failAudit=true;const cap=criarCapturaHttpBtg({db,emissaoId:2,usuarioId:3});
  await expect(cap.preparar(body)).rejects.toThrow('evidência protegida');expect(cap.id).toBeNull();expect(state.tables.btgHttpDiagnosticos).toHaveLength(0);
 });
 it('revogação antes de iniciar bloqueia, após iniciar não perde retorno',async()=>{
  const {db,state}=fixture(),cap=criarCapturaHttpBtg({db,emissaoId:2,usuarioId:3});await cap.preparar(body);
  state.tables.users[0].isActive=0; await expect(cap.iniciar()).rejects.toThrow();expect(state.tables.btgHttpDiagnosticos[0].estadoCaptura).toBe('preparado');
  state.tables.users[0].isActive=1;await cap.iniciar();state.tables.users[0].isActive=0;await cap.responder(400,Buffer.from('erro recebido'),true);
  expect(state.tables.btgHttpDiagnosticos[0].httpStatus).toBe(400);
 });
 it('auditoria pósPOST falha preserva preparado/enviando e não inventa resposta',async()=>{
  const {db,state}=fixture(),cap=criarCapturaHttpBtg({db,emissaoId:2,usuarioId:3});await cap.preparar(body);await cap.iniciar();state.failAudit=true;
  await expect(cap.responder(201,Buffer.from('{"collectionId":"X"}'),true)).rejects.toThrow();
  expect(state.tables.btgHttpDiagnosticos[0].estadoCaptura).toBe('enviando');expect(state.tables.btgHttpDiagnosticos[0].respostaCifrada).toBeNull();
 });
 it('registra retorno limitado e transporte sem confirmação distintamente',async()=>{
  const {db,state}=fixture(),cap=criarCapturaHttpBtg({db,emissaoId:2,usuarioId:3});await cap.preparar(body);await cap.iniciar();await cap.responder(400,Buffer.from('prefixo'),false);
  expect(state.tables.btgHttpDiagnosticos[0].estadoCaptura).toBe('resposta_incompleta');expect(state.tables.btgHttpDiagnosticos[0].respostaCompleta).toBe(0);
  const f2=fixture(),c2=criarCapturaHttpBtg({db:f2.db,emissaoId:2,usuarioId:3});await c2.preparar(body);await c2.iniciar();await c2.semResposta();expect(f2.state.tables.btgHttpDiagnosticos[0].estadoCaptura).toBe('sem_resposta');
 });
 it.each(['ator','ambiente','condominio','correlation','documento','external','canonica'])('recusa contexto incompatível: %s',async(caso)=>{
  const {db,state}=fixture();let payload=body;
  if(caso==='ator')state.tables.users[0].role='advogado';if(caso==='ambiente')state.tables.btgIntegracoes[0].ambiente='sandbox';
  if(caso==='condominio')state.tables.acordos[0].condominioId=2;if(caso==='canonica')state.tables.btgCobrancasEmitidas[0].status='incerta';
  if(caso==='correlation')payload=body.replace('btgv2-2','btgv2-3');if(caso==='documento')payload=body.replace('PA20R1','PA21R1');if(caso==='external')payload=body.replace(':20:r1',':21:r1');
  await expect(criarCapturaHttpBtg({db,emissaoId:2,usuarioId:3}).preparar(payload)).rejects.toThrow();expect(state.tables.btgHttpDiagnosticos).toHaveLength(0);
 });
 it('nega segunda captura e resposta repetida',async()=>{
  const {db,state}=fixture(),cap=criarCapturaHttpBtg({db,emissaoId:2,usuarioId:3});await cap.preparar(body);
  await expect(criarCapturaHttpBtg({db,emissaoId:2,usuarioId:3}).preparar(body)).rejects.toThrow();await cap.iniciar();await cap.responder(400,Buffer.from('x'),true);
  await expect(cap.responder(400,Buffer.from('y'),true)).rejects.toThrow();expect(state.tables.btgHttpDiagnosticos).toHaveLength(1);
 });
});

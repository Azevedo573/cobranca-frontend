import { createHash, randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { acordos, auditLogs, btgContasRecebedoras, btgContaRecebedoraCondominios, btgCobrancasEmitidas, btgHttpDiagnosticos, btgIntegracoes, btgRecuperacoes, btgRemessaItens, btgRemessas, devedores, parcelasAcordo, users } from '../../drizzle/schema';
import { bloquearParcelasParaCanal } from '../btg-canais';
import type { BtgTransaction } from './manual-producao';
import { bloquearIntegracaoBtg } from './manual-producao';
import { getBtgV2ServerConfig, validarContaRecebedoraParaAmbiente } from './config';
import { avaliarElegibilidadeCanalParcela } from '../../shared/btg-canais';
import { criarAutorizacaoReenvioBtg, hashContextoEnvioBtg } from './reenvio-autorizacao';
import { emitirBolePixV2, gerarExternalIdBtgV2, gerarIdempotencyKeyBtgV2 } from './issuance';
import { cifrarDiagnosticoBtg, decifrarDiagnosticoBtg } from './diagnosticos-crypto';
import { classificarProvaReenvioBtg } from './reenvio-provas';
import { consultarSituacaoRecuperacaoBtg } from './reenvio-consulta';
import { consolidarResultadoRemessaBtgV2 } from './remessas';

type Db = NonNullable<Awaited<ReturnType<typeof import('../db').getDb>>>;
type Consulta = Awaited<ReturnType<typeof consultarSituacaoRecuperacaoBtg>>;
type Emissao = typeof btgCobrancasEmitidas.$inferSelect;
const TTL = 5 * 60 * 1000;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const erro = (message = 'A análise BTG ficou desatualizada ou indisponível; revise novamente.') => new TRPCError({code:'PRECONDITION_FAILED',message});
const aad = (row: { chaveAnalise: string; emissaoAnteriorId: number; usuarioId: number; btgIntegracaoId: number }) => JSON.stringify(['btg-recuperacao-v1',row.chaveAnalise,row.emissaoAnteriorId,row.usuarioId,row.btgIntegracaoId]);

async function carregar(tx: BtgTransaction, usuarioId: number, parcelaId: number, remessaId?: number) {
  const [ator] = await tx.select().from(users).where(eq(users.id,usuarioId)).limit(1).for('share');
  if (!ator || ator.role !== 'admin' || ator.isActive !== 1 || ator.isDeleted !== 0) throw new TRPCError({code:'FORBIDDEN',message:'Acesso administrativo indisponível.'});
  const config = getBtgV2ServerConfig();
  const integracao = await bloquearIntegracaoBtg(tx,config);
  const [parcelaInicial] = await tx.select().from(parcelasAcordo).where(eq(parcelasAcordo.id,parcelaId)).limit(1);
  if (!parcelaInicial) throw erro();
  const [acordoInicial] = await tx.select().from(acordos).where(eq(acordos.id,parcelaInicial.acordoId)).limit(1);
  if (!acordoInicial) throw erro();
  const [vinculo] = await tx.select({conta:btgContasRecebedoras,ativo:btgContaRecebedoraCondominios.ativo}).from(btgContaRecebedoraCondominios)
    .innerJoin(btgContasRecebedoras,eq(btgContasRecebedoras.id,btgContaRecebedoraCondominios.btgContaRecebedoraId))
    .where(and(eq(btgContaRecebedoraCondominios.btgIntegracaoId,integracao.id),eq(btgContaRecebedoraCondominios.condominioId,acordoInicial.condominioId))).limit(1).for('update');
  if (!vinculo || vinculo.ativo !== 1 || vinculo.conta.ativo !== 1) throw erro('Conta recebedora ou vínculo não disponível.');
  validarContaRecebedoraParaAmbiente({conta:vinculo.conta,integracao,serverConfig:config});
  const [bloqueada] = await bloquearParcelasParaCanal(tx,[parcelaId],acordoInicial.condominioId);
  const parcela = bloqueada.parcela;
  const [acordo] = await tx.select().from(acordos).where(eq(acordos.id,parcela.acordoId)).limit(1);
  if (!acordo) throw erro();
  const [devedor] = await tx.select().from(devedores).where(eq(devedores.id,acordo.devedorId)).limit(1);
  if (!acordo || !devedor || devedor.condominioId !== acordo.condominioId || parcela.acordoId !== acordoInicial.id) throw erro();
  const emissoes = await tx.select().from(btgCobrancasEmitidas).where(and(eq(btgCobrancasEmitidas.origemTipo,'parcela_acordo'),eq(btgCobrancasEmitidas.origemId,parcelaId))).orderBy(desc(btgCobrancasEmitidas.revisao)).for('update');
  if (!emissoes.length || emissoes.some(e=>e.btgIntegracaoId !== integracao.id || e.condominioId !== acordo.condominioId || e.btgContaRecebedoraId !== vinculo.conta.id)) throw erro('Não há uma tentativa inequívoca neste contexto.');
  const emissao = emissoes[0];
  if (emissoes.some((e,i)=>i>0 && e.revisao === emissao.revisao)) throw erro();
  const recuperacoes = await tx.select().from(btgRecuperacoes).where(eq(btgRecuperacoes.parcelaAcordoId,parcelaId));
  const cadeiaValida = emissoes.slice(1).every(e=>recuperacoes.some(r=>r.estado==='consumida' && r.acao==='reenviar' && r.emissaoAnteriorId===e.id && r.novaEmissaoId===emissoes.find(n=>n.revisao===e.revisao+1)?.id && r.btgIntegracaoId===integracao.id));
  const [diagnostico] = await tx.select().from(btgHttpDiagnosticos).where(eq(btgHttpDiagnosticos.btgCobrancaEmitidaId,emissao.id)).limit(1).for('share');
  if (diagnostico && (diagnostico.ambiente!==integracao.ambiente || diagnostico.btgIntegracaoId!==integracao.id || diagnostico.parcelaAcordoId!==parcelaId || diagnostico.condominioId!==acordo.condominioId || diagnostico.btgRemessaId!==emissao.btgRemessaId)) throw erro();
  const remessaEsperada = remessaId ?? emissao.btgRemessaId ?? undefined;
  let item: typeof btgRemessaItens.$inferSelect | null = null;
  if (remessaEsperada !== undefined) {
    const [remessa] = await tx.select().from(btgRemessas).where(eq(btgRemessas.id,remessaEsperada)).limit(1).for('update');
    const [itemAtual] = await tx.select().from(btgRemessaItens).where(and(eq(btgRemessaItens.btgRemessaId,remessaEsperada),eq(btgRemessaItens.parcelaAcordoId,parcelaId))).limit(1).for('update');
    if (!remessa || !itemAtual || emissao.btgRemessaId!==remessa.id || remessa.btgIntegracaoId!==integracao.id || remessa.condominioId!==acordo.condominioId || remessa.btgContaRecebedoraId!==vinculo.conta.id || (itemAtual.btgCobrancaEmitidaId!==null && itemAtual.btgCobrancaEmitidaId!==emissao.id)) throw erro();
    item = itemAtual;
  }
  const contextoHash = hashContextoEnvioBtg({parcela,acordo,devedor,integracao,conta:vinculo.conta});
  return {parcela,acordo,devedor,integracao,conta:vinculo.conta,emissao,diagnostico:diagnostico??null,emissoes,cadeiaValida,item,contextoHash};
}
type Contexto = Awaited<ReturnType<typeof carregar>>;
function contextoPermitido(c: Contexto) {
  const livre = avaliarElegibilidadeCanalParcela({...c.parcela,canalBancario:null,btgEmissaoV2Existente:false},'api_btg_v2');
  const mesmaCondicao = c.parcela.amount===c.emissao.amount && c.parcela.dueDate.getTime()===c.emissao.dueDate.getTime() && c.conta.agencia===c.emissao.agenciaRecebedora && c.conta.numero===c.emissao.contaRecebedora && c.conta.documentoBeneficiario===c.emissao.documentoBeneficiario;
  return mesmaCondicao && c.cadeiaValida && c.acordo.status==='ativo' && c.parcela.canalBancario==='api_btg_v2' && livre.elegivel && ['reservada','incerta','enviando','falha'].includes(c.emissao.status) && (!c.item || c.item.resultado==='falha');
}
function combinar(c: Contexto, consulta: Consulta) {
  const prova = classificarProvaReenvioBtg(c.emissao,c.diagnostico,new Date());
  if (!contextoPermitido(c)) return {acao:'bloqueada' as const,codigo:'contexto_bloqueado',mensagem:'Parcela, canal ou tentativa não disponível para recuperação.',prova};
  if (!consulta.completa) return {acao:'bloqueada' as const,codigo:'consulta_incompleta',mensagem:'Consulta bancária incompleta; nenhum reenvio autorizado.',prova};
  if (consulta.cobrancas.length>1) return {acao:'bloqueada' as const,codigo:'consulta_ambigua',mensagem:'Mais de um resultado bancário; confira a situação sem reenviar.',prova};
  if (consulta.cobrancas.length===1) {
    const remoto = consulta.cobrancas[0];
    const r = remoto as unknown as Record<string,unknown>;
    const coerente = r.correlationId===`btgv2-${c.emissao.id}` && r.valorCentavos===c.emissao.amount && r.dueDate===c.emissao.dueDate.toISOString().slice(0,10) && r.type==='BANKSLIP_QRCODE' && r.agencia===c.emissao.agenciaRecebedora && r.conta===c.emissao.contaRecebedora && r.documentoBeneficiario===c.emissao.documentoBeneficiario && (r.externalId===c.emissao.externalId || r.documentNumber===`PA${c.parcela.id}R${c.emissao.revisao}`) && (!c.emissao.btgCollectionId || r.collectionId===c.emissao.btgCollectionId);
    if (!coerente || !['CREATED','PROCESSING','PAID'].includes(String(r.status))) return {acao:'bloqueada' as const,codigo:'titulo_divergente',mensagem:'Título remoto sem identidade ou contexto completo compatível; não reenviar.',prova};
    return {acao:'recuperar_vinculo' as const,codigo:'titulo_existente',mensagem:'Cobrança localizada e compatível; recuperar vínculo sem novo envio. Pagamento exige conciliação própria.',prova};
  }
  if (c.emissao.btgCollectionId || prova.codigo==='incerta') return {acao:'bloqueada' as const,codigo:'incerta_sem_prova',mensagem:'Cobrança não localizada, mas ausência na lista não prova inexistência; reenvio bloqueado.',prova};
  return {acao:'reenviar' as const,codigo:prova.codigo,mensagem:'Falha comprovada e consulta completa sem título; revise os dados e confirme uma nova tentativa.',prova};
}
async function auditar(tx: BtgTransaction, c: Contexto, usuarioId: number, analiseId: number, evento: string) {
  await tx.insert(auditLogs).values({userId:usuarioId,userRole:'admin',action:'config_change',entity:'configuracao',entityId:`btg-recuperacao:${analiseId}`,condominioId:c.acordo.condominioId,metadata:JSON.stringify({evento,analiseId,parcelaId:c.parcela.id,emissaoId:c.emissao.id}),success:1,severity:'warning',ipAddress:'unknown'});
}
function previa(c: Contexto, row: typeof btgRecuperacoes.$inferSelect, mensagem: string) {
  return {analiseId:row.chaveAnalise,emissaoId:c.emissao.id,revisaoAtual:c.emissao.revisao,acao:row.acao,codigo:row.codigo,mensagem,expiraEm:row.expiraEm,novaRevisao:row.acao==='reenviar'?c.emissao.revisao+1:null,resumo:{parcelaId:c.parcela.id,acordoId:c.acordo.id,installmentNumber:c.parcela.installmentNumber,valorCentavos:c.parcela.amount,vencimento:c.parcela.dueDate,ambiente:c.integracao.ambiente,contaMascara:`Ag. ${c.conta.agencia} · ••••${c.conta.numero.slice(-4)}`}};
}
export async function analisarRecuperacaoBtg(input:{db:Db;usuarioId:number;parcelaId:number;remessaId?:number}) {
  const inicial = await input.db.transaction(tx=>carregar(tx,input.usuarioId,input.parcelaId,input.remessaId));
  const consulta = await consultarSituacaoRecuperacaoBtg({correlationId:`btgv2-${inicial.emissao.id}`,...(inicial.emissao.btgCollectionId?{collectionId:inicial.emissao.btgCollectionId}:{})});
  return input.db.transaction(async tx=>{
    const c = await carregar(tx,input.usuarioId,input.parcelaId,input.remessaId);
    if (c.contextoHash!==inicial.contextoHash || hash(c.emissao)!==hash(inicial.emissao) || hash(c.diagnostico)!==hash(inicial.diagnostico)) throw erro();
    const decisao = combinar(c,consulta);
    const values = {chaveAnalise:randomUUID(),btgIntegracaoId:c.integracao.id,emissaoAnteriorId:c.emissao.id,parcelaAcordoId:c.parcela.id,btgRemessaId:c.emissao.btgRemessaId,condominioId:c.acordo.condominioId,usuarioId:input.usuarioId,diagnosticoId:decisao.prova.diagnosticoId,acao:decisao.acao,codigo:decisao.codigo,estado:'analisada' as const,contextoHash:c.contextoHash,provaHash:decisao.prova.hashProva,consultaHash:hash(consulta),consultaCompleta:consulta.completa?1:0,criadaEm:new Date(),expiraEm:new Date(Date.now()+TTL)};
    await tx.insert(btgRecuperacoes).values({...values,consultaCifrada:cifrarDiagnosticoBtg(Buffer.from(JSON.stringify(consulta)),aad(values))});
    const [row] = await tx.select().from(btgRecuperacoes).where(eq(btgRecuperacoes.chaveAnalise,values.chaveAnalise)).limit(1);
    if (!row) throw erro();
    await auditar(tx,c,input.usuarioId,row.id,'recuperacao_analisada');
    return previa(c,row,decisao.mensagem);
  });
}
async function atualizarRemessa(tx:BtgTransaction,c:Contexto,emissaoId:number,sucesso:boolean,mensagem:string) {
  if (!c.item) return;
  await tx.update(btgRemessaItens).set({btgCobrancaEmitidaId:emissaoId,resultado:sucesso?'emitida':'falha',mensagem,updatedAt:new Date()}).where(eq(btgRemessaItens.id,c.item.id));
  const itens = await tx.select().from(btgRemessaItens).where(eq(btgRemessaItens.btgRemessaId,c.item.btgRemessaId));
  const resumo = consolidarResultadoRemessaBtgV2(itens.map(i=>({resultado:i.resultado==='pendente'?'falha':i.resultado,valorCentavos:i.valorCentavos})));
  await tx.update(btgRemessas).set({...resumo,erroResumo:resumo.totalFalha?'Existem tentativas com falha; consulte o histórico de cada item.':null,updatedAt:new Date()}).where(eq(btgRemessas.id,c.item.btgRemessaId));
}
export async function confirmarRecuperacaoBtg(input:{db:Db;usuarioId:number;analiseId:string;confirmacao:'REENVIAR PARCELA BTG'|'RECUPERAR VINCULO BTG';ciente:true}) {
  const [inicial] = await input.db.select().from(btgRecuperacoes).where(eq(btgRecuperacoes.chaveAnalise,input.analiseId)).limit(1);
  if (!inicial || inicial.usuarioId!==input.usuarioId || inicial.estado!=='analisada' || inicial.acao==='bloqueada' || inicial.expiraEm.getTime()<=Date.now()) throw erro();
  // Autorizar antes do GET; resposta não é prova sem identidade/contexto fresco.
  await input.db.transaction(tx=>carregar(tx,input.usuarioId,inicial.parcelaAcordoId,inicial.btgRemessaId??undefined));
  const consulta = await consultarSituacaoRecuperacaoBtg({correlationId:`btgv2-${inicial.emissaoAnteriorId}`});
  const reservado = await input.db.transaction(async tx=>{
    const c = await carregar(tx,input.usuarioId,inicial.parcelaAcordoId,inicial.btgRemessaId??undefined);
    const [analise] = await tx.select().from(btgRecuperacoes).where(eq(btgRecuperacoes.id,inicial.id)).limit(1).for('update');
    const decisao = combinar(c,consulta);
    if (!analise || analise.estado!=='analisada' || analise.usuarioId!==input.usuarioId || analise.expiraEm.getTime()<=Date.now() || analise.emissaoAnteriorId!==c.emissao.id || analise.btgIntegracaoId!==c.integracao.id || analise.condominioId!==c.acordo.condominioId || analise.contextoHash!==c.contextoHash || analise.provaHash!==decisao.prova.hashProva || analise.acao!==decisao.acao || decisao.acao==='bloqueada') throw erro();
    const consultaAnterior = JSON.parse(decifrarDiagnosticoBtg(analise.consultaCifrada,aad(analise)).toString()) as Consulta;
    if (hash(consultaAnterior)!==analise.consultaHash || consultaAnterior.completa!==true || input.ciente!==true || input.confirmacao!==(decisao.acao==='reenviar'?'REENVIAR PARCELA BTG':'RECUPERAR VINCULO BTG')) throw erro();
    if (decisao.acao==='recuperar_vinculo') {
      if (hash(consulta)!==analise.consultaHash) throw erro();
      const remoto = consulta.cobrancas[0] as unknown as Record<string,unknown>;
      await tx.update(btgCobrancasEmitidas).set({btgCollectionId:String(remoto.collectionId),status:'emitida',erroCodigo:remoto.status==='PAID'?'PAGAMENTO_REQUER_CONCILIACAO':null,emitidaEm:new Date(),updatedAt:new Date()}).where(eq(btgCobrancasEmitidas.id,c.emissao.id));
      await tx.update(btgRecuperacoes).set({estado:'consumida',consumidaEm:new Date()}).where(eq(btgRecuperacoes.id,analise.id));
      await atualizarRemessa(tx,c,c.emissao.id,true,'Vínculo bancário recuperado sem nova emissão; confira a conciliação.');
      await auditar(tx,c,input.usuarioId,analise.id,'vinculo_recuperado_sem_post');
      return {c,analise,emissao:c.emissao,cap:null};
    }
    if (c.integracao.emissaoHabilitada!==1 || c.parcela.amount!==c.emissao.amount || c.parcela.dueDate.getTime()!==c.emissao.dueDate.getTime()) throw erro('Valor ou vencimento divergente da tentativa anterior; reenvio não altera condições financeiras.');
    const revisao = c.emissao.revisao+1;
    const externalId = gerarExternalIdBtgV2(c.integracao.ambiente,'parcela_acordo',c.parcela.id,revisao);
    await tx.insert(btgCobrancasEmitidas).values({btgIntegracaoId:c.integracao.id,btgContaRecebedoraId:c.conta.id,btgRemessaId:c.emissao.btgRemessaId,condominioId:c.acordo.condominioId,origemTipo:'parcela_acordo',origemId:c.parcela.id,revisao,instrumento:'bolepix',externalId,idempotencyKey:gerarIdempotencyKeyBtgV2(externalId),status:'reservada',amount:c.parcela.amount,dueDate:c.parcela.dueDate,agenciaRecebedora:c.conta.agencia,contaRecebedora:c.conta.numero,documentoBeneficiario:c.conta.documentoBeneficiario,nomeBeneficiario:c.conta.nomeBeneficiario,createdAt:new Date(),updatedAt:new Date()});
    const [nova] = await tx.select().from(btgCobrancasEmitidas).where(and(eq(btgCobrancasEmitidas.origemId,c.parcela.id),eq(btgCobrancasEmitidas.btgIntegracaoId,c.integracao.id),eq(btgCobrancasEmitidas.revisao,revisao))).limit(1);
    if (!nova) throw erro();
    await tx.update(btgRecuperacoes).set({novaEmissaoId:nova.id,estado:'consumida',consumidaEm:new Date()}).where(eq(btgRecuperacoes.id,analise.id));
    await atualizarRemessa(tx,c,nova.id,false,'Nova tentativa autorizada e reservada; histórico anterior preservado.');
    await auditar(tx,c,input.usuarioId,analise.id,'nova_revisao_autorizada');
    return {c,analise,emissao:nova,cap:criarAutorizacaoReenvioBtg({emissaoId:nova.id,emissaoAnteriorId:c.emissao.id,analiseId:analise.id,revisao,parcelaId:c.parcela.id,usuarioId:input.usuarioId,contextoHash:c.contextoHash})};
  });
  if (!reservado.cap) return {acao:'recuperar_vinculo',emissaoId:reservado.emissao.id,status:'emitida',mensagem:'Vínculo recuperado sem nova cobrança. Confira eventual pagamento pela conciliação.'};
  let status = 'incerta';
  let sucesso = false;
  try {
    const resultado = await emitirBolePixV2({db:input.db,parcelaId:reservado.c.parcela.id,usuarioId:input.usuarioId,recuperacao:reservado.cap});
    status = resultado.status; sucesso = ['emitida','paga'].includes(status);
  } catch { /* Preservar canônica e captura; nunca repetir automaticamente. */ }
  await input.db.transaction(async tx=>{
    const c = await carregar(tx,input.usuarioId,reservado.c.parcela.id,reservado.c.emissao.btgRemessaId??undefined);
    if (c.emissao.id!==reservado.emissao.id) throw erro();
    status = c.emissao.status;
    sucesso = ['emitida','paga'].includes(status);
    await atualizarRemessa(tx,c,c.emissao.id,sucesso,sucesso?'Nova tentativa confirmada pelo BTG.':'Tentativa sem sucesso confirmado; consulte o diagnóstico antes de outra ação.');
    await auditar(tx,c,input.usuarioId,reservado.analise.id,'resultado_reenvio_registrado');
  });
  return {acao:'reenviar',emissaoId:reservado.emissao.id,status,mensagem:sucesso?'Nova tentativa confirmada pelo BTG.':'Tentativa sem confirmação de sucesso; vínculo e histórico preservados, sem repetição automática.'};
}

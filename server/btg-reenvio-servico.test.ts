import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarDbCanaisEmMemoria } from './btg-canais-test-db';
const fake = vi.hoisted(()=>({ consulta:vi.fn(),emissor:vi.fn() }));
vi.mock('./btg-v2/reenvio-consulta',()=>({consultarSituacaoRecuperacaoBtg:fake.consulta}));
vi.mock('./btg-v2/issuance',async importOriginal=>({...(await importOriginal<any>()),emitirBolePixV2:fake.emissor}));
import { analisarRecuperacaoBtg, confirmarRecuperacaoBtg } from './btg-v2/reenvio';
import { consumirAutorizacaoReenvioBtg, criarAutorizacaoReenvioBtg } from './btg-v2/reenvio-autorizacao';
const datas = {createdAt:new Date('2026-11-09T12:01:00Z'),updatedAt:new Date('2026-11-09T12:01:02Z')};
const estado = () => ({
  users:[{id:1,role:'admin',isActive:1,isDeleted:0}],
  btgIntegracoes:[{id:1,ambiente:'sandbox',companyId:'30306294000145',ativo:1,emissaoHabilitada:1,diasLimitePagamento:30,instrucoes:null,...datas}],
  btgContasRecebedoras:[{id:1,btgIntegracaoId:1,accountId:'api-conta',agencia:'50',numero:'1234',documentoBeneficiario:'11222333000181',nomeBeneficiario:'Escritório fictício',ativo:1,origemCadastro:'api',ambiente:'sandbox',...datas}],
  btgContaRecebedoraCondominios:[{id:1,btgIntegracaoId:1,btgContaRecebedoraId:1,condominioId:1,ativo:1}],
  acordos:[{id:1,condominioId:1,devedorId:1,status:'ativo',...datas}],
  parcelasAcordo:[{id:10,acordoId:1,installmentNumber:1,amount:1234,dueDate:new Date('2026-12-09T12:00:00Z'),status:'pendente',nossoNumero:'1000000018',nossoNumeroOrigem:'reserva_local',canalBancario:'api_btg_v2',remessaId:null,statusRemessa:'nao_enviado',btgCollectionId:null,btgQrCodePix:null,btgCodigoBarras:null,btgLinhaDigitavel:null,...datas}],
  devedores:[{id:1,condominioId:1,name:'Pagador fictício',cpfCnpj:'52998224725',email:'ficticio@example.test',address:'Rua de teste',...datas}],
  btgCobrancasEmitidas:[{id:20,btgIntegracaoId:1,btgContaRecebedoraId:1,btgRemessaId:2,condominioId:1,origemTipo:'parcela_acordo',origemId:10,revisao:1,instrumento:'bolepix',externalId:'v2:sbx:parcela_acordo:10:r1',idempotencyKey:'hash-ficticio',status:'reservada',amount:1234,dueDate:new Date('2026-12-09T12:00:00Z'),agenciaRecebedora:'50',contaRecebedora:'1234',documentoBeneficiario:'11222333000181',nomeBeneficiario:'Escritório fictício',btgCollectionId:null,emitidaEm:null,erroCodigo:'FALHA_ANTES_POST_COMPROVADA',falhaAntesEnvioEm:new Date('2026-11-09T12:01:01Z'),...datas}],
  btgRemessas:[{id:2,btgIntegracaoId:1,btgContaRecebedoraId:1,condominioId:1,status:'falha',totalSelecionado:2,totalEmitido:1,totalFalha:1,...datas}],
  btgRemessaItens:[{id:31,btgRemessaId:2,parcelaAcordoId:10,btgCobrancaEmitidaId:20,installmentNumber:1,valorCentavos:1234,resultado:'falha',mensagem:'Falha antiga',...datas},{id:32,btgRemessaId:2,parcelaAcordoId:11,btgCobrancaEmitidaId:21,installmentNumber:2,valorCentavos:500,resultado:'emitida',mensagem:'Sucesso antigo',...datas}],
  btgRecuperacoes:[],btgHttpDiagnosticos:[],auditLogs:[],
});
const consultaVazia = {completa:true,motivo:'NAO_LOCALIZADA_SEM_PROVA_DE_AUSENCIA',cobrancas:[]};
beforeEach(()=>{
  vi.useRealTimers();
  vi.stubEnv('BTG_SANDBOX','true');vi.stubEnv('BTG_COMPANY_ID','11222333000181');vi.stubEnv('BTG_TOKEN_ENCRYPTION_KEY',Buffer.alloc(32,7).toString('base64'));
  fake.consulta.mockReset().mockResolvedValue(consultaVazia);fake.emissor.mockReset();
});
describe('análise administrativa e prova bancária',()=>{
  it('legado incerto continua bloqueado mesmo com lista vazia; não altera tentativa nem canal',async()=>{
    const {db,state}=criarDbCanaisEmMemoria(estado());
    const anterior=state.tables.btgCobrancasEmitidas[0];anterior.status='incerta';anterior.erroCodigo='EMISSAO_SEM_CONFIRMACAO';anterior.falhaAntesEnvioEm=null;
    const snapshot=structuredClone(anterior);
    const r=await analisarRecuperacaoBtg({db,usuarioId:1,parcelaId:10,remessaId:2});
    expect(r.acao).toBe('bloqueada');expect(r.codigo).toBe('incerta_sem_prova');expect(anterior).toEqual(snapshot);expect(fake.emissor).not.toHaveBeenCalled();
    expect(state.tables.auditLogs).toHaveLength(1);
  });
  it('prova local nova e lista completa permitem prévia, não POST, e consulta é cifrada',async()=>{
    const {db,state}=criarDbCanaisEmMemoria(estado());
    const r=await analisarRecuperacaoBtg({db,usuarioId:1,parcelaId:10,remessaId:2});
    expect(r.acao).toBe('reenviar');expect(r.novaRevisao).toBe(2);expect(fake.emissor).not.toHaveBeenCalled();
    expect(state.tables.btgRecuperacoes[0].consultaCifrada).toMatch(/^v1:/);
    expect(JSON.stringify(state.tables.auditLogs)).not.toMatch(/52998224725|1234|ficticio@example/);
    expect(JSON.stringify(r)).not.toMatch(/52998224725|ficticio@example/);
  });
  it.each(['consulta incompleta','timeout','título divergente'])('bloqueia %s',async(tipo)=>{
    const {db}=criarDbCanaisEmMemoria(estado());
    fake.consulta.mockResolvedValue(tipo==='título divergente'?{completa:true,motivo:'CONSULTA_COMPLETA',cobrancas:[{collectionId:'id-remoto',correlationId:'outro'}]}:{completa:false,motivo:'PRAZO_EXCEDIDO',cobrancas:[]});
    expect((await analisarRecuperacaoBtg({db,usuarioId:1,parcelaId:10})).acao).toBe('bloqueada');
  });
  it.each(['role','isActive','isDeleted'])('revogação fresca %s bloqueia antes do GET',async(campo)=>{
    const {db,state}=criarDbCanaisEmMemoria(estado());state.tables.users[0][campo]=campo==='role'?'colaborador':campo==='isActive'?0:1;
    await expect(analisarRecuperacaoBtg({db,usuarioId:1,parcelaId:10})).rejects.toMatchObject({code:'FORBIDDEN'});expect(fake.consulta).not.toHaveBeenCalled();
  });
  it('mudança durante GET invalida análise sem gravar decisão',async()=>{
    const {db,state}=criarDbCanaisEmMemoria(estado());fake.consulta.mockImplementation(async()=>{state.tables.parcelasAcordo[0].amount=900;return consultaVazia;});
    await expect(analisarRecuperacaoBtg({db,usuarioId:1,parcelaId:10})).rejects.toMatchObject({code:'PRECONDITION_FAILED'});expect(state.tables.btgRecuperacoes).toHaveLength(0);
  });
});
describe('confirmação e reserva auditada',()=>{
  it('cria apenasR2, preservaR1 e sucesso de outra parcela, capacidade interna usoúnico',async()=>{
    const {db,state}=criarDbCanaisEmMemoria(estado());const old=structuredClone(state.tables.btgCobrancasEmitidas[0]);
    const r=await analisarRecuperacaoBtg({db,usuarioId:1,parcelaId:10});
    fake.emissor.mockImplementation(async(input)=>{
      const cap=consumirAutorizacaoReenvioBtg(input.recuperacao);expect(cap?.revisao).toBe(2);expect(consumirAutorizacaoReenvioBtg(input.recuperacao)).toBeNull();
      const nova=state.tables.btgCobrancasEmitidas.find(e=>e.revisao===2)!;nova.status='emitida';return {id:nova.id,status:'emitida',jaExistia:false};
    });
    const result=await confirmarRecuperacaoBtg({db,usuarioId:1,analiseId:r.analiseId,confirmacao:'REENVIAR PARCELA BTG',ciente:true});
    expect(result.status).toBe('emitida');expect(state.tables.btgCobrancasEmitidas[0]).toEqual(old);expect(state.tables.btgCobrancasEmitidas).toHaveLength(2);expect(fake.emissor).toHaveBeenCalledTimes(1);expect(state.tables.btgRemessaItens[1].mensagem).toBe('Sucesso antigo');expect(state.tables.btgRecuperacoes[0].estado).toBe('consumida');
    await expect(confirmarRecuperacaoBtg({db,usuarioId:1,analiseId:r.analiseId,confirmacao:'REENVIAR PARCELA BTG',ciente:true})).rejects.toMatchObject({code:'PRECONDITION_FAILED'});expect(fake.emissor).toHaveBeenCalledTimes(1);
  });
  it('auditoria falha impede reserva e POST',async()=>{
    const {db,state}=criarDbCanaisEmMemoria(estado());const r=await analisarRecuperacaoBtg({db,usuarioId:1,parcelaId:10});state.failAudit=true;
    await expect(confirmarRecuperacaoBtg({db,usuarioId:1,analiseId:r.analiseId,confirmacao:'REENVIAR PARCELA BTG',ciente:true})).rejects.toThrow();expect(state.tables.btgCobrancasEmitidas).toHaveLength(1);expect(state.tables.btgRecuperacoes[0].estado).toBe('analisada');expect(fake.emissor).not.toHaveBeenCalled();
  });
  it.each(['amount','dueDate','address','conta','acao','consulta'])('mudança %s após prévia impede envio',async(campo)=>{
    const {db,state}=criarDbCanaisEmMemoria(estado());const r=await analisarRecuperacaoBtg({db,usuarioId:1,parcelaId:10});
    if(campo==='amount')state.tables.parcelasAcordo[0].amount=999;
    if(campo==='dueDate')state.tables.parcelasAcordo[0].dueDate=new Date('2027-01-01');
    if(campo==='address')state.tables.devedores[0].address='Outro cadastro';
    if(campo==='conta')state.tables.btgContasRecebedoras[0].numero='outro';
    if(campo==='acao')state.tables.btgRecuperacoes[0].acao='recuperar_vinculo';
    if(campo==='consulta')state.tables.btgRecuperacoes[0].consultaCifrada='cifra adulterada';
    await expect(confirmarRecuperacaoBtg({db,usuarioId:1,analiseId:r.analiseId,confirmacao:'REENVIAR PARCELA BTG',ciente:true})).rejects.toThrow();expect(fake.emissor).not.toHaveBeenCalled();
  });
  it('duas confirmações concorrentes reservam só uma revisão',async()=>{
    const {db,state}=criarDbCanaisEmMemoria(estado());const r=await analisarRecuperacaoBtg({db,usuarioId:1,parcelaId:10});fake.emissor.mockResolvedValue({status:'incerta',jaExistia:false});
    const input={db,usuarioId:1,analiseId:r.analiseId,confirmacao:'REENVIAR PARCELA BTG' as const,ciente:true as const};
    const results=await Promise.allSettled([confirmarRecuperacaoBtg(input),confirmarRecuperacaoBtg(input)]);
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(state.tables.btgCobrancasEmitidas).toHaveLength(2);expect(fake.emissor).toHaveBeenCalledTimes(1);
  });
  it('prévia expirada ou outro ator bloqueiam',async()=>{
    const {db,state}=criarDbCanaisEmMemoria(estado());const r=await analisarRecuperacaoBtg({db,usuarioId:1,parcelaId:10});state.tables.btgRecuperacoes[0].expiraEm=new Date(0);
    await expect(confirmarRecuperacaoBtg({db,usuarioId:1,analiseId:r.analiseId,confirmacao:'REENVIAR PARCELA BTG',ciente:true})).rejects.toThrow();expect(fake.emissor).not.toHaveBeenCalled();
  });
});

describe('vínculo remoto sem criar cobrança',()=>{
  const titulo=(status='CREATED')=>({collectionId:'titulo-real-ficticio',status,correlationId:'btgv2-20',documentNumber:'PA10R1',valorCentavos:1234,dueDate:'2026-12-09',type:'BANKSLIP_QRCODE',agencia:'50',conta:'1234',documentoBeneficiario:'11222333000181'});
  it.each(['CREATED','PROCESSING','PAID'])('recupera %s sem POST/baixa de parcela nem acordo',async(status)=>{
    const {db,state}=criarDbCanaisEmMemoria(estado());state.tables.btgCobrancasEmitidas[0].status='incerta';state.tables.btgCobrancasEmitidas[0].falhaAntesEnvioEm=null;
    fake.consulta.mockResolvedValue({completa:true,motivo:'CONSULTA_COMPLETA',cobrancas:[titulo(status)]});
    const r=await analisarRecuperacaoBtg({db,usuarioId:1,parcelaId:10});expect(r.acao).toBe('recuperar_vinculo');
    const result=await confirmarRecuperacaoBtg({db,usuarioId:1,analiseId:r.analiseId,confirmacao:'RECUPERAR VINCULO BTG',ciente:true});
    expect(result.acao).toBe('recuperar_vinculo');expect(fake.emissor).not.toHaveBeenCalled();expect(state.tables.btgCobrancasEmitidas).toHaveLength(1);expect(state.tables.btgCobrancasEmitidas[0].btgCollectionId).toBe('titulo-real-ficticio');expect(state.tables.parcelasAcordo[0].status).toBe('pendente');expect(state.tables.acordos[0].status).toBe('ativo');
    if(status==='PAID')expect(state.tables.btgCobrancasEmitidas[0].erroCodigo).toBe('PAGAMENTO_REQUER_CONCILIACAO');
  });
  it.each(['valorCentavos','agencia','conta','documentoBeneficiario','correlationId','type','documentNumber','dueDate'])('campo %s ausente impede vínculo',async(campo)=>{
    const {db}=criarDbCanaisEmMemoria(estado());const remoto:any=titulo();delete remoto[campo];fake.consulta.mockResolvedValue({completa:true,motivo:'CONSULTA_COMPLETA',cobrancas:[remoto]});
    expect((await analisarRecuperacaoBtg({db,usuarioId:1,parcelaId:10})).acao).toBe('bloqueada');expect(fake.emissor).not.toHaveBeenCalled();
  });
  it('título aparece entre prévia vazia e confirmação: não reenvia',async()=>{
    const {db}=criarDbCanaisEmMemoria(estado());const r=await analisarRecuperacaoBtg({db,usuarioId:1,parcelaId:10});fake.consulta.mockResolvedValue({completa:true,motivo:'CONSULTA_COMPLETA',cobrancas:[titulo()]});
    await expect(confirmarRecuperacaoBtg({db,usuarioId:1,analiseId:r.analiseId,confirmacao:'REENVIAR PARCELA BTG',ciente:true})).rejects.toThrow();expect(fake.emissor).not.toHaveBeenCalled();
  });
  it('outra tentativa sem cadeia válida ou outro canal não são ignorados',async()=>{
    const {db,state}=criarDbCanaisEmMemoria(estado());state.tables.btgCobrancasEmitidas.push({...state.tables.btgCobrancasEmitidas[0],id:19,revisao:0,status:'incerta'});
    expect((await analisarRecuperacaoBtg({db,usuarioId:1,parcelaId:10})).acao).toBe('bloqueada');
  });
  it('item legado sem vínculo resolve a canônica por parcela, nunca ID do item',async()=>{
    const {db,state}=criarDbCanaisEmMemoria(estado());state.tables.btgRemessaItens[0].btgCobrancaEmitidaId=null;
    const r=await analisarRecuperacaoBtg({db,usuarioId:1,parcelaId:10,remessaId:2});expect(r.emissaoId).toBe(20);expect(r.acao).toBe('reenviar');expect(fake.emissor).not.toHaveBeenCalled();
  });
});

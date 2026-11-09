import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarDbCanaisEmMemoria } from './btg-canais-test-db';
import { carregarTituloBtg, carregarTituloPorEmissaoBtg, situacaoDocumentoTituloBtg, validarCadeiaTituloBtg, type EmissaoTituloBtg, type ParcelaTituloBtg } from './btg-v2/titulo-contexto';

const e = (values: Partial<EmissaoTituloBtg> = {}) => ({id:40,btgIntegracaoId:1,btgContaRecebedoraId:2,btgRemessaId:null,condominioId:3,origemTipo:'parcela_acordo',origemId:10,revisao:1,status:'emitida',instrumento:'bolepix',amount:5600,dueDate:new Date('2026-11-15T00:00:00Z'),agenciaRecebedora:'50',contaRecebedora:'123456',documentoBeneficiario:'11111111111111',btgCollectionId:'col-40',erroCodigo:null,codigoBarras:'000',linhaDigitavel:'000',...values} as EmissaoTituloBtg);
const p = (values: Partial<ParcelaTituloBtg> = {}) => ({id:10,acordoId:4,installmentNumber:1,status:'pendente',amount:5600,dueDate:new Date('2026-11-15T00:00:00Z'),canalBancario:'api_btg_v2',...values} as ParcelaTituloBtg);
function fixture() { return criarDbCanaisEmMemoria({users:[{id:5,role:'admin',isActive:1,isDeleted:0}],parcelasAcordo:[p()],acordos:[{id:4,devedorId:6,condominioId:3,status:'ativo'}],devedores:[{id:6,condominioId:3}],condominios:[{id:3}],btgCobrancasEmitidas:[e()],btgIntegracoes:[{id:1,ambiente:'sandbox',ativo:1}],btgContasRecebedoras:[{id:2,btgIntegracaoId:1,agencia:'50',numero:'123456',documentoBeneficiario:'11111111111111'}],btgRecuperacoes:[]}); }
const antigo = process.env.BTG_SANDBOX;
beforeEach(()=>{process.env.BTG_SANDBOX='true';});
afterEach(()=>{if(antigo===undefined)delete process.env.BTG_SANDBOX;else process.env.BTG_SANDBOX=antigo;});

describe('fonte canônica documental BTG',()=>{
  it('localiza emissão sem limitar últimos registros e sem gravação',async()=>{const {db,state}=fixture();state.tables.btgCobrancasEmitidas.push(e({id:55,origemId:999}));const c=await carregarTituloBtg(db,5,10);expect(c.emissao?.id).toBe(40);expect(c.identidadeValida).toBe(true);expect(state.writes).toHaveLength(0);});
  it.each([{role:'colaborador'},{isActive:0},{isDeleted:1}])('recusa ator revogado %j',async patch=>{const {db,state}=fixture();Object.assign(state.tables.users[0],patch);await expect(carregarTituloBtg(db,5,10)).rejects.toMatchObject({code:'FORBIDDEN'});});
  it('recusa sessão não existente',async()=>{const {db}=fixture();await expect(carregarTituloBtg(db,999,10)).rejects.toMatchObject({code:'FORBIDDEN'});});
  it('recusa parcela inexistente',async()=>{const {db}=fixture();await expect(carregarTituloBtg(db,5,999)).rejects.toThrow();});
  it('bloqueia devedor de outro condomínio',async()=>{const {db,state}=fixture();state.tables.devedores[0].condominioId=99;await expect(carregarTituloBtg(db,5,10)).rejects.toThrow();});
  it.each(['condominioId','btgIntegracaoId','btgContaRecebedoraId'])('não habilita contexto divergente %s',async campo=>{const {db,state}=fixture();state.tables.btgCobrancasEmitidas[0][campo]=99;const c=await carregarTituloBtg(db,5,10);expect(c.identidadeValida).toBe(false);expect(c.situacao.pagamentoPermitido).toBe(false);});
  it('bloqueia outro ambiente',async()=>{const {db,state}=fixture();state.tables.btgIntegracoes[0].ambiente='producao';expect((await carregarTituloBtg(db,5,10)).identidadeValida).toBe(false);});
  it('recusa ID da revisão anterior',async()=>{const {db,state}=fixture();state.tables.btgCobrancasEmitidas.push(e({id:41,revisao:2}));state.tables.btgRecuperacoes.push({estado:'consumida',acao:'reenviar',emissaoAnteriorId:40,novaEmissaoId:41,btgIntegracaoId:1,parcelaAcordoId:10});await expect(carregarTituloPorEmissaoBtg(db,5,40)).rejects.toThrow();expect((await carregarTituloBtg(db,5,10)).emissao?.id).toBe(41);});
  it('cadeia exige evidência e não aceita duplicidade',()=>{expect(validarCadeiaTituloBtg([e(),e({id:41,revisao:2})],[])).toBe(false);expect(validarCadeiaTituloBtg([e(),e({id:41})],[])).toBe(false);});
  it.each(['paga','cancelada','expirada','incerta','enviando','reservada','falha'] as const)('não disponibiliza emissão %s',status=>{expect(situacaoDocumentoTituloBtg({parcela:p(),emissao:e({status}),identidadeValida:true}).pagamentoPermitido).toBe(false);});
  it.each(['pago','cancelado'] as const)('não disponibiliza parcela %s',status=>{expect(situacaoDocumentoTituloBtg({parcela:p({status}),emissao:e(),identidadeValida:true}).pagamentoPermitido).toBe(false);});
  it('não disponibiliza resultado pagamento pendente de conciliação',()=>{expect(situacaoDocumentoTituloBtg({parcela:p(),emissao:e({erroCodigo:'PAGAMENTO_REQUER_CONCILIACAO'}),identidadeValida:true}).pagamentoPermitido).toBe(false);});
  it('bloqueia valor/data divergentes',()=>{expect(situacaoDocumentoTituloBtg({parcela:p(),emissao:e({amount:999}),identidadeValida:true}).codigo).toBe('divergente');expect(situacaoDocumentoTituloBtg({parcela:p(),emissao:e({dueDate:new Date('2026-11-16Z')}),identidadeValida:true}).codigo).toBe('divergente');});
  it.each(['solicitada','em_confirmacao','conflito_pagamento'])('bloqueia operação %s',estado=>{expect(situacaoDocumentoTituloBtg({parcela:p(),emissao:e(),identidadeValida:true,operacoes:[{estado}]}).pagamentoPermitido).toBe(false);});
  it('ausência de códigos não cria campos',()=>{const r=situacaoDocumentoTituloBtg({parcela:p(),emissao:e({codigoBarras:null,linhaDigitavel:null}),identidadeValida:true});expect(r.codigo).toBe('dados_pendentes');});
});

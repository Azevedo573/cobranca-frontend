import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { snapshotDoPedidoBtg,cifrarSnapshotBoletoBtg,decifrarSnapshotBoletoBtg,hashBoletoBtg } from './btg-v2/boleto-snapshot-dominio';
import type { EmissaoTituloBtg } from './btg-v2/titulo-contexto';

const emissao={id:42,revisao:1,origemId:21,btgIntegracaoId:1,condominioId:2,externalId:'v2:sbx:parcela_acordo:21:r1',amount:5610,dueDate:new Date('2026-11-09T00:00:00Z'),agenciaRecebedora:'50',contaRecebedora:'00123456',nomeBeneficiario:'Beneficiário Fictício',documentoBeneficiario:'11111111111111'} as EmissaoTituloBtg;
function pedido(){return {amount:56.1,type:'BANKSLIP_QRCODE',dueDate:'2026-11-09',account:{branch:'50',number:'00123456'},detail:{documentNumber:'PA21R1',externalId:emissao.externalId,correlationId:'btgv2-42'},payer:{name:'Pessoa Fictícia',taxId:'12345678901',email:'nao-incluir@example.com',phoneNumber:'+552130001234',address:{street:'Rua Exemplo',number:'8',complement:'Sala 2',neighborhood:'Centro',city:'Rio de Janeiro',state:'RJ',zipCode:'20011020'}}};}
const chaveAnterior=process.env.BTG_TOKEN_ENCRYPTION_KEY;
beforeEach(()=>{process.env.BTG_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,17).toString('base64');});
afterEach(()=>{if(chaveAnterior===undefined)delete process.env.BTG_TOKEN_ENCRYPTION_KEY;else process.env.BTG_TOKEN_ENCRYPTION_KEY=chaveAnterior;});
describe('snapshot documental mínimo BTG',()=>{
  it('preserva endereço do pedido sem email/telefone nem outro cadastro',()=>{const s=snapshotDoPedidoBtg(JSON.stringify(pedido()),emissao);expect(s.pagador.nome).toBe('Pessoa Fictícia');expect(s.pagador.endereco.complemento).toBe('Sala 2');expect(JSON.stringify(s)).not.toContain('nao-incluir');expect(JSON.stringify(s)).not.toContain('+5521');});
  it('cifra e autentica conteúdo/contexto/hash',()=>{const s=snapshotDoPedidoBtg(JSON.stringify(pedido()),emissao);const cifra=cifrarSnapshotBoletoBtg(s,emissao);const hash=hashBoletoBtg(JSON.stringify(s));expect(cifra).not.toContain('Pessoa');expect(decifrarSnapshotBoletoBtg(cifra,hash,emissao)).toEqual(s);expect(()=>decifrarSnapshotBoletoBtg(cifra,'0'.repeat(64),emissao)).toThrow();expect(()=>decifrarSnapshotBoletoBtg(cifra,hash,{...emissao,id:43})).toThrow();});
  it.each(['amount','dueDate','type'])('recusa pedido divergente %s',key=>{const p=pedido();Object.assign(p,{[key]:'outro'});expect(()=>snapshotDoPedidoBtg(JSON.stringify(p),emissao)).toThrow();});
  it.each(['documentNumber','externalId','correlationId'])('recusa identidade divergente %s',key=>{const p=pedido();Object.assign(p.detail,{[key]:'outro'});expect(()=>snapshotDoPedidoBtg(JSON.stringify(p),emissao)).toThrow();});
  it('recusa ausência de endereço ou beneficiário sem inventar dados',()=>{const p=pedido();Object.assign(p.payer,{address:null});expect(()=>snapshotDoPedidoBtg(JSON.stringify(p),emissao)).toThrow();expect(()=>snapshotDoPedidoBtg(JSON.stringify(pedido()),{...emissao,nomeBeneficiario:null})).toThrow();});
  it('não normaliza número de conta truncando zeros',()=>{const p=pedido();p.account.number='123456';expect(()=>snapshotDoPedidoBtg(JSON.stringify(p),emissao)).toThrow();});
});

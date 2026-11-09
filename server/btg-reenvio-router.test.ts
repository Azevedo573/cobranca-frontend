import {beforeEach,describe,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({analisar:vi.fn(),confirmar:vi.fn(),getDb:vi.fn()}));
vi.mock('./db',()=>({getDb:f.getDb}));vi.mock('./btg-v2/reenvio',()=>({analisarRecuperacaoBtg:f.analisar,confirmarRecuperacaoBtg:f.confirmar}));
import {btgRecuperacaoRouter} from './routers/btg-recuperacao';
const ctx=(role='admin')=>({user:{id:1,role},req:{headers:{}},res:{}} as any);
beforeEach(()=>{f.getDb.mockReset().mockResolvedValue({db:'ficticio'});f.analisar.mockReset().mockResolvedValue({acao:'bloqueada'});f.confirmar.mockReset().mockResolvedValue({status:'incerta'});});
describe('btgRecuperacao router',()=>{
  it.each(['advogado','colaborador','sindico','user'])('não autoriza role %s nem carrega banco',async(role)=>{
    await expect(btgRecuperacaoRouter.createCaller(ctx(role)).analisar({parcelaId:1})).rejects.toMatchObject({code:'FORBIDDEN'});expect(f.getDb).not.toHaveBeenCalled();
  });
  it('sessão ausente bloqueada',async()=>{await expect(btgRecuperacaoRouter.createCaller({...ctx(),user:null}).analisar({parcelaId:1})).rejects.toMatchObject({code:'FORBIDDEN'});expect(f.getDb).not.toHaveBeenCalled();});
  it('análise recebe ator por sessão e não por input arbitrário',async()=>{await btgRecuperacaoRouter.createCaller(ctx()).analisar({parcelaId:10,remessaId:2});expect(f.analisar).toHaveBeenCalledWith({db:{db:'ficticio'},usuarioId:1,parcelaId:10,remessaId:2});expect(f.confirmar).not.toHaveBeenCalled();});
  it.each([{analiseId:'invalid',confirmacao:'REENVIAR PARCELA BTG',ciente:true},{analiseId:'e4d3f747-1b11-442a-bafe-b01d3b9d4f1b',confirmacao:'sim',ciente:true},{analiseId:'e4d3f747-1b11-442a-bafe-b01d3b9d4f1b',confirmacao:'REENVIAR PARCELA BTG',ciente:false}])('recusa confirmação inválida antes do service',async(input)=>{await expect(btgRecuperacaoRouter.createCaller(ctx()).confirmar(input as any)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(f.confirmar).not.toHaveBeenCalled();});
  it('não revela raw SQL, conta ou token em erro',async()=>{f.analisar.mockRejectedValue(new Error('token-secreto CPF52998224725 selectraw'));const error=await btgRecuperacaoRouter.createCaller(ctx()).analisar({parcelaId:1}).catch(e=>e);expect(error.message).not.toMatch(/token-secreto|52998224725|selectraw/);expect(error.cause).toBeUndefined();});
});

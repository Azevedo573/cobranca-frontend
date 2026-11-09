import { describe,expect,it } from 'vitest';
import { normalizarCobrancaRecuperacaoBtg } from './btg-v2/reenvio-consulta';
describe('estados documentais e cancelamento na consulta BTG',()=>{
  it.each(['CANCELING','CANCEL_FAILED','CANCELED'])('preserva estado %s sem classificá-lo como emitido',status=>{expect(normalizarCobrancaRecuperacaoBtg({collectionId:'col-1',status}).status).toBe(status);});
  it.each(['paidAt','paidAmount','amountPaid','hasPayment'])('preserva somente o sinal conservador %s',key=>{const r=normalizarCobrancaRecuperacaoBtg({collectionId:'col-1',status:'CREATED',[key]:key==='paidAt'?'2026-11-09':1});expect(r.pagamentoDetectado).toBe(true);expect(r).not.toHaveProperty(key);});
  it('não inventa indicação de pagamento na ausência de dados',()=>{expect(normalizarCobrancaRecuperacaoBtg({collectionId:'col-1',status:'CREATED'})).not.toHaveProperty('pagamentoDetectado');});
});

import { describe, expect, it } from "vitest";
import { reaisBtgParaCentavos, valorPagoBtgEmCentavos, dataPagamentoBtg } from "./btg-v2/valores";

describe("BTG — contrato monetário em reais, não heurística de unidade", () => {
  it.each([[5.84,584],[5,500],[0.01,1],[0.29,29],[1.15,115],[125.99,12599],[9200,920000],[0,0],[1e3,100000]])(
    "%s reais corresponde exatamente a %s centavos", (input,output) => expect(reaisBtgParaCentavos(input)).toBe(output));
  it.each([undefined,null,"5.84","584",true,false,{},[],NaN,Infinity,-Infinity,-1,-0,0.001,5.841,1e-7,Number.MAX_SAFE_INTEGER,21474836.48])(
    "recusa tipo, precisão, sinal ou overflow sem arredondar: %j", input => expect(reaisBtgParaCentavos(input)).toBeNull());
  it("aceita o limite inteiro em centavos do schema, sem perda", () => expect(reaisBtgParaCentavos(21474836.47)).toBe(2147483647));
  it("não usa amount nominal como prova de pagamento", () => expect(valorPagoBtgEmCentavos({amount:5.84})).toBeNull());
  it.each([{amountPaid:5.84},{paidAmount:5.84},{amountPaid:5.84,paidAmount:5.84}])("normaliza prova explícita %j", data => expect(valorPagoBtgEmCentavos(data)).toBe(584));
  it.each([{amountPaid:5.84,paidAmount:5.83},{amountPaid:5.84,paidAmount:null},{amountPaid:5.84,paidAmount:"5.84"},{amountPaid:undefined},{amountPaid:5.841},{paidAmount:584},{amountPaid:0}])(
    "não confunde prova divergente/ausente ou unidade: %j", data => {
      const n=valorPagoBtgEmCentavos(data);
      if (data.paidAmount===584) expect(n).toBe(58400);
      else if (data.amountPaid===0) expect(n).toBe(0);
      else expect(n).toBeNull();
    });
});

describe("BTG — data bancária validada", () => {
  const now=new Date("2026-11-11T20:00:00.000Z");
  it("preserva calendário sem timezone e ISO válido",()=>{
    expect(dataPagamentoBtg("2026-11-11",now)?.toISOString()).toBe("2026-11-11T00:00:00.000Z");
    expect(dataPagamentoBtg("2026-11-11T13:08:09.944Z",now)?.toISOString()).toBe("2026-11-11T13:08:09.944Z");
  });
  it("usa momento informado apenas quando ausente, sem inventar data bancária",()=>expect(dataPagamentoBtg(undefined,now)).toEqual(now));
  it.each([null,"2026-02-31","2026-13-01","2026-11-11T13:08:09","invalid",0,{},"2026-11-11T13:08:09.9999Z"])("recusa data inválida: %j",value=>expect(dataPagamentoBtg(value,now)).toBeNull());
});

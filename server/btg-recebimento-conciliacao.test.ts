import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarDbWebhookBtgEmMemoria } from "./btg-v2-webhook-test-db";
const mocks=vi.hoisted(()=>({consulta:vi.fn(),config:{ambiente:"sandbox",companyId:"00000000000000",apiBaseUrl:"https://btg.invalid"}}));
vi.mock("./btg-v2/client",()=>({consultarCobrancaBtgV2:mocks.consulta,cancelarCobrancaBtgV2:vi.fn()}));
vi.mock("./btg-v2/config",async importOriginal=>({...await importOriginal<typeof import("./btg-v2/config")>(),getBtgV2ServerConfig:()=>mocks.config}));
import { conciliarEmissaoBolePixV2 } from "./btg-v2/settlement";
const date=new Date("2026-11-11T00:00:00.000Z");
const emission={id:7,btgIntegracaoId:1,btgContaRecebedoraId:2,condominioId:10,origemTipo:"parcela_acordo",origemId:26,revisao:1,amount:584,status:"emitida",btgCollectionId:"titulo-ficticio",externalId:"id-ficticio",dueDate:date};
function fixture(extra:Record<string,any[]>={}) {
 return criarDbWebhookBtgEmMemoria({
  btgIntegracoes:[{id:1,ambiente:"sandbox",companyId:mocks.config.companyId}],
  btgContaRecebedoraCondominios:[{id:1,btgIntegracaoId:1,btgContaRecebedoraId:2,condominioId:10,ativo:1}],
  btgCobrancasEmitidas:[emission],btgCancelamentos:[],btgWebhookEntregas:[],auditLogs:[],
  acordos:[{id:12,devedorId:501,condominioId:10,agreedAmount:584,totalAmount:584,installments:1,status:"ativo",valorPago:0,valorPagoAcordo:0}],
  parcelasAcordo:[{id:26,acordoId:12,amount:584,installmentNumber:1,status:"pendente",paymentDate:null,dueDate:date}],
  acordoCobrancas:[{id:1,acordoId:12,cobrancaId:201,valorOriginal:500}],
  cobrancas:[{id:201,devedorId:501,condominioId:10,status:"em_acordo",amount:500,description:"Origem fictícia preservada",paidAt:null,paidAmount:null,dueDate:date}],
  devedores:[{id:501,condominioId:10,totalDue:584,status:"acordo"}],
  condominios:[{id:10,taxaJurosMensal:"0",taxaMulta:"0",taxaHonorarios:"0",correcaoMonetaria:"0"}],
  ...extra,
 });
}
function remoto(data:Record<string,any>={}){return {collectionId:"titulo-ficticio",status:"PAID",paidAmount:584,paidAt:"2026-11-11",paymentMethod:"QRCODE",settledAt:"2026-11-11T13:08:09.944Z",bankSlipUrl:null,pixQrCode:null,pixCopiaECola:null,codigoBarras:null,linhaDigitavel:null,nossoNumero:null,...data};}
beforeEach(()=>{vi.clearAllMocks();mocks.consulta.mockResolvedValue(remoto());});
describe("Conciliação BTG — recebimento comum e contexto fresco",()=>{
 it("baixa parcela/acordo/origem e audita uma única vez sem apagar descrição/valor",async()=>{
  const f=fixture();const result=await conciliarEmissaoBolePixV2(f.db,7);
  expect(result.pagamentoAplicado).toBe(true);
  expect(f.state.tables.parcelasAcordo[0]).toMatchObject({status:"pago",amount:584});
  expect(f.state.tables.acordos[0]).toMatchObject({status:"pago",valorPago:584,valorPagoAcordo:0});
  expect(f.state.tables.cobrancas[0]).toMatchObject({status:"pago",description:"Origem fictícia preservada",amount:500,paidAmount:null});
  expect(f.state.tables.devedores[0]).toMatchObject({status:"pago",totalDue:0});
  expect(f.state.tables.btgCobrancasEmitidas[0].status).toBe("paga");
  expect(f.state.tables.auditLogs.filter(a=>a.action==="pay_parcela")).toHaveLength(1);
  expect(f.state.writes.every(w=>w.inTransaction)).toBe(true);
 });
 it("segunda consulta paga não reaplica recebimento",async()=>{
  const f=fixture();await conciliarEmissaoBolePixV2(f.db,7);
  const before=structuredClone(f.state.tables);
  const again=await conciliarEmissaoBolePixV2(f.db,7);
  expect(again.pagamentoAplicado).toBe(false);
  expect(f.state.tables.acordos).toEqual(before.acordos);
  expect(f.state.tables.cobrancas).toEqual(before.cobrancas);
  expect(f.state.tables.auditLogs).toEqual(before.auditLogs);
 });
 it.each([null,583,585,5.84])("bloqueia prova ausente/divergente/sem centavos normalizados %s",async paidAmount=>{
  const f=fixture();mocks.consulta.mockResolvedValue(remoto({paidAmount}));
  await expect(conciliarEmissaoBolePixV2(f.db,7)).rejects.toThrow();
  expect(f.state.tables.parcelasAcordo[0].status).toBe("pendente");
  expect(f.state.tables.btgCobrancasEmitidas[0].status).toBe("emitida");
 });
 it("recusa pagamento de parcela cancelada",async()=>{
  const f=fixture({parcelasAcordo:[{id:26,acordoId:12,amount:584,status:"cancelado",installmentNumber:1,dueDate:date}]});
  await expect(conciliarEmissaoBolePixV2(f.db,7)).rejects.toThrow();
  expect(f.state.tables.acordos[0].status).toBe("ativo");
  expect(f.state.tables.cobrancas[0].status).toBe("em_acordo");
 });
 it("falha ao quitar origem desfaz todos os efeitos financeiros",async()=>{
  const f=fixture();f.state.failInjected={table:"cobrancas",times:1};
  await expect(conciliarEmissaoBolePixV2(f.db,7)).rejects.toThrow();
  expect(f.state.tables.parcelasAcordo[0].status).toBe("pendente");
  expect(f.state.tables.acordos[0]).toMatchObject({status:"ativo",valorPago:0});
  expect(f.state.tables.cobrancas[0].status).toBe("em_acordo");
  expect(f.state.tables.auditLogs).toHaveLength(0);
  expect(f.state.tables.btgCobrancasEmitidas[0].status).toBe("emitida");
  expect(f.state.rollbacks).toBe(1);
 });
 it("revalida a identidade local após o GET",async()=>{
  const f=fixture();mocks.consulta.mockImplementation(async()=>{f.state.tables.btgCobrancasEmitidas[0].amount=585;return remoto();});
  await expect(conciliarEmissaoBolePixV2(f.db,7)).rejects.toThrow();
  expect(f.state.tables.parcelasAcordo[0].status).toBe("pendente");
 });
 it("integração de outro ambiente bloqueia antes da chamada remota",async()=>{
  const f=fixture({btgIntegracoes:[{id:1,ambiente:"producao",companyId:mocks.config.companyId}]});
  await expect(conciliarEmissaoBolePixV2(f.db,7)).rejects.toThrow();
  expect(mocks.consulta).not.toHaveBeenCalled();
 });
 it("não sobrescreve Pix/barras anteriores com dados parciais da consulta",async()=>{
  const f=fixture({btgCobrancasEmitidas:[{...emission,pixCopiaECola:"fixture-inalterada",codigoBarras:"fixture-barras"}]});
  await conciliarEmissaoBolePixV2(f.db,7);
  expect(f.state.tables.btgCobrancasEmitidas[0]).toMatchObject({pixCopiaECola:"fixture-inalterada",codigoBarras:"fixture-barras"});
 });
});

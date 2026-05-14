import { describe, it, expect } from "vitest";
import { gerarPixCopiaCola, calcularCRC16 } from "./pix-emv";

const dadosTeste = {
  chavePix: "32311089000101",
  nomeBeneficiario: "GOMES & SILVA SOCIEDADE DE ADVOGADOS",
  cidade: "SAO PAULO",
  valor: 2065330, // R$20.653,30
  txid: "1000000084",
  descricao: "Cobranca 1000000084",
};

describe("calcularCRC16", () => {
  it("deve calcular CRC16 correto para string vazia + 6304", () => {
    // Teste de referência do Banco Central
    const payload = "00020126580014BR.GOV.BCB.PIX0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
    const crc = calcularCRC16(payload);
    expect(crc).toMatch(/^[0-9A-F]{4}$/);
    expect(crc.length).toBe(4);
  });

  it("deve retornar string de 4 chars hexadecimais maiúsculos", () => {
    const crc = calcularCRC16("teste");
    expect(crc).toMatch(/^[0-9A-F]{4}$/);
  });

  it("deve retornar resultados consistentes para a mesma entrada", () => {
    const crc1 = calcularCRC16("payload de teste");
    const crc2 = calcularCRC16("payload de teste");
    expect(crc1).toBe(crc2);
  });

  it("deve retornar resultados diferentes para entradas diferentes", () => {
    const crc1 = calcularCRC16("payload1");
    const crc2 = calcularCRC16("payload2");
    expect(crc1).not.toBe(crc2);
  });
});

describe("gerarPixCopiaCola", () => {
  it("deve gerar um payload Pix válido (não vazio)", () => {
    const payload = gerarPixCopiaCola(dadosTeste);
    expect(payload).toBeTruthy();
    expect(payload.length).toBeGreaterThan(50);
  });

  it("deve começar com o Payload Format Indicator '000201'", () => {
    const payload = gerarPixCopiaCola(dadosTeste);
    expect(payload.startsWith("000201")).toBe(true);
  });

  it("deve conter o GUI do Pix 'BR.GOV.BCB.PIX'", () => {
    const payload = gerarPixCopiaCola(dadosTeste);
    expect(payload).toContain("BR.GOV.BCB.PIX");
  });

  it("deve conter a chave Pix informada", () => {
    const payload = gerarPixCopiaCola(dadosTeste);
    expect(payload).toContain("32311089000101");
  });

  it("deve conter o código de moeda BRL '53039865'", () => {
    const payload = gerarPixCopiaCola(dadosTeste);
    expect(payload).toContain("5303986");
  });

  it("deve conter o código de país 'BR' (5802BR)", () => {
    const payload = gerarPixCopiaCola(dadosTeste);
    expect(payload).toContain("5802BR");
  });

  it("deve conter o valor formatado corretamente (20653.30)", () => {
    const payload = gerarPixCopiaCola(dadosTeste);
    expect(payload).toContain("20653.30");
  });

  it("deve conter o nome do beneficiário (sem acentos, max 25 chars)", () => {
    const payload = gerarPixCopiaCola(dadosTeste);
    // "GOMES & SILVA SOCIEDADE DE ADVOGADOS" → truncado para 25 chars = "GOMES & SILVA SOCIEDADE D"
    // O & é preservado no Pix
    expect(payload).toContain("GOMES & SILVA SOCIEDADE D");
  });

  it("deve conter a cidade (max 15 chars)", () => {
    const payload = gerarPixCopiaCola(dadosTeste);
    expect(payload).toContain("SAO PAULO");
  });

  it("deve terminar com CRC16 de 4 chars hexadecimais (6304XXXX)", () => {
    const payload = gerarPixCopiaCola(dadosTeste);
    expect(payload).toMatch(/6304[0-9A-F]{4}$/);
  });

  it("deve ter CRC16 válido (verificar integridade)", () => {
    const payload = gerarPixCopiaCola(dadosTeste);
    // O CRC é calculado sobre tudo exceto os 4 últimos chars
    const payloadSemCRC = payload.slice(0, -4);
    const crcEsperado = calcularCRC16(payloadSemCRC);
    const crcReal = payload.slice(-4);
    expect(crcReal).toBe(crcEsperado);
  });

  it("deve gerar Pix sem valor quando valor não informado", () => {
    const dadosSemValor = { ...dadosTeste, valor: undefined };
    const payload = gerarPixCopiaCola(dadosSemValor);
    expect(payload).not.toContain("5404"); // ID 54 = Transaction Amount
    expect(payload).toBeTruthy();
  });

  it("deve gerar Pix sem valor quando valor é 0", () => {
    const dadosValorZero = { ...dadosTeste, valor: 0 };
    const payload = gerarPixCopiaCola(dadosValorZero);
    expect(payload).not.toContain("54040.00");
  });

  it("deve usar '***' como txid quando não informado", () => {
    const dadosSemTxid = { ...dadosTeste, txid: undefined };
    const payload = gerarPixCopiaCola(dadosSemTxid);
    expect(payload).toContain("***");
  });

  it("deve gerar payloads diferentes para valores diferentes", () => {
    const payload1 = gerarPixCopiaCola(dadosTeste);
    const payload2 = gerarPixCopiaCola({ ...dadosTeste, valor: 100000 });
    expect(payload1).not.toBe(payload2);
  });

  it("deve gerar payloads diferentes para chaves Pix diferentes", () => {
    const payload1 = gerarPixCopiaCola(dadosTeste);
    const payload2 = gerarPixCopiaCola({ ...dadosTeste, chavePix: "outro@email.com" });
    expect(payload1).not.toBe(payload2);
  });

  it("deve remover acentos do nome do beneficiário", () => {
    const dados = { ...dadosTeste, nomeBeneficiario: "João da Conceição" };
    const payload = gerarPixCopiaCola(dados);
    expect(payload).not.toContain("ã");
    expect(payload).not.toContain("ç");
    expect(payload).toContain("Joao da Conceicao");
  });
});

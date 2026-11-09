import { describe, expect, it } from "vitest";
import { validarDadosBancariosBtg, validarPixBtg } from "./btg-v2/boleto-bancario";

// Fixtures sintéticas independentes do gerador CNAB; campo livre opaco da API.
const codigoBarras = "20898100000000050000012345678901234567890123";
const linhaDigitavel = "20890012304567890123745678901237810000000005000";
const input = { codigoBarras, linhaDigitavel, valorCentavos: 5000, vencimento: new Date("2025-02-22T00:00:00Z") };
const alterarDigito = (s: string, indice: number) => s.slice(0, indice) + ((Number(s[indice]) + 1) % 10) + s.slice(indice + 1);

// Algoritmos apenas nas fixtures: nunca criar/reparar códigos em produção.
function modulo10(s: string): string {
  let soma = 0;
  for (let i = 0; i < s.length; i++) {
    const n = Number(s[s.length - 1 - i]) * (i % 2 ? 1 : 2);
    soma += Math.floor(n / 10) + n % 10;
  }
  return String((10 - soma % 10) % 10);
}
function fixtureBancaria(fator: string, livre = "0012345678901234567890123", banco = "208", moeda = "9") {
  const semDv = banco + moeda + fator + "0000005000" + livre;
  let soma = 0;
  for (let i = 0; i < semDv.length; i++) soma += Number(semDv[semDv.length - 1 - i]) * (2 + i % 8);
  const n = 11 - soma % 11;
  const dv = String(n === 10 || n === 11 ? 1 : n);
  const barras = semDv.slice(0, 4) + dv + semDv.slice(4);
  const c1 = barras.slice(0, 4) + barras.slice(19, 24), c2 = barras.slice(24, 34), c3 = barras.slice(34, 44);
  return { codigoBarras: barras, linhaDigitavel: c1 + modulo10(c1) + c2 + modulo10(c2) + c3 + modulo10(c3) + dv + barras.slice(5, 19) };
}
function tlv(id: string, valor: string) { return id + String(Buffer.byteLength(valor)).padStart(2, "0") + valor; }
function comCrc(corpo: string): string {
  const prefixo = corpo + "6304";
  let crc = 0xffff;
  for (const byte of Buffer.from(prefixo, "utf8")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  return prefixo + crc.toString(16).toUpperCase().padStart(4, "0");
}
const corpoPix = tlv("00", "01") + tlv("01", "12") + tlv("26", tlv("00", "BR.GOV.BCB.PIX") + tlv("25", "qr.example.test/cobranca"))
  + tlv("52", "0000") + tlv("53", "986") + tlv("54", "50.00") + tlv("58", "BR") + tlv("59", " PAGADOR  TESTE ")
  + tlv("60", "SAO PAULO ") + tlv("62", tlv("05", "***"));

// Exports somente deste arquivo de teste para reutilizar fixtures no teste PDF.
export const fixturesBtgBoleto = { codigoBarras, linhaDigitavel, pix: comCrc(corpoPix) };

describe("validarDadosBancariosBtg", () => {
  it("retorna códigos validados preservando todos os zeros, sem modificar o input", () => {
    const antes = structuredClone(input);
    expect(validarDadosBancariosBtg(input)).toEqual({ codigoBarras, linhaDigitavel });
    expect(input).toEqual(antes);
  });
  it("aceita apenas separadores visuais de linha digitável, sem descartar letras ou controles", () => {
    expect(validarDadosBancariosBtg({ ...input, linhaDigitavel: "20890.01230 45678.901237 45678.901237 8 10000000005000" }).linhaDigitavel).toBe(linhaDigitavel);
    expect(validarDadosBancariosBtg({ ...input, linhaDigitavel: "2089001230 45678901237 45678901237 8 10000000005000" }).linhaDigitavel).toBe(linhaDigitavel);
    for (const s of ["x" + linhaDigitavel, linhaDigitavel + "\n", linhaDigitavel.replace("0", "０"), "https://bank.example.test/pdf"]) {
      expect(() => validarDadosBancariosBtg({ ...input, linhaDigitavel: s })).toThrow(/linha digitável/i);
    }
  });
  it.each(["", codigoBarras.slice(1), codigoBarras + "0", " " + codigoBarras, alterarDigito(codigoBarras, 4) + "x"])("rejeita barras malformadas: %s", (s) => {
    expect(() => validarDadosBancariosBtg({ ...input, codigoBarras: s })).toThrow(/44 dígitos/i);
  });
  it.each(["", linhaDigitavel.slice(1), linhaDigitavel + "0"])("rejeita linha sem 47 dígitos: %s", (s) => {
    expect(() => validarDadosBancariosBtg({ ...input, linhaDigitavel: s })).toThrow(/47 dígitos/i);
  });
  it("valida o DV geral nas barras e na linha", () => {
    expect(() => validarDadosBancariosBtg({ ...input, codigoBarras: alterarDigito(codigoBarras, 4) })).toThrow(/DV geral/i);
    expect(() => validarDadosBancariosBtg({ ...input, linhaDigitavel: alterarDigito(linhaDigitavel, 32) })).toThrow(/DV geral/i);
  });
  it.each([9, 20, 31])("valida o DV de cada campo da linha (índice %i)", (indice) => {
    expect(() => validarDadosBancariosBtg({ ...input, linhaDigitavel: alterarDigito(linhaDigitavel, indice) })).toThrow(/DV.*campo/i);
  });
  it("rejeita códigos individualmente válidos de títulos diferentes", () => {
    const outro = fixtureBancaria("1000", "9012345678901234567890123");
    expect(() => validarDadosBancariosBtg({ ...input, linhaDigitavel: outro.linhaDigitavel })).toThrow(/correspond/i);
  });
  it("rejeita banco divergente, moeda divergente e banco que não seja BTG", () => {
    expect(() => validarDadosBancariosBtg({ ...input, banco: "237" })).toThrow(/banco/i);
    expect(() => validarDadosBancariosBtg({ ...input, ...fixtureBancaria("1000", undefined, "237") })).toThrow(/banco/i);
    expect(() => validarDadosBancariosBtg({ ...input, ...fixtureBancaria("1000", undefined, "208", "0") })).toThrow(/moeda/i);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 10000000000, Number.MAX_SAFE_INTEGER])("rejeita valor inválido: %s", (valorCentavos) => {
    expect(() => validarDadosBancariosBtg({ ...input, valorCentavos })).toThrow(/valor/i);
  });
  it("confere valor da canônica em centavos, não o valor de todo o acordo", () => {
    expect(() => validarDadosBancariosBtg({ ...input, valorCentavos: 5001 })).toThrow(/valor/i);
  });
  it.each([
    ["2025-02-22T23:59:59.999Z", "1000"], ["2025-02-23T00:00:00Z", "1001"],
    ["2025-02-21T23:59:59Z", "9999"], ["2026-11-09T00:00:00Z", "1625"],
    ["2025-02-22T23:30:00-03:00", "1001"], ["2049-10-13T00:00:00Z", "9999"],
  ])("confere o fator vigente usando dia UTC: %s / %s", (data, fator) => {
    expect(validarDadosBancariosBtg({ ...input, ...fixtureBancaria(fator), vencimento: new Date(data) }).codigoBarras.slice(5, 9)).toBe(fator);
  });
  it("não interpreta fator 1000 pela base antiga nem aceita zero/outro ciclo", () => {
    expect(() => validarDadosBancariosBtg({ ...input, vencimento: new Date("2025-02-23T00:00:00Z") })).toThrow(/fator.*vencimento/i);
    expect(() => validarDadosBancariosBtg({ ...input, ...fixtureBancaria("0000") })).toThrow(/fator.*vencimento/i);
    expect(() => validarDadosBancariosBtg({ ...input, vencimento: new Date("2049-10-14T00:00:00Z") })).toThrow(/vencimento/i);
    expect(() => validarDadosBancariosBtg({ ...input, vencimento: new Date(NaN) })).toThrow(/vencimento/i);
    expect(() => validarDadosBancariosBtg({ ...input, vencimento: new Date("1997-10-07T00:00:00Z") })).toThrow(/vencimento/i);
  });
  it("cobre todas as somas possíveis de módulo 11, inclusive os casos especiais que retornam 1", () => {
    const restos = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const dados = fixtureBancaria("1000", String(i).padStart(25, "0"));
      const semDv = dados.codigoBarras.slice(0, 4) + dados.codigoBarras.slice(5);
      let soma = 0;
      for (let j = 0; j < semDv.length; j++) soma += Number(semDv[semDv.length - 1 - j]) * (2 + j % 8);
      restos.add(soma % 11);
      expect(validarDadosBancariosBtg({ ...input, ...dados }).codigoBarras).toBe(dados.codigoBarras);
    }
    expect(restos.size).toBe(11);
  });
});

describe("validarPixBtg", () => {
  it("valida TLV e CRC e devolve exatamente os mesmos bytes, inclusive espaços múltiplos e finais nos campos", () => {
    const payload = fixturesBtgBoleto.pix;
    expect(validarPixBtg(payload)).toBe(payload);
    expect(Buffer.from(validarPixBtg(payload))).toEqual(Buffer.from(payload));
    expect(payload).toContain(" PAGADOR  TESTE ");
  });
  it.each(["br.gov.bcb.pix", "Br.GoV.bCb.PiX"])("aceita GUI Pix %s sem modificar nenhum byte ou CRC", (gui) => {
    const payload = comCrc(corpoPix.replace("BR.GOV.BCB.PIX", gui));
    expect(validarPixBtg(payload)).toBe(payload);
    expect(Buffer.from(validarPixBtg(payload))).toEqual(Buffer.from(payload));
    expect(payload).toContain(gui);
  });
  it("não repara o CRC ao alterar somente a capitalização do GUI", () => {
    const corrompido = fixturesBtgBoleto.pix.replace("BR.GOV.BCB.PIX", "br.gov.bcb.pix");
    expect(() => validarPixBtg(corrompido)).toThrow(/CRC/i);
  });
  it.each(["br.gov.bcb.abc", "br.gov.bcb.pıx", "BR.GOV.BCB.PIＸ"])("recusa GUI alheio ou Unicode visualmente semelhante: %s", (gui) => {
    const template = (valor: string) => tlv("26", tlv("00", valor) + tlv("25", "qr.example.test/cobranca"));
    const payload = comCrc(corpoPix.replace(template("BR.GOV.BCB.PIX"), template(gui)));
    expect(() => validarPixBtg(payload)).toThrow(/Pix|EMV/i);
  });
  it("aceita EMV Pix estático recebido, sem inventar chave ou URL", () => {
    const corpo = corpoPix.replace(tlv("01", "12"), tlv("01", "11")).replace(tlv("26", tlv("00", "BR.GOV.BCB.PIX") + tlv("25", "qr.example.test/cobranca")), tlv("26", tlv("00", "BR.GOV.BCB.PIX") + tlv("01", "00000000000000")));
    expect(validarPixBtg(comCrc(corpo))).toBe(comCrc(corpo));
  });
  it("verifica CRC calculado sobre UTF-8 preservado, sem normalizar texto", () => {
    const payload = comCrc(corpoPix.replace(tlv("59", " PAGADOR  TESTE "), tlv("59", " PAGADOR JOÃO ")));
    expect(validarPixBtg(payload)).toBe(payload);
  });
  it.each(["", "https://bank.example.test/pix", "000201", " 00020163040000", "00020163040000\n"])("rejeita payload incompleto ou não EMV: %s", (payload) => {
    expect(() => validarPixBtg(payload)).toThrow(/Pix|EMV|TLV|CRC/i);
  });
  it("rejeita corrupção dos bytes ou CRC, sem tentar reparar", () => {
    const payload = fixturesBtgBoleto.pix;
    expect(() => validarPixBtg(payload.replace("PAGADOR", "PAGAdOR"))).toThrow(/CRC/i);
    expect(() => validarPixBtg(payload.slice(0, -4) + "FFFF")).toThrow(/CRC/i);
    expect(() => validarPixBtg(payload.slice(0, -4) + "ZZZZ")).toThrow(/CRC/i);
  });
  it.each([
    corpoPix.replace("0014BR.GOV.BCB.PIX", "0015BR.GOV.BCB.PIX"),
    corpoPix.replace("0014BR.GOV.BCB.PIX", "XX14BR.GOV.BCB.PIX"),
    corpoPix + tlv("59", "OUTRO"), corpoPix + "6100", corpoPix + "6105ab",
    corpoPix.replace(tlv("62", tlv("05", "***")), tlv("62", "0505***")),
  ])("rejeita TLV malformado/duplicado mesmo com CRC correto", (corpo) => {
    expect(() => validarPixBtg(comCrc(corpo))).toThrow(/TLV|EMV/i);
  });
  it("exige CRC como último campo com tamanho 04 e sem dados após ele", () => {
    expect(() => validarPixBtg(fixturesBtgBoleto.pix + tlv("61", "1"))).toThrow(/CRC/i);
    expect(() => validarPixBtg(corpoPix + "6303000")).toThrow(/CRC/i);
    expect(() => validarPixBtg(corpoPix)).toThrow(/CRC/i);
  });
  it.each([
    corpoPix.replace("BR.GOV.BCB.PIX", "BR.GOV.BCB.ABC"),
    corpoPix.replace(tlv("00", "01"), tlv("00", "02")),
    corpoPix.replace(tlv("53", "986"), tlv("53", "840")),
    corpoPix.replace(tlv("58", "BR"), tlv("58", "US")),
  ])("rejeita EMV que não descreve Pix BRL/BR", (corpo) => {
    expect(() => validarPixBtg(comCrc(corpo))).toThrow(/Pix|EMV/i);
  });
});

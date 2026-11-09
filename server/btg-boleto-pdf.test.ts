import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import QRCode from "qrcode";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gerarBoletoPDF, calcularCodigoBarras, calcularLinhaDigitavel, type DadosBoleto } from "./boleto-pdf";
import { montarOrigemDividaAcordo } from "./origem-divida-acordo";

const codigoBarras = "20898100000000050000012345678901234567890123";
const linhaDigitavel = "20890012304567890123745678901237810000000005000";
const linhaFormatada = "20890.01230 45678.901237 45678.901237 8 10000000005000";
const temPoppler = !spawnSync("pdftotext", ["-v"]).error;
const textoPdf = (buffer: Buffer) => execFileSync("pdftotext", ["-layout", "-", "-"], { input: buffer, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
const paginasPdf = (buffer: Buffer) => (buffer.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
function comCrc(corpo: string) {
  const prefixo = corpo + "6304";
  let crc = 0xffff;
  for (const byte of Buffer.from(prefixo)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  return prefixo + crc.toString(16).toUpperCase().padStart(4, "0");
}
const tlv = (id: string, valor: string) => id + String(Buffer.byteLength(valor)).padStart(2, "0") + valor;
const pix = comCrc(tlv("00", "01") + tlv("01", "12") + tlv("26", tlv("00", "BR.GOV.BCB.PIX") + tlv("25", "qr.example.test/807"))
  + tlv("52", "0000") + tlv("53", "986") + tlv("54", "50.00") + tlv("58", "BR") + tlv("59", " PAGADOR  TESTE ") + tlv("60", "SAO PAULO ") + tlv("62", tlv("05", "***")));
function fixture(quantidade = 80): DadosBoleto {
  const dataVencimento = new Date("2025-02-22T00:30:00Z");
  return {
    nomeBeneficiario: "Beneficiário Sintético", cnpjBeneficiario: "00000000000000", enderecoBeneficiario: "Rua Beneficiário, 1",
    banco: "208", nomeBanco: "BTG", agencia: "0050", digitoAgencia: "", conta: "0000432260", digitoConta: "", carteira: "API", convenio: "SEM-CNAB",
    nossoNumero: "00001234567890123456789012345678901234", dataVencimento, dataEmissao: new Date("2025-02-20T00:30:00Z"), valor: 5000, especieDocumento: "DD", aceite: "N",
    nomeSacado: "Pagador Sintético", cpfCnpjSacado: "00000000000", enderecoSacado: "Rua da Emissão, 807", cidadeSacado: "Rio de Janeiro", ufSacado: "RJ", cepSacado: "20000-000",
    localPagamento: "Pagável em qualquer banco", instrucoes: ["Não receber após o vencimento"], seuNumero: "PA807R1", pixCopiaCola: pix,
    pagamentoBancario: { origem: "btg_api", codigoBarras, linhaDigitavel },
    contextoAcordo: { acordoId: 807, referenciaParcelaAtual: "Entrada do Acordo #807", valorDocumento: 5000, valorOrigem: quantidade * 10000,
      totalNegociado: 325000, saldoAposEstePagamento: 320000,
      parcelas: Array.from({ length: 65 }, (_, i) => ({ id: i + 1, installmentNumber: i, etapa: `Etapa ${i}`, valor: 5000, vencimento: dataVencimento, status: "pendente", situacao: "A vencer", documentoAtual: i === 0 })),
    },
    origemDivida: montarOrigemDividaAcordo(Array.from({ length: quantidade }, (_, i) => ({ cobrancaId: i + 1, valorOriginal: 10000, titulo: `Dívida sintética ${i + 1}`, vencimento: dataVencimento })), []),
  };
}
function streamsPdf(pdf: Buffer): Buffer[] {
  const texto = pdf.toString("latin1"), streams: Buffer[] = [];
  const regex = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/gs;
  for (const match of texto.matchAll(regex)) {
    const buffer = Buffer.from(match[2], "latin1");
    streams.push(/\/FlateDecode/.test(match[1]) ? inflateSync(buffer) : buffer);
  }
  return streams;
}
function textosDosStreams(pdf: Buffer): string {
  return streamsPdf(pdf).map(stream => {
    return [...stream.toString("latin1").matchAll(/\[([^\]]*)\] TJ/g)].map(match => {
      return [...match[1].matchAll(/<([0-9a-f]+)>/gi)].map(hex => Buffer.from(hex[1], "hex").toString("latin1")).join("");
    }).join("");
  }).join("");
}
function decodificarI25Pdf(pdf: Buffer): string {
  const barras = streamsPdf(pdf).flatMap(stream => [...stream.toString("latin1").matchAll(/([\d.]+) ([\d.]+) ([\d.]+) 44 re\b/g)].map(m => ({ x: Number(m[1]), largura: Number(m[3]) })));
  expect(barras).toHaveLength(114); // início (2), 22 pares (110), fim (2)
  const modulo = Math.min(...barras.map(b => b.largura));
  const padroes = ["00110", "10001", "01001", "11000", "00101", "10100", "01100", "00011", "10010", "01010"];
  const bit = (largura: number) => {
    expect(Math.min(Math.abs(largura / modulo - 1), Math.abs(largura / modulo - 3))).toBeLessThan(0.001);
    return largura / modulo > 2 ? "1" : "0";
  };
  let resultado = "";
  for (let par = 0; par < 22; par++) {
    let pBarra = "", pEspaco = "";
    for (let j = 0; j < 5; j++) {
      const i = 2 + par * 5 + j;
      pBarra += bit(barras[i].largura);
      pEspaco += bit(barras[i + 1].x - barras[i].x - barras[i].largura);
    }
    const d1 = padroes.indexOf(pBarra), d2 = padroes.indexOf(pEspaco);
    expect(d1).toBeGreaterThanOrEqual(0);
    expect(d2).toBeGreaterThanOrEqual(0);
    resultado += `${d1}${d2}`;
  }
  return resultado;
}
afterEach(() => vi.restoreAllMocks());

describe("gerarBoletoPDF no modo explícito btg_api", () => {
  it("gera PDF real de até duas páginas com origem longa sem alterar dados e reutiliza QR com bytes integrais", async () => {
    const dados = fixture(), antes = structuredClone(dados);
    const qr = vi.spyOn(QRCode, "toBuffer");
    const pdf = await gerarBoletoPDF(dados);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(paginasPdf(pdf)).toBeGreaterThan(0);
    expect(paginasPdf(pdf)).toBeLessThanOrEqual(2);
    expect(qr).toHaveBeenCalledWith(pix, expect.objectContaining({ type: "png" }));
    expect(dados).toEqual(antes);
    expect(decodificarI25Pdf(pdf)).toBe(codigoBarras);
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
    if (process.env.BTG_BOLETO_PDF_AMOSTRA_DIR) {
      mkdirSync(process.env.BTG_BOLETO_PDF_AMOSTRA_DIR, { recursive: true });
      writeFileSync(join(process.env.BTG_BOLETO_PDF_AMOSTRA_DIR, "btg-boleto-api-sintetico.pdf"), pdf);
    }
  });
  it.skipIf(!temPoppler)("exibe linha da API, nosso número completo sem carteira, conta sem DV inventado, CPF/endereço e resumo existente", async () => {
    const dados = fixture();
    const texto = textoPdf(await gerarBoletoPDF(dados));
    expect(texto).toContain(linhaFormatada);
    expect(texto.split(dados.nossoNumero).length - 1).toBe(2);
    expect(texto).not.toContain("API/" + dados.nossoNumero);
    expect(texto).toContain("0050 / 0000432260");
    expect(texto).not.toContain("0000432260-");
    expect(texto).toContain("000.000.000-00");
    expect(texto).toContain(dados.enderecoSacado);
    expect(texto).toContain("Resumo do acordo");
    expect(texto).toContain("composição consolidada");
    expect(texto).toContain("80 cobrança(s)");
    expect(texto).toContain("Demonstrativo completo do acordo");
    expect(texto).not.toContain("Plano de pagamento do acordo");
    expect(texto).not.toContain("Dívida sintética 1");
    expect(texto).toContain("Ficha de Compensação");
    expect(texto).toContain("50,00");
  });
  it("preserva todos os bytes Pix nos operadores textuais do PDF, inclusive espaços que Poppler agrupa", async () => {
    const pdf = await gerarBoletoPDF(fixture());
    const textoPix = textosDosStreams(pdf).split("PIX COPIA E COLA")[1].split("Corte na linha pontilhada")[0];
    expect(textoPix).toBe(pix);
    expect(Buffer.from(textoPix)).toEqual(Buffer.from(pix));
  });
  it.skipIf(!temPoppler)("formata vencimento e emissão em UTC inclusive quando timezone local está em São Paulo", async () => {
    const anterior = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
    try {
      const texto = textoPdf(await gerarBoletoPDF(fixture(2)));
      expect(texto).toContain("22/02/2025");
      expect(texto).toContain("20/02/2025");
      expect(texto).not.toContain("21/02/2025");
      expect(texto).not.toContain("19/02/2025");
    } finally {
      if (anterior === undefined) delete process.env.TZ; else process.env.TZ = anterior;
    }
  });
  it.skipIf(!temPoppler)("mantém títulos curtos e DVs de agência/conta somente quando informados", async () => {
    const dados = { ...fixture(2), digitoAgencia: "7", digitoConta: "0" };
    const pdf = await gerarBoletoPDF(dados), texto = textoPdf(pdf);
    expect(paginasPdf(pdf)).toBeLessThanOrEqual(2);
    expect(texto).toContain("Dívida sintética 1");
    expect(texto).toContain("Dívida sintética 2");
    expect(texto).toContain("0050-7 / 0000432260-0");
  });
  it.skipIf(!temPoppler)("sem contexto original não inventa resumo do acordo, mas preserva origem histórica recebida e limita páginas", async () => {
    const dados = { ...fixture(), contextoAcordo: undefined };
    const pdf = await gerarBoletoPDF(dados), texto = textoPdf(pdf);
    expect(paginasPdf(pdf)).toBeLessThanOrEqual(2);
    expect(texto).toContain("Resumo do acordo indisponível");
    expect(texto).toContain("80 cobrança(s)");
    expect(texto).not.toContain("Total negociado no acordo");
    expect(texto).not.toContain("Saldo após este pagamento");
    expect(decodificarI25Pdf(pdf)).toBe(codigoBarras);
  });
  it("preserva payload Pix longo com espaços, sem truncar bytes ou ultrapassar duas páginas", async () => {
    const corpo = pix.slice(0, -8).replace(tlv("26", tlv("00", "BR.GOV.BCB.PIX") + tlv("25", "qr.example.test/807")), tlv("26", tlv("00", "BR.GOV.BCB.PIX") + tlv("25", "qr.example.test/" + "a".repeat(60))))
      + tlv("80", " CAMPO  ADICIONAL ".repeat(5));
    const payload = comCrc(corpo);
    const dados = { ...fixture(), pixCopiaCola: payload, contextoAcordo: undefined };
    const qr = vi.spyOn(QRCode, "toBuffer"), pdf = await gerarBoletoPDF(dados);
    expect(paginasPdf(pdf)).toBeLessThanOrEqual(2);
    expect(qr).toHaveBeenCalledWith(payload, expect.anything());
    expect(textosDosStreams(pdf).split("PIX COPIA E COLA")[1].split("Corte na linha pontilhada")[0]).toBe(payload);
  });
  it("não calcula campo livre CNAB, mesmo com carteira e convênio incompatíveis com CNAB", async () => {
    const dados = { ...fixture(), carteira: "", convenio: "", pixCopiaCola: undefined };
    const pdf = await gerarBoletoPDF(dados);
    expect(paginasPdf(pdf)).toBeLessThanOrEqual(2);
    expect(decodificarI25Pdf(pdf)).toBe(codigoBarras);
  });
  it.each(["barras", "linha", "valor", "vencimento", "pix", "nossoNumero", "agencia", "conta", "origem", "modoNulo"])("bloqueia %s inválido antes de QR/PDF, sem fallback", async (cenario) => {
    const dados = fixture();
    switch (cenario) {
      case "barras": dados.pagamentoBancario!.codigoBarras = ""; break;
      case "linha": dados.pagamentoBancario!.linhaDigitavel = ""; break;
      case "valor": dados.valor = 5001; break;
      case "vencimento": dados.dataVencimento = new Date("2025-02-23T00:00:00Z"); break;
      case "pix": dados.pixCopiaCola = pix.slice(0, -4) + "0000"; break;
      case "nossoNumero": dados.nossoNumero = ""; break;
      case "agencia": dados.agencia = ""; break;
      case "conta": dados.conta = ""; break;
      case "origem": (dados.pagamentoBancario as unknown as { origem: string }).origem = "cnab"; break;
      case "modoNulo": (dados as unknown as { pagamentoBancario: null }).pagamentoBancario = null; break;
    }
    const qr = vi.spyOn(QRCode, "toBuffer");
    await expect(gerarBoletoPDF(dados)).rejects.toThrow();
    expect(qr).not.toHaveBeenCalled();
  });
});

describe("regressão: modo CNAB ausente permanece idêntico", () => {
  it("mantém códigos conhecidos, truncamento legado, carteira/nosso número, conta e Pix sem validação nova", async () => {
    const dados: DadosBoleto = { ...fixture(2), pagamentoBancario: undefined, carteira: "1", convenio: "11051861158", nossoNumero: "999991000000084",
      dataVencimento: new Date("2026-06-12T12:00:00Z"), dataEmissao: new Date("2026-05-12T12:00:00Z"), valor: 2065330,
      agencia: "0050", conta: "432260", digitoConta: "0", pixCopiaCola: "CNAB-PAYLOAD-LEGADO-SEM-CRC", contextoAcordo: undefined, origemDivida: undefined };
    const antes = structuredClone(dados);
    expect(calcularCodigoBarras(dados)).toBe("20892147500020653301100000008400504322600000");
    expect(calcularLinhaDigitavel(calcularCodigoBarras(dados))).toBe("2089110007 00008400509 43226000008 2 14750002065330");
    const qr = vi.spyOn(QRCode, "toBuffer"), pdf = await gerarBoletoPDF(dados);
    expect(qr).toHaveBeenCalledWith(dados.pixCopiaCola, expect.anything());
    expect(dados).toEqual(antes);
    if (temPoppler) {
      const texto = textoPdf(pdf);
      expect(texto).toContain("1/" + dados.nossoNumero);
      expect(texto).toContain("0050 / 432260-0");
      expect(texto).toContain("20891.10007 00008.400509 43226.000008 2 14750002065330");
    }
  });
});

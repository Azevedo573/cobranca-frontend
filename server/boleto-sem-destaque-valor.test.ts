import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import QRCode from "qrcode";
import {
  calcularCodigoBarras,
  calcularLinhaDigitavel,
  formatarLinhaDigitavel,
  formatarValorReais,
  gerarBoletoPDF,
  type DadosBoleto,
} from "./boleto-pdf";
import { montarOrigemDividaAcordo } from "./origem-divida-acordo";

// Nenhum banco, API ou storage é consultado: até os códigos do modo API são
// sintéticos, montados com os helpers CNAB antes de preencher pagamentoBancario.
type Modo = "btg_api" | "cnab";
const cenarios = [
  { nome: "parcela única de 862 centavos / acordo #9", acordoId: 9, valoresCentavos: [862], atual: 0, origens: 1, referencia: "Parcela única do Acordo #9 / REF-BANNER-UNICA" },
  { nome: "entrada", acordoId: 10, valoresCentavos: [5000, 10000, 10000], atual: 0, origens: 2, referencia: "Entrada do Acordo #10 / REF-BANNER-ENTRADA" },
  { nome: "plano longo de 65 parcelas e 80 origens", acordoId: 11, valoresCentavos: Array.from({ length: 65 }, () => 5000), atual: 31, origens: 80, referencia: "Parcela 32/65 do Acordo #11 / REF-BANNER-LONGO" },
];

const tlv = (id: string, valor: string) => id + String(Buffer.byteLength(valor)).padStart(2, "0") + valor;
function comCrc(corpo: string): string {
  const prefixo = corpo + "6304";
  let crc = 0xffff;
  for (const byte of Buffer.from(prefixo)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  return prefixo + crc.toString(16).toUpperCase().padStart(4, "0");
}
function fixture(cenario: typeof cenarios[number], modo: Modo): DadosBoleto {
  const dataVencimento = new Date("2025-02-22T12:00:00Z");
  const valorCentavos = cenario.valoresCentavos[cenario.atual];
  const principal = cenario.origens * 10000;
  const origemDivida = montarOrigemDividaAcordo(
    Array.from({ length: cenario.origens }, (_, i) => ({ cobrancaId: i + 1, titulo: `Dívida sintética ${i + 1}`, valorOriginal: 10000, vencimento: dataVencimento })),
    [{ snapshotPrincipal: principal, snapshotCorrecao: 100, snapshotMulta: 200, snapshotJuros: 300, snapshotHonorarios: 400, snapshotValorAtualizado: principal + 1000 }],
  );
  const pixCopiaCola = comCrc(tlv("00", "01") + tlv("01", "12")
    + tlv("26", tlv("00", "BR.GOV.BCB.PIX") + tlv("25", `qr.example.test/acordo-${cenario.acordoId}`))
    + tlv("52", "0000") + tlv("53", "986") + tlv("54", (valorCentavos / 100).toFixed(2))
    + tlv("58", "BR") + tlv("59", "PAGADOR SINTETICO") + tlv("60", "CIDADE TESTE") + tlv("62", tlv("05", "***")));
  const dados: DadosBoleto = {
    nomeBeneficiario: "Beneficiário Sintético", cnpjBeneficiario: "00000000000000", enderecoBeneficiario: "Rua de Teste, 1",
    banco: "208", nomeBanco: "BTG", agencia: "0001", digitoAgencia: "", conta: "000001", digitoConta: "0", carteira: "1", convenio: "00000000000",
    nossoNumero: String(cenario.acordoId).padStart(10, "0"), dataVencimento, dataEmissao: new Date("2025-02-20T12:00:00Z"), valor: valorCentavos, especieDocumento: "DD", aceite: "N",
    nomeSacado: "Pagador Sintético", cpfCnpjSacado: "00000000000", enderecoSacado: "Rua de Teste, 2", cidadeSacado: "Cidade Sintética", ufSacado: "SP", cepSacado: "00000-000",
    localPagamento: "Pagável em qualquer banco", instrucoes: ["Instrução sintética: não receber após o vencimento"], seuNumero: `SINT-${cenario.acordoId}`, pixCopiaCola,
    contextoAcordo: {
      acordoId: cenario.acordoId, referenciaParcelaAtual: cenario.referencia, valorDocumento: valorCentavos,
      valorOrigem: origemDivida.totalFechamento!, totalNegociado: cenario.valoresCentavos.reduce((soma, valor) => soma + valor, 0),
      saldoAposEstePagamento: cenario.valoresCentavos.slice(cenario.atual + 1).reduce((soma, valor) => soma + valor, 0),
      parcelas: cenario.valoresCentavos.map((valor, i) => ({
        id: i + 1, installmentNumber: i + 1, etapa: `Etapa sintética ${i + 1}`, valor, vencimento: dataVencimento,
        status: "pendente", situacao: "A vencer", documentoAtual: i === cenario.atual,
      })),
    },
    origemDivida,
  };
  if (modo === "btg_api") {
    const codigoBarras = calcularCodigoBarras(dados);
    dados.pagamentoBancario = { origem: "btg_api", codigoBarras, linhaDigitavel: calcularLinhaDigitavel(codigoBarras) };
    dados.carteira = "API";
    dados.convenio = "SEM-CNAB";
  }
  return dados;
}

function textoPdf(pdf: Buffer): string {
  return execFileSync("pdftotext", ["-layout", "-", "-"], { input: pdf, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}
function yDetalhesFatura(pdf: Buffer): number {
  const bbox = execFileSync("pdftotext", ["-bbox", "-", "-"], { input: pdf, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const palavra = bbox.match(/<word\b[^>]*\byMin="([\d.]+)"[^>]*>Detalhes<\/word>/);
  expect(palavra, "Poppler deve localizar o título Detalhes da fatura").not.toBeNull();
  return Number(palavra![1]);
}
// Mesma inspeção de streams/I25 usada no teste BTG existente; não substitui
// PDFKit nem QRCode por mocks. O spy continua chamando o QR real.
function streamsPdf(pdf: Buffer): Buffer[] {
  const regex = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/gs;
  return [...pdf.toString("latin1").matchAll(regex)].map(match => {
    const buffer = Buffer.from(match[2], "latin1");
    return /\/FlateDecode/.test(match[1]) ? inflateSync(buffer) : buffer;
  });
}
function textosDosStreams(pdf: Buffer): string {
  return streamsPdf(pdf).map(stream => [...stream.toString("latin1").matchAll(/\[([^\]]*)\] TJ/g)]
    .map(match => [...match[1].matchAll(/<([0-9a-f]+)>/gi)].map(hex => Buffer.from(hex[1], "hex").toString("latin1")).join(""))
    .join("")).join("");
}
function decodificarI25Pdf(pdf: Buffer): string {
  const barras = streamsPdf(pdf).flatMap(stream => [...stream.toString("latin1").matchAll(/([\d.]+) ([\d.]+) ([\d.]+) 44 re\b/g)]
    .map(match => ({ x: Number(match[1]), largura: Number(match[3]) })));
  expect(barras).toHaveLength(114);
  const modulo = Math.min(...barras.map(barra => barra.largura));
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

describe.each<Modo>(["btg_api", "cnab"])("boleto sem destaque de valor — %s", modo => {
  it.each(cenarios)("$nome: remove somente banner e espaço, preservando título e contexto", async cenario => {
    const dados = fixture(cenario, modo), antes = structuredClone(dados);
    const qr = vi.spyOn(QRCode, "toBuffer");
    const pdf = await gerarBoletoPDF(dados);
    const texto = textoPdf(pdf);
    const valorFormatado = formatarValorReais(dados.valor);
    const codigoBarras = dados.pagamentoBancario?.codigoBarras ?? calcularCodigoBarras(dados);
    const linha = formatarLinhaDigitavel(dados.pagamentoBancario?.linhaDigitavel ?? calcularLinhaDigitavel(codigoBarras));

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const paginas = (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
    expect(paginas).toBeGreaterThan(0);
    expect(paginas).toBeLessThanOrEqual(2);
    expect(dados).toEqual(antes);
    expect(qr).toHaveBeenCalledTimes(1);
    expect(qr).toHaveBeenCalledWith(dados.pixCopiaCola, expect.objectContaining({ type: "png" }));
    expect(Buffer.from(qr.mock.calls[0][0] as string)).toEqual(Buffer.from(dados.pixCopiaCola!));
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
    expect(decodificarI25Pdf(pdf)).toBe(codigoBarras);

    const detalhes = texto.split("Detalhes da fatura")[1].split("Resumo do acordo")[0];
    expect(detalhes).toContain(`R$ ${valorFormatado}`);
    expect(detalhes).toContain("22/02/2025");
    expect(detalhes).toContain(dados.nossoNumero);
    const ficha = texto.split("Corte na linha pontilhada")[1];
    expect(ficha).toContain("Ficha de Compensação");
    expect(ficha).toContain(linha);
    expect(ficha.split("(=) Valor do Documento")[1].split("Instruções")[0]).toContain(valorFormatado);
    expect(ficha).toContain(dados.instrucoes[0]);
    expect(ficha).toContain("Pague com o PIX");
    expect(ficha.split("PIX COPIA E COLA")[1].replace(/\s/g, "")).toBe(dados.pixCopiaCola!.replace(/\s/g, ""));
    expect(textosDosStreams(pdf).split("PIX COPIA E COLA")[1].split("Corte na linha pontilhada")[0]).toBe(dados.pixCopiaCola);

    const resumo = texto.split("Resumo do acordo")[1].split(/Origem da dívida|Resumo da origem do acordo/)[0];
    expect(resumo).toContain("Base dos títulos na formalização");
    expect(resumo).toContain(`R$ ${formatarValorReais(dados.origemDivida!.totalFechamento!)}`);
    expect(resumo).toContain("Total negociado no acordo");
    expect(resumo).toContain(`R$ ${formatarValorReais(dados.contextoAcordo!.totalNegociado)}`);
    expect(resumo).toContain("Saldo após este pagamento");
    expect(resumo).toContain(`R$ ${formatarValorReais(dados.contextoAcordo!.saldoAposEstePagamento)}`);
    expect(texto).toContain(`${cenario.origens} cobrança(s) incluída(s)`);
    expect(texto).toContain("Principal preservado");
    expect(texto).toContain(`R$ ${formatarValorReais(dados.origemDivida!.principal!)}`);
    expect(texto).toContain("A origem explica o acordo e não altera o valor deste boleto.");
    expect(texto).toContain("Demonstrativo completo do acordo");
    expect(texto).not.toContain("Plano de pagamento do acordo");
    expect(texto).not.toContain("Etapa sintética");
    if (cenario.origens > 5) {
      expect(texto).toContain("composição consolidada");
      expect(texto).not.toContain("Dívida sintética 1");
    } else {
      expect(texto).toContain("Origem da dívida na formalização do acordo");
      expect(texto).toContain("Dívida sintética 1");
    }

    // Controle visual real: retirar contexto não altera o cabeçalho anterior aos
    // detalhes. Assim detectamos também um y += 51 esquecido após apagar o texto.
    const controle = structuredClone(dados);
    delete controle.contextoAcordo;
    const controleAntes = structuredClone(controle);
    const pdfSemContexto = await gerarBoletoPDF(controle);
    expect(controle).toEqual(controleAntes);
    expect(dados).toEqual(antes);

    if (modo === "btg_api" && cenario.acordoId === 9 && process.env.BOLETO_SEM_DESTAQUE_AMOSTRA_DIR) {
      mkdirSync(process.env.BOLETO_SEM_DESTAQUE_AMOSTRA_DIR, { recursive: true });
      writeFileSync(join(process.env.BOLETO_SEM_DESTAQUE_AMOSTRA_DIR, "boleto-sem-destaque-valor-sintetico.pdf"), pdf);
    }
    // Soft apenas nos critérios da remoção para o RED mostrar as duas ausências
    // e o espaço reservado, depois de todas as verificações de preservação.
    expect.soft(texto, "O título exclusivo do banner deve desaparecer").not.toContain("VALOR EXIGÍVEL NESTE BOLETO");
    expect.soft(texto, "A referência exclusiva do banner deve desaparecer").not.toContain(cenario.referencia);
    expect.soft(yDetalhesFatura(pdf), "Não reservar o espaço vertical do banner").toBeCloseTo(yDetalhesFatura(pdfSemContexto), 3);
  });
});

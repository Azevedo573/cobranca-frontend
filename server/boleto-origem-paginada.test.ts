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

// Integração documental local: PDFKit, QRCode e Poppler reais. Nenhum mock de
// renderização, consulta bancária, DB, storage, arquivo histórico ou dado pessoal.
// Poppler é requisito explícito desta suíte; sua ausência não silencia a regressão.
type Modo = "btg_api" | "cnab";
const MODOS: Modo[] = ["btg_api", "cnab"];
const QUANTIDADES = [0, 1, 5, 6, 80];
const BARRAS_API = "20898100000000050000012345678901234567890123";
const LINHA_API = "20890012304567890123745678901237810000000005000";
const LINHA_API_FORMATADA = "20890.01230 45678.901237 45678.901237 8 10000000005000";
const BARRAS_CNAB = "20897100000000050001100000002400504322600000";
const LINHA_CNAB_FORMATADA = "20891.10007 00002.400505 43226.000008 7 10000000005000";
const TITULO_ORIGEM = "Origem da dívida na formalização do acordo";
const LIMITE_INFERIOR = 812;
const tlv = (id: string, valor: string) => id + String(Buffer.byteLength(valor)).padStart(2, "0") + valor;
const normalizar = (texto: string) => texto.replace(/\s+/g, " ").trim();
const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ocorrencias = (texto: string, trecho: string) => [...texto.matchAll(new RegExp(escaparRegex(trecho), "g"))].length;

function comCrc(corpo: string): string {
  const prefixo = corpo + "6304";
  let crc = 0xffff;
  for (const byte of Buffer.from(prefixo)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  return prefixo + crc.toString(16).toUpperCase().padStart(4, "0");
}
function criarPix(gui = "BR.GOV.BCB.PIX", longo = false): string {
  return comCrc(tlv("00", "01") + tlv("01", "12")
    + tlv("26", tlv("00", gui) + tlv("25", "qr.example.test/807" + (longo ? "/" + "a".repeat(55) : "")))
    + tlv("52", "0000") + tlv("53", "986") + tlv("54", "50.00")
    + tlv("58", "BR") + tlv("59", " PAGADOR  TESTE ") + tlv("60", "CIDADE TESTE ")
    + tlv("62", tlv("05", "***")) + (longo ? tlv("80", " CAMPO  ADICIONAL ".repeat(5)) : ""));
}

/** Fixture reutilizável em testes/amostras locais; todos os nomes e códigos são fictícios. */
export function criarFixtureBoletoOrigemPaginada(quantidade: number, modo: Modo): DadosBoleto {
  const dataVencimento = new Date("2025-02-22T12:00:00Z");
  const vinculos = Array.from({ length: quantidade }, (_, i) => ({
    cobrancaId: 910001 + i,
    titulo: `ORIGEM${String(i + 1).padStart(4, "0")} início ação término`,
    valorOriginal: 10000 + i * 37,
    // Três vencimentos empatados por grupo; reverter a entrada exercita a ordem
    // histórica por vencimento/ID, e não a posição incidental no array recebido.
    vencimento: new Date(Date.UTC(2024, 0, 1 + Math.floor(i / 3), 12)),
  }));
  const principal = vinculos.reduce((soma, item) => soma + item.valorOriginal, 0);
  const snapshot = { snapshotPrincipal: principal, snapshotCorrecao: 123,
    snapshotMulta: 234, snapshotJuros: 345, snapshotHonorarios: 456,
    snapshotValorAtualizado: principal + 123 + 234 + 345 + 456 };
  const origemDivida = montarOrigemDividaAcordo(vinculos.reverse(), quantidade ? [snapshot, { ...snapshot }] : []);
  const dados: DadosBoleto = {
    nomeBeneficiario: "Beneficiário Sintético", cnpjBeneficiario: "00000000000000", enderecoBeneficiario: "Rua Sintética, 1",
    banco: "208", nomeBanco: "BTG", agencia: "0050", digitoAgencia: "", conta: "432260", digitoConta: "0", carteira: "1", convenio: "11051861158",
    nossoNumero: "1000000024", dataVencimento, dataEmissao: new Date("2025-02-20T12:00:00Z"), valor: 5000, especieDocumento: "DD", aceite: "N",
    nomeSacado: "Pagador Sintético", cpfCnpjSacado: "00000000000", enderecoSacado: "Rua Sintética, 2", cidadeSacado: "Cidade Sintética", ufSacado: "SP", cepSacado: "00000-000",
    localPagamento: "Pagável em qualquer banco", instrucoes: ["Não receber após o vencimento"], seuNumero: "DOC-SINT-807", pixCopiaCola: criarPix(),
    contextoAcordo: {
      acordoId: 807, referenciaParcelaAtual: "REFERENCIA-NAO-REINTRODUZIR-BANNER", valorDocumento: 5000,
      valorOrigem: origemDivida.totalFechamento ?? 0, totalNegociado: 325000, saldoAposEstePagamento: 320000,
      parcelas: Array.from({ length: 65 }, (_, i) => ({ id: i + 1, installmentNumber: i,
        etapa: `ETAPA-PLANO-NAO-IMPRIMIR-${String(i).padStart(2, "0")}`, valor: 5000, vencimento: dataVencimento,
        status: "pendente", situacao: "A vencer", documentoAtual: i === 0 })),
    },
    origemDivida,
  };
  if (modo === "btg_api") {
    dados.agencia = "0050";
    dados.conta = "0000432260";
    dados.digitoConta = "";
    dados.nossoNumero = "00001234567890123456789012345678901234";
    dados.carteira = "API";
    dados.convenio = "SEM-CNAB";
    dados.pagamentoBancario = { origem: "btg_api", codigoBarras: BARRAS_API, linhaDigitavel: LINHA_API };
  }
  return dados;
}

interface Palavra { texto: string; xMin: number; xMax: number; yMin: number; yMax: number }
interface Pagina { numero: number; texto: string; palavras: Palavra[]; stream: string; recursos: string }
function decodificarXml(texto: string): string {
  return texto.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n: string) => String.fromCodePoint(n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function objetosPdf(pdf: Buffer): Map<number, string> {
  return new Map([...pdf.toString("latin1").matchAll(/(\d+) 0 obj\b([\s\S]*?)endobj/g)]
    .map(match => [Number(match[1]), match[2]]));
}
function lerStream(objeto: string): string {
  const match = objeto.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
  expect(match, "Objeto /Contents precisa ter stream real").not.toBeNull();
  const bytes = Buffer.from(match![1], "latin1");
  return (/\/FlateDecode/.test(objeto) ? inflateSync(bytes) : bytes).toString("latin1");
}
function paginasPdf(pdf: Buffer): Pagina[] {
  const opcoes = { input: pdf, encoding: "utf8" as const, maxBuffer: 32 * 1024 * 1024 };
  const texto = execFileSync("pdftotext", ["-layout", "-", "-"], opcoes);
  const bbox = execFileSync("pdftotext", ["-bbox", "-", "-"], opcoes);
  const textos = texto.split("\f");
  if (!textos.at(-1)?.trim()) textos.pop();
  const caixas = [...bbox.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)];
  const objetos = objetosPdf(pdf);
  const arvore = [...objetos.values()].find(objeto => /\/Type \/Pages\b/.test(objeto));
  expect(arvore, "PDFKit deve emitir a árvore de páginas").toBeDefined();
  const filhos = arvore!.match(/\/Kids\s*\[([\s\S]*?)\]/);
  expect(filhos).not.toBeNull();
  const ids = [...filhos![1].matchAll(/(\d+) 0 R/g)].map(match => Number(match[1]));
  expect(textos.length).toBe(ids.length);
  expect(caixas.length).toBe(ids.length);
  return ids.map((id, i) => {
    const objeto = objetos.get(id)!;
    expect(objeto).toMatch(/\/Type \/Page\b/);
    const conteudo = objeto.match(/\/Contents\s*(\[[^\]]*\]|\d+ 0 R)/);
    const recurso = objeto.match(/\/Resources (\d+) 0 R/);
    expect(conteudo).not.toBeNull();
    expect(recurso).not.toBeNull();
    const stream = [...conteudo![1].matchAll(/(\d+) 0 R/g)].map(match => lerStream(objetos.get(Number(match[1]))!)).join("\n");
    const palavras = [...caixas[i][1].matchAll(/<word\b([^>]*)>([\s\S]*?)<\/word>/g)].map(match => {
      const coordenada = (nome: string) => Number(match[1].match(new RegExp(`${nome}="([\\d.-]+)"`))![1]);
      return { texto: decodificarXml(match[2]), xMin: coordenada("xMin"), xMax: coordenada("xMax"), yMin: coordenada("yMin"), yMax: coordenada("yMax") };
    });
    return { numero: i + 1, texto: normalizar(textos[i]), palavras, stream, recursos: objetos.get(Number(recurso![1]))! };
  });
}
function textosStream(stream: string): string {
  return [...stream.matchAll(/\[([^\]]*)\] TJ/g)].map(match => [...match[1].matchAll(/<([0-9a-f]+)>/gi)]
    .map(hex => Buffer.from(hex[1], "hex").toString("latin1")).join("")).join("");
}
function conferirLimites(paginas: Pagina[]): void {
  for (const pagina of paginas) {
    expect(pagina.palavras.length, `Página ${pagina.numero} não pode estar vazia`).toBeGreaterThan(0);
    for (const palavra of pagina.palavras) {
      const mensagem = `Página ${pagina.numero}, palavra ${palavra.texto}`;
      expect(palavra.xMin, mensagem).toBeGreaterThanOrEqual(0);
      expect(palavra.xMax, mensagem).toBeLessThan(595.28);
      expect(palavra.yMin, mensagem).toBeGreaterThan(0);
      expect(palavra.yMax, mensagem).toBeLessThan(LIMITE_INFERIOR);
    }
  }
}
function conferirCabecalhoOrigem(pagina: Pagina, continuacao: boolean): void {
  expect(pagina.texto).toContain(TITULO_ORIGEM);
  expect(pagina.texto).toContain("Cobrança de origem");
  expect(pagina.texto).toContain("Vencimento");
  expect(pagina.texto).toContain("Principal preservado");
  if (continuacao) expect(pagina.texto).toMatch(/continuação/i);
  const cobranca = pagina.palavras.find(palavra => palavra.texto === "Cobrança");
  expect(cobranca).toBeDefined();
  const vencimento = pagina.palavras.find(palavra => palavra.texto === "Vencimento" && Math.abs(palavra.yMin - cobranca!.yMin) < 1);
  const principal = pagina.palavras.find(palavra => palavra.texto === "Principal" && Math.abs(palavra.yMin - cobranca!.yMin) < 1);
  expect(vencimento, "Colunas devem ser repetidas juntas, na mesma linha").toBeDefined();
  expect(principal).toBeDefined();
  expect(cobranca!.xMin).toBeLessThan(vencimento!.xMin);
  expect(vencimento!.xMin).toBeLessThan(principal!.xMin);
}
function conferirSemResumoAutomatico(paginas: Pagina[]): void {
  const texto = paginas.map(pagina => pagina.texto).join(" ");
  expect(texto).not.toContain("Resumo da origem do acordo");
  expect(texto).not.toContain("composição consolidada");
  expect(texto).not.toContain("VALOR EXIGÍVEL NESTE BOLETO");
  expect(texto).not.toContain("REFERENCIA-NAO-REINTRODUZIR-BANNER");
  expect(texto).not.toContain("Plano de pagamento do acordo");
  expect(texto).not.toContain("ETAPA-PLANO-NAO-IMPRIMIR");
}
function conferirTodasOrigens(paginas: Pagina[], dados: DadosBoleto): void {
  const texto = paginas.map(pagina => pagina.texto).join(" ");
  const ids = [...texto.matchAll(/#(91\d{4})\b/g)].map(match => Number(match[1]));
  expect(ids, "Todos os IDs, uma única vez e na ordem histórica").toEqual(dados.origemDivida!.itens.map(item => item.cobrancaId));
  for (const item of dados.origemDivida!.itens) {
    expect(ocorrencias(texto, item.titulo), `Descrição integral única: ${item.cobrancaId}`).toBe(1);
    const pagina = paginas.find(p => p.texto.includes(item.titulo));
    expect(pagina).toBeDefined();
    const marcador = pagina!.palavras.find(palavra => palavra.texto === `#${item.cobrancaId}`);
    expect(marcador).toBeDefined();
    // A descrição curta não pode desaparecer atrás de um cabeçalho ou fora da folha.
    expect(marcador!.yMin).toBeGreaterThan(pagina!.palavras.find(palavra => palavra.texto === "Cobrança")!.yMax);
  }
  const paginasComOrigem = paginas.filter(pagina => /ORIGEM\d{4}/.test(pagina.texto));
  paginasComOrigem.forEach((pagina, i) => conferirCabecalhoOrigem(pagina, i > 0));
}
function conferirResumoHistorico(paginas: Pagina[], dados: DadosBoleto): void {
  const texto = paginas.map(pagina => pagina.texto).join(" ");
  const primeira = paginas[0].texto;
  for (const rotulo of ["Resumo do acordo", "Total negociado no acordo", "Saldo após este pagamento"]) {
    expect(ocorrencias(texto, rotulo), `Cartão/resumo preservado: ${rotulo}`).toBe(1);
    expect(primeira).toContain(rotulo);
  }
  expect(primeira).toContain("Base dos títulos na formalização");
  expect(primeira).toContain(`R$ ${formatarValorReais(dados.contextoAcordo!.totalNegociado)}`);
  expect(primeira).toContain(`R$ ${formatarValorReais(dados.contextoAcordo!.saldoAposEstePagamento)}`);
  const labels = ["Base", "Total", "Saldo"].map(label => paginas[0].palavras.find(p => p.texto === label));
  expect(labels.every(Boolean), "Três cartões continuam presentes").toBe(true);
  expect(labels[0]!.xMin).toBeLessThan(labels[1]!.xMin);
  expect(labels[1]!.xMin).toBeLessThan(labels[2]!.xMin);
  expect(labels[0]!.yMin).toBeCloseTo(labels[1]!.yMin, 2);
  expect(labels[1]!.yMin).toBeCloseTo(labels[2]!.yMin, 2);
  expect(texto).toContain(`${dados.origemDivida!.quantidade} cobrança(s) incluída(s)`);
  expect(texto).toContain("Principal preservado");
  expect(texto).toContain("Encargos exibidos de forma agregada, sem rateio por dívida.");
  expect(texto).toContain("A origem explica o acordo e não altera o valor deste boleto.");
  expect(texto).toContain("Demonstrativo completo do acordo");
  for (const aviso of dados.origemDivida!.avisos) expect(texto).toContain(normalizar(aviso));
  const origem = dados.origemDivida!;
  if (origem.quantidade) {
    expect(texto).toContain(`Correção: R$ ${formatarValorReais(origem.correcao!)}`);
    expect(texto).toContain(`Multa: R$ ${formatarValorReais(origem.multa!)}`);
    expect(texto).toContain(`Juros: R$ ${formatarValorReais(origem.juros!)}`);
    expect(texto).toContain(`Honorários: R$ ${formatarValorReais(origem.honorarios!)}`);
    expect(primeira).toContain(`R$ ${formatarValorReais(origem.totalFechamento!)}`);
  } else {
    expect(primeira).toContain("Não disponível");
    expect(texto).not.toContain("Correção: R$ 0,00");
  }
}
interface Barra { x: number; y: number; largura: number }
function barrasPagina(pagina: Pagina): Barra[] {
  return [...pagina.stream.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) 44 re\b/g)]
    .map(match => ({ x: Number(match[1]), y: Number(match[2]), largura: Number(match[3]) }));
}
function decodificarI25(barras: Barra[]): string {
  expect(barras).toHaveLength(114); // início 2 + 22 pares de 5 barras + fim 2
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
function desenhosQr(pdf: Buffer, paginas: Pagina[]) {
  const objetos = objetosPdf(pdf);
  return paginas.flatMap(pagina => [...pagina.stream.matchAll(/([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) cm\s*\/(I\d+) Do/g)]
    .flatMap(match => {
      const referencia = pagina.recursos.match(new RegExp(`/${match[7]} (\\d+) 0 R\\b`));
      expect(referencia, "Imagem desenhada precisa existir nos recursos da página").not.toBeNull();
      const imagem = objetos.get(Number(referencia![1]))!;
      // QR real é PNG 150x150; logos existentes não são confundidos com QR.
      if (!/\/Width 150\b/.test(imagem) || !/\/Height 150\b/.test(imagem)) return [];
      return [{ pagina: pagina.numero, largura: Number(match[1]), altura: -Number(match[4]),
        xMin: Number(match[5]), xMax: Number(match[5]) + Number(match[1]),
        yMin: Number(match[6]) + Number(match[4]), yMax: Number(match[6]) }];
    }));
}
function conferirFichaFinal(pdf: Buffer, paginas: Pagina[], dados: DadosBoleto, modo: Modo): void {
  const ultima = paginas.at(-1)!;
  const linha = modo === "btg_api" ? LINHA_API_FORMATADA : LINHA_CNAB_FORMATADA;
  for (const pagina of paginas.slice(0, -1)) {
    for (const exclusivo of [linha, "Ficha de Compensação", "Pague com o PIX", "PIX COPIA E COLA", "Corte na linha pontilhada"]) {
      expect(pagina.texto, `${exclusivo} somente na última página`).not.toContain(exclusivo);
    }
    expect(barrasPagina(pagina), `I25 não pode estar na página ${pagina.numero}`).toHaveLength(0);
  }
  expect(ocorrencias(ultima.texto, linha)).toBe(1);
  expect(ocorrencias(ultima.texto, "Ficha de Compensação")).toBe(1);
  const corte = ultima.palavras.find(palavra => palavra.texto === "Corte");
  expect(corte, "Separador de início da ficha deve ser visível").toBeDefined();
  const inicioFicha = corte!.yMin;
  for (const palavra of ultima.palavras.filter(p => /^#91\d{4}\b/.test(p.texto) || /^ORIGEM\d{4}/.test(p.texto))) {
    expect(palavra.yMax, "Nenhuma origem pode ser impressa depois do início da ficha").toBeLessThan(inicioFicha);
  }
  for (const exclusivoOrigem of ["cobrança(s) incluída(s)", "Encargos exibidos", "A origem explica", "Demonstrativo completo do acordo", "AVISO"]) {
    expect(ultima.texto.slice(ultima.texto.indexOf("Corte na linha pontilhada"))).not.toContain(exclusivoOrigem);
  }
  const ficha = ultima.texto.slice(ultima.texto.indexOf(linha));
  expect(ficha).toContain(modo === "btg_api" ? dados.nossoNumero : `1/${dados.nossoNumero}`);
  expect(ficha).toContain(modo === "btg_api" ? "0050 / 0000432260" : "0050 / 432260-0");
  expect(ficha).toContain("22/02/2025");
  expect(ficha).toContain("20/02/2025");
  expect(ficha).toContain(dados.seuNumero);
  expect(ficha).toContain(dados.nomeSacado);
  expect(ficha).toContain(dados.enderecoSacado);
  expect(ficha).toContain("(=) Valor do Documento");
  expect(ficha).toContain(formatarValorReais(dados.valor));
  const rotuloInstrucoes = ultima.palavras.find(p => p.texto === "Instruções" && p.yMin > inicioFicha);
  expect(rotuloInstrucoes).toBeDefined();
  const pagadorAposInstrucoes = ultima.palavras.find(p => p.texto === "Pagador" && p.yMin > rotuloInstrucoes!.yMax);
  expect(pagadorAposInstrucoes).toBeDefined();
  const textoInstrucoes = ultima.palavras.filter(p => p.xMin < 378
    && p.yMin > rotuloInstrucoes!.yMax && p.yMax < pagadorAposInstrucoes!.yMin).map(p => p.texto).join(" ");
  expect(normalizar(textoInstrucoes)).toBe(normalizar(dados.instrucoes.join(" ")));
  const barras = barrasPagina(ultima);
  expect(decodificarI25(barras)).toBe(modo === "btg_api" ? BARRAS_API : BARRAS_CNAB);
  for (const barra of barras) {
    expect(barra.x).toBeGreaterThan(0);
    expect(barra.x + barra.largura).toBeLessThan(595.28);
    expect(barra.y).toBeGreaterThan(inicioFicha);
    expect(barra.y + 44).toBeLessThan(LIMITE_INFERIOR);
  }
  const qrs = desenhosQr(pdf, paginas);
  if (dados.pixCopiaCola) {
    expect(ocorrencias(ultima.texto, "Pague com o PIX")).toBe(1);
    expect(qrs).toHaveLength(1);
    expect(qrs[0].pagina).toBe(ultima.numero);
    expect(qrs[0].largura).toBe(72);
    expect(qrs[0].altura).toBe(72);
    expect(qrs[0].xMin).toBeGreaterThan(0);
    expect(qrs[0].xMax).toBeLessThan(595.28);
    expect(qrs[0].yMin).toBeGreaterThan(inicioFicha);
    expect(qrs[0].yMax).toBeLessThan(LIMITE_INFERIOR);
    const textoPix = textosStream(ultima.stream).split("PIX COPIA E COLA")[1]?.split("Corte na linha pontilhada")[0];
    expect(textoPix, "Bytes Pix originais nos operadores textuais da última página").toBe(dados.pixCopiaCola);
    expect(Buffer.from(textoPix!)).toEqual(Buffer.from(dados.pixCopiaCola));
  } else {
    expect(qrs).toHaveLength(0);
    expect(ultima.texto).not.toContain("Pague com o PIX");
    expect(ultima.texto).not.toContain("PIX COPIA E COLA");
  }
  conferirLimites(paginas);
}
async function gerarImutavel(dados: DadosBoleto): Promise<Buffer> {
  const antes = structuredClone(dados);
  const codigoAntes = dados.pagamentoBancario?.codigoBarras ?? calcularCodigoBarras(dados);
  const linhaAntes = formatarLinhaDigitavel(dados.pagamentoBancario?.linhaDigitavel ?? calcularLinhaDigitavel(codigoAntes));
  const pdf = await gerarBoletoPDF(dados);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(dados, "Não alterar fonte histórica, valores, datas ou identificadores").toEqual(antes);
  expect(dados.pagamentoBancario?.codigoBarras ?? calcularCodigoBarras(dados)).toBe(codigoAntes);
  expect(formatarLinhaDigitavel(dados.pagamentoBancario?.linhaDigitavel ?? calcularLinhaDigitavel(codigoAntes))).toBe(linhaAntes);
  return pdf;
}
function gravarAmostraOptIn(pdf: Buffer, quantidade: number, modo: Modo): void {
  const diretorio = process.env.BOLETO_ORIGEM_AMOSTRA_DIR;
  if (!diretorio || ![5, 80].includes(quantidade)) return;
  mkdirSync(diretorio, { recursive: true });
  writeFileSync(join(diretorio, `boleto-${modo.replace("_", "-")}-${quantidade}-origens-completas-sintetico.pdf`), pdf);
}

afterEach(() => vi.restoreAllMocks());

describe.each(MODOS)("boleto com origem completa paginada — %s", modo => {
  it.each(QUANTIDADES)("%i origens: todos os IDs/textos, uma vez e em ordem, sem resumo automático", async quantidade => {
    const dados = criarFixtureBoletoOrigemPaginada(quantidade, modo);
    const pdf = await gerarImutavel(dados);
    gravarAmostraOptIn(pdf, quantidade, modo);
    const paginas = paginasPdf(pdf);
    conferirSemResumoAutomatico(paginas);
    conferirTodasOrigens(paginas, dados);
    conferirResumoHistorico(paginas, dados);
    conferirLimites(paginas);
    if (quantidade === 80) {
      expect(paginas.length, "Origem completa não tem teto artificial de duas páginas").toBeGreaterThan(2);
      expect(paginas.filter(p => /ORIGEM\d{4}/.test(p.texto)).length).toBeGreaterThan(2);
    }
  });

  it("cinco origens começam na primeira página após os três cartões, sem mover a lista inteira junto com a ficha", async () => {
    const dados = criarFixtureBoletoOrigemPaginada(5, modo);
    const paginas = paginasPdf(await gerarImutavel(dados));
    expect(paginas[0].texto).toContain(TITULO_ORIGEM);
    const primeiroId = `#${dados.origemDivida!.itens[0].cobrancaId}`;
    const primeiro = paginas[0].palavras.find(p => p.texto === primeiroId);
    expect(primeiro, "Primeira origem precisa aproveitar a primeira página").toBeDefined();
    const saldo = paginas[0].palavras.find(p => p.texto === "Saldo");
    expect(saldo).toBeDefined();
    expect(primeiro!.yMin).toBeGreaterThan(saldo!.yMax + 15);
    conferirTodasOrigens(paginas, dados);
  });

  it("uma origem curta com histórico consistente aproveita uma única página, sem criar página exclusiva para a ficha", async () => {
    const dados = criarFixtureBoletoOrigemPaginada(1, modo);
    const pdf = await gerarImutavel(dados), paginas = paginasPdf(pdf);
    expect(paginas, "Resumo, origem, avisos e bloco bancário cabem juntos nesta fixture").toHaveLength(1);
    conferirResumoHistorico(paginas, dados);
    conferirTodasOrigens(paginas, dados);
    conferirFichaFinal(pdf, paginas, dados, modo);
  });

  it.each(QUANTIDADES)("%i origens: ficha, linha, 114 barras I25, QR e Pix íntegros juntos somente na última página", async quantidade => {
    const dados = criarFixtureBoletoOrigemPaginada(quantidade, modo);
    const qr = vi.spyOn(QRCode, "toBuffer"); // spy call-through: gera o PNG verdadeiro
    const pdf = await gerarImutavel(dados);
    expect(qr).toHaveBeenCalledTimes(1);
    expect(qr).toHaveBeenCalledWith(dados.pixCopiaCola, expect.objectContaining({ type: "png", width: 150 }));
    expect(Buffer.from(qr.mock.calls[0][0] as string)).toEqual(Buffer.from(dados.pixCopiaCola!));
    const png = await qr.mock.results[0].value as Buffer;
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    conferirFichaFinal(pdf, paginasPdf(pdf), dados, modo);
  });

  it("sem Pix: mantém origem longa completa e I25 na ficha final, sem gerar QR ou página vazia", async () => {
    const dados = criarFixtureBoletoOrigemPaginada(80, modo);
    delete dados.pixCopiaCola;
    const qr = vi.spyOn(QRCode, "toBuffer");
    const pdf = await gerarImutavel(dados), paginas = paginasPdf(pdf);
    expect(qr).not.toHaveBeenCalled();
    conferirSemResumoAutomatico(paginas);
    conferirTodasOrigens(paginas, dados);
    conferirFichaFinal(pdf, paginas, dados, modo);
  });

  it("uma descrição multicaractere maior que duas páginas continua com cabeçalhos, sem perder ou duplicar nenhum token", async () => {
    const dados = criarFixtureBoletoOrigemPaginada(1, modo);
    const tokens = Array.from({ length: 1000 }, (_, i) => `DESCR${String(i).padStart(4, "0")}açãoÁéÇñü`);
    dados.origemDivida!.itens[0].titulo = tokens.join(" ");
    const pdf = await gerarImutavel(dados), paginas = paginasPdf(pdf);
    const encontrados = paginas.flatMap(p => [...p.texto.matchAll(/DESCR\d{4}açãoÁéÇñü/g)].map(m => m[0]));
    expect(encontrados, "Todos os caracteres acentuados e tokens em ordem, uma vez").toEqual(tokens);
    const comDescricao = paginas.filter(p => /DESCR\d{4}/.test(p.texto));
    expect(comDescricao.length).toBeGreaterThan(2);
    comDescricao.forEach((pagina, i) => conferirCabecalhoOrigem(pagina, i > 0));
    // A cobrança deve continuar identificável, sem registrar outro principal em cada trecho.
    const valoresPrincipal = paginas.flatMap(p => {
      const identificacoes = p.palavras.filter(w => w.texto === "#910001");
      return p.palavras.filter(w => w.xMin > 440 && w.texto === "100,00"
        && identificacoes.some(id => Math.abs(id.yMin - w.yMin) < 1));
    });
    expect(valoresPrincipal).toHaveLength(1);
    conferirSemResumoAutomatico(paginas);
    conferirFichaFinal(pdf, paginas, dados, modo);
  });

  it("palavra enorme sem espaços é dividida pela largura real e todos os caracteres reaparecem em ordem", async () => {
    const dados = criarFixtureBoletoOrigemPaginada(1, modo);
    const palavra = "INICIOPALAVRA" + Array.from({ length: 2400 }, (_, i) => `L${String(i).padStart(4, "0")}ÁÇÉ`).join("") + "FIMPALAVRA";
    dados.origemDivida!.itens[0].titulo = palavra;
    const pdf = await gerarImutavel(dados), paginas = paginasPdf(pdf);
    // Reconstrução das partes na coluna de descrição, tolerando que uma quebra
    // atravesse um token; não remove ou normaliza os caracteres da palavra fonte.
    const letras = paginas.flatMap(p => p.palavras.filter(w => w.xMin >= 34 && w.xMin < 385 && /^[A-ZÁÇÉ0-9]+$/.test(w.texto)).map(w => w.texto)).join("");
    const inicio = letras.indexOf("INICIOPALAVRA"), fim = letras.indexOf("FIMPALAVRA", inicio);
    expect(inicio).toBeGreaterThanOrEqual(0);
    expect(fim).toBeGreaterThan(inicio);
    expect(letras.slice(inicio, fim + "FIMPALAVRA".length)).toBe(palavra);
    const comLetras = paginas.filter(p => p.palavras.some(w => /^[A-ZÁÇÉ0-9]{15,}$/.test(w.texto) && w.xMin >= 34 && w.xMin < 385));
    expect(comLetras.length).toBeGreaterThan(2);
    comLetras.forEach((pagina, i) => conferirCabecalhoOrigem(pagina, i > 0));
    conferirSemResumoAutomatico(paginas);
    conferirFichaFinal(pdf, paginas, dados, modo);
  });

  it("avisos históricos multipágina vêm após todas as origens e antes da ficha, sem perda de conteúdo", async () => {
    const dados = criarFixtureBoletoOrigemPaginada(6, modo);
    const tokens = Array.from({ length: 1300 }, (_, i) => `AVISO${String(i).padStart(4, "0")}açãoÇé`);
    dados.origemDivida!.avisos.push(tokens.slice(0, 650).join(" "), tokens.slice(650).join(" "));
    const pdf = await gerarImutavel(dados), paginas = paginasPdf(pdf);
    const encontrados = paginas.flatMap(p => [...p.texto.matchAll(/AVISO\d{4}açãoÇé/g)].map(m => m[0]));
    expect(encontrados).toEqual(tokens);
    expect(paginas.filter(p => /AVISO\d{4}/.test(p.texto)).length).toBeGreaterThan(2);
    const texto = paginas.map(p => p.texto).join(" ");
    expect(texto.indexOf(tokens[0])).toBeGreaterThan(texto.indexOf(dados.origemDivida!.itens.at(-1)!.titulo));
    expect(texto.indexOf(tokens.at(-1)!)).toBeLessThan(texto.indexOf("Ficha de Compensação"));
    conferirTodasOrigens(paginas, dados);
    conferirSemResumoAutomatico(paginas);
    conferirFichaFinal(pdf, paginas, dados, modo);
  });

  it("Pix longo com GUI minúsculo e espaços mantém os bytes originais e todo o bloco bancário na última página", async () => {
    const dados = criarFixtureBoletoOrigemPaginada(80, modo);
    dados.pixCopiaCola = criarPix("br.gov.bcb.pix", true);
    const qr = vi.spyOn(QRCode, "toBuffer");
    const pdf = await gerarImutavel(dados), paginas = paginasPdf(pdf);
    expect(qr).toHaveBeenCalledTimes(1);
    expect(qr).toHaveBeenCalledWith(dados.pixCopiaCola, expect.anything());
    expect(Buffer.from(qr.mock.calls[0][0] as string)).toEqual(Buffer.from(dados.pixCopiaCola));
    conferirTodasOrigens(paginas, dados);
    conferirFichaFinal(pdf, paginas, dados, modo);
  });

  it("instruções bancárias extensas reservam altura real, sem sobrepor pagador, barras ou Pix", async () => {
    const dados = criarFixtureBoletoOrigemPaginada(80, modo);
    const tokens = Array.from({ length: 120 }, (_, i) => `INSTR${String(i).padStart(4, "0")}açãoÇé`);
    dados.instrucoes = [tokens.join(" ")];
    const qr = vi.spyOn(QRCode, "toBuffer");
    const pdf = await gerarImutavel(dados), paginas = paginasPdf(pdf), ultima = paginas.at(-1)!;
    expect(qr).toHaveBeenCalledTimes(1);
    const encontrados = paginas.flatMap(p => [...p.texto.matchAll(/INSTR\d{4}açãoÇé/g)].map(m => m[0]));
    expect(encontrados).toEqual(tokens);
    for (const pagina of paginas.slice(0, -1)) expect(pagina.texto).not.toContain("INSTR");
    const palavrasInstrucao = ultima.palavras.filter(p => /^INSTR\d{4}/.test(p.texto));
    const ultimaInstrucaoY = Math.max(...palavrasInstrucao.map(p => p.yMax));
    const primeiraInstrucaoY = Math.min(...palavrasInstrucao.map(p => p.yMin));
    expect(ultimaInstrucaoY - primeiraInstrucaoY, "Fixture deve ultrapassar os 80 pontos antigos").toBeGreaterThan(80);
    const pagadorFicha = ultima.palavras.find(p => p.texto === "Pagador" && p.yMin > primeiraInstrucaoY);
    expect(pagadorFicha, "Pagador bancário continua após todas as instruções").toBeDefined();
    expect(ultimaInstrucaoY).toBeLessThan(pagadorFicha!.yMin);
    conferirTodasOrigens(paginas, dados);
    conferirFichaFinal(pdf, paginas, dados, modo);
  });

  it("bloco bancário maior que uma A4 falha explicitamente, sem truncar input, substituir códigos ou tentar outro QR", async () => {
    const dados = criarFixtureBoletoOrigemPaginada(6, modo);
    dados.instrucoes = Array.from({ length: 100 }, (_, i) => `INSTRUCAO-EXCESSIVA-${String(i).padStart(3, "0")}`);
    const antes = structuredClone(dados);
    const codigoAntes = dados.pagamentoBancario?.codigoBarras ?? calcularCodigoBarras(dados);
    const qr = vi.spyOn(QRCode, "toBuffer");
    await expect(gerarBoletoPDF(dados)).rejects.toThrow(/ficha bancária.*excede.*página A4/i);
    expect(dados).toEqual(antes);
    expect(dados.pagamentoBancario?.codigoBarras ?? calcularCodigoBarras(dados)).toBe(codigoAntes);
    // É permitido pré-gerar o QR original antes de medir a ficha. Não é permitido
    // fazer fallback, emitir outro payload nem tentar reduzir os bytes para caber.
    expect(qr.mock.calls.length).toBeLessThanOrEqual(1);
    if (qr.mock.calls.length) expect(qr).toHaveBeenCalledWith(dados.pixCopiaCola, expect.objectContaining({ type: "png", width: 150 }));
  });

  it("histórico ausente não vira encargos zero nem altera o título, e todas as origens continuam completas", async () => {
    const dados = criarFixtureBoletoOrigemPaginada(6, modo);
    const vinculos = dados.origemDivida!.itens.map(item => ({ cobrancaId: item.cobrancaId, titulo: item.titulo,
      valorOriginal: item.principal, vencimento: item.vencimento }));
    dados.origemDivida = montarOrigemDividaAcordo(vinculos, []);
    const pdf = await gerarImutavel(dados), paginas = paginasPdf(pdf);
    const texto = paginas.map(p => p.texto).join(" ");
    expect(texto).toContain("Correção: Não disponível");
    expect(texto).toContain("Multa: Não disponível");
    expect(texto).toContain("Juros: Não disponível");
    expect(texto).toContain("Honorários: Não disponível");
    expect(texto).not.toContain("Correção: R$ 0,00");
    for (const aviso of dados.origemDivida.avisos) expect(texto).toContain(normalizar(aviso));
    conferirTodasOrigens(paginas, dados);
    conferirSemResumoAutomatico(paginas);
    conferirFichaFinal(pdf, paginas, dados, modo);
  });
});

it("API sem contexto original conserva as 80 origens congeladas, sem inventar cartões/parcelas ou reduzir a lista", async () => {
  const dados = criarFixtureBoletoOrigemPaginada(80, "btg_api");
  delete dados.contextoAcordo;
  const pdf = await gerarImutavel(dados), paginas = paginasPdf(pdf);
  const texto = paginas.map(p => p.texto).join(" ");
  expect(texto).toContain("Resumo do acordo indisponível");
  expect(texto).not.toContain("Total negociado no acordo");
  expect(texto).not.toContain("Saldo após este pagamento");
  conferirTodasOrigens(paginas, dados);
  conferirSemResumoAutomatico(paginas);
  expect(paginas.length).toBeGreaterThan(2);
  conferirFichaFinal(pdf, paginas, dados, "btg_api");
});

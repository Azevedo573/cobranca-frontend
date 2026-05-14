/**
 * Gerador de Boleto Bancário PDF — BTG Pactual (Banco 208)
 * Layout FEBRABAN CNAB 240 — Carteira 1 (Cobrança Simples)
 *
 * Referências:
 *  - Manual FEBRABAN de Cobrança Bancária
 *  - Manual de Integração BTG Pactual — Cobrança
 */

import PDFDocument from "pdfkit";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface DadosBoleto {
  // Beneficiário (cedente)
  nomeBeneficiario: string;
  cnpjBeneficiario: string;
  enderecoBeneficiario: string;
  // Banco
  banco: string;         // "208"
  nomeBanco: string;     // "BTG PACTUAL S/A"
  agencia: string;       // "0050"
  digitoAgencia: string; // "0"
  conta: string;         // "432260"
  digitoConta: string;   // "0"
  carteira: string;      // "1"
  convenio: string;      // "11051861158"
  // Título
  nossoNumero: string;   // "1000000084" (10 dígitos)
  dataVencimento: Date;
  dataEmissao: Date;
  valor: number;         // em centavos
  especieDocumento: string; // "DD"
  aceite: string;        // "N"
  // Sacado (devedor)
  nomeSacado: string;
  cpfCnpjSacado: string;
  enderecoSacado: string;
  cidadeSacado: string;
  ufSacado: string;
  cepSacado: string;
  // Instruções
  localPagamento: string;
  instrucoes: string[];
  // Referência
  seuNumero: string;     // número do documento (nossoNumero formatado)
}

// ─── Cálculos FEBRABAN ────────────────────────────────────────────────────────

/**
 * Módulo 10 — usado nos campos da linha digitável
 */
function modulo10(numero: string): string {
  let soma = 0;
  let mult = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    let res = parseInt(numero[i]) * mult;
    if (res > 9) res = Math.floor(res / 10) + (res % 10);
    soma += res;
    mult = mult === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return resto === 0 ? "0" : String(10 - resto);
}

/**
 * Módulo 11 — usado no dígito verificador do código de barras
 * Retorna "1" se o resto for 0 ou 1 (conforme FEBRABAN)
 */
function modulo11CodigoBarras(numero: string): string {
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
  let soma = 0;
  let idx = 0;
  for (let i = numero.length - 1; i >= 0; i--) {
    soma += parseInt(numero[i]) * pesos[idx % pesos.length];
    idx++;
  }
  const resto = soma % 11;
  if (resto === 0 || resto === 1) return "1";
  return String(11 - resto);
}

/**
 * Fator de vencimento: dias corridos desde a data base FEBRABAN.
 *
 * A FEBRABAN usa duas datas base:
 *  - Data base 1: 07/10/1997 — válida até fator 9999 (21/02/2025)
 *  - Data base 2: 22/02/2025 — válida a partir do fator 1000
 *
 * Para datas após 21/02/2025, usa-se a data base 2 com fator iniciando em 1000.
 * Retorna "0000" para boletos sem vencimento definido.
 */
function fatorVencimento(data: Date): string {
  const BASE1 = new Date("1997-10-07T00:00:00.000Z");
  const BASE2 = new Date("2025-02-22T00:00:00.000Z"); // Nova data base FEBRABAN
  const LIMITE_BASE1 = 9999;
  const FATOR_INICIO_BASE2 = 1000;

  const diff1 = Math.floor((data.getTime() - BASE1.getTime()) / (1000 * 60 * 60 * 24));

  if (diff1 <= 0) return "0000";

  if (diff1 <= LIMITE_BASE1) {
    // Data base 1: até 21/02/2025
    return String(diff1).padStart(4, "0");
  }

  // Data base 2: a partir de 22/02/2025
  const diff2 = Math.floor((data.getTime() - BASE2.getTime()) / (1000 * 60 * 60 * 24));
  const fator2 = FATOR_INICIO_BASE2 + diff2;
  if (fator2 > 9999) return "0000"; // Limite também para base 2
  return String(fator2).padStart(4, "0");
}

/**
 * Formata valor em centavos para 10 dígitos (sem separadores)
 * Ex: 2065330 → "0002065330"
 */
function formatarValor(centavos: number): string {
  return String(centavos).padStart(10, "0");
}

/**
 * Calcula o código de barras BTG (44 dígitos)
 *
 * Estrutura:
 *   [208][9][FATOR_VENC(4)][VALOR(10)][CAMPO_LIVRE(25)]
 *
 * Campo livre BTG (25 dígitos):
 *   [CARTEIRA(1)][NOSSO_NUMERO(10)][AGENCIA(4)][CONTA(6)][ZEROS(4)]
 *
 * O dígito verificador (pos 5) é calculado sobre os outros 43 dígitos.
 */
export function calcularCodigoBarras(d: DadosBoleto): string {
  const banco = d.banco.padStart(3, "0");
  const moeda = "9"; // Real
  const fator = fatorVencimento(d.dataVencimento);
  const valor = formatarValor(d.valor);

  // Campo livre BTG: carteira(1) + nossoNumero(10) + agencia(4) + conta(6) + zeros(4)
  const carteira = d.carteira.padStart(1, "0");
  const nossoNum = d.nossoNumero.padStart(10, "0");
  const agencia = d.agencia.replace(/\D/g, "").padStart(4, "0");
  const conta = d.conta.replace(/\D/g, "").padStart(6, "0");
  const campoLivre = `${carteira}${nossoNum}${agencia}${conta}0000`;

  // Código sem o DV (posição 5)
  const semDV = `${banco}${moeda}${fator}${valor}${campoLivre}`;
  const dv = modulo11CodigoBarras(semDV);

  // Inserir DV na posição 5 (índice 4)
  return `${banco}${moeda}${dv}${fator}${valor}${campoLivre}`;
}

/**
 * Calcula a linha digitável (47 dígitos) a partir do código de barras (44 dígitos)
 *
 * Estrutura da linha digitável:
 *   Campo 1 (10): banco(3) + moeda(1) + campoLivre[0-4](5) + DV10
 *   Campo 2 (11): campoLivre[5-14](10) + DV10
 *   Campo 3 (11): campoLivre[15-24](10) + DV10
 *   Campo 4 (1):  DV do código de barras
 *   Campo 5 (14): fatorVenc(4) + valor(10)
 */
export function calcularLinhaDigitavel(codigoBarras: string): string {
  const banco = codigoBarras.substring(0, 3);
  const moeda = codigoBarras.substring(3, 4);
  const dvGeral = codigoBarras.substring(4, 5);
  const fator = codigoBarras.substring(5, 9);
  const valor = codigoBarras.substring(9, 19);
  const campoLivre = codigoBarras.substring(19, 44); // 25 dígitos

  // Campo 1: banco(3) + moeda(1) + campoLivre[0-4](5) → 9 dígitos + DV10
  const campo1Base = `${banco}${moeda}${campoLivre.substring(0, 5)}`;
  const campo1 = `${campo1Base}${modulo10(campo1Base)}`;

  // Campo 2: campoLivre[5-14](10) → 10 dígitos + DV10
  const campo2Base = campoLivre.substring(5, 15);
  const campo2 = `${campo2Base}${modulo10(campo2Base)}`;

  // Campo 3: campoLivre[15-24](10) → 10 dígitos + DV10
  const campo3Base = campoLivre.substring(15, 25);
  const campo3 = `${campo3Base}${modulo10(campo3Base)}`;

  // Campo 4: DV geral do código de barras
  const campo4 = dvGeral;

  // Campo 5: fator(4) + valor(10)
  const campo5 = `${fator}${valor}`;

  return `${campo1} ${campo2} ${campo3} ${campo4} ${campo5}`;
}

/**
 * Formata a linha digitável para exibição padrão:
 * XXXXX.XXXXX XXXXX.XXXXXX XXXXX.XXXXXX X XXXXXXXXXXXXXX
 */
export function formatarLinhaDigitavel(linha: string): string {
  const s = linha.replace(/\s/g, "");
  if (s.length !== 47) return linha;
  return `${s.substring(0, 5)}.${s.substring(5, 10)} ${s.substring(10, 15)}.${s.substring(15, 21)} ${s.substring(21, 26)}.${s.substring(26, 32)} ${s.substring(32, 33)} ${s.substring(33, 47)}`;
}

// ─── Gerador de código de barras visual (barras) ──────────────────────────────

/**
 * Gera as barras do código de barras Interleaved 2 of 5 (I25)
 * conforme padrão FEBRABAN para boletos
 */
function gerarBarrasI25(codigo: string): Array<{ largura: number; tipo: "barra" | "espaco" }> {
  const tabela: Record<string, string> = {
    "0": "00110", "1": "10001", "2": "01001", "3": "11000",
    "4": "00101", "5": "10100", "6": "01100", "7": "00011",
    "8": "10010", "9": "01010",
  };

  // I25 processa pares de dígitos
  const barras: Array<{ largura: number; tipo: "barra" | "espaco" }> = [];

  // Start: 4 barras estreitas (barra, espaço, barra, espaço)
  barras.push({ largura: 1, tipo: "barra" });
  barras.push({ largura: 1, tipo: "espaco" });
  barras.push({ largura: 1, tipo: "barra" });
  barras.push({ largura: 1, tipo: "espaco" });

  for (let i = 0; i < codigo.length; i += 2) {
    const d1 = tabela[codigo[i]];
    const d2 = tabela[codigo[i + 1]];
    for (let j = 0; j < 5; j++) {
      barras.push({ largura: d1[j] === "1" ? 3 : 1, tipo: "barra" });
      barras.push({ largura: d2[j] === "1" ? 3 : 1, tipo: "espaco" });
    }
  }

  // Stop: barra larga + barra estreita + espaço estreito
  barras.push({ largura: 3, tipo: "barra" });
  barras.push({ largura: 1, tipo: "espaco" });
  barras.push({ largura: 1, tipo: "barra" });

  return barras;
}

// ─── Formatadores ─────────────────────────────────────────────────────────────

function formatarData(data: Date): string {
  const d = String(data.getDate()).padStart(2, "0");
  const m = String(data.getMonth() + 1).padStart(2, "0");
  const a = data.getFullYear();
  return `${d}/${m}/${a}`;
}

function formatarValorReais(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

function formatarCNPJ(cnpj: string): string {
  const n = cnpj.replace(/\D/g, "");
  if (n.length === 14) {
    return `${n.substring(0, 2)}.${n.substring(2, 5)}.${n.substring(5, 8)}/${n.substring(8, 12)}-${n.substring(12, 14)}`;
  }
  if (n.length === 11) {
    return `${n.substring(0, 3)}.${n.substring(3, 6)}.${n.substring(6, 9)}-${n.substring(9, 11)}`;
  }
  return cnpj;
}

// ─── Gerador de PDF ───────────────────────────────────────────────────────────

/**
 * Gera o PDF do boleto bancário e retorna um Buffer.
 */
export async function gerarBoletoPDF(dados: DadosBoleto): Promise<Buffer> {
  const codigoBarras = calcularCodigoBarras(dados);
  const linhaDigitavel = calcularLinhaDigitavel(codigoBarras);
  const linhaFormatada = formatarLinhaDigitavel(linhaDigitavel);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      info: {
        Title: `Boleto - ${dados.nomeSacado}`,
        Author: dados.nomeBeneficiario,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const L = 40;   // margem esquerda
    const R = 555;  // margem direita
    const W = R - L; // largura útil

    // ── Cores e fontes ──
    const CINZA_CLARO = "#f5f5f5";
    const CINZA_BORDA = "#cccccc";
    const PRETO = "#000000";
    const FONTE = "Helvetica";
    const FONTE_BOLD = "Helvetica-Bold";

    // ── Função auxiliar: linha horizontal ──
    const hLine = (y: number) => {
      doc.moveTo(L, y).lineTo(R, y).strokeColor(CINZA_BORDA).lineWidth(0.5).stroke();
    };

    // ── Função auxiliar: linha vertical ──
    const vLine = (x: number, y1: number, y2: number) => {
      doc.moveTo(x, y1).lineTo(x, y2).strokeColor(CINZA_BORDA).lineWidth(0.5).stroke();
    };

    // ── Função auxiliar: campo com label e valor ──
    const campo = (x: number, y: number, w: number, label: string, valor: string, opts?: { bold?: boolean; fontSize?: number }) => {
      doc.font(FONTE).fontSize(6).fillColor("#666666").text(label, x + 2, y + 2, { width: w - 4 });
      doc.font(opts?.bold ? FONTE_BOLD : FONTE)
        .fontSize(opts?.fontSize ?? 8)
        .fillColor(PRETO)
        .text(valor, x + 2, y + 12, { width: w - 4 });
    };

    let y = 40;

    // ════════════════════════════════════════════════════════════
    // RECIBO DO SACADO (parte superior — destacável)
    // ════════════════════════════════════════════════════════════

    // Cabeçalho do recibo
    doc.rect(L, y, W, 18).fillColor(CINZA_CLARO).fill();
    doc.font(FONTE_BOLD).fontSize(7).fillColor(PRETO)
      .text("RECIBO DO SACADO", L + 2, y + 5, { width: W - 4, align: "center" });
    y += 18;
    hLine(y);

    // Linha: Beneficiário | Banco | Vencimento
    const y1 = y;
    const colBanco = R - 130;
    const colVenc = R - 60;

    doc.rect(L, y, colBanco - L, 28).fillColor("#ffffff").fill();
    campo(L, y, colBanco - L, "BENEFICIÁRIO", `${dados.nomeBeneficiario} — CNPJ: ${formatarCNPJ(dados.cnpjBeneficiario)}`);

    doc.rect(colBanco, y, colVenc - colBanco, 28).fillColor("#ffffff").fill();
    campo(colBanco, y, colVenc - colBanco, "BANCO", `${dados.banco} — ${dados.nomeBanco}`);

    doc.rect(colVenc, y, R - colVenc, 28).fillColor("#ffffff").fill();
    campo(colVenc, y, R - colVenc, "VENCIMENTO", formatarData(dados.dataVencimento), { bold: true });

    y += 28;
    hLine(y);
    vLine(colBanco, y1, y);
    vLine(colVenc, y1, y);

    // Linha: Sacado | Valor
    const y2 = y;
    const colValor = R - 120;

    doc.rect(L, y, colValor - L, 28).fillColor("#ffffff").fill();
    campo(L, y, colValor - L, "SACADO", `${dados.nomeSacado} — CPF/CNPJ: ${formatarCNPJ(dados.cpfCnpjSacado)}`);

    doc.rect(colValor, y, R - colValor, 28).fillColor("#ffffff").fill();
    campo(colValor, y, R - colValor, "VALOR DO DOCUMENTO", formatarValorReais(dados.valor), { bold: true });

    y += 28;
    hLine(y);
    vLine(colValor, y2, y);

    // Linha: Nosso Número | Agência/Conta | Data Emissão
    const y3 = y;
    const colAg = L + 180;
    const colEmissao = R - 100;

    campo(L, y, colAg - L, "NOSSO NÚMERO", dados.nossoNumero);
    campo(colAg, y, colEmissao - colAg, "AGÊNCIA / CONTA", `${dados.agencia} / ${dados.conta}-${dados.digitoConta}`);
    campo(colEmissao, y, R - colEmissao, "DATA DE EMISSÃO", formatarData(dados.dataEmissao));

    y += 24;
    hLine(y);
    vLine(colAg, y3, y);
    vLine(colEmissao, y3, y);

    // Linha digitável no recibo
    doc.font(FONTE_BOLD).fontSize(9).fillColor(PRETO)
      .text(linhaFormatada, L + 2, y + 6, { width: W - 4, align: "center" });
    y += 22;
    hLine(y);

    // ── Linha de corte ──
    y += 8;
    doc.font(FONTE).fontSize(7).fillColor("#999999")
      .text("✂  Corte aqui", L, y, { width: W, align: "center" });
    doc.moveTo(L, y + 4).lineTo(R, y + 4).dash(3, { space: 3 }).strokeColor("#aaaaaa").lineWidth(0.5).stroke();
    doc.undash();
    y += 16;

    // ════════════════════════════════════════════════════════════
    // BOLETO BANCÁRIO (parte inferior — para o banco)
    // ════════════════════════════════════════════════════════════

    // ── Cabeçalho: Banco | Linha digitável ──
    const yHeader = y;
    const colSep1 = L + 80;
    const colSep2 = L + 100;

    // Logo banco (texto)
    doc.rect(L, y, colSep1 - L, 32).fillColor("#ffffff").fill();
    doc.font(FONTE_BOLD).fontSize(14).fillColor(PRETO)
      .text(dados.banco, L + 4, y + 4, { width: colSep1 - L - 8 });
    doc.font(FONTE).fontSize(7).fillColor("#444444")
      .text(dados.nomeBanco, L + 4, y + 20, { width: colSep1 - L - 8 });

    // Separador
    vLine(colSep1, y, y + 32);
    doc.font(FONTE_BOLD).fontSize(11).fillColor(PRETO)
      .text("208-7", colSep1 + 2, y + 10, { width: colSep2 - colSep1 - 4, align: "center" });
    vLine(colSep2, y, y + 32);

    // Linha digitável
    doc.font(FONTE_BOLD).fontSize(10).fillColor(PRETO)
      .text(linhaFormatada, colSep2 + 4, y + 10, { width: R - colSep2 - 8, align: "right" });

    y += 32;
    hLine(y);

    // ── Local de pagamento ──
    const yLocal = y;
    campo(L, y, W * 0.65, "LOCAL DE PAGAMENTO", dados.localPagamento);
    campo(L + W * 0.65, y, W * 0.35, "VENCIMENTO", formatarData(dados.dataVencimento), { bold: true, fontSize: 10 });
    y += 28;
    hLine(y);
    vLine(L + W * 0.65, yLocal, y);

    // ── Beneficiário ──
    const yBenef = y;
    campo(L, y, W * 0.65, "BENEFICIÁRIO", `${dados.nomeBeneficiario} — CNPJ: ${formatarCNPJ(dados.cnpjBeneficiario)}`);
    doc.font(FONTE).fontSize(7).fillColor("#666666").text(dados.enderecoBeneficiario, L + 2, y + 20, { width: W * 0.65 - 4 });
    campo(L + W * 0.65, y, W * 0.35, "AGÊNCIA / CÓDIGO DO BENEFICIÁRIO", `${dados.agencia}-${dados.digitoAgencia} / ${dados.conta}-${dados.digitoConta}`);
    y += 32;
    hLine(y);
    vLine(L + W * 0.65, yBenef, y);

    // ── Data emissão | Carteira | Espécie | Aceite | Nosso número ──
    const yDados = y;
    const cw = W / 5;
    campo(L, y, cw, "DATA DO DOCUMENTO", formatarData(dados.dataEmissao));
    campo(L + cw, y, cw, "NÚMERO DO DOCUMENTO", dados.seuNumero);
    campo(L + cw * 2, y, cw, "ESPÉCIE DOC.", dados.especieDocumento);
    campo(L + cw * 3, y, cw, "ACEITE", dados.aceite);
    campo(L + cw * 4, y, cw, "DATA DE PROCESSAMENTO", formatarData(dados.dataEmissao));
    y += 24;
    hLine(y);
    for (let i = 1; i < 5; i++) vLine(L + cw * i, yDados, y);

    // ── Nosso número | Carteira | Espécie | Valor ──
    const yNosso = y;
    const cw2 = W / 4;
    campo(L, y, cw2, "NOSSO NÚMERO", dados.nossoNumero, { bold: true });
    campo(L + cw2, y, cw2, "CARTEIRA", dados.carteira);
    campo(L + cw2 * 2, y, cw2, "ESPÉCIE", "R$");
    campo(L + cw2 * 3, y, cw2, "VALOR DO DOCUMENTO", formatarValorReais(dados.valor), { bold: true, fontSize: 10 });
    y += 28;
    hLine(y);
    for (let i = 1; i < 4; i++) vLine(L + cw2 * i, yNosso, y);

    // ── Instruções ──
    const yInstr = y;
    const instrW = W * 0.65;
    doc.font(FONTE).fontSize(6).fillColor("#666666").text("INSTRUÇÕES (Texto de responsabilidade do Beneficiário)", L + 2, y + 2, { width: instrW - 4 });
    dados.instrucoes.forEach((instr, idx) => {
      doc.font(FONTE).fontSize(8).fillColor(PRETO).text(`• ${instr}`, L + 4, y + 14 + idx * 12, { width: instrW - 8 });
    });

    // Campos à direita das instruções
    const xRight = L + instrW;
    const rightW = W - instrW;
    campo(xRight, y, rightW, "(-) DESCONTO / ABATIMENTO", "");
    y += 18;
    hLine(y);
    vLine(xRight, yInstr, y + 18 * 3);

    campo(xRight, y, rightW, "(-) OUTRAS DEDUÇÕES", "");
    y += 18;
    hLine(y);

    campo(xRight, y, rightW, "(+) MORA / MULTA", "");
    y += 18;
    hLine(y);

    campo(xRight, y, rightW, "(+) OUTROS ACRÉSCIMOS", "");
    y += 18;
    hLine(y);

    campo(xRight, y, rightW, "(=) VALOR COBRADO", "", { bold: true });
    y += 18;
    hLine(y);

    // ── Sacado ──
    const ySacado = y;
    doc.font(FONTE).fontSize(6).fillColor("#666666").text("SACADO", L + 2, y + 2);
    doc.font(FONTE).fontSize(8).fillColor(PRETO)
      .text(`${dados.nomeSacado} — CPF/CNPJ: ${formatarCNPJ(dados.cpfCnpjSacado)}`, L + 2, y + 12, { width: W - 4 });
    doc.font(FONTE).fontSize(8).fillColor(PRETO)
      .text(`${dados.enderecoSacado} — ${dados.cidadeSacado}/${dados.ufSacado} — CEP: ${dados.cepSacado}`, L + 2, y + 22, { width: W - 4 });
    y += 36;
    hLine(y);

    // ── Código de barras ──
    y += 10;
    const barras = gerarBarrasI25(codigoBarras);
    const alturaBarras = 40;
    const larguraTotal = barras.reduce((acc, b) => acc + b.largura, 0);
    const escala = (W * 0.85) / larguraTotal;
    let xBar = L + W * 0.075;

    barras.forEach((b) => {
      if (b.tipo === "barra") {
        doc.rect(xBar, y, b.largura * escala, alturaBarras).fillColor(PRETO).fill();
      }
      xBar += b.largura * escala;
    });

    y += alturaBarras + 6;

    // Número do código de barras abaixo das barras
    doc.font(FONTE).fontSize(7).fillColor(PRETO)
      .text(codigoBarras, L, y, { width: W, align: "center" });

    y += 16;

    // ── Autenticação mecânica ──
    doc.font(FONTE).fontSize(7).fillColor("#999999")
      .text("Autenticação Mecânica / Ficha de Compensação", L, y, { width: W, align: "right" });

    doc.end();
  });
}

// ─── Formatadores para exibição ───────────────────────────────────────────────

export { formatarData, formatarValorReais, formatarCNPJ };

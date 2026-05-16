/**
 * Gerador de Boleto Bancário PDF — BTG Pactual (Banco 208)
 * Layout baseado na Máscara Oficial BTG Pactual
 *
 * Estrutura:
 *  1. Recibo do Pagador (topo, destacável)
 *  2. Linha pontilhada de corte
 *  3. Ficha de Compensação (baixo, com código de barras)
 */

import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

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
  especieDocumento: string; // "DM"
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
  seuNumero: string;     // número do documento
}

// ─── Cálculos FEBRABAN ────────────────────────────────────────────────────────

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

function fatorVencimento(data: Date): string {
  const BASE1 = new Date("1997-10-07T00:00:00.000Z");
  const BASE2 = new Date("2025-02-22T00:00:00.000Z");
  const LIMITE_BASE1 = 9999;
  const FATOR_INICIO_BASE2 = 1000;

  const diff1 = Math.floor((data.getTime() - BASE1.getTime()) / (1000 * 60 * 60 * 24));
  if (diff1 <= 0) return "0000";
  if (diff1 <= LIMITE_BASE1) return String(diff1).padStart(4, "0");

  const diff2 = Math.floor((data.getTime() - BASE2.getTime()) / (1000 * 60 * 60 * 24));
  const fator2 = FATOR_INICIO_BASE2 + diff2;
  if (fator2 > 9999) return "0000";
  return String(fator2).padStart(4, "0");
}

function formatarValorCentavos(centavos: number): string {
  return String(centavos).padStart(10, "0");
}

export function calcularCodigoBarras(d: DadosBoleto): string {
  const banco = d.banco.padStart(3, "0");
  const moeda = "9";
  const fator = fatorVencimento(d.dataVencimento);
  const valor = formatarValorCentavos(d.valor);

  const carteira = d.carteira.padStart(1, "0");
  const nossoNum = d.nossoNumero.padStart(10, "0");
  const agencia = d.agencia.replace(/\D/g, "").padStart(4, "0");
  const conta = d.conta.replace(/\D/g, "").padStart(6, "0");
  const campoLivre = `${carteira}${nossoNum}${agencia}${conta}0000`;

  const semDV = `${banco}${moeda}${fator}${valor}${campoLivre}`;
  const dv = modulo11CodigoBarras(semDV);

  return `${banco}${moeda}${dv}${fator}${valor}${campoLivre}`;
}

export function calcularLinhaDigitavel(codigoBarras: string): string {
  const banco = codigoBarras.substring(0, 3);
  const moeda = codigoBarras.substring(3, 4);
  const dvGeral = codigoBarras.substring(4, 5);
  const fator = codigoBarras.substring(5, 9);
  const valor = codigoBarras.substring(9, 19);
  const campoLivre = codigoBarras.substring(19, 44);

  const campo1Base = `${banco}${moeda}${campoLivre.substring(0, 5)}`;
  const campo1 = `${campo1Base}${modulo10(campo1Base)}`;

  const campo2Base = campoLivre.substring(5, 15);
  const campo2 = `${campo2Base}${modulo10(campo2Base)}`;

  const campo3Base = campoLivre.substring(15, 25);
  const campo3 = `${campo3Base}${modulo10(campo3Base)}`;

  const campo4 = dvGeral;
  const campo5 = `${fator}${valor}`;

  return `${campo1} ${campo2} ${campo3} ${campo4} ${campo5}`;
}

export function formatarLinhaDigitavel(linha: string): string {
  const s = linha.replace(/\s/g, "");
  if (s.length !== 47) return linha;
  return `${s.substring(0, 5)}.${s.substring(5, 10)} ${s.substring(10, 15)}.${s.substring(15, 21)} ${s.substring(21, 26)}.${s.substring(26, 32)} ${s.substring(32, 33)} ${s.substring(33, 47)}`;
}

// ─── Código de barras I25 ─────────────────────────────────────────────────────

function gerarBarrasI25(codigo: string): Array<{ largura: number; tipo: "barra" | "espaco" }> {
  const tabela: Record<string, string> = {
    "0": "00110", "1": "10001", "2": "01001", "3": "11000",
    "4": "00101", "5": "10100", "6": "01100", "7": "00011",
    "8": "10010", "9": "01010",
  };

  const barras: Array<{ largura: number; tipo: "barra" | "espaco" }> = [];

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

  barras.push({ largura: 3, tipo: "barra" });
  barras.push({ largura: 1, tipo: "espaco" });
  barras.push({ largura: 1, tipo: "barra" });

  return barras;
}

// ─── Formatadores ─────────────────────────────────────────────────────────────

export function formatarData(data: Date): string {
  const d = String(data.getDate()).padStart(2, "0");
  const m = String(data.getMonth() + 1).padStart(2, "0");
  const a = data.getFullYear();
  return `${d}/${m}/${a}`;
}

export function formatarValorReais(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

export function formatarCNPJ(cnpj: string): string {
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

export async function gerarBoletoPDF(dados: DadosBoleto): Promise<Buffer> {
  const codigoBarras = calcularCodigoBarras(dados);
  const linhaDigitavel = calcularLinhaDigitavel(codigoBarras);
  const linhaFormatada = formatarLinhaDigitavel(linhaDigitavel);

  // Nosso número formatado: carteira/nossoNumero-dv
  const nossoNumFormatado = `${dados.carteira}/${dados.nossoNumero}`;

  // Agência/Código do Beneficiário
  const agenciaCodigo = `${dados.agencia}/${dados.conta}-${dados.digitoConta}`;

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

    // ── Constantes de layout ──
    const PAGE_W = 595.28; // A4 largura em pontos
    const ML = 28;         // margem esquerda
    const MR = PAGE_W - 28; // margem direita
    const W = MR - ML;     // largura útil

    const PRETO = "#000000";
    const CINZA_LABEL = "#555555";
    const CINZA_BORDA = "#999999";
    const FONTE = "Helvetica";
    const FONTE_BOLD = "Helvetica-Bold";

    // ── Helpers ──
    const hLine = (y: number, x1 = ML, x2 = MR) => {
      doc.moveTo(x1, y).lineTo(x2, y).strokeColor(CINZA_BORDA).lineWidth(0.4).stroke();
    };

    const vLine = (x: number, y1: number, y2: number) => {
      doc.moveTo(x, y1).lineTo(x, y2).strokeColor(CINZA_BORDA).lineWidth(0.4).stroke();
    };

    // Célula: label pequeno em cima, valor em baixo
    const cell = (
      x: number, y: number, w: number, h: number,
      label: string, valor: string,
      opts?: { bold?: boolean; fontSize?: number; align?: "left" | "right" | "center" }
    ) => {
      const fs = opts?.fontSize ?? 8;
      const align = opts?.align ?? "left";
      doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL)
        .text(label, x + 3, y + 2, { width: w - 6, lineBreak: false });
      doc.font(opts?.bold ? FONTE_BOLD : FONTE)
        .fontSize(fs).fillColor(PRETO)
        .text(valor, x + 3, y + h - fs - 4, { width: w - 6, align, lineBreak: false });
    };

    // Logo BTG Pactual
    const logoPath = path.join(process.cwd(), "client/public/btg-logo.png");
    const logoExists = fs.existsSync(logoPath);

    // Cabeçalho BTG: logo | |208-1| | linha digitável
    const desenharCabecalho = (y: number): number => {
      const H = 34;
      const xSep1 = ML + 95;  // fim do logo
      const xSep2 = xSep1 + 42; // fim do código banco

      // Logo BTG
      if (logoExists) {
        doc.image(logoPath, ML + 2, y + 4, { height: 24, fit: [90, 24] });
      } else {
        doc.font(FONTE_BOLD).fontSize(11).fillColor("#003087")
          .text("btg pactual", ML + 2, y + 10, { width: 90 });
      }

      // Separador vertical
      vLine(xSep1, y, y + H);

      // Código do banco |208-1|
      doc.font(FONTE_BOLD).fontSize(13).fillColor(PRETO)
        .text("|208-1|", xSep1 + 2, y + 10, { width: 40, align: "center", lineBreak: false });

      // Separador vertical
      vLine(xSep2, y, y + H);

      // Linha digitável
      doc.font(FONTE_BOLD).fontSize(9.5).fillColor(PRETO)
        .text(linhaFormatada, xSep2 + 6, y + 12, { width: MR - xSep2 - 8, align: "right", lineBreak: false });

      hLine(y + H);
      return y + H;
    };

    // ════════════════════════════════════════════════════════════
    // INSTRUÇÕES DE IMPRESSÃO (topo)
    // ════════════════════════════════════════════════════════════
    let y = 14;
    doc.font(FONTE_BOLD).fontSize(7).fillColor(PRETO)
      .text("Instruções de Impressão", ML, y, { width: W, align: "center" });
    y += 10;
    doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL)
      .text("Imprimir em impressora jato de tinta (ink jet) ou laser em qualidade normal.", ML, y, { width: W, align: "center" });
    y += 8;
    doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL)
      .text("Utilize folha A4 (210 x 297 mm) ou Carta (216 x 279 mm) - Corte na linha indicada", ML, y, { width: W, align: "center" });
    y += 12;

    // Linha pontilhada superior
    doc.moveTo(ML, y).lineTo(MR, y).dash(3, { space: 3 }).strokeColor(CINZA_BORDA).lineWidth(0.5).stroke();
    doc.undash();
    doc.font(FONTE).fontSize(6.5).fillColor(CINZA_LABEL)
      .text("Recibo do Pagador", MR - 80, y + 2, { width: 80, align: "right", lineBreak: false });
    y += 12;

    // ════════════════════════════════════════════════════════════
    // RECIBO DO PAGADOR
    // ════════════════════════════════════════════════════════════

    y = desenharCabecalho(y);

    // Linha 1: Beneficiário | Agência/Cód. Beneficiário | Espécie | Quantidade | Carteira/Nosso número
    const ROW_H = 22;
    const y1 = y;
    const xBenef = ML;
    const wBenef = W * 0.42;
    const xAgCod = xBenef + wBenef;
    const wAgCod = W * 0.20;
    const xEsp = xAgCod + wAgCod;
    const wEsp = W * 0.08;
    const xQtd = xEsp + wEsp;
    const wQtd = W * 0.10;
    const xCart = xQtd + wQtd;
    const wCart = MR - xCart;

    cell(xBenef, y, wBenef, ROW_H, "Beneficiário", dados.nomeBeneficiario);
    cell(xAgCod, y, wAgCod, ROW_H, "Agência / Código do Beneficiário", agenciaCodigo);
    cell(xEsp, y, wEsp, ROW_H, "Espécie", "R$");
    cell(xQtd, y, wQtd, ROW_H, "Quantidade", "");
    cell(xCart, y, wCart, ROW_H, "Carteira / Nosso número", nossoNumFormatado, { bold: true, align: "right" });

    y += ROW_H;
    hLine(y);
    vLine(xAgCod, y1, y);
    vLine(xEsp, y1, y);
    vLine(xQtd, y1, y);
    vLine(xCart, y1, y);

    // Linha 2: Número do documento | CPF/CNPJ | Vencimento | Valor documento
    const y2 = y;
    const xNumDoc = ML;
    const wNumDoc = W * 0.22;
    const xCpf = xNumDoc + wNumDoc;
    const wCpf = W * 0.20;
    const xVenc = xCpf + wCpf;
    const wVenc = W * 0.18;
    const xValDoc = xVenc + wVenc;
    const wValDoc = MR - xValDoc;

    cell(xNumDoc, y, wNumDoc, ROW_H, "Número do documento", dados.seuNumero);
    cell(xCpf, y, wCpf, ROW_H, "CPF/CNPJ", formatarCNPJ(dados.cnpjBeneficiario));
    cell(xVenc, y, wVenc, ROW_H, "Vencimento", formatarData(dados.dataVencimento));
    cell(xValDoc, y, wValDoc, ROW_H, "Valor documento", formatarValorReais(dados.valor), { bold: true, align: "right" });

    y += ROW_H;
    hLine(y);
    vLine(xCpf, y2, y);
    vLine(xVenc, y2, y);
    vLine(xValDoc, y2, y);

    // Linha 3: Desconto | Outras deduções | Mora/Multa | Outros acréscimos | Valor cobrado
    const y3 = y;
    const wCols5 = W / 5;
    cell(ML, y, wCols5, ROW_H, "(-) Desconto / Abatimentos", "");
    cell(ML + wCols5, y, wCols5, ROW_H, "(-) Outras deduções", "");
    cell(ML + wCols5 * 2, y, wCols5, ROW_H, "(+) Mora / Multa", "");
    cell(ML + wCols5 * 3, y, wCols5, ROW_H, "(+) Outros acréscimos", "");
    cell(ML + wCols5 * 4, y, wCols5, ROW_H, "(=) Valor cobrado", "");

    y += ROW_H;
    hLine(y);
    for (let i = 1; i < 5; i++) vLine(ML + wCols5 * i, y3, y);

    // Linha 4: Pagador (nome + endereço)
    const y4 = y;
    const ROW_PAGADOR = 36;
    doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL).text("Pagador", ML + 3, y + 2);
    doc.font(FONTE_BOLD).fontSize(8).fillColor(PRETO)
      .text(`${dados.nomeSacado} - CPF/CNPJ: ${formatarCNPJ(dados.cpfCnpjSacado)}`, ML + 3, y + 10, { width: W - 6 });
    doc.font(FONTE).fontSize(8).fillColor(PRETO)
      .text(`${dados.enderecoSacado} - ${dados.cidadeSacado}/${dados.ufSacado} - CEP: ${dados.cepSacado}`, ML + 3, y + 20, { width: W * 0.75 });

    // Autenticação mecânica (canto direito)
    doc.font(FONTE).fontSize(6.5).fillColor(CINZA_LABEL)
      .text("Autenticação mecânica", MR - 100, y + ROW_PAGADOR - 12, { width: 100, align: "right" });

    y += ROW_PAGADOR;
    hLine(y);

    // Instruções no recibo
    const y5 = y;
    const ROW_INSTR = 18;
    doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL).text("Instruções", ML + 3, y + 4);
    y += ROW_INSTR;
    hLine(y);

    // ── Linha de corte entre recibo e ficha ──
    y += 6;
    doc.moveTo(ML, y).lineTo(MR, y).dash(3, { space: 3 }).strokeColor(CINZA_BORDA).lineWidth(0.5).stroke();
    doc.undash();
    doc.font(FONTE).fontSize(6.5).fillColor(CINZA_LABEL)
      .text("Corte na linha pontilhada", MR - 110, y + 2, { width: 110, align: "right", lineBreak: false });
    y += 14;

    // ════════════════════════════════════════════════════════════
    // FICHA DE COMPENSAÇÃO
    // ════════════════════════════════════════════════════════════

    y = desenharCabecalho(y);

    // Local de pagamento | Vencimento
    const yLocal = y;
    const wLocal = W * 0.72;
    cell(ML, y, wLocal, ROW_H, "Local de pagamento", dados.localPagamento);
    cell(ML + wLocal, y, W - wLocal, ROW_H, "Vencimento", formatarData(dados.dataVencimento), { bold: true, fontSize: 10, align: "right" });

    y += ROW_H;
    hLine(y);
    vLine(ML + wLocal, yLocal, y);

    // Beneficiário | Agência/Código Beneficiário
    const yBenef2 = y;
    cell(ML, y, wLocal, ROW_H + 6, "Beneficiário",
      `${dados.nomeBeneficiario} - ${formatarCNPJ(dados.cnpjBeneficiario)}`);
    cell(ML + wLocal, y, W - wLocal, ROW_H + 6, "Agência / Código Beneficiário", agenciaCodigo, { align: "right" });

    y += ROW_H + 6;
    hLine(y);
    vLine(ML + wLocal, yBenef2, y);

    // Data do documento | No documento | Espécie doc. | Aceite | Data processamento | Carteira/Nosso número
    const yDados = y;
    const wD1 = W * 0.14;
    const wD2 = W * 0.18;
    const wD3 = W * 0.10;
    const wD4 = W * 0.08;
    const wD5 = W * 0.16;
    const wD6 = MR - (ML + wD1 + wD2 + wD3 + wD4 + wD5);

    cell(ML, y, wD1, ROW_H, "Data do documento", formatarData(dados.dataEmissao));
    cell(ML + wD1, y, wD2, ROW_H, "No documento", dados.seuNumero);
    cell(ML + wD1 + wD2, y, wD3, ROW_H, "Espécie doc.", dados.especieDocumento);
    cell(ML + wD1 + wD2 + wD3, y, wD4, ROW_H, "Aceite", dados.aceite);
    cell(ML + wD1 + wD2 + wD3 + wD4, y, wD5, ROW_H, "Data processamento", formatarData(dados.dataEmissao));
    cell(ML + wD1 + wD2 + wD3 + wD4 + wD5, y, wD6, ROW_H, "Carteira / Nosso número", nossoNumFormatado, { bold: true, align: "right" });

    y += ROW_H;
    hLine(y);
    let xv = ML;
    for (const w of [wD1, wD2, wD3, wD4, wD5]) {
      xv += w;
      vLine(xv, yDados, y);
    }

    // Uso do banco | CIP | Carteira | Espécie | Quantidade | (x) Valor | (=) Valor documento
    const yUso = y;
    const wU1 = W * 0.12;
    const wU2 = W * 0.08;
    const wU3 = W * 0.10;
    const wU4 = W * 0.10;
    const wU5 = W * 0.12;
    const wU6 = W * 0.10;
    const wU7 = MR - (ML + wU1 + wU2 + wU3 + wU4 + wU5 + wU6);

    cell(ML, y, wU1, ROW_H, "Uso do banco", "");
    cell(ML + wU1, y, wU2, ROW_H, "CIP", "");
    cell(ML + wU1 + wU2, y, wU3, ROW_H, "Carteira", dados.carteira);
    cell(ML + wU1 + wU2 + wU3, y, wU4, ROW_H, "Espécie", "R$");
    cell(ML + wU1 + wU2 + wU3 + wU4, y, wU5, ROW_H, "Quantidade", "");
    cell(ML + wU1 + wU2 + wU3 + wU4 + wU5, y, wU6, ROW_H, "(x) Valor", "");
    cell(ML + wU1 + wU2 + wU3 + wU4 + wU5 + wU6, y, wU7, ROW_H, "(=) Valor documento",
      formatarValorReais(dados.valor), { bold: true, align: "right" });

    y += ROW_H;
    hLine(y);
    let xu = ML;
    for (const w of [wU1, wU2, wU3, wU4, wU5, wU6]) {
      xu += w;
      vLine(xu, yUso, y);
    }

    // ── Área de instruções (esquerda) + Valores (direita) ──
    const yInstrFicha = y;
    const wInstrArea = W * 0.65;
    const xValores = ML + wInstrArea;
    const wValores = MR - xValores;
    const ROW_VALOR = 16;
    const INSTR_H = ROW_VALOR * 5; // 5 linhas de valores = altura total

    // Label instruções
    doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL)
      .text("Instruções (Texto de responsabilidade do beneficiário)", ML + 3, y + 3, { width: wInstrArea - 6 });

    // Texto das instruções
    dados.instrucoes.forEach((instr, idx) => {
      doc.font(FONTE).fontSize(7.5).fillColor(PRETO)
        .text(`${instr}`, ML + 5, y + 13 + idx * 11, { width: wInstrArea - 10 });
    });

    // Coluna de valores à direita
    const valoresCampos = [
      "(-) Desconto / Abatimentos",
      "(-) Outras deduções",
      "(+) Mora / Multa",
      "(+) Outros acréscimos",
      "(=) Valor cobrado",
    ];
    valoresCampos.forEach((label, idx) => {
      const yv = y + idx * ROW_VALOR;
      doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL)
        .text(label, xValores + 3, yv + 3, { width: wValores - 6 });
      if (idx < valoresCampos.length - 1) {
        hLine(yv + ROW_VALOR, xValores, MR);
      }
    });

    y += INSTR_H;
    hLine(y);
    vLine(xValores, yInstrFicha, y);

    // ── Pagador ──
    const ROW_PAG = 36;
    doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL).text("Pagador", ML + 3, y + 2);
    doc.font(FONTE_BOLD).fontSize(8).fillColor(PRETO)
      .text(`${dados.nomeSacado} - CPF/CNPJ: ${formatarCNPJ(dados.cpfCnpjSacado)}`, ML + 3, y + 10, { width: W - 6 });
    doc.font(FONTE).fontSize(8).fillColor(PRETO)
      .text(`${dados.enderecoSacado} - ${dados.cidadeSacado}/${dados.ufSacado} - CEP: ${dados.cepSacado}`, ML + 3, y + 20, { width: W * 0.75 });

    // Código de Baixa (canto direito)
    doc.font(FONTE).fontSize(6.5).fillColor(CINZA_LABEL)
      .text("Código de Baixa", MR - 100, y + 10, { width: 100, align: "right" });

    y += ROW_PAG;
    hLine(y);

    // ── Sacador / Avalista | Autenticação mecânica ──
    const ySac = y;
    doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL).text("Sacador / Avalista", ML + 3, y + 4);
    doc.font(FONTE).fontSize(6.5).fillColor(CINZA_LABEL)
      .text("Autenticação mecânica - Ficha de Compensação", MR - 200, y + 4, { width: 200, align: "right" });

    y += 18;
    hLine(y);

    // ── Código de barras I25 ──
    y += 8;
    const barras = gerarBarrasI25(codigoBarras);
    const alturaBarras = 42;
    const larguraTotal = barras.reduce((acc, b) => acc + b.largura, 0);
    const escala = W / larguraTotal;
    let xBar = ML;

    barras.forEach((b) => {
      if (b.tipo === "barra") {
        doc.rect(xBar, y, b.largura * escala, alturaBarras).fillColor(PRETO).fill();
      }
      xBar += b.largura * escala;
    });

    y += alturaBarras + 8;

    // ── Linha de corte final ──
    doc.moveTo(ML, y).lineTo(MR, y).dash(3, { space: 3 }).strokeColor(CINZA_BORDA).lineWidth(0.5).stroke();
    doc.undash();
    doc.font(FONTE).fontSize(6.5).fillColor(CINZA_LABEL)
      .text("Corte na linha pontilhada", MR - 110, y + 2, { width: 110, align: "right", lineBreak: false });

    doc.end();
  });
}

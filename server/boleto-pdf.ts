/**
 * Gerador de Boleto Bancário PDF — BTG Pactual (Banco 208)
 * Layout fiel à Máscara Oficial BTG Pactual
 *
 * Estrutura:
 *  1. Instruções de impressão
 *  2. Recibo do Pagador (destacável)
 *  3. Linha pontilhada de corte
 *  4. Ficha de Compensação (com código de barras + Pix)
 */

import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import QRCode from "qrcode";

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
  carteira: string;      // "001"
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
  // Pix (opcional — Bolepix BTG)
  pixCopiaCola?: string; // código EMV do Pix copia e cola
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

  // Gerar QR Code Pix como PNG buffer (se houver pixCopiaCola)
  let qrCodeBuffer: Buffer | null = null;
  if (dados.pixCopiaCola) {
    qrCodeBuffer = await QRCode.toBuffer(dados.pixCopiaCola, {
      errorCorrectionLevel: "M",
      type: "png",
      margin: 1,
      width: 150,
      color: { dark: "#000000", light: "#ffffff" },
    }) as Buffer;
  }

  // Nosso número formatado: carteira/nossoNumero
  const nossoNumFormatado = `${dados.carteira}/${dados.nossoNumero}`;

  // Agência/Código do Beneficiário: agência / conta-dígito
  const agenciaCodigo = `${dados.agencia} / ${dados.conta}-${dados.digitoConta}`;

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
    const ML = 30;          // margem esquerda
    const MR = PAGE_W - 30; // margem direita
    const W = MR - ML;      // largura útil

    const PRETO = "#000000";
    const CINZA_LABEL = "#666666";
    const CINZA_BORDA = "#aaaaaa";
    const AZUL_BTG = "#003087";
    const FONTE = "Helvetica";
    const FONTE_BOLD = "Helvetica-Bold";

    // ── Helpers ──
    const hLine = (y: number, x1 = ML, x2 = MR, cor = CINZA_BORDA) => {
      doc.moveTo(x1, y).lineTo(x2, y).strokeColor(cor).lineWidth(0.4).stroke();
    };

    const vLine = (x: number, y1: number, y2: number) => {
      doc.moveTo(x, y1).lineTo(x, y2).strokeColor(CINZA_BORDA).lineWidth(0.4).stroke();
    };

    /**
     * Célula padrão: label pequeno no topo, valor maior abaixo
     */
    const cell = (
      x: number, y: number, w: number, h: number,
      label: string, valor: string,
      opts?: { bold?: boolean; fontSize?: number; align?: "left" | "right" | "center"; labelSize?: number }
    ) => {
      const fz = opts?.fontSize ?? 8;
      const lz = opts?.labelSize ?? 6;
      const align = opts?.align ?? "left";
      doc.font(FONTE).fontSize(lz).fillColor(CINZA_LABEL)
        .text(label, x + 3, y + 2, { width: w - 6, lineBreak: false });
      doc.font(opts?.bold ? FONTE_BOLD : FONTE)
        .fontSize(fz).fillColor(PRETO)
        .text(valor, x + 3, y + h - fz - 4, { width: w - 6, align, lineBreak: false });
    };

    // Logo BTG Pactual
    const logoPath = path.join(process.cwd(), "client/public/btg-logo.png");
    const logoExists = fs.existsSync(logoPath);

    /**
     * Cabeçalho padrão BTG: [logo] | |208-1| | linha digitável
     * Retorna o Y após o cabeçalho (incluindo hLine inferior)
     */
    const desenharCabecalho = (y: number): number => {
      const H = 36;
      const xSep1 = ML + 100; // fim do logo
      const xSep2 = xSep1 + 46; // fim do código banco

      // Borda superior do cabeçalho
      hLine(y);

      // Logo BTG
      if (logoExists) {
        doc.image(logoPath, ML + 4, y + 5, { height: 26, fit: [92, 26] });
      } else {
        doc.font(FONTE_BOLD).fontSize(12).fillColor(AZUL_BTG)
          .text("btg pactual", ML + 4, y + 12, { width: 92, lineBreak: false });
        doc.font(FONTE).fontSize(7).fillColor(AZUL_BTG)
          .text("empresas", ML + 4, y + 24, { width: 92, lineBreak: false });
      }

      // Separador vertical logo | código banco
      vLine(xSep1, y, y + H);

      // Código do banco |208-1|
      doc.font(FONTE_BOLD).fontSize(13).fillColor(PRETO)
        .text("|208-1|", xSep1 + 2, y + 11, { width: 44, align: "center", lineBreak: false });

      // Separador vertical código banco | linha digitável
      vLine(xSep2, y, y + H);

      // Linha digitável (alinhada à direita)
      doc.font(FONTE_BOLD).fontSize(9.5).fillColor(PRETO)
        .text(linhaFormatada, xSep2 + 6, y + 13, { width: MR - xSep2 - 8, align: "right", lineBreak: false });

      hLine(y + H);
      return y + H;
    };

    // ════════════════════════════════════════════════════════════
    // INSTRUÇÕES DE IMPRESSÃO (topo da página)
    // ════════════════════════════════════════════════════════════
    let y = 12;
    doc.font(FONTE_BOLD).fontSize(7).fillColor(PRETO)
      .text("Instruções de Impressão", ML, y, { width: W, align: "center" });
    y += 10;
    doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL)
      .text("Imprimir em impressora jato de tinta (ink jet) ou laser em qualidade normal ou alta.", ML, y, { width: W, align: "center" });
    y += 7;
    doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL)
      .text("Utilize folha A4 (210 x 297 mm) ou Carta (216 x 279 mm) — Corte na linha indicada.", ML, y, { width: W, align: "center" });
    y += 10;

    // Linha pontilhada superior (acima do recibo)
    doc.moveTo(ML, y).lineTo(MR, y).dash(3, { space: 3 }).strokeColor(CINZA_BORDA).lineWidth(0.5).stroke();
    doc.undash();
    doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL)
      .text("Recibo do Pagador", MR - 85, y + 2, { width: 85, align: "right", lineBreak: false });
    y += 12;

    // ════════════════════════════════════════════════════════════
    // RECIBO DO PAGADOR
    // ════════════════════════════════════════════════════════════

    y = desenharCabecalho(y);

    const ROW_H = 22;

    // ── Linha R1: Beneficiário | Agência/Cód. Beneficiário ──
    {
      const yR = y;
      const wL = W * 0.72;
      cell(ML, y, wL, ROW_H, "Beneficiário", `${dados.nomeBeneficiario} — CNPJ: ${formatarCNPJ(dados.cnpjBeneficiario)}`);
      cell(ML + wL, y, W - wL, ROW_H, "Agência / Cód. Beneficiário", agenciaCodigo, { align: "right" });
      y += ROW_H;
      hLine(y);
      vLine(ML + wL, yR, y);
    }

    // ── Linha R2: Nosso número | Nº documento | Espécie | Vencimento | Valor ──
    {
      const yR = y;
      const wNN = W * 0.24;
      const wND = W * 0.18;
      const wES = W * 0.10;
      const wVC = W * 0.16;
      const wVL = MR - (ML + wNN + wND + wES + wVC);

      cell(ML, y, wNN, ROW_H, "Carteira / Nosso número", nossoNumFormatado, { bold: true });
      cell(ML + wNN, y, wND, ROW_H, "Nº do documento", dados.seuNumero);
      cell(ML + wNN + wND, y, wES, ROW_H, "Espécie doc.", dados.especieDocumento);
      cell(ML + wNN + wND + wES, y, wVC, ROW_H, "Vencimento", formatarData(dados.dataVencimento), { bold: true });
      cell(ML + wNN + wND + wES + wVC, y, wVL, ROW_H, "Valor do documento",
        formatarValorReais(dados.valor), { bold: true, align: "right" });

      y += ROW_H;
      hLine(y);
      let xv = ML;
      for (const w of [wNN, wND, wES, wVC]) { xv += w; vLine(xv, yR, y); }
    }

    // ── Linha R3: Desconto | Outras deduções | Mora/Multa | Outros acréscimos | Valor cobrado ──
    {
      const yR = y;
      const wC = W / 5;
      const campos = [
        "(-) Desconto / Abatimentos",
        "(-) Outras deduções",
        "(+) Mora / Multa",
        "(+) Outros acréscimos",
        "(=) Valor cobrado",
      ];
      campos.forEach((label, i) => {
        cell(ML + wC * i, y, wC, ROW_H, label, "");
      });
      y += ROW_H;
      hLine(y);
      for (let i = 1; i < 5; i++) vLine(ML + wC * i, yR, y);
    }

    // ── Linha R4: Pagador ──
    {
      const ROW_PAG = 34;
      doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL).text("Pagador", ML + 3, y + 2);
      doc.font(FONTE_BOLD).fontSize(8).fillColor(PRETO)
        .text(dados.nomeSacado, ML + 3, y + 10, { width: W * 0.75, lineBreak: false });
      doc.font(FONTE).fontSize(7.5).fillColor(PRETO)
        .text(`${dados.enderecoSacado}`, ML + 3, y + 20, { width: W * 0.75, lineBreak: false });
      doc.font(FONTE).fontSize(6.5).fillColor(CINZA_LABEL)
        .text("Autenticação mecânica", MR - 110, y + ROW_PAG - 12, { width: 110, align: "right", lineBreak: false });
      y += ROW_PAG;
      hLine(y);
    }

    // ── Linha R5: Instruções resumidas ──
    {
      const ROW_INSTR = 16;
      doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL).text("Instruções", ML + 3, y + 3);
      if (dados.instrucoes.length > 0) {
        doc.font(FONTE).fontSize(7).fillColor(PRETO)
          .text(dados.instrucoes[0], ML + 50, y + 3, { width: W - 60, lineBreak: false });
      }
      y += ROW_INSTR;
      hLine(y);
    }

    // ── Linha de corte entre recibo e ficha ──
    y += 6;
    doc.moveTo(ML, y).lineTo(MR, y).dash(3, { space: 3 }).strokeColor(CINZA_BORDA).lineWidth(0.5).stroke();
    doc.undash();
    doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL)
      .text("Corte na linha pontilhada", MR - 115, y + 2, { width: 115, align: "right", lineBreak: false });
    y += 14;

    // ════════════════════════════════════════════════════════════
    // FICHA DE COMPENSAÇÃO
    // ════════════════════════════════════════════════════════════

    y = desenharCabecalho(y);

    // ── FC Linha 1: Local de pagamento | Vencimento ──
    {
      const yR = y;
      const wL = W * 0.72;
      cell(ML, y, wL, ROW_H, "Local de pagamento", dados.localPagamento);
      cell(ML + wL, y, W - wL, ROW_H, "Vencimento",
        formatarData(dados.dataVencimento), { bold: true, fontSize: 10, align: "right" });
      y += ROW_H;
      hLine(y);
      vLine(ML + wL, yR, y);
    }

    // ── FC Linha 2: Beneficiário | Agência/Código Beneficiário ──
    {
      const yR = y;
      const wL = W * 0.72;
      cell(ML, y, wL, ROW_H + 4, "Beneficiário",
        `${dados.nomeBeneficiario} — CNPJ: ${formatarCNPJ(dados.cnpjBeneficiario)}`);
      cell(ML + wL, y, W - wL, ROW_H + 4, "Agência / Código Beneficiário",
        agenciaCodigo, { align: "right" });
      y += ROW_H + 4;
      hLine(y);
      vLine(ML + wL, yR, y);
    }

    // ── FC Linha 3: Data doc. | Nº doc. | Espécie doc. | Aceite | Data proc. | Carteira/Nosso nº ──
    {
      const yR = y;
      const wD1 = W * 0.14;
      const wD2 = W * 0.16;
      const wD3 = W * 0.10;
      const wD4 = W * 0.08;
      const wD5 = W * 0.16;
      const wD6 = MR - (ML + wD1 + wD2 + wD3 + wD4 + wD5);

      cell(ML, y, wD1, ROW_H, "Data do documento", formatarData(dados.dataEmissao));
      cell(ML + wD1, y, wD2, ROW_H, "No documento", dados.seuNumero);
      cell(ML + wD1 + wD2, y, wD3, ROW_H, "Espécie doc.", dados.especieDocumento);
      cell(ML + wD1 + wD2 + wD3, y, wD4, ROW_H, "Aceite", dados.aceite);
      cell(ML + wD1 + wD2 + wD3 + wD4, y, wD5, ROW_H, "Data processamento", formatarData(dados.dataEmissao));
      cell(ML + wD1 + wD2 + wD3 + wD4 + wD5, y, wD6, ROW_H,
        "Carteira / Nosso número", nossoNumFormatado, { bold: true, align: "right" });

      y += ROW_H;
      hLine(y);
      let xv = ML;
      for (const w of [wD1, wD2, wD3, wD4, wD5]) { xv += w; vLine(xv, yR, y); }
    }

    // ── FC Linha 4: Uso do banco | CIP | Carteira | Espécie | Quantidade | (x) Valor | (=) Valor doc. ──
    {
      const yR = y;
      const wU1 = W * 0.12;
      const wU2 = W * 0.08;
      const wU3 = W * 0.10;
      const wU4 = W * 0.10;
      const wU5 = W * 0.12;
      const wU6 = W * 0.10;
      const wU7 = MR - (ML + wU1 + wU2 + wU3 + wU4 + wU5 + wU6);

      cell(ML, y, wU1, ROW_H, "Uso do banco", "");
      cell(ML + wU1, y, wU2, ROW_H, "CIP", "");
      cell(ML + wU1 + wU2, y, wU3, ROW_H, "Carteira", dados.carteira.padStart(3, "0"));
      cell(ML + wU1 + wU2 + wU3, y, wU4, ROW_H, "Espécie", "R$");
      cell(ML + wU1 + wU2 + wU3 + wU4, y, wU5, ROW_H, "Quantidade", "");
      cell(ML + wU1 + wU2 + wU3 + wU4 + wU5, y, wU6, ROW_H, "(x) Valor", "");
      cell(ML + wU1 + wU2 + wU3 + wU4 + wU5 + wU6, y, wU7, ROW_H,
        "(=) Valor documento", formatarValorReais(dados.valor), { bold: true, align: "right" });

      y += ROW_H;
      hLine(y);
      let xu = ML;
      for (const w of [wU1, wU2, wU3, wU4, wU5, wU6]) { xu += w; vLine(xu, yR, y); }
    }

    // ── FC Linha 5: Instruções (esquerda) | Descontos/Multas (direita) ──
    {
      const yInstr = y;
      const wInstr = W * 0.65;
      const xVal = ML + wInstr;
      const wVal = MR - xVal;
      const ROW_V = 16;
      const INSTR_H = ROW_V * 5;

      // Label instruções
      doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL)
        .text("Instruções (Texto de responsabilidade do beneficiário)", ML + 3, y + 3, { width: wInstr - 6 });

      // Texto das instruções
      dados.instrucoes.forEach((instr, idx) => {
        doc.font(FONTE).fontSize(7.5).fillColor(PRETO)
          .text(instr, ML + 5, y + 13 + idx * 11, { width: wInstr - 10 });
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
        const yv = y + idx * ROW_V;
        doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL)
          .text(label, xVal + 3, yv + 3, { width: wVal - 6 });
        if (idx < valoresCampos.length - 1) hLine(yv + ROW_V, xVal, MR);
      });

      y += INSTR_H;
      hLine(y);
      vLine(xVal, yInstr, y);
    }

    // ── FC Linha 6: Pagador ──
    {
      const ROW_PAG = 38;
      doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL).text("Pagador", ML + 3, y + 2);
      doc.font(FONTE_BOLD).fontSize(8).fillColor(PRETO)
        .text(dados.nomeSacado, ML + 3, y + 10, { width: W * 0.75, lineBreak: false });
      doc.font(FONTE).fontSize(7.5).fillColor(PRETO)
        .text(`${dados.enderecoSacado}`, ML + 3, y + 20, { width: W * 0.75, lineBreak: false });
      if (dados.cidadeSacado) {
        doc.font(FONTE).fontSize(7.5).fillColor(PRETO)
          .text(`${dados.cidadeSacado}/${dados.ufSacado}${dados.cepSacado ? " — CEP: " + dados.cepSacado : ""}`,
            ML + 3, y + 29, { width: W * 0.75, lineBreak: false });
      }
      // Código de Baixa (canto direito)
      doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL)
        .text("Código de Baixa", MR - 110, y + 10, { width: 110, align: "right", lineBreak: false });
      y += ROW_PAG;
      hLine(y);
    }

    // ── FC Linha 7: Pagador/Avalista | Autenticação mecânica — Ficha de Compensação ──
    {
      doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL)
        .text("Pagador / Avalista", ML + 3, y + 4, { lineBreak: false });
      doc.font(FONTE).fontSize(6.5).fillColor(CINZA_LABEL)
        .text("Autenticação mecânica — Ficha de Compensação", MR - 210, y + 4, { width: 210, align: "right", lineBreak: false });
      y += 18;
      hLine(y);
    }

    // ── Código de barras I25 ──
    y += 8;
    const barras = gerarBarrasI25(codigoBarras);
    const alturaBarras = 44;
    const larguraTotal = barras.reduce((acc, b) => acc + b.largura, 0);

    if (qrCodeBuffer) {
      // Com Pix: código de barras ocupa ~55% da largura, QR Code à direita
      const wBarras = W * 0.55;
      const escala = wBarras / larguraTotal;
      let xBar = ML;
      barras.forEach((b) => {
        if (b.tipo === "barra") {
          doc.rect(xBar, y, b.largura * escala, alturaBarras).fillColor(PRETO).fill();
        }
        xBar += b.largura * escala;
      });

      // Seção "Pague com o PIX" à direita
      const PIX_VERDE = "#32BCAD";
      const xPix = ML + wBarras + 12;
      const wPix = MR - xPix;
      const QR_SIZE = alturaBarras + 20;

      // Título "Pague com o PIX"
      doc.font(FONTE_BOLD).fontSize(8.5).fillColor(PIX_VERDE)
        .text("Pague com o PIX", xPix, y, { width: wPix - QR_SIZE - 6, lineBreak: false });

      // Dados do Pix
      const pixInfoY = y + 12;
      const wPixInfo = wPix - QR_SIZE - 6;
      doc.font(FONTE).fontSize(7).fillColor(CINZA_LABEL)
        .text("CNPJ:", xPix, pixInfoY, { width: wPixInfo, lineBreak: false });
      doc.font(FONTE).fontSize(7).fillColor(PRETO)
        .text(formatarCNPJ(dados.cnpjBeneficiario), xPix + 28, pixInfoY, { width: wPixInfo - 28, lineBreak: false });

      doc.font(FONTE).fontSize(7).fillColor(CINZA_LABEL)
        .text("Vencimento:", xPix, pixInfoY + 11, { width: wPixInfo, lineBreak: false });
      doc.font(FONTE).fontSize(7).fillColor(PRETO)
        .text(formatarData(dados.dataVencimento), xPix + 50, pixInfoY + 11, { width: wPixInfo - 50, lineBreak: false });

      doc.font(FONTE).fontSize(7).fillColor(CINZA_LABEL)
        .text("Valor:", xPix, pixInfoY + 22, { width: wPixInfo, lineBreak: false });
      doc.font(FONTE_BOLD).fontSize(7).fillColor(PRETO)
        .text(formatarValorReais(dados.valor), xPix + 28, pixInfoY + 22, { width: wPixInfo - 28, lineBreak: false });

      // QR Code
      const xQR = MR - QR_SIZE;
      doc.rect(xQR - 2, y - 2, QR_SIZE + 4, QR_SIZE + 4)
        .strokeColor(PIX_VERDE).lineWidth(1).stroke();
      doc.image(qrCodeBuffer, xQR, y, { width: QR_SIZE, height: QR_SIZE });

      y += QR_SIZE + 8;
    } else {
      // Sem Pix: código de barras ocupa largura total
      const escala = W / larguraTotal;
      let xBar = ML;
      barras.forEach((b) => {
        if (b.tipo === "barra") {
          doc.rect(xBar, y, b.largura * escala, alturaBarras).fillColor(PRETO).fill();
        }
        xBar += b.largura * escala;
      });
      y += alturaBarras + 8;
    }

    // ── Linha de corte final ──
    doc.moveTo(ML, y).lineTo(MR, y).dash(3, { space: 3 }).strokeColor(CINZA_BORDA).lineWidth(0.5).stroke();
    doc.undash();
    doc.font(FONTE).fontSize(6).fillColor(CINZA_LABEL)
      .text("Corte na linha pontilhada", MR - 115, y + 2, { width: 115, align: "right", lineBreak: false });

    doc.end();
  });
}

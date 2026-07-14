/**
 * Gerador de PDF — Relatório de Acordos
 * Layout fiel ao Markdown de referência fornecido pela Gomes & Silva
 *
 * Estrutura:
 *  1. Cabeçalho: Condomínio + Período
 *  2. Para cada acordo:
 *     a. Título "Acordo XXXXXX"
 *     b. Tabela de Detalhes (Unidade, Código, Efetuado em)
 *     c. Tabela de Cobranças Originais (agrupadas por boleto)
 *     d. Resumo (Acréscimos + Total Devido)
 *     e. Tabela de Parcelas
 *  3. Rodapé: Jetro Administradora
 */

import PDFDocument from "pdfkit";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CobrancaOriginalPDF {
  cobrancaId: number;
  dataVencimento: Date | string | null;
  monthReference: string | null;
  descricao: string | null;
  tipoCobranca: string | null;
  valorOriginalAcordo: number; // centavos
}

export interface ParcelaPDF {
  parcelaId: number;
  installmentNumber: number | null;
  nossoNumero: string | null;
  dueDate: Date | string | null;
  paymentDate: Date | string | null;
  amount: number; // centavos
  status: string;
  snapshotDescricao: string | null;
}

export interface AcordoPDF {
  acordoId: number;
  nomeDevedor: string;
  unidade: string | null;
  bloco: string | null;
  nomeCondominio: string;
  createdAt: Date | string | null;
  agreedAmount: number | null; // centavos
  installments: number | null;
  cobrancasOriginais: CobrancaOriginalPDF[];
  parcelas: ParcelaPDF[];
  somaOriginal: number; // centavos
  acrescimos: number;   // centavos
  valorPagoEfetivo: number; // centavos
}

export interface RelatorioAcordosPDFInput {
  nomeCondominio: string;
  periodoLabel: string;
  acordos: AcordoPDF[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (centavos: number | null | undefined): string => {
  if (centavos == null) return "0,00";
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
};

const fmtMes = (ref: string | null | undefined): string => {
  if (!ref) return "—";
  if (ref.includes("-")) {
    const [y, m] = ref.split("-");
    return `${m}/${y}`;
  }
  return ref;
};

const TIPO_LABELS: Record<string, string> = {
  condominio: "Condomínio",
  salao_jogos: "Salão de Jogos",
  churrasqueira: "Churrasqueira",
  cota_extra: "Cota Extra",
  multa: "Multa",
  outros: "Outros",
};

const descricaoCobranca = (c: CobrancaOriginalPDF): string =>
  c.descricao || TIPO_LABELS[c.tipoCobranca ?? ""] || c.tipoCobranca || "—";

// ─── Constantes de layout ─────────────────────────────────────────────────────

const PAGE_W = 595.28;  // A4 largura em pontos
const PAGE_H = 841.89;  // A4 altura em pontos
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Cores
const COLOR_PRIMARY = "#1a3a5c";    // azul navy
const COLOR_ACCENT = "#2d7d46";     // verde
const COLOR_HEADER_BG = "#1a3a5c";  // fundo cabeçalho
const COLOR_TABLE_HEADER = "#e8edf2";
const COLOR_TABLE_ALT = "#f5f7fa";
const COLOR_BORDER = "#c8d0d8";
const COLOR_TEXT = "#1a1a2e";
const COLOR_MUTED = "#6b7280";
const COLOR_TOTAL_BG = "#dce8f0";

// ─── Gerador principal ────────────────────────────────────────────────────────

export async function gerarRelatorioAcordosPDF(input: RelatorioAcordosPDFInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: {
        Title: "Relatório de Acordos",
        Author: "Gomes & Silva Sociedade de Advogados",
        Subject: `Relatório de Acordos — ${input.nomeCondominio}`,
      },
    });

    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    let y = MARGIN;

    // ─── Funções auxiliares de desenho ───────────────────────────────────────

    const checkPageBreak = (needed: number) => {
      if (y + needed > PAGE_H - MARGIN - 60) {
        doc.addPage();
        y = MARGIN;
        drawPageFooter();
      }
    };

    const drawPageFooter = () => {
      const footerY = PAGE_H - 30;
      doc
        .fontSize(7)
        .fillColor(COLOR_MUTED)
        .text(
          `Gomes & Silva Sociedade de Advogados — Relatório de Acordos — ${input.nomeCondominio}`,
          MARGIN,
          footerY,
          { width: CONTENT_W, align: "center" }
        );
    };

    const drawHRule = (color = COLOR_BORDER, thickness = 0.5) => {
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(thickness).strokeColor(color).stroke();
    };

    // ─── Cabeçalho do relatório ──────────────────────────────────────────────

    // Faixa de cabeçalho
    doc.rect(MARGIN, y, CONTENT_W, 52).fill(COLOR_HEADER_BG);

    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .fillColor("#ffffff")
      .text("Relatório de Acordos", MARGIN + 12, y + 10, { width: CONTENT_W - 24 });

    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#c8d8e8")
      .text(`Gomes & Silva Sociedade de Advogados`, MARGIN + 12, y + 30, { width: CONTENT_W - 24 });

    y += 60;

    // Linha de info: condomínio + período
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(COLOR_TEXT)
      .text("Condomínio:", MARGIN, y, { continued: true })
      .font("Helvetica")
      .text(` ${input.nomeCondominio}`, { continued: false });

    y += 14;

    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(COLOR_TEXT)
      .text("Período:", MARGIN, y, { continued: true })
      .font("Helvetica")
      .text(` ${input.periodoLabel}`, { continued: false });

    y += 8;
    drawHRule(COLOR_PRIMARY, 1.5);
    y += 12;

    // ─── Acordos ─────────────────────────────────────────────────────────────

    for (const acordo of input.acordos) {
      checkPageBreak(80);

      // Título do acordo
      const acordoCodigo = String(acordo.acordoId).padStart(6, "0");
      doc.rect(MARGIN, y, CONTENT_W, 22).fill(COLOR_PRIMARY);
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor("#ffffff")
        .text(`Acordo ${acordoCodigo}`, MARGIN + 8, y + 6, { width: CONTENT_W - 16 });
      y += 28;

      // ── Tabela de Detalhes ──────────────────────────────────────────────
      checkPageBreak(60);

      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(COLOR_PRIMARY)
        .text("DETALHES", MARGIN, y);
      y += 12;

      // Cabeçalho da tabela
      const detCols = [
        { label: "Campo", x: MARGIN, w: 120 },
        { label: "Valor", x: MARGIN + 120, w: CONTENT_W - 120 },
      ];

      doc.rect(MARGIN, y, CONTENT_W, 16).fill(COLOR_TABLE_HEADER);
      for (const col of detCols) {
        doc
          .fontSize(8)
          .font("Helvetica-Bold")
          .fillColor(COLOR_TEXT)
          .text(col.label, col.x + 4, y + 4, { width: col.w - 8 });
      }
      y += 16;

      // Linhas de detalhe
      const unidade = acordo.bloco ? `${acordo.bloco}/${acordo.unidade ?? "—"}` : (acordo.unidade ?? "—");
      const detRows = [
        ["Unidade", unidade],
        ["Código do Acordo", acordoCodigo],
        ["Efetuado em", fmtDate(acordo.createdAt)],
      ];

      for (let i = 0; i < detRows.length; i++) {
        const [campo, valor] = detRows[i];
        if (i % 2 === 1) doc.rect(MARGIN, y, CONTENT_W, 14).fill(COLOR_TABLE_ALT);
        doc.rect(MARGIN, y, CONTENT_W, 14).stroke(COLOR_BORDER).lineWidth(0.3);
        doc.fontSize(8).font("Helvetica-Bold").fillColor(COLOR_TEXT).text(campo, MARGIN + 4, y + 3, { width: 112 });
        doc.fontSize(8).font("Helvetica").fillColor(COLOR_TEXT).text(valor, MARGIN + 124, y + 3, { width: CONTENT_W - 128 });
        y += 14;
      }

      y += 8;

      // ── Cobranças Originais ─────────────────────────────────────────────
      checkPageBreak(50);

      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(COLOR_PRIMARY)
        .text("COBRANÇAS ORIGINAIS", MARGIN, y);
      y += 12;

      // Colunas: Número | Vencimento | Competência | Descrição | Valor (R$)
      const cobCols = [
        { label: "Número", x: MARGIN, w: 60, align: "right" as const },
        { label: "Vencimento", x: MARGIN + 60, w: 70, align: "center" as const },
        { label: "Competência", x: MARGIN + 130, w: 65, align: "center" as const },
        { label: "Descrição", x: MARGIN + 195, w: CONTENT_W - 195 - 70, align: "left" as const },
        { label: "Valor (R$)", x: MARGIN + CONTENT_W - 70, w: 70, align: "right" as const },
      ];

      // Cabeçalho
      doc.rect(MARGIN, y, CONTENT_W, 16).fill(COLOR_TABLE_HEADER);
      for (const col of cobCols) {
        doc
          .fontSize(7.5)
          .font("Helvetica-Bold")
          .fillColor(COLOR_TEXT)
          .text(col.label, col.x + 3, y + 4, { width: col.w - 6, align: col.align });
      }
      y += 16;

      if (acordo.cobrancasOriginais.length === 0) {
        doc.rect(MARGIN, y, CONTENT_W, 14).fill("#fff").stroke(COLOR_BORDER);
        doc.fontSize(8).font("Helvetica").fillColor(COLOR_MUTED)
          .text("Nenhuma cobrança original registrada", MARGIN + 4, y + 3, { width: CONTENT_W - 8, align: "center" });
        y += 14;
      } else {
        // Agrupar cobranças por cobrancaId para exibir número apenas na primeira linha
        const grupos: { cobrancaId: number; dataVencimento: Date | string | null; monthReference: string | null; itens: CobrancaOriginalPDF[] }[] = [];
        for (const c of acordo.cobrancasOriginais) {
          const g = grupos.find((g) => g.cobrancaId === c.cobrancaId);
          if (g) {
            g.itens.push(c);
          } else {
            grupos.push({ cobrancaId: c.cobrancaId, dataVencimento: c.dataVencimento, monthReference: c.monthReference, itens: [c] });
          }
        }

        let rowIdx = 0;
        for (const grupo of grupos) {
          for (let i = 0; i < grupo.itens.length; i++) {
            const item = grupo.itens[i];
            checkPageBreak(14);

            const isAlt = rowIdx % 2 === 1;
            if (isAlt) doc.rect(MARGIN, y, CONTENT_W, 14).fill(COLOR_TABLE_ALT);
            doc.rect(MARGIN, y, CONTENT_W, 14).stroke(COLOR_BORDER).lineWidth(0.3);

            // Número (apenas na primeira linha do grupo)
            if (i === 0) {
              doc.fontSize(7.5).font("Helvetica").fillColor(COLOR_TEXT)
                .text(String(grupo.cobrancaId), cobCols[0].x + 3, y + 3, { width: cobCols[0].w - 6, align: "right" });
              doc.fontSize(7.5).font("Helvetica").fillColor(COLOR_TEXT)
                .text(fmtDate(grupo.dataVencimento), cobCols[1].x + 3, y + 3, { width: cobCols[1].w - 6, align: "center" });
              doc.fontSize(7.5).font("Helvetica").fillColor(COLOR_TEXT)
                .text(fmtMes(grupo.monthReference), cobCols[2].x + 3, y + 3, { width: cobCols[2].w - 6, align: "center" });
            }

            // Descrição
            doc.fontSize(7.5).font("Helvetica").fillColor(COLOR_TEXT)
              .text(descricaoCobranca(item), cobCols[3].x + 3, y + 3, { width: cobCols[3].w - 6, align: "left" });

            // Valor
            doc.fontSize(7.5).font("Helvetica").fillColor(COLOR_TEXT)
              .text(fmtBRL(item.valorOriginalAcordo), cobCols[4].x + 3, y + 3, { width: cobCols[4].w - 6, align: "right" });

            y += 14;
            rowIdx++;
          }

          // Subtotal do grupo (se mais de 1 item)
          if (grupo.itens.length > 1) {
            checkPageBreak(14);
            const subtotal = grupo.itens.reduce((s, c) => s + (c.valorOriginalAcordo ?? 0), 0);
            doc.rect(MARGIN, y, CONTENT_W, 14).fill(COLOR_TOTAL_BG);
            doc.rect(MARGIN, y, CONTENT_W, 14).stroke(COLOR_BORDER).lineWidth(0.3);
            doc.fontSize(7.5).font("Helvetica-Bold").fillColor(COLOR_TEXT)
              .text("Subtotal", cobCols[3].x + 3, y + 3, { width: cobCols[3].w - 6, align: "left" });
            doc.fontSize(7.5).font("Helvetica-Bold").fillColor(COLOR_TEXT)
              .text(fmtBRL(subtotal), cobCols[4].x + 3, y + 3, { width: cobCols[4].w - 6, align: "right" });
            y += 14;
          }
        }
      }

      y += 8;

      // ── Resumo ──────────────────────────────────────────────────────────
      checkPageBreak(50);

      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(COLOR_PRIMARY)
        .text("RESUMO", MARGIN, y);
      y += 12;

      const resumoCols = [
        { label: "Descrição", x: MARGIN, w: CONTENT_W - 100 },
        { label: "Valor (R$)", x: MARGIN + CONTENT_W - 100, w: 100 },
      ];

      doc.rect(MARGIN, y, CONTENT_W, 16).fill(COLOR_TABLE_HEADER);
      for (const col of resumoCols) {
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor(COLOR_TEXT)
          .text(col.label, col.x + 4, y + 4, { width: col.w - 8, align: col === resumoCols[1] ? "right" : "left" });
      }
      y += 16;

      // Linha acréscimos
      doc.rect(MARGIN, y, CONTENT_W, 14).fill("#fff").stroke(COLOR_BORDER).lineWidth(0.3);
      doc.fontSize(7.5).font("Helvetica").fillColor(COLOR_TEXT)
        .text("Acréscimos (juros, multa, honorários)", resumoCols[0].x + 4, y + 3, { width: resumoCols[0].w - 8 });
      doc.fontSize(7.5).font("Helvetica").fillColor(COLOR_TEXT)
        .text(fmtBRL(acordo.acrescimos), resumoCols[1].x + 3, y + 3, { width: resumoCols[1].w - 6, align: "right" });
      y += 14;

      // Linha Total Devido
      doc.rect(MARGIN, y, CONTENT_W, 16).fill(COLOR_TOTAL_BG).stroke(COLOR_BORDER).lineWidth(0.3);
      doc.fontSize(8.5).font("Helvetica-Bold").fillColor(COLOR_PRIMARY)
        .text("Total Devido", resumoCols[0].x + 4, y + 4, { width: resumoCols[0].w - 8 });
      doc.fontSize(8.5).font("Helvetica-Bold").fillColor(COLOR_PRIMARY)
        .text(fmtBRL(acordo.agreedAmount), resumoCols[1].x + 3, y + 4, { width: resumoCols[1].w - 6, align: "right" });
      y += 20;

      y += 8;

      // ── Parcelas do Acordo ───────────────────────────────────────────────
      checkPageBreak(50);

      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(COLOR_PRIMARY)
        .text("PARCELAS DO ACORDO", MARGIN, y);
      y += 12;

      // Colunas: Parcela | Vencimento | Liquidação | Observação | Emitido (R$) | Pago (R$)
      const parCols = [
        { label: "Parcela", x: MARGIN, w: 55, align: "right" as const },
        { label: "Vencimento", x: MARGIN + 55, w: 65, align: "center" as const },
        { label: "Liquidação", x: MARGIN + 120, w: 65, align: "center" as const },
        { label: "Observação", x: MARGIN + 185, w: CONTENT_W - 185 - 130, align: "left" as const },
        { label: "Emitido (R$)", x: MARGIN + CONTENT_W - 130, w: 65, align: "right" as const },
        { label: "Pago (R$)", x: MARGIN + CONTENT_W - 65, w: 65, align: "right" as const },
      ];

      doc.rect(MARGIN, y, CONTENT_W, 16).fill(COLOR_TABLE_HEADER);
      for (const col of parCols) {
        doc.fontSize(7).font("Helvetica-Bold").fillColor(COLOR_TEXT)
          .text(col.label, col.x + 3, y + 4, { width: col.w - 6, align: col.align });
      }
      y += 16;

      if (acordo.parcelas.length === 0) {
        doc.rect(MARGIN, y, CONTENT_W, 14).fill("#fff").stroke(COLOR_BORDER);
        doc.fontSize(8).font("Helvetica").fillColor(COLOR_MUTED)
          .text("Nenhuma parcela registrada", MARGIN + 4, y + 3, { width: CONTENT_W - 8, align: "center" });
        y += 14;
      } else {
        for (let i = 0; i < acordo.parcelas.length; i++) {
          const p = acordo.parcelas[i];
          checkPageBreak(14);

          const isAlt = i % 2 === 1;
          if (isAlt) doc.rect(MARGIN, y, CONTENT_W, 14).fill(COLOR_TABLE_ALT);
          doc.rect(MARGIN, y, CONTENT_W, 14).stroke(COLOR_BORDER).lineWidth(0.3);

          const parcelaLabel = p.nossoNumero ?? String(p.parcelaId).padStart(6, "0");
          const observacao = p.snapshotDescricao ?? (acordo.installments === 1 ? "Parcela única" : `Parcela ${p.installmentNumber}/${acordo.installments}`);
          const valorPago = p.status === "pago" ? fmtBRL(p.amount) : "—";

          doc.fontSize(7.5).font("Helvetica").fillColor(COLOR_TEXT)
            .text(parcelaLabel, parCols[0].x + 3, y + 3, { width: parCols[0].w - 6, align: "right" });
          doc.fontSize(7.5).font("Helvetica").fillColor(COLOR_TEXT)
            .text(fmtDate(p.dueDate), parCols[1].x + 3, y + 3, { width: parCols[1].w - 6, align: "center" });
          doc.fontSize(7.5).font("Helvetica").fillColor(COLOR_TEXT)
            .text(fmtDate(p.paymentDate), parCols[2].x + 3, y + 3, { width: parCols[2].w - 6, align: "center" });
          doc.fontSize(7.5).font("Helvetica").fillColor(COLOR_TEXT)
            .text(observacao, parCols[3].x + 3, y + 3, { width: parCols[3].w - 6, align: "left" });
          doc.fontSize(7.5).font("Helvetica").fillColor(COLOR_TEXT)
            .text(fmtBRL(p.amount), parCols[4].x + 3, y + 3, { width: parCols[4].w - 6, align: "right" });
          doc.fontSize(7.5).font("Helvetica").fillColor(p.status === "pago" ? COLOR_ACCENT : COLOR_MUTED)
            .text(valorPago, parCols[5].x + 3, y + 3, { width: parCols[5].w - 6, align: "right" });

          y += 14;
        }

        // Total do acordo
        checkPageBreak(16);
        doc.rect(MARGIN, y, CONTENT_W, 16).fill(COLOR_TOTAL_BG).stroke(COLOR_BORDER).lineWidth(0.3);
        doc.fontSize(8).font("Helvetica-Bold").fillColor(COLOR_PRIMARY)
          .text("Total do Acordo", parCols[0].x + 3, y + 4, { width: parCols[0].w + parCols[1].w + parCols[2].w + parCols[3].w - 6, align: "right" });
        doc.fontSize(8).font("Helvetica-Bold").fillColor(COLOR_PRIMARY)
          .text(fmtBRL(acordo.agreedAmount), parCols[4].x + 3, y + 4, { width: parCols[4].w - 6, align: "right" });
        doc.fontSize(8).font("Helvetica-Bold").fillColor(COLOR_ACCENT)
          .text(fmtBRL(acordo.valorPagoEfetivo), parCols[5].x + 3, y + 4, { width: parCols[5].w - 6, align: "right" });
        y += 20;
      }

      // Separador entre acordos
      y += 10;
      drawHRule(COLOR_BORDER, 0.5);
      y += 14;
    }

    // ─── Rodapé final ─────────────────────────────────────────────────────────
    checkPageBreak(80);

    y += 10;
    drawHRule(COLOR_PRIMARY, 1.5);
    y += 12;

    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(COLOR_TEXT)
      .text("Jetro Administradora de Condomínios", MARGIN, y, { width: CONTENT_W, align: "center" });
    y += 14;

    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(COLOR_MUTED)
      .text("Avenida Ayrton Senna, 5500 - Bloco 3 - Salas 241 a 246", MARGIN, y, { width: CONTENT_W, align: "center" });
    y += 12;

    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(COLOR_MUTED)
      .text("Tel.: (21) 3596-6640  •  (21) 99866-6640  •  (11) 91521-3538", MARGIN, y, { width: CONTENT_W, align: "center" });
    y += 12;

    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(COLOR_MUTED)
      .text("www.jetroadministradora.com.br", MARGIN, y, { width: CONTENT_W, align: "center" });
    y += 14;

    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor(COLOR_MUTED)
      .text(
        `Relatório gerado em ${new Date().toLocaleString("pt-BR")} — Gomes & Silva Sociedade de Advogados`,
        MARGIN,
        y,
        { width: CONTENT_W, align: "center" }
      );

    // Rodapé em todas as páginas
    drawPageFooter();

    doc.end();
  });
}

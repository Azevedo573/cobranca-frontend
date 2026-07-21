/**
 * Gerador de PDF — Relatório de Recuperação de Créditos
 * Estilo idêntico ao Relatório de Acordos (Gomes & Silva)
 */

import PDFDocument from "pdfkit";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface RecuperacaoRowPDF {
  cobrancaId: number;
  nomeDevedor: string | null;
  cpfCnpj: string | null;
  unidade: string | null;
  bloco: string | null;
  nomeCondominio: string | null;
  descricao: string | null;
  dataVencimento: Date | string | null;
  dataPagamento: Date | string | null;
  valorOriginal: number; // centavos
  status: string;
}

export interface RelatorioRecuperacaoPDFInput {
  nomeCondominio: string;
  periodoLabel: string;
  rows: RecuperacaoRowPDF[];
  totais: {
    totalRecuperado: number;
    totalEmAberto: number;
    taxaRecuperacao: number;
  };
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

// ─── Constantes de layout ─────────────────────────────────────────────────────

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

const COLOR_PRIMARY = "#1a3a5c";
const COLOR_ACCENT = "#2d7d46";
const COLOR_HEADER_BG = "#1a3a5c";
const COLOR_TABLE_HEADER = "#e8edf2";
const COLOR_TABLE_ALT = "#f5f7fa";
const COLOR_BORDER = "#c8d0d8";
const COLOR_TEXT = "#1a1a2e";
const COLOR_MUTED = "#6b7280";
const COLOR_TOTAL_BG = "#dce8f0";

// ─── Gerador principal ────────────────────────────────────────────────────────

export async function gerarRelatorioRecuperacaoPDF(input: RelatorioRecuperacaoPDFInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
      bufferPages: true,
    });

    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    let y = MARGIN;

    // ─── Helpers de desenho ───────────────────────────────────────────────────

    const checkPageBreak = (needed: number) => {
      if (y + needed > PAGE_H - MARGIN - 30) {
        doc.addPage();
        y = MARGIN;
        drawPageHeader();
      }
    };

    const drawHRule = (color = COLOR_BORDER, thickness = 0.5) => {
      doc.save().strokeColor(color).lineWidth(thickness)
        .moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).stroke().restore();
    };

    const drawPageHeader = () => {
      doc.save().rect(0, 0, PAGE_W, 70).fill(COLOR_HEADER_BG).restore();

      doc.fontSize(18).font("Helvetica-Bold").fillColor("#ffffff")
        .text("Gomes & Silva", MARGIN, 16, { width: CONTENT_W * 0.6 });
      doc.fontSize(9).font("Helvetica").fillColor("#a8c4d8")
        .text("Sociedade de Advogados", MARGIN, 38, { width: CONTENT_W * 0.6 });

      doc.fontSize(11).font("Helvetica-Bold").fillColor("#ffffff")
        .text("RELATÓRIO DE RECUPERAÇÃO", MARGIN, 16, { width: CONTENT_W, align: "right" });
      doc.fontSize(8).font("Helvetica").fillColor("#a8c4d8")
        .text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, MARGIN, 38, { width: CONTENT_W, align: "right" });

      y = 80;
    };

    const drawPageFooter = () => {
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.save()
          .fontSize(7).font("Helvetica").fillColor(COLOR_MUTED)
          .text(
            `Página ${i + 1} de ${range.count}  —  Gomes & Silva Sociedade de Advogados`,
            MARGIN, PAGE_H - 25, { width: CONTENT_W, align: "center" }
          )
          .restore();
      }
    };

    // ─── Início do documento ──────────────────────────────────────────────────
    drawPageHeader();

    // Bloco de informações
    doc.save()
      .rect(MARGIN, y, CONTENT_W, 44)
      .fillAndStroke("#f0f4f8", COLOR_BORDER)
      .restore();

    doc.fontSize(10).font("Helvetica-Bold").fillColor(COLOR_PRIMARY)
      .text("Condomínio:", MARGIN + 10, y + 8);
    doc.fontSize(10).font("Helvetica").fillColor(COLOR_TEXT)
      .text(input.nomeCondominio, MARGIN + 90, y + 8);

    doc.fontSize(10).font("Helvetica-Bold").fillColor(COLOR_PRIMARY)
      .text("Período:", MARGIN + 10, y + 24);
    doc.fontSize(10).font("Helvetica").fillColor(COLOR_TEXT)
      .text(input.periodoLabel, MARGIN + 90, y + 24);

    y += 54;

    // ─── Cards de totalizadores ───────────────────────────────────────────────
    const cardW = (CONTENT_W - 20) / 3;
    const cards = [
      { label: "Total Recuperado", value: fmtBRL(input.totais.totalRecuperado), color: COLOR_ACCENT },
      { label: "Total em Aberto", value: fmtBRL(input.totais.totalEmAberto), color: "#c0392b" },
      { label: "Taxa de Recuperação", value: `${input.totais.taxaRecuperacao}%`, color: COLOR_PRIMARY },
    ];

    cards.forEach((card, i) => {
      const cx = MARGIN + i * (cardW + 10);
      doc.save().rect(cx, y, cardW, 46).fillAndStroke(COLOR_TABLE_ALT, COLOR_BORDER).restore();
      doc.fontSize(8).font("Helvetica").fillColor(COLOR_MUTED).text(card.label, cx + 8, y + 8, { width: cardW - 16 });
      doc.fontSize(13).font("Helvetica-Bold").fillColor(card.color)
        .text(card.label === "Taxa de Recuperação" ? card.value : `R$ ${card.value}`, cx + 8, y + 22, { width: cardW - 16 });
    });

    y += 58;

    // ─── Tabela de registros recuperados ─────────────────────────────────────
    const COL = {
      devedor: { x: MARGIN, w: 120 },
      unidade: { x: MARGIN + 120, w: 55 },
      condominio: { x: MARGIN + 175, w: 95 },
      descricao: { x: MARGIN + 270, w: 85 },
      vencimento: { x: MARGIN + 355, w: 60 },
      pagamento: { x: MARGIN + 415, w: 60 },
      valor: { x: MARGIN + 475, w: 40 },
    };

    const drawTableHeader = () => {
      doc.save().rect(MARGIN, y, CONTENT_W, 18).fill(COLOR_TABLE_HEADER).restore();
      const headers = [
        { label: "Devedor", col: COL.devedor },
        { label: "Unidade", col: COL.unidade },
        { label: "Condomínio", col: COL.condominio },
        { label: "Descrição", col: COL.descricao },
        { label: "Vencimento", col: COL.vencimento },
        { label: "Dt. Pagamento", col: COL.pagamento },
        { label: "Valor (R$)", col: COL.valor },
      ];
      headers.forEach(({ label, col }) => {
        doc.fontSize(7).font("Helvetica-Bold").fillColor(COLOR_PRIMARY)
          .text(label, col.x + 3, y + 5, { width: col.w - 6, align: col === COL.valor ? "right" : "left" });
      });
      y += 18;
    };

    drawTableHeader();

    // Agrupar por devedor
    const grupos = new Map<string, { devedor: string; rows: RecuperacaoRowPDF[]; subtotal: number }>();
    for (const row of input.rows) {
      const key = row.nomeDevedor ?? "Sem nome";
      const g = grupos.get(key);
      if (g) { g.rows.push(row); g.subtotal += row.valorOriginal; }
      else grupos.set(key, { devedor: key, rows: [row], subtotal: row.valorOriginal });
    }

    Array.from(grupos.values()).sort((a, b) => a.devedor.localeCompare(b.devedor)).forEach((grupo) => {
      grupo.rows.forEach((row, idx) => {
        checkPageBreak(18);
        if (idx % 2 === 1) {
          doc.save().rect(MARGIN, y, CONTENT_W, 16).fill(COLOR_TABLE_ALT).restore();
        }
        const unidLabel = row.bloco ? `${row.bloco}/${row.unidade ?? ""}` : (row.unidade ?? "—");

        doc.fontSize(7).font("Helvetica").fillColor(COLOR_TEXT)
          .text(row.nomeDevedor ?? "—", COL.devedor.x + 3, y + 4, { width: COL.devedor.w - 6, ellipsis: true })
          .text(unidLabel, COL.unidade.x + 3, y + 4, { width: COL.unidade.w - 6 })
          .text(row.nomeCondominio ?? "—", COL.condominio.x + 3, y + 4, { width: COL.condominio.w - 6, ellipsis: true })
          .text(row.descricao ?? "—", COL.descricao.x + 3, y + 4, { width: COL.descricao.w - 6, ellipsis: true })
          .text(fmtDate(row.dataVencimento), COL.vencimento.x + 3, y + 4, { width: COL.vencimento.w - 6 })
          .fillColor(COLOR_ACCENT)
          .text(fmtDate(row.dataPagamento), COL.pagamento.x + 3, y + 4, { width: COL.pagamento.w - 6 })
          .fillColor(COLOR_TEXT)
          .text(`R$ ${fmtBRL(row.valorOriginal)}`, COL.valor.x + 3, y + 4, { width: COL.valor.w - 6, align: "right" });

        y += 16;
      });

      // Subtotal do devedor
      checkPageBreak(18);
      doc.save().rect(MARGIN, y, CONTENT_W, 16).fill("#e8f5e9").restore();
      doc.fontSize(7).font("Helvetica-Bold").fillColor(COLOR_ACCENT)
        .text(`Subtotal — ${grupo.devedor}`, MARGIN + 6, y + 4, { width: CONTENT_W * 0.7 })
        .text(`R$ ${fmtBRL(grupo.subtotal)}`, MARGIN, y + 4, { width: CONTENT_W - 6, align: "right" });
      y += 16;
    });

    // Linha de total geral
    checkPageBreak(24);
    doc.save().rect(MARGIN, y, CONTENT_W, 22).fill(COLOR_TOTAL_BG).restore();
    doc.fontSize(8).font("Helvetica-Bold").fillColor(COLOR_PRIMARY)
      .text(`Total recuperado: ${input.rows.length} cobranças`, MARGIN + 6, y + 7, { width: CONTENT_W * 0.5 })
      .text(`R$ ${fmtBRL(input.totais.totalRecuperado)}`, MARGIN, y + 7, { width: CONTENT_W - 6, align: "right" });
    y += 22;

    // ─── Rodapé final ─────────────────────────────────────────────────────────
    checkPageBreak(40);
    y += 10;
    drawHRule(COLOR_PRIMARY, 1.5);
    y += 12;

    doc.fontSize(7).font("Helvetica").fillColor(COLOR_MUTED)
      .text(
        `Relatório gerado em ${new Date().toLocaleString("pt-BR")} — Gomes & Silva Sociedade de Advogados`,
        MARGIN, y, { width: CONTENT_W, align: "center" }
      );

    drawPageFooter();
    doc.end();
  });
}

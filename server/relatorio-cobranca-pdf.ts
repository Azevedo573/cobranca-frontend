import PDFDocument from "pdfkit";
import type { RelatorioCobrancaRow, RelatorioCobrancaTotais } from "./db-relatorios";

// ─── Labels ────────────────────────────────────────────────────────────────────
const CONTACT_LABELS: Record<string, string> = {
  telefone: "Telefone",
  email: "E-mail",
  whatsapp: "WhatsApp",
  pessoal: "Presencial",
  sistema: "Sistema",
};

const RESULT_LABELS: Record<string, string> = {
  promessa_pagamento: "Promessa de Pagamento",
  sem_resposta: "Sem Resposta",
  recusa: "Recusa",
  deseja_acordo: "Deseja Acordo",
  outro: "Outro",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function truncate(s: string | null | undefined, max = 60): string {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ─── Gerador principal ────────────────────────────────────────────────────────
export async function gerarRelatorioCobrancaPDF(params: {
  nomeCondominio: string;
  periodoLabel: string;
  rows: RelatorioCobrancaRow[];
  totais: RelatorioCobrancaTotais;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width - 80; // largura útil
    const NAVY = "#1e3a5f";
    const LIGHT_BLUE = "#e8f0fe";
    const GRAY = "#f5f5f5";
    const TEXT = "#1a1a1a";
    const MUTED = "#666666";

    // ── Cabeçalho ──────────────────────────────────────────────────────────────
    doc.rect(40, 40, W, 44).fill(NAVY);
    doc.fillColor("white").fontSize(16).font("Helvetica-Bold")
      .text("Relatório de Cobrança", 52, 50, { width: W / 2 });
    doc.fontSize(9).font("Helvetica")
      .text("Gomes & Silva Sociedade de Advogados", 52, 70, { width: W / 2 });

    // Condomínio e período no lado direito
    const rightX = 40 + W / 2 + 10;
    doc.fillColor("white").fontSize(8).font("Helvetica-Bold")
      .text("Condomínio:", rightX, 50, { continued: true })
      .font("Helvetica").text(` ${params.nomeCondominio}`);
    doc.font("Helvetica-Bold")
      .text("Período:", rightX, 62, { continued: true })
      .font("Helvetica").text(` ${params.periodoLabel}`);
    doc.font("Helvetica-Bold")
      .text("Gerado em:", rightX, 74, { continued: true })
      .font("Helvetica").text(` ${new Date().toLocaleString("pt-BR")}`);

    let y = 96;

    // ── Cards de totais ────────────────────────────────────────────────────────
    const cards = [
      { label: "Total de Contatos", value: String(params.totais.total), color: NAVY },
      { label: "Promessas", value: String(params.totais.promessas), color: "#16a34a" },
      { label: "Sem Resposta", value: String(params.totais.semResposta), color: "#ca8a04" },
      { label: "Recusas", value: String(params.totais.recusas), color: "#dc2626" },
      { label: "Outros", value: String(params.totais.outros), color: "#6b7280" },
    ];
    const cardW = (W - 16) / cards.length;
    cards.forEach((card, i) => {
      const cx = 40 + i * (cardW + 4);
      doc.rect(cx, y, cardW, 36).fill(LIGHT_BLUE);
      doc.fillColor(card.color).fontSize(16).font("Helvetica-Bold")
        .text(card.value, cx + 6, y + 4, { width: cardW - 12, align: "center" });
      doc.fillColor(MUTED).fontSize(7).font("Helvetica")
        .text(card.label, cx + 6, y + 22, { width: cardW - 12, align: "center" });
    });
    y += 46;

    // ── Tabela ─────────────────────────────────────────────────────────────────
    // Definição das colunas
    const cols = [
      { header: "Data/Hora", width: 72 },
      { header: "Devedor", width: 110 },
      { header: "Unidade", width: 52 },
      { header: "Condomínio", width: 110 },
      { header: "Tipo", width: 62 },
      { header: "Resultado", width: 90 },
      { header: "Responsável", width: 90 },
      { header: "Observações", width: W - 72 - 110 - 52 - 110 - 62 - 90 - 90 },
    ];

    const ROW_H = 16;
    const HEADER_H = 18;

    const drawTableHeader = (yPos: number) => {
      let cx = 40;
      doc.rect(40, yPos, W, HEADER_H).fill(NAVY);
      cols.forEach((col) => {
        doc.fillColor("white").fontSize(7).font("Helvetica-Bold")
          .text(col.header, cx + 3, yPos + 5, { width: col.width - 6, ellipsis: true });
        cx += col.width;
      });
      return yPos + HEADER_H;
    };

    y = drawTableHeader(y);

    if (params.rows.length === 0) {
      doc.rect(40, y, W, ROW_H).fill(GRAY);
      doc.fillColor(MUTED).fontSize(8).font("Helvetica")
        .text("Nenhum contato encontrado com os filtros selecionados.", 40 + 8, y + 4, { width: W - 16, align: "center" });
      y += ROW_H;
    } else {
      params.rows.forEach((row, idx) => {
        // Verificar se precisa de nova página
        if (y + ROW_H > doc.page.height - 60) {
          doc.addPage({ size: "A4", layout: "landscape", margin: 40 });
          y = 40;
          y = drawTableHeader(y);
        }

        const bg = idx % 2 === 0 ? "white" : GRAY;
        doc.rect(40, y, W, ROW_H).fill(bg);

        const tipoLabel = row.isSistema
          ? "Sistema"
          : (CONTACT_LABELS[row.contactType] ?? row.contactType);
        const resultLabel = RESULT_LABELS[row.result ?? ""] ?? (row.result ?? "—");
        const unidade = row.bloco ? `${row.bloco}/${row.unitNumber}` : row.unitNumber;

        const cells = [
          fmtDateTime(row.attemptDate),
          row.nomeDevedor,
          unidade,
          row.nomeCondominio,
          tipoLabel,
          resultLabel,
          row.colaboradorNome,
          truncate(row.notes, 55),
        ];

        let cx = 40;
        cells.forEach((cell, ci) => {
          doc.fillColor(TEXT).fontSize(7).font("Helvetica")
            .text(cell, cx + 3, y + 4, { width: cols[ci].width - 6, ellipsis: true, lineBreak: false });
          cx += cols[ci].width;
        });

        // Linha separadora
        doc.moveTo(40, y + ROW_H).lineTo(40 + W, y + ROW_H).strokeColor("#e0e0e0").lineWidth(0.3).stroke();
        y += ROW_H;
      });
    }

    // ── Rodapé ─────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 50;
    doc.moveTo(40, footerY).lineTo(40 + W, footerY).strokeColor("#cccccc").lineWidth(0.5).stroke();
    doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold")
      .text("Jetro Administradora de Condomínios", 40, footerY + 6, { width: W, align: "center" });
    doc.font("Helvetica")
      .text("Avenida Ayrton Senna, 5500 - Bloco 3 - Salas 241 a 246  |  Tel.: (21) 3596-6640 • (21) 99866-6640 • (11) 91521-3538  |  www.jetroadministradora.com.br", 40, footerY + 16, { width: W, align: "center" });

    doc.end();
  });
}

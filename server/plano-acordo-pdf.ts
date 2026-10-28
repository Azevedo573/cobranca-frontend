import PDFDocument from "pdfkit";

export type StatusPlanoAcordo = "pendente" | "pago" | "atrasado" | "cancelado";

export interface ParcelaResumoPlanoAcordo {
  id: number;
  installmentNumber: number;
  amount: number;
  dueDate: Date;
  status: StatusPlanoAcordo;
  paymentDate: Date | null;
}

export interface ResumoPlanoBoletoAcordo {
  quantidadeEtapas: number;
  entrada: { rotulo: "Entrada"; valor: number; vencimento: Date; situacao: string } | null;
  quantidadeParcelasRegulares: number;
  valorMinimoParcela: number | null;
  valorMaximoParcela: number | null;
  primeiroVencimento: Date | null;
  ultimoVencimento: Date | null;
  parcelasQuitadas: number;
  valorPago: number;
  saldoEmAberto: number;
  totalPlano: number;
}

export interface PlanoCompletoAcordoPdfInput {
  acordo: {
    id: number;
    totalAmount: number;
    agreedAmount: number;
    installments: number;
    paymentFrequency: string;
    status: string;
    valorPago: number | null;
    notes: string | null;
    createdAt: Date | null;
  };
  condominio: {
    name: string;
    cnpj: string | null;
  };
  devedor: {
    name: string | null;
    unitNumber: string | null;
    bloco: string | null;
    cpfCnpj: string | null;
  };
  parcelas: ParcelaResumoPlanoAcordo[];
  geradoEm?: Date;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const ROW_H = 19;
const ROWS_PER_PAGE = 24;

const COR_PRIMARIA = "#173B63";
const COR_DESTAQUE = "#DCE8F5";
const COR_TEXTO = "#172033";
const COR_MUTED = "#64748B";
const COR_BORDA = "#CAD5E1";
const COR_LINHA_ALTERNADA = "#F8FAFC";

function ordenarParcelas<T extends Pick<ParcelaResumoPlanoAcordo, "id" | "installmentNumber">>(parcelas: T[]): T[] {
  return [...parcelas].sort((a, b) => a.installmentNumber - b.installmentNumber || a.id - b.id);
}

function rotuloStatus(status: StatusPlanoAcordo): string {
  switch (status) {
    case "pago": return "Pago";
    case "atrasado": return "Em atraso";
    case "cancelado": return "Cancelada";
    default: return "A vencer";
  }
}

function rotuloEtapa(parcela: ParcelaResumoPlanoAcordo, totalRegulares: number): string {
  return parcela.installmentNumber === 0
    ? "Entrada"
    : `Parcela ${parcela.installmentNumber}/${totalRegulares}`;
}

export function resumirPlanoBoletoAcordo(parcelas: ParcelaResumoPlanoAcordo[]): ResumoPlanoBoletoAcordo {
  const ordenadas = ordenarParcelas(parcelas);
  const entrada = ordenadas.find((parcela) => parcela.installmentNumber === 0) ?? null;
  const regulares = ordenadas.filter((parcela) => parcela.installmentNumber > 0);
  const ativas = ordenadas.filter((parcela) => parcela.status !== "cancelado");
  const quitadas = ordenadas.filter((parcela) => parcela.status === "pago");
  const emAberto = ordenadas.filter((parcela) => !["pago", "cancelado"].includes(parcela.status));
  const vencimentos = ordenadas.map((parcela) => parcela.dueDate.getTime()).filter(Number.isFinite);

  return {
    quantidadeEtapas: ordenadas.length,
    entrada: entrada ? {
      rotulo: "Entrada",
      valor: entrada.amount,
      vencimento: entrada.dueDate,
      situacao: rotuloStatus(entrada.status),
    } : null,
    quantidadeParcelasRegulares: regulares.length,
    valorMinimoParcela: regulares.length ? Math.min(...regulares.map((parcela) => parcela.amount)) : null,
    valorMaximoParcela: regulares.length ? Math.max(...regulares.map((parcela) => parcela.amount)) : null,
    primeiroVencimento: vencimentos.length ? new Date(Math.min(...vencimentos)) : null,
    ultimoVencimento: vencimentos.length ? new Date(Math.max(...vencimentos)) : null,
    parcelasQuitadas: quitadas.length,
    valorPago: quitadas.reduce((total, parcela) => total + parcela.amount, 0),
    saldoEmAberto: emAberto.reduce((total, parcela) => total + parcela.amount, 0),
    totalPlano: ativas.reduce((total, parcela) => total + parcela.amount, 0),
  };
}

/** Divide linhas com limite explícito para impedir páginas isoladas por célula. */
export function dividirParcelasEmPaginas<T>(parcelas: T[], tamanhoPagina = ROWS_PER_PAGE): T[][] {
  if (!Number.isInteger(tamanhoPagina) || tamanhoPagina <= 0) {
    throw new Error("O tamanho da página deve ser maior que zero");
  }

  const paginas: T[][] = [];
  for (let inicio = 0; inicio < parcelas.length; inicio += tamanhoPagina) {
    paginas.push(parcelas.slice(inicio, inicio + tamanhoPagina));
  }
  return paginas;
}

function formatarBRL(centavos: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(centavos ?? 0) / 100);
}

function formatarData(data: Date | null | undefined): string {
  return data ? new Date(data).toLocaleDateString("pt-BR") : "—";
}

function formatarFrequencia(frequencia: string): string {
  const labels: Record<string, string> = {
    mensal: "Mensal",
    semanal: "Semanal",
    quinzenal: "Quinzenal",
  };
  return labels[frequencia] ?? frequencia;
}

function rotuloAcordoStatus(status: string): string {
  const labels: Record<string, string> = {
    ativo: "Ativo",
    pago: "Quitado",
    cancelado: "Cancelado",
    quebrado: "Quebrado",
  };
  return labels[status] ?? status;
}

/**
 * Gera um demonstrativo informativo do plano persistido. Ele não é boleto e não
 * contém código de barras, Pix, linha digitável ou instrução de pagamento.
 */
export async function gerarPlanoCompletoAcordoPDF(input: PlanoCompletoAcordoPdfInput): Promise<Buffer> {
  const parcelas = ordenarParcelas(input.parcelas);
  const resumo = resumirPlanoBoletoAcordo(parcelas);
  const totalRegulares = parcelas.filter((parcela) => parcela.installmentNumber > 0).length;
  const paginas = dividirParcelasEmPaginas(parcelas);
  const geradoEm = input.geradoEm ?? new Date();

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      info: {
        Title: `Plano completo do Acordo #${input.acordo.id}`,
        Author: "Sistema de Gestão de Cobranças",
        Subject: "Documento informativo — plano de pagamento",
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const desenharRodape = (numeroPagina: number) => {
      const margemInferiorOriginal = doc.page.margins.bottom;
      // PDFKit aplica auto-page-break a textos desenhados dentro da margem inferior.
      // O rodapé é posicionado manualmente, portanto precisa ignorar essa margem só aqui.
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(7).fillColor(COR_MUTED)
        .text(
          `Documento informativo — não é boleto nem substitui título de cobrança · Página ${numeroPagina}`,
          MARGIN,
          PAGE_H - 28,
          { width: CONTENT_W, align: "center", lineBreak: false },
        );
      doc.page.margins.bottom = margemInferiorOriginal;
    };

    const desenharCabecalho = (numeroPagina: number, continuacao = false): number => {
      let y = MARGIN;
      doc.rect(MARGIN, y, CONTENT_W, 52).fill(COR_PRIMARIA);
      doc.font("Helvetica-Bold").fontSize(16).fillColor("#FFFFFF")
        .text(continuacao ? "Plano de pagamento — continuação" : "Plano completo do acordo", MARGIN + 12, y + 10, { width: CONTENT_W - 24, lineBreak: false });
      doc.font("Helvetica").fontSize(8.5).fillColor("#DDEBFA")
        .text(`Acordo #${input.acordo.id} · ${input.condominio.name}`, MARGIN + 12, y + 31, { width: CONTENT_W - 24, lineBreak: false });
      desenharRodape(numeroPagina);
      return y + 66;
    };

    const desenharLinhaInfo = (rotulo: string, valor: string, x: number, y: number, largura: number) => {
      doc.font("Helvetica-Bold").fontSize(7).fillColor(COR_MUTED).text(rotulo, x, y, { width: largura, lineBreak: false });
      doc.font("Helvetica").fontSize(9).fillColor(COR_TEXTO).text(valor, x, y + 10, { width: largura, lineBreak: false });
    };

    const desenharCabecalhoTabela = (y: number): number => {
      const colunas = [
        { titulo: "Etapa", x: MARGIN, w: 96, align: "left" as const },
        { titulo: "Vencimento", x: MARGIN + 96, w: 86, align: "center" as const },
        { titulo: "Valor", x: MARGIN + 182, w: 93, align: "right" as const },
        { titulo: "Situação", x: MARGIN + 275, w: 105, align: "left" as const },
        { titulo: "Pagamento", x: MARGIN + 380, w: CONTENT_W - 380, align: "center" as const },
      ];
      doc.rect(MARGIN, y, CONTENT_W, 18).fill(COR_DESTAQUE);
      colunas.forEach((coluna) => {
        doc.font("Helvetica-Bold").fontSize(7).fillColor(COR_TEXTO)
          .text(coluna.titulo, coluna.x + 4, y + 5, { width: coluna.w - 8, align: coluna.align, lineBreak: false });
      });
      return y + 18;
    };

    const desenharLinhaParcela = (parcela: ParcelaResumoPlanoAcordo, indice: number, y: number) => {
      const colunas = [
        { x: MARGIN, w: 96, texto: rotuloEtapa(parcela, totalRegulares), align: "left" as const },
        { x: MARGIN + 96, w: 86, texto: formatarData(parcela.dueDate), align: "center" as const },
        { x: MARGIN + 182, w: 93, texto: formatarBRL(parcela.amount), align: "right" as const },
        { x: MARGIN + 275, w: 105, texto: rotuloStatus(parcela.status), align: "left" as const },
        { x: MARGIN + 380, w: CONTENT_W - 380, texto: parcela.paymentDate ? formatarData(parcela.paymentDate) : "—", align: "center" as const },
      ];
      if (indice % 2 === 1) doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill(COR_LINHA_ALTERNADA);
      doc.rect(MARGIN, y, CONTENT_W, ROW_H).strokeColor(COR_BORDA).lineWidth(0.3).stroke();
      colunas.slice(1).forEach((coluna) => doc.moveTo(coluna.x, y).lineTo(coluna.x, y + ROW_H).strokeColor(COR_BORDA).lineWidth(0.3).stroke());
      colunas.forEach((coluna) => {
        doc.font(parcela.status === "pago" ? "Helvetica-Bold" : "Helvetica").fontSize(7.5)
          .fillColor(parcela.status === "atrasado" ? "#B42318" : COR_TEXTO)
          .text(coluna.texto, coluna.x + 4, y + 5.5, { width: coluna.w - 8, align: coluna.align, lineBreak: false });
      });
    };

    let pageNumber = 1;
    let y = desenharCabecalho(pageNumber);

    const unidade = [input.devedor.bloco ? `Bloco ${input.devedor.bloco}` : null, input.devedor.unitNumber ? `Unidade ${input.devedor.unitNumber}` : null]
      .filter(Boolean)
      .join(" · ") || "—";

    doc.font("Helvetica-Bold").fontSize(10).fillColor(COR_PRIMARIA).text("Identificação", MARGIN, y);
    y += 16;
    desenharLinhaInfo("CONDOMÍNIO", input.condominio.name, MARGIN, y, 250);
    desenharLinhaInfo("DEVEDOR", input.devedor.name ?? "—", MARGIN + 270, y, CONTENT_W - 270);
    y += 34;
    desenharLinhaInfo("UNIDADE", unidade, MARGIN, y, 250);
    desenharLinhaInfo("FORMALIZADO EM", formatarData(input.acordo.createdAt), MARGIN + 270, y, CONTENT_W - 270);
    y += 43;

    doc.font("Helvetica-Bold").fontSize(10).fillColor(COR_PRIMARIA).text("Resumo do plano formalizado", MARGIN, y);
    y += 15;
    const cards = [
      ["VALOR NEGOCIADO", formatarBRL(input.acordo.agreedAmount)],
      ["ETAPAS", `${resumo.quantidadeEtapas} · ${resumo.parcelasQuitadas} quitada(s)`],
      ["SALDO EM ABERTO", formatarBRL(resumo.saldoEmAberto)],
      ["FREQUÊNCIA", formatarFrequencia(input.acordo.paymentFrequency)],
    ];
    const cardW = (CONTENT_W - 18) / 4;
    cards.forEach(([rotulo, valor], index) => {
      const x = MARGIN + index * (cardW + 6);
      doc.roundedRect(x, y, cardW, 42, 3).fill("#F7FAFC");
      doc.roundedRect(x, y, cardW, 42, 3).strokeColor(COR_BORDA).lineWidth(0.4).stroke();
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(COR_MUTED).text(rotulo, x + 5, y + 6, { width: cardW - 10, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(COR_TEXTO).text(valor, x + 5, y + 23, { width: cardW - 10, align: "right", lineBreak: false });
    });
    y += 55;

    const entradaTexto = resumo.entrada
      ? `Entrada: ${formatarBRL(resumo.entrada.valor)} em ${formatarData(resumo.entrada.vencimento)} (${resumo.entrada.situacao}).`
      : "Sem entrada registrada.";
    const faixaParcelas = resumo.quantidadeParcelasRegulares > 0
      ? `Parcelas regulares: ${resumo.quantidadeParcelasRegulares} de ${formatarBRL(resumo.valorMinimoParcela)}${resumo.valorMinimoParcela !== resumo.valorMaximoParcela ? ` a ${formatarBRL(resumo.valorMaximoParcela)}` : ""}.`
      : "Sem parcelas regulares.";
    doc.roundedRect(MARGIN, y, CONTENT_W, 48, 3).fill("#FFF8E7");
    doc.roundedRect(MARGIN, y, CONTENT_W, 48, 3).strokeColor("#F1C26A").lineWidth(0.4).stroke();
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COR_TEXTO).text("Leitura do documento", MARGIN + 8, y + 7, { lineBreak: false });
    doc.font("Helvetica").fontSize(7.5).fillColor(COR_TEXTO)
      .text(`${entradaTexto} ${faixaParcelas} Este plano é informativo e não substitui o boleto de cada vencimento.`, MARGIN + 8, y + 19, { width: CONTENT_W - 16 });

    pageNumber += 1;
    doc.addPage();
    y = desenharCabecalho(pageNumber, true);

    paginas.forEach((pagina, indicePagina) => {
      if (indicePagina > 0) {
        pageNumber += 1;
        doc.addPage();
        y = desenharCabecalho(pageNumber, true);
      }

      doc.font("Helvetica-Bold").fontSize(10).fillColor(COR_PRIMARIA).text("Parcelas do acordo", MARGIN, y);
      doc.font("Helvetica").fontSize(7.5).fillColor(COR_MUTED)
        .text(`Etapas ${indicePagina * ROWS_PER_PAGE + 1} a ${indicePagina * ROWS_PER_PAGE + pagina.length} de ${parcelas.length}`, MARGIN, y + 1, { width: CONTENT_W, align: "right", lineBreak: false });
      y += 16;
      y = desenharCabecalhoTabela(y);
      pagina.forEach((parcela, indiceLinha) => {
        desenharLinhaParcela(parcela, indiceLinha, y);
        y += ROW_H;
      });

      if (indicePagina === paginas.length - 1) {
        y += 12;
        doc.rect(MARGIN, y, CONTENT_W, 23).fill(COR_DESTAQUE);
        doc.rect(MARGIN, y, CONTENT_W, 23).strokeColor(COR_BORDA).lineWidth(0.4).stroke();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(COR_PRIMARIA)
          .text("Total do plano ativo", MARGIN + 6, y + 7, { width: CONTENT_W - 120, lineBreak: false });
        doc.font("Helvetica-Bold").fontSize(9).fillColor(COR_PRIMARIA)
          .text(formatarBRL(resumo.totalPlano), MARGIN + CONTENT_W - 114, y + 6, { width: 108, align: "right", lineBreak: false });
      }
    });

    const margemInferiorOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(6.5).fillColor(COR_MUTED)
      .text(`Gerado em ${geradoEm.toLocaleString("pt-BR")} · Dados exibidos conforme plano formalizado no sistema.`, MARGIN, PAGE_H - 43, { width: CONTENT_W, align: "center", lineBreak: false });
    doc.page.margins.bottom = margemInferiorOriginal;
    doc.end();
  });
}

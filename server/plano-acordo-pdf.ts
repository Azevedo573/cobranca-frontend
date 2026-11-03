import PDFDocument from "pdfkit";
import type { OrigemDividaDocumento } from "./origem-divida-acordo";

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
  origemDivida?: OrigemDividaDocumento;
  geradoEm?: Date;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
// Reserva explícita para ambos os rodapés, sem depender do auto-page-break do PDFKit.
const CONTENT_BOTTOM = PAGE_H - 64;
const ROW_H = 19;
const ROWS_PER_PAGE = 24;
const ORIGEM_DESCRICAO_W = CONTENT_W - 200;
const ORIGEM_LINE_H = 13;
const ORIGEM_PADDING = 6;

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

type ItemOrigemDocumento = OrigemDividaDocumento["itens"][number];

export interface TrechoOrigemDocumento {
  item: ItemOrigemDocumento;
  indiceItem: number;
  linhasDescricao: string[];
  continuacao: boolean;
  altura: number;
}

/**
 * Quebra pelo tamanho real da fonte, inclusive palavras maiores que a coluna.
 * Não trunca caracteres nem separa pares Unicode. Espaços não são descartados;
 * quebras explícitas de parágrafo são respeitadas como linhas (inclusive vazias).
 */
export function quebrarTextoOrigemEmLinhas(
  texto: string,
  largura: number,
  medirTexto: (texto: string) => number,
): string[] {
  if (!Number.isFinite(largura) || largura <= 0) {
    throw new Error("A largura da descrição deve ser maior que zero");
  }
  const linhas: string[] = [];
  for (const paragrafo of texto.replace(/\r\n?/g, "\n").split("\n")) {
    const caracteres = Array.from(paragrafo);
    if (!caracteres.length) linhas.push("");
    let inicio = 0;
    while (inicio < caracteres.length) {
      let minimo = 1;
      let maximo = caracteres.length - inicio;
      let quantidade = 0;
      while (minimo <= maximo) {
        const meio = Math.floor((minimo + maximo) / 2);
        const medida = medirTexto(caracteres.slice(inicio, inicio + meio).join(""));
        if (!Number.isFinite(medida) || medida < 0) throw new Error("Medida de texto inválida");
        if (medida <= largura) {
          quantidade = meio;
          minimo = meio + 1;
        } else {
          maximo = meio - 1;
        }
      }
      if (!quantidade) throw new Error("A coluna não comporta um caractere da descrição");
      // Prefere uma fronteira de palavra, mas mantém o espaço na linha anterior.
      if (inicio + quantidade < caracteres.length) {
        for (let indice = quantidade - 1; indice >= 0; indice -= 1) {
          if (/\s/.test(caracteres[inicio + indice])) {
            quantidade = indice + 1;
            break;
          }
        }
      }
      linhas.push(caracteres.slice(inicio, inicio + quantidade).join(""));
      inicio += quantidade;
    }
  }
  return linhas;
}

/**
 * Paginação pura por altura: uma cobrança pode ocupar vários trechos/páginas.
 * Cada trecho reserva uma linha para o ID (repetido na continuação) e preserva
 * vencimento/principal. Datas indisponíveis ficam por último, com desempate por ID.
 */
export function dividirOrigemEmPaginas(
  itens: ItemOrigemDocumento[],
  medirTexto: (texto: string) => number,
  opcoes: { alturaDisponivel: number; larguraDescricao?: number; alturaLinha?: number; padding?: number },
): TrechoOrigemDocumento[][] {
  const { alturaDisponivel, larguraDescricao = ORIGEM_DESCRICAO_W - 12, alturaLinha = ORIGEM_LINE_H, padding = ORIGEM_PADDING } = opcoes;
  if (!Number.isFinite(alturaLinha) || alturaLinha <= 0 || !Number.isFinite(padding) || padding < 0
    || !Number.isFinite(alturaDisponivel) || alturaDisponivel < alturaLinha * 2 + padding * 2) {
    throw new Error("A página de origem deve comportar o ID e uma linha de descrição");
  }
  const dataOrdenacao = (item: ItemOrigemDocumento) => {
    const data = item.vencimento?.getTime();
    return data != null && Number.isFinite(data) ? data : Infinity;
  };
  const ordenados = [...itens].sort((a, b) => dataOrdenacao(a) - dataOrdenacao(b) || a.cobrancaId - b.cobrancaId);
  const paginas: TrechoOrigemDocumento[][] = [];
  let pagina: TrechoOrigemDocumento[] = [];
  let alturaUsada = 0;
  ordenados.forEach((item, indiceItem) => {
    const linhas = quebrarTextoOrigemEmLinhas(item.titulo, larguraDescricao, medirTexto);
    const alturaIntegral = (linhas.length + 1) * alturaLinha + padding * 2;
    // Não divide uma linha comum só para preencher o fim da página anterior.
    if (pagina.length && alturaIntegral <= alturaDisponivel && alturaUsada + alturaIntegral > alturaDisponivel) {
      paginas.push(pagina);
      pagina = [];
      alturaUsada = 0;
    }
    let inicio = 0;
    while (inicio < linhas.length) {
      let capacidade = Math.floor((alturaDisponivel - alturaUsada - padding * 2) / alturaLinha) - 1;
      if (capacidade < 1) {
        paginas.push(pagina);
        pagina = [];
        alturaUsada = 0;
        capacidade = Math.floor((alturaDisponivel - padding * 2) / alturaLinha) - 1;
      }
      const linhasDescricao = linhas.slice(inicio, inicio + capacidade);
      const altura = (linhasDescricao.length + 1) * alturaLinha + padding * 2;
      pagina.push({ item, indiceItem, linhasDescricao, continuacao: inicio > 0, altura });
      alturaUsada += altura;
      inicio += linhasDescricao.length;
    }
  });
  if (pagina.length) paginas.push(pagina);
  return paginas;
}

function formatarBRL(centavos: number | null | undefined): string {
  return centavos != null && Number.isFinite(centavos)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100)
    : "—";
}

function formatarData(data: Date | null | undefined): string {
  return data && Number.isFinite(new Date(data).getTime()) ? new Date(data).toLocaleDateString("pt-BR") : "—";
}

function formatarFrequencia(frequencia: string): string {
  const labels: Record<string, string> = { mensal: "Mensal", semanal: "Semanal", quinzenal: "Quinzenal" };
  return labels[frequencia] ?? frequencia;
}

function rotuloAcordoStatus(status: string): string {
  const labels: Record<string, string> = { ativo: "Ativo", pago: "Quitado", cancelado: "Cancelado", quebrado: "Quebrado" };
  return labels[status] ?? status;
}

/**
 * Gera um demonstrativo informativo do acordo, da origem e do plano persistidos.
 * Não recalcula encargos, rateia snapshots ou infere descontos. Não é boleto e
 * não contém código de barras, Pix, linha digitável ou instrução de pagamento.
 */
export async function gerarPlanoCompletoAcordoPDF(input: PlanoCompletoAcordoPdfInput): Promise<Buffer> {
  const parcelas = ordenarParcelas(input.parcelas);
  const resumo = resumirPlanoBoletoAcordo(parcelas);
  const totalRegulares = parcelas.filter((parcela) => parcela.installmentNumber > 0).length;
  const paginasParcelas = dividirParcelasEmPaginas(parcelas);
  const origem = input.origemDivida;
  const geradoEm = input.geradoEm ?? new Date();

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      info: {
        Title: `Demonstrativo completo do acordo #${input.acordo.id}`,
        Author: "Sistema de Gestão de Cobranças",
        Subject: "Documento informativo — origem da dívida e plano de pagamento",
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const desenharCabecalho = (numeroPagina: number, secao: string): number => {
      doc.rect(MARGIN, MARGIN, CONTENT_W, 52).fill(COR_PRIMARIA);
      doc.font("Helvetica-Bold").fontSize(15).fillColor("#FFFFFF")
        .text("Demonstrativo completo do acordo", MARGIN + 12, MARGIN + 10, { width: CONTENT_W - 24, lineBreak: false });
      doc.font("Helvetica").fontSize(9).fillColor("#DDEBFA")
        .text(`Acordo #${input.acordo.id} · ${secao}`, MARGIN + 12, MARGIN + 32, { width: CONTENT_W - 24, lineBreak: false });
      const margemInferiorOriginal = doc.page.margins.bottom;
      // Textos de rodapé não podem acionar páginas automáticas, mesmo na última página.
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(7.5).fillColor(COR_MUTED)
        .text(`Documento informativo — não é boleto nem substitui título de cobrança · Página ${numeroPagina}`,
          MARGIN, PAGE_H - 28, { width: CONTENT_W, align: "center", lineBreak: false });
      doc.fontSize(7).text(`Gerado em ${geradoEm.toLocaleString("pt-BR")} · Dados persistidos no sistema.`,
        MARGIN, PAGE_H - 43, { width: CONTENT_W, align: "center", lineBreak: false });
      doc.page.margins.bottom = margemInferiorOriginal;
      return MARGIN + 66;
    };

    let pageNumber = 1;
    let y = desenharCabecalho(pageNumber, "Resumo do acordo");
    const novaPagina = (secao: string) => {
      doc.addPage();
      pageNumber += 1;
      y = desenharCabecalho(pageNumber, secao);
    };
    const garantirEspaco = (altura: number, secao: string) => {
      if (y + altura > CONTENT_BOTTOM) novaPagina(secao);
    };
    const escreverTexto = (texto: string, secao: string, cor = COR_TEXTO, negrito = false) => {
      const fonte = negrito ? "Helvetica-Bold" : "Helvetica";
      doc.font(fonte).fontSize(9);
      const linhas = quebrarTextoOrigemEmLinhas(texto, CONTENT_W, (linha) => doc.widthOfString(linha));
      linhas.forEach((linha) => {
        garantirEspaco(ORIGEM_LINE_H, secao);
        doc.font(fonte).fontSize(9).fillColor(cor)
          .text(linha, MARGIN, y, { width: CONTENT_W, lineBreak: false });
        y += ORIGEM_LINE_H;
      });
      y += 5;
    };
    const tituloSecao = (titulo: string, secao = titulo) => {
      garantirEspaco(36, secao);
      doc.font("Helvetica-Bold").fontSize(11).fillColor(COR_PRIMARIA)
        .text(titulo, MARGIN, y, { width: CONTENT_W, lineBreak: false });
      y += 21;
    };
    const desenharInfo = (rotulo: string, valor: string) => {
      garantirEspaco(31, "Resumo do acordo — continuação");
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COR_MUTED)
        .text(rotulo, MARGIN, y, { width: CONTENT_W, lineBreak: false });
      y += 12;
      escreverTexto(valor, "Resumo do acordo — continuação");
    };

    const unidade = [input.devedor.bloco ? `Bloco ${input.devedor.bloco}` : null, input.devedor.unitNumber ? `Unidade ${input.devedor.unitNumber}` : null]
      .filter(Boolean).join(" · ") || "—";
    tituloSecao("Resumo do acordo");
    desenharInfo("CONDOMÍNIO", input.condominio.name);
    desenharInfo("DEVEDOR / UNIDADE", `${input.devedor.name ?? "—"} · ${unidade}`);
    desenharInfo("FORMALIZAÇÃO / SITUAÇÃO / FREQUÊNCIA", `${formatarData(input.acordo.createdAt)} · ${rotuloAcordoStatus(input.acordo.status)} · ${formatarFrequencia(input.acordo.paymentFrequency)}`);
    escreverTexto(`Valor negociado: ${formatarBRL(input.acordo.agreedAmount)} · Total do plano ativo: ${formatarBRL(resumo.totalPlano)}`,
      "Resumo do acordo — continuação", COR_TEXTO, true);
    escreverTexto(`Etapas: ${resumo.quantidadeEtapas} · Quitadas: ${resumo.parcelasQuitadas} · Valor pago no plano: ${formatarBRL(resumo.valorPago)} · Saldo em aberto: ${formatarBRL(resumo.saldoEmAberto)}`,
      "Resumo do acordo — continuação");
    const entradaTexto = resumo.entrada
      ? `Entrada: ${formatarBRL(resumo.entrada.valor)} em ${formatarData(resumo.entrada.vencimento)} (${resumo.entrada.situacao}).`
      : "Sem entrada registrada.";
    const faixaParcelas = resumo.quantidadeParcelasRegulares > 0
      ? `Parcelas regulares: ${resumo.quantidadeParcelasRegulares} de ${formatarBRL(resumo.valorMinimoParcela)}${resumo.valorMinimoParcela !== resumo.valorMaximoParcela ? ` a ${formatarBRL(resumo.valorMaximoParcela)}` : ""}.`
      : "Sem parcelas regulares.";
    escreverTexto(`${entradaTexto} ${faixaParcelas}`, "Resumo do acordo — continuação");
    escreverTexto("Este demonstrativo explica a origem da dívida e o plano de parcelas. Os valores históricos não alteram o valor de cada boleto; utilize o boleto do respectivo vencimento para pagamento.",
      "Resumo do acordo — continuação", COR_MUTED);

    y += 8;
    tituloSecao("Composição financeira da origem (agregada)", "Composição financeira — continuação");
    const componentes: [string, number | null | undefined][] = [
      ["Principal preservado nos vínculos", origem?.principal],
      ["Juros — snapshot na formalização", origem?.juros],
      ["Multa — snapshot na formalização", origem?.multa],
      ["Correção monetária — snapshot na formalização", origem?.correcao],
      ["Honorários — snapshot na formalização", origem?.honorarios],
      ["Base dos títulos na formalização", origem?.totalFechamento],
    ];
    componentes.forEach(([rotulo, valor], indice) => {
      garantirEspaco(23, "Composição financeira — continuação");
      doc.rect(MARGIN, y, CONTENT_W, 23).fill(indice === componentes.length - 1 ? COR_DESTAQUE : indice % 2 ? COR_LINHA_ALTERNADA : "#FFFFFF");
      doc.rect(MARGIN, y, CONTENT_W, 23).strokeColor(COR_BORDA).lineWidth(0.3).stroke();
      doc.font(indice === componentes.length - 1 ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(COR_TEXTO)
        .text(rotulo, MARGIN + 6, y + 6, { width: CONTENT_W - 130, lineBreak: false });
      doc.text(formatarBRL(valor), MARGIN + CONTENT_W - 118, y + 6, { width: 112, align: "right", lineBreak: false });
      y += 23;
    });
    y += 10;
    escreverTexto("Fonte: principal = valor original preservado no vínculo com o acordo; encargos e base dos títulos = snapshot agregado validado na formalização. Descrições e vencimentos são do cadastro vinculado atual, sem snapshot próprio.",
      "Composição financeira — continuação", COR_MUTED);
    escreverTexto("Encargos somente agregados: não há detalhamento histórico por cobrança e não foi realizado rateio. A base dos títulos é anterior aos ajustes da negociação e não representa o total financeiro do fechamento. Nenhum encargo foi recalculado.",
      "Composição financeira — continuação", COR_MUTED);
    escreverTexto("Origem separada dos descontos e extras negociados: ajustes sem discriminação neste demonstrativo. Não é possível inferir desconto pela diferença entre a base dos títulos e o valor negociado.",
      "Composição financeira — continuação", COR_MUTED);
    const avisos = [...(origem?.avisos ?? [])];
    if (!origem) avisos.push("Origem da dívida não fornecida para este demonstrativo; os dados históricos estão indisponíveis.");
    if (componentes.some(([, valor]) => valor == null || !Number.isFinite(valor))) {
      avisos.push("Composição financeira incompleta: — indica dado indisponível, não valor zero. Consulte a formalização do acordo.");
    }
    if (origem && !origem.itens.length) avisos.push("Não há dívidas de origem vinculadas disponíveis neste acordo.");
    if (origem?.itens.some((item) => item.principal == null || !item.vencimento || !Number.isFinite(item.vencimento.getTime()))) {
      avisos.push("Há vencimento ou principal de origem indisponível; consulte o cadastro vinculado e a formalização do acordo.");
    }
    Array.from(new Set(avisos)).forEach((aviso) => escreverTexto(`Aviso: ${aviso}`, "Composição financeira — continuação", "#8A4B08"));

    const desenharCabecalhoOrigem = () => {
      tituloSecao("Dívidas de origem — composição integral");
      doc.font("Helvetica").fontSize(9).fillColor(COR_MUTED)
        .text(`${origem?.itens.length ?? 0} cobrança(s) · Ordem: vencimento, depois ID · Página de origem com cabeçalho repetido`,
          MARGIN, y, { width: CONTENT_W, lineBreak: false });
      y += 20;
      doc.rect(MARGIN, y, CONTENT_W, 24).fill(COR_DESTAQUE);
      const colunas = [
        { titulo: "ID / descrição completa", x: MARGIN, w: ORIGEM_DESCRICAO_W, align: "left" as const },
        { titulo: "Vencimento", x: MARGIN + ORIGEM_DESCRICAO_W, w: 90, align: "center" as const },
        { titulo: "Principal preservado", x: MARGIN + ORIGEM_DESCRICAO_W + 90, w: 110, align: "right" as const },
      ];
      colunas.forEach((coluna) => doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COR_TEXTO)
        .text(coluna.titulo, coluna.x + 6, y + 7, { width: coluna.w - 12, align: coluna.align, lineBreak: false }));
      y += 24;
    };
    if (origem?.itens.length) {
      // A origem tem paginação própria, com a mesma altura disponível em todas as páginas.
      novaPagina("Dívidas de origem");
      desenharCabecalhoOrigem();
      doc.font("Helvetica").fontSize(9);
      const paginasOrigem = dividirOrigemEmPaginas(origem.itens, (texto) => doc.widthOfString(texto), { alturaDisponivel: CONTENT_BOTTOM - y });
      paginasOrigem.forEach((pagina, indicePagina) => {
        if (indicePagina > 0) {
          novaPagina("Dívidas de origem — continuação");
          desenharCabecalhoOrigem();
        }
        pagina.forEach((trecho) => {
          const { item, altura } = trecho;
          if (trecho.indiceItem % 2) doc.rect(MARGIN, y, CONTENT_W, altura).fill(COR_LINHA_ALTERNADA);
          doc.rect(MARGIN, y, CONTENT_W, altura).strokeColor(COR_BORDA).lineWidth(0.3).stroke();
          [MARGIN + ORIGEM_DESCRICAO_W, MARGIN + ORIGEM_DESCRICAO_W + 90].forEach((x) =>
            doc.moveTo(x, y).lineTo(x, y + altura).strokeColor(COR_BORDA).lineWidth(0.3).stroke());
          doc.font("Helvetica-Bold").fontSize(9).fillColor(COR_TEXTO)
            .text(`Cobrança #${item.cobrancaId}${trecho.continuacao ? " (continuação)" : ""}`,
              MARGIN + ORIGEM_PADDING, y + ORIGEM_PADDING, { width: ORIGEM_DESCRICAO_W - 12, lineBreak: false });
          trecho.linhasDescricao.forEach((linha, indiceLinha) => doc.font("Helvetica").fontSize(9).fillColor(COR_TEXTO)
            .text(linha, MARGIN + ORIGEM_PADDING, y + ORIGEM_PADDING + (indiceLinha + 1) * ORIGEM_LINE_H,
              { width: ORIGEM_DESCRICAO_W - 12, lineBreak: false }));
          doc.font("Helvetica").fontSize(9).fillColor(COR_TEXTO)
            .text(formatarData(item.vencimento), MARGIN + ORIGEM_DESCRICAO_W + 6, y + ORIGEM_PADDING,
              { width: 78, align: "center", lineBreak: false })
            .text(formatarBRL(item.principal), MARGIN + ORIGEM_DESCRICAO_W + 96, y + ORIGEM_PADDING,
              { width: 98, align: "right", lineBreak: false });
          y += altura;
        });
      });
    } else {
      tituloSecao("Dívidas de origem — composição integral");
      escreverTexto("Nenhuma cobrança de origem disponível para detalhamento neste documento.", "Dívidas de origem", COR_MUTED);
    }

    const desenharCabecalhoParcelas = (indicePagina: number, quantidade: number) => {
      tituloSecao("Parcelas do acordo");
      doc.font("Helvetica").fontSize(9).fillColor(COR_MUTED)
        .text(`Etapas ${indicePagina * ROWS_PER_PAGE + 1} a ${indicePagina * ROWS_PER_PAGE + quantidade} de ${parcelas.length}`,
          MARGIN, y, { width: CONTENT_W, lineBreak: false });
      y += 20;
      doc.rect(MARGIN, y, CONTENT_W, 22).fill(COR_DESTAQUE);
      const colunas = [
        { titulo: "Etapa", x: MARGIN, w: 96, align: "left" as const },
        { titulo: "Vencimento", x: MARGIN + 96, w: 86, align: "center" as const },
        { titulo: "Valor", x: MARGIN + 182, w: 93, align: "right" as const },
        { titulo: "Situação", x: MARGIN + 275, w: 105, align: "left" as const },
        { titulo: "Pagamento", x: MARGIN + 380, w: CONTENT_W - 380, align: "center" as const },
      ];
      colunas.forEach((coluna) => doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COR_TEXTO)
        .text(coluna.titulo, coluna.x + 4, y + 6, { width: coluna.w - 8, align: coluna.align, lineBreak: false }));
      y += 22;
    };
    paginasParcelas.forEach((pagina, indicePagina) => {
      novaPagina(indicePagina ? "Plano de parcelas — continuação" : "Plano de parcelas");
      desenharCabecalhoParcelas(indicePagina, pagina.length);
      pagina.forEach((parcela, indiceLinha) => {
        const colunas = [
          { x: MARGIN, w: 96, texto: rotuloEtapa(parcela, totalRegulares), align: "left" as const },
          { x: MARGIN + 96, w: 86, texto: formatarData(parcela.dueDate), align: "center" as const },
          { x: MARGIN + 182, w: 93, texto: formatarBRL(parcela.amount), align: "right" as const },
          { x: MARGIN + 275, w: 105, texto: rotuloStatus(parcela.status), align: "left" as const },
          { x: MARGIN + 380, w: CONTENT_W - 380, texto: formatarData(parcela.paymentDate), align: "center" as const },
        ];
        if (indiceLinha % 2) doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill(COR_LINHA_ALTERNADA);
        doc.rect(MARGIN, y, CONTENT_W, ROW_H).strokeColor(COR_BORDA).lineWidth(0.3).stroke();
        colunas.slice(1).forEach((coluna) => doc.moveTo(coluna.x, y).lineTo(coluna.x, y + ROW_H).strokeColor(COR_BORDA).lineWidth(0.3).stroke());
        colunas.forEach((coluna) => doc.font(parcela.status === "pago" ? "Helvetica-Bold" : "Helvetica").fontSize(9)
          .fillColor(parcela.status === "atrasado" ? "#B42318" : COR_TEXTO)
          .text(coluna.texto, coluna.x + 4, y + 5, { width: coluna.w - 8, align: coluna.align, lineBreak: false }));
        y += ROW_H;
      });
      if (indicePagina === paginasParcelas.length - 1) {
        y += 12;
        doc.rect(MARGIN, y, CONTENT_W, 23).fill(COR_DESTAQUE);
        doc.rect(MARGIN, y, CONTENT_W, 23).strokeColor(COR_BORDA).lineWidth(0.4).stroke();
        doc.font("Helvetica-Bold").fontSize(9).fillColor(COR_PRIMARIA)
          .text("Total do plano ativo", MARGIN + 6, y + 6, { width: CONTENT_W - 120, lineBreak: false })
          .text(formatarBRL(resumo.totalPlano), MARGIN + CONTENT_W - 114, y + 6, { width: 108, align: "right", lineBreak: false });
      }
    });
    if (!paginasParcelas.length) {
      tituloSecao("Parcelas do acordo");
      escreverTexto("Não há parcelas registradas neste plano.", "Plano de parcelas", COR_MUTED);
    }
    doc.end();
  });
}

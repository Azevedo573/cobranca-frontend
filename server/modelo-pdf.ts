import PDFDocument from "pdfkit";
import https from "https";
import http from "http";
import { Readable } from "stream";
import sharp from "sharp";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface VariaveisDocumento {
  // Devedor
  nomeDevedor?: string;
  cpfCnpjDevedor?: string;
  unidadeDevedor?: string;
  blocoDevedor?: string;
  enderecoDevedor?: string;
  // Condomínio
  nomeCondominio?: string;
  cnpjCondominio?: string;
  enderecoCondominio?: string;
  // Dívida / Acordo
  valorOriginal?: string;
  valorAcordo?: string;
  valorEntrada?: string;
  numeroParcelas?: string;
  valorParcela?: string;
  dataVencimentoPrimeiraParcela?: string;
  tabelaParcelas?: string; // HTML da tabela de parcelas
  // Datas
  dataAtual?: string;
  dataAtualExtenso?: string;
  // Outros
  nomeResponsavel?: string;
  [key: string]: string | undefined;
}

export interface AnexoPDF {
  url: string;
  largura?: number;
  alinhamento?: "esquerda" | "centro" | "direita";
  legenda?: string;
}

export interface OpcoesPDFModelo {
  conteudoHtml: string;
  logoUrl?: string | null;
  marcaDaguaUrl?: string | null;
  logoAlinhamento?: "esquerda" | "centro" | "direita";
  logoPosicaoVertical?: "topo" | "rodape";
  logoLargura?: number;
  marcaDaguaOpacidade?: number;
  marcaDaguaPosicao?: "diagonal" | "centro" | "topo" | "rodape";
  margemSuperior?: number;
  margemInferior?: number;
  margemEsquerda?: number;
  margemDireita?: number;
  variaveis?: VariaveisDocumento;
  anexos?: AnexoPDF[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function substituirVariaveis(html: string, variaveis: VariaveisDocumento): string {
  let resultado = html;
  for (const [chave, valor] of Object.entries(variaveis)) {
    if (valor !== undefined) {
      const regex = new RegExp(`\\{\\{\\s*${chave}\\s*\\}\\}`, "gi");
      resultado = resultado.replace(regex, valor);
    }
  }
  return resultado;
}

async function baixarImagem(url: string): Promise<Buffer> {
  const raw = await new Promise<Buffer>((resolve, reject) => {
    const protocolo = url.startsWith("https") ? https : http;
    protocolo.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
  // PDFKit suporta apenas JPEG e PNG.
  // Converte WebP, AVIF e outros formatos não suportados para PNG via sharp.
  try {
    const meta = await sharp(raw).metadata();
    if (meta.format && !["jpeg", "jpg", "png"].includes(meta.format)) {
      return await sharp(raw).png().toBuffer();
    }
  } catch {
    // Se sharp falhar, retorna o buffer original e deixa o PDFKit tentar
  }
  return raw;
}

/**
 * Converte HTML simples (do TipTap) em blocos de texto para PDFKit.
 * Suporta: parágrafos, negrito, itálico, listas, headings, tabelas, quebras de linha.
 * Preserva a ordem original dos elementos e captura alinhamentos de texto.
 */
function htmlParaLinhas(html: string): Array<{ texto: string; tipo: string; nivel?: number; align?: string }> {
  const linhas: Array<{ texto: string; tipo: string; nivel?: number; align?: string }> = [];

  // Remove tags de estilo inline mas preserva conteúdo
  const limpar = (s: string) =>
    s
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
      .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
      .replace(/<em[^>]*>(.*?)<\/em>/gi, "_$1_")
      .replace(/<i[^>]*>(.*?)<\/i>/gi, "_$1_")
      .replace(/<u[^>]*>(.*?)<\/u>/gi, "$1")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();

  // Extrai alinhamento de texto de um atributo style ou data-text-align
  const extrairAlign = (tag: string): string => {
    // TipTap usa style="text-align: center" ou style="text-align:center"
    const styleMatch = tag.match(/style=["'][^"']*text-align\s*:\s*(\w+)/i);
    if (styleMatch) return styleMatch[1].toLowerCase();
    return "left";
  };

  // Helper para converter alinhamento TipTap → PDFKit
  const normalizarAlign = (a: string): string => {
    if (a === "center" || a === "centre") return "center";
    if (a === "right") return "right";
    if (a === "justify") return "justify";
    return "left";
  };

  // Helper para processar tabela HTML e retornar objeto de linha
  const processarTabela = (conteudo: string): { texto: string; tipo: string } => {
    const rows = Array.from(conteudo.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
    const tableRows: Array<{ cells: string[]; isHeader: boolean }> = [];
    for (const [, row] of rows) {
      const headerCells = Array.from(row.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi));
      const dataCells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi));
      if (headerCells.length > 0) {
        tableRows.push({ cells: headerCells.map(([, c]) => limpar(c)), isHeader: true });
      } else if (dataCells.length > 0) {
        tableRows.push({ cells: dataCells.map(([, c]) => limpar(c)), isHeader: false });
      }
    }
    return { texto: JSON.stringify(tableRows), tipo: "tabela_estruturada" };
  };

  // Processa o HTML de forma sequencial, preservando a ordem dos elementos
  // Divide o HTML em tokens: blocos de nível superior (p, h1-h6, ul, ol, table)
  // usando uma regex que captura cada bloco com sua tag de abertura completa
  const blockRegex = /<(h[1-6]|p|ul|ol|table)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(html)) !== null) {
    const [fullMatch, tag, attrs = "", inner] = match;
    const tagLower = tag.toLowerCase();

    if (tagLower.match(/^h[1-6]$/)) {
      const nivel = parseInt(tagLower[1]);
      const align = normalizarAlign(extrairAlign(fullMatch));
      const texto = limpar(inner);
      if (texto) linhas.push({ texto, tipo: tagLower, nivel, align });

    } else if (tagLower === "p") {
      const align = normalizarAlign(extrairAlign(fullMatch));
      // Verifica se o parágrafo contém uma tabela embutida ({{tabelaParcelas}} já substituído)
      if (/<table/i.test(inner)) {
        // Extrai texto antes da tabela
        const preTabela = inner.replace(/<table[\s\S]*?<\/table>/gi, "").trim();
        const textoAntes = limpar(preTabela);
        if (textoAntes) linhas.push({ texto: textoAntes, tipo: "p", align });
        // Extrai e processa a tabela
        const tabelaMatch = inner.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
        if (tabelaMatch) {
          linhas.push(processarTabela(tabelaMatch[1]));
        }
      } else {
        const texto = limpar(inner);
        if (texto) linhas.push({ texto, tipo: "p", align });
      }

    } else if (tagLower === "ul") {
      const items = Array.from(inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi));
      for (const [, item] of items) {
        linhas.push({ texto: `• ${limpar(item)}`, tipo: "li" });
      }

    } else if (tagLower === "ol") {
      const items = Array.from(inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi));
      items.forEach(([, item], idx) => {
        linhas.push({ texto: `${idx + 1}. ${limpar(item)}`, tipo: "li" });
      });

    } else if (tagLower === "table") {
      linhas.push(processarTabela(inner));
    }

    lastIndex = match.index + fullMatch.length;
  }

  // Processa qualquer texto restante fora de blocos (edge case)
  const resto = html.slice(lastIndex).trim();
  if (resto) {
    const texto = limpar(resto);
    if (texto) linhas.push({ texto, tipo: "p", align: "left" });
  }

  return linhas;
}

// ─── Gerador de tabela HTML de parcelas ─────────────────────────────────────

export interface ParcelaTabela {
  numero: number;
  vencimento: string; // dd/mm/aaaa
  valor: string;      // R$ X.XXX,XX
  status?: string;
}

export function gerarHtmlTabelaParcelas(parcelas: ParcelaTabela[]): string {
  const linhas = parcelas
    .map(
      (p) =>
        `<tr><td>${p.numero}</td><td>${p.vencimento}</td><td>${p.valor}</td><td>${p.status ?? "Em aberto"}</td></tr>`
    )
    .join("");
  return `<table><thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

// ─── Gerador Principal ───────────────────────────────────────────────────────

export async function gerarPDFModelo(opcoes: OpcoesPDFModelo): Promise<Buffer> {
  const {
    conteudoHtml,
    logoUrl,
    marcaDaguaUrl,
    logoAlinhamento = "esquerda",
    logoPosicaoVertical = "topo",
    logoLargura = 120,
    marcaDaguaOpacidade = 8,
    marcaDaguaPosicao = "diagonal",
    margemSuperior = 40,
    margemInferior = 40,
    margemEsquerda = 50,
    margemDireita = 50,
    variaveis = {},
    anexos = [],
  } = opcoes;

  // Substituir variáveis no HTML
  const htmlFinal = substituirVariaveis(conteudoHtml, variaveis);

  // Criar documento PDF
  const doc = new PDFDocument({
    size: "A4",
    margins: {
      top: margemSuperior,
      bottom: margemInferior,
      left: margemEsquerda,
      right: margemDireita,
    },
    bufferPages: true,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const larguraUtil = doc.page.width - margemEsquerda - margemDireita;

  // ── Marca d'água (antes do conteúdo) ──────────────────────────────────────
  const renderizarMarcaDagua = async () => {
    if (!marcaDaguaUrl) return;
    try {
      const imgBuffer = await baixarImagem(marcaDaguaUrl);
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const opacidade = (marcaDaguaOpacidade ?? 8) / 100;
      doc.save();
      doc.opacity(opacidade);
      if (marcaDaguaPosicao === "diagonal") {
        const imgW = pageW * 0.6;
        doc.rotate(-45, { origin: [pageW / 2, pageH / 2] });
        doc.image(imgBuffer, (pageW - imgW) / 2, (pageH - imgW) / 2, { width: imgW, height: imgW });
      } else if (marcaDaguaPosicao === "centro") {
        const imgW = pageW * 0.5;
        doc.image(imgBuffer, (pageW - imgW) / 2, (pageH - imgW) / 2, { width: imgW, height: imgW });
      } else if (marcaDaguaPosicao === "topo") {
        const imgW = pageW * 0.4;
        doc.image(imgBuffer, (pageW - imgW) / 2, margemSuperior, { width: imgW });
      } else if (marcaDaguaPosicao === "rodape") {
        const imgW = pageW * 0.4;
        doc.image(imgBuffer, (pageW - imgW) / 2, pageH - margemInferior - imgW * 0.5, { width: imgW });
      }
      doc.restore();
    } catch {
      // Ignora erro de marca d'água
    }
  };
  await renderizarMarcaDagua();

  // ── Logo no topo ──────────────────────────────────────────────────────────
  let yAtual = margemSuperior;
  let logoBuffer: Buffer | null = null;
  if (logoUrl) {
    try {
      logoBuffer = await baixarImagem(logoUrl);
    } catch { /* ignora */ }
  }

  if (logoBuffer && logoPosicaoVertical === "topo") {
    try {
      const logoW = logoLargura ?? 120;
      const logoH = 60;
      let logoX = margemEsquerda;
      if (logoAlinhamento === "centro") logoX = (doc.page.width - logoW) / 2;
      if (logoAlinhamento === "direita") logoX = doc.page.width - margemDireita - logoW;
      doc.image(logoBuffer, logoX, yAtual, { height: logoH, fit: [logoW, logoH] });
      yAtual += logoH + 16;
      doc.moveTo(margemEsquerda, yAtual).lineTo(doc.page.width - margemDireita, yAtual).strokeColor("#cccccc").lineWidth(0.5).stroke();
      yAtual += 12;
    } catch { /* ignora */ }
  }

  // ── Conteúdo ──────────────────────────────────────────────────────────────
  doc.y = yAtual;
  const linhas = htmlParaLinhas(htmlFinal);

  for (const linha of linhas) {
    if (doc.y > doc.page.height - margemInferior - 40) {
      doc.addPage();
      // Repete marca d'água nas páginas seguintes
      if (marcaDaguaUrl) {
        try {
          const imgBuffer = await baixarImagem(marcaDaguaUrl);
          const pageW = doc.page.width;
          const pageH = doc.page.height;
          const imgW = pageW * 0.6;
          doc.save();
          doc.opacity(0.08);
          doc.rotate(-45, { origin: [pageW / 2, pageH / 2] });
          doc.image(imgBuffer, (pageW - imgW) / 2, (pageH - imgW) / 2, { width: imgW, height: imgW });
          doc.restore();
        } catch { /* */ }
      }
      doc.y = margemSuperior;
    }

    // Normaliza o alinhamento para PDFKit (aceita 'left'|'center'|'right'|'justify')
    const pdfAlign = (linha.align ?? "left") as "left" | "center" | "right" | "justify";

    switch (linha.tipo) {
      case "h1":
        doc.font("Helvetica-Bold").fontSize(18).fillColor("#1a1a2e");
        doc.text(linha.texto, { width: larguraUtil, align: pdfAlign !== "left" ? pdfAlign : "center" });
        doc.moveDown(0.5);
        break;
      case "h2":
        doc.font("Helvetica-Bold").fontSize(15).fillColor("#1a1a2e");
        doc.text(linha.texto, { width: larguraUtil, align: pdfAlign });
        doc.moveDown(0.3);
        break;
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        doc.font("Helvetica-Bold").fontSize(12).fillColor("#333333");
        doc.text(linha.texto, { width: larguraUtil, align: pdfAlign });
        doc.moveDown(0.3);
        break;
      case "li":
        doc.font("Helvetica").fontSize(11).fillColor("#333333");
        doc.text(linha.texto, { width: larguraUtil - 16, indent: 16 });
        doc.moveDown(0.2);
        break;
      case "tabela":
        doc.font("Courier").fontSize(9).fillColor("#333333");
        doc.text(linha.texto, { width: larguraUtil });
        doc.moveDown(0.1);
        break;

      case "tabela_estruturada": {
        // Renderiza tabela com bordas e cabeçalho destacado
        let tableRows: Array<{ cells: string[]; isHeader: boolean }> = [];
        try { tableRows = JSON.parse(linha.texto); } catch { break; }
        if (tableRows.length === 0) break;

        const numCols = Math.max(...tableRows.map((r) => r.cells.length));
        const colW = larguraUtil / numCols;
        const cellPadH = 4;
        const cellPadV = 5;
        const rowH = 20;

        // Verificar espaço na página
        const tableH = tableRows.length * rowH + 4;
        if (doc.y + tableH > doc.page.height - margemInferior - 20) {
          doc.addPage();
          doc.y = margemSuperior;
        }

        const startX = doc.x;
        let rowY = doc.y;

        for (const row of tableRows) {
          // Fundo do cabeçalho
          if (row.isHeader) {
            doc.rect(startX, rowY, larguraUtil, rowH).fillColor("#1a1a2e").fill();
          } else {
            // Linha zebrada
            const rowIndex = tableRows.indexOf(row);
            if (rowIndex % 2 === 0) {
              doc.rect(startX, rowY, larguraUtil, rowH).fillColor("#f5f5f5").fill();
            }
          }

          // Bordas externas da linha
          doc.rect(startX, rowY, larguraUtil, rowH).strokeColor("#cccccc").lineWidth(0.5).stroke();

          // Texto das células
          for (let ci = 0; ci < numCols; ci++) {
            const cellText = row.cells[ci] ?? "";
            const cellX = startX + ci * colW;
            // Linha vertical entre células
            if (ci > 0) {
              doc.moveTo(cellX, rowY).lineTo(cellX, rowY + rowH).strokeColor("#cccccc").lineWidth(0.5).stroke();
            }
            doc
              .font(row.isHeader ? "Helvetica-Bold" : "Helvetica")
              .fontSize(9)
              .fillColor(row.isHeader ? "#ffffff" : "#333333")
              .text(cellText, cellX + cellPadH, rowY + cellPadV, {
                width: colW - cellPadH * 2,
                height: rowH - cellPadV,
                ellipsis: true,
                lineBreak: false,
              });
          }
          rowY += rowH;
        }

        doc.y = rowY + 8;
        doc.x = startX;
        break;
      }
      default: // "p"
        doc.font("Helvetica").fontSize(11).fillColor("#333333");
        // Suporte básico a negrito inline **texto**
        if (linha.texto.includes("**")) {
          const partes = linha.texto.split(/(\*\*.*?\*\*)/g);
          let x = doc.x;
          const y = doc.y;
          for (const parte of partes) {
            if (parte.startsWith("**") && parte.endsWith("**")) {
              doc.font("Helvetica-Bold").text(parte.slice(2, -2), x, y, { continued: true, align: pdfAlign });
            } else if (parte) {
              doc.font("Helvetica").text(parte, { continued: true, align: pdfAlign });
            }
          }
          doc.text(""); // finaliza linha
        } else {
          doc.text(linha.texto, { width: larguraUtil, align: pdfAlign });
        }
        doc.moveDown(0.4);
    }
  }
  // ── Anexos de imagens ──────────────────────────────────────────────────────────────────
  if (anexos.length > 0) {
    doc.moveDown(1);
    doc.moveTo(margemEsquerda, doc.y).lineTo(doc.page.width - margemDireita, doc.y).strokeColor("#cccccc").lineWidth(0.5).stroke();
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#333333").text("Anexos", { width: larguraUtil });
    doc.moveDown(0.5);
    for (const anexo of anexos) {
      try {
        const imgBuf = await baixarImagem(anexo.url);
        const largura = Math.min(anexo.largura ?? 400, larguraUtil);
        let imgX = margemEsquerda;
        if (anexo.alinhamento === "centro") imgX = (doc.page.width - largura) / 2;
        if (anexo.alinhamento === "direita") imgX = doc.page.width - margemDireita - largura;
        // Verificar espaço na página
        if (doc.y + 80 > doc.page.height - margemInferior - 20) {
          doc.addPage();
          await renderizarMarcaDagua();
          doc.y = margemSuperior;
        }
        doc.image(imgBuf, imgX, doc.y, { width: largura });
        doc.y += largura * 0.6 + 8; // estimativa de altura
        if (anexo.legenda) {
          doc.font("Helvetica").fontSize(9).fillColor("#666666").text(anexo.legenda, { width: larguraUtil, align: (anexo.alinhamento as any) ?? "center" });
          doc.moveDown(0.3);
        }
        doc.moveDown(0.5);
      } catch { /* ignora erro de anexo */ }
    }
  }

  // ── Logo no rodapé ──────────────────────────────────────────────────────────────────
  // (será aplicado na fase de numeração de páginas abaixo)

  // ── Numeração de páginas e logo no rodapé ──────────────────────────────────────────────────────────────────
  const totalPaginas = (doc as any).bufferedPageRange().count;
  for (let i = 0; i < totalPaginas; i++) {
    doc.switchToPage(i);
    // Logo no rodapé
    if (logoBuffer && logoPosicaoVertical === "rodape") {
      try {
        const logoW = logoLargura ?? 120;
        const logoH = 40;
        let logoX = margemEsquerda;
        if (logoAlinhamento === "centro") logoX = (doc.page.width - logoW) / 2;
        if (logoAlinhamento === "direita") logoX = doc.page.width - margemDireita - logoW;
        const logoY = doc.page.height - margemInferior - logoH - 12;
        doc.image(logoBuffer, logoX, logoY, { height: logoH, fit: [logoW, logoH] });
      } catch { /* ignora */ }
    }
    // Numeração
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#999999")
      .text(
        `Página ${i + 1} de ${totalPaginas}`,
        margemEsquerda,
        doc.page.height - margemInferior - 14,
        { width: larguraUtil, align: "center", lineBreak: false }
      );
  }

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

// ─── Variáveis disponíveis (para o painel de ajuda no editor) ────────────────

export const VARIAVEIS_DISPONIVEIS: Array<{ chave: string; descricao: string; categoria: string }> = [
  // Devedor
  { chave: "nomeDevedor", descricao: "Nome completo do devedor", categoria: "Devedor" },
  { chave: "cpfCnpjDevedor", descricao: "CPF ou CNPJ do devedor", categoria: "Devedor" },
  { chave: "unidadeDevedor", descricao: "Número da unidade", categoria: "Devedor" },
  { chave: "blocoDevedor", descricao: "Bloco do devedor", categoria: "Devedor" },
  { chave: "enderecoDevedor", descricao: "Endereço completo do devedor", categoria: "Devedor" },
  // Condomínio
  { chave: "nomeCondominio", descricao: "Nome do condomínio", categoria: "Condomínio" },
  { chave: "cnpjCondominio", descricao: "CNPJ do condomínio", categoria: "Condomínio" },
  { chave: "enderecoCondominio", descricao: "Endereço do condomínio", categoria: "Condomínio" },
  // Acordo / Dívida
  { chave: "valorOriginal", descricao: "Valor original da dívida", categoria: "Acordo" },
  { chave: "valorAcordo", descricao: "Valor total do acordo", categoria: "Acordo" },
  { chave: "valorEntrada", descricao: "Valor da entrada", categoria: "Acordo" },
  { chave: "numeroParcelas", descricao: "Número de parcelas", categoria: "Acordo" },
  { chave: "valorParcela", descricao: "Valor de cada parcela", categoria: "Acordo" },
  { chave: "dataVencimentoPrimeiraParcela", descricao: "Vencimento da 1ª parcela", categoria: "Acordo" },
  { chave: "tabelaParcelas", descricao: "Tabela completa de parcelas", categoria: "Acordo" },
  // Datas
  { chave: "dataAtual", descricao: "Data atual (dd/mm/aaaa)", categoria: "Data" },
  { chave: "dataAtualExtenso", descricao: "Data atual por extenso", categoria: "Data" },
  // Responsável
  { chave: "nomeResponsavel", descricao: "Nome do responsável pelo acordo", categoria: "Responsável" },
];

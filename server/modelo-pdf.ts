import PDFDocument from "pdfkit";
import https from "https";
import http from "http";
import { Readable } from "stream";

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

export interface OpcoesPDFModelo {
  conteudoHtml: string;
  logoUrl?: string | null;
  marcaDaguaUrl?: string | null;
  logoAlinhamento?: "esquerda" | "centro" | "direita";
  margemSuperior?: number;
  margemInferior?: number;
  margemEsquerda?: number;
  margemDireita?: number;
  variaveis?: VariaveisDocumento;
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
  return new Promise((resolve, reject) => {
    const protocolo = url.startsWith("https") ? https : http;
    protocolo.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

/**
 * Converte HTML simples (do TipTap) em blocos de texto para PDFKit.
 * Suporta: parágrafos, negrito, itálico, listas, headings, tabelas, quebras de linha.
 */
function htmlParaLinhas(html: string): Array<{ texto: string; tipo: string; nivel?: number }> {
  const linhas: Array<{ texto: string; tipo: string; nivel?: number }> = [];

  // Remove tags de estilo inline mas preserva conteúdo
  const limpar = (s: string) =>
    s
      .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
      .replace(/<b>(.*?)<\/b>/gi, "**$1**")
      .replace(/<em>(.*?)<\/em>/gi, "_$1_")
      .replace(/<i>(.*?)<\/i>/gi, "_$1_")
      .replace(/<u>(.*?)<\/u>/gi, "$1")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();

  // Headings
  html = html.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, nivel, conteudo) => {
    linhas.push({ texto: limpar(conteudo), tipo: `h${nivel}`, nivel: parseInt(nivel) });
    return "";
  });

  // Listas não ordenadas
  html = html.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, conteudo) => {
    const items = [...conteudo.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
    for (const [, item] of items) {
      linhas.push({ texto: `• ${limpar(item)}`, tipo: "li" });
    }
    return "";
  });

  // Listas ordenadas
  let liCounter = 0;
  html = html.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, conteudo) => {
    liCounter = 0;
    const items = [...conteudo.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
    for (const [, item] of items) {
      liCounter++;
      linhas.push({ texto: `${liCounter}. ${limpar(item)}`, tipo: "li" });
    }
    return "";
  });

  // Tabelas — renderiza como texto tabulado simples
  html = html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, conteudo) => {
    const rows = [...conteudo.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const [, row] of rows) {
      const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
      const cellTexts = cells.map(([, c]) => limpar(c).padEnd(20)).join(" | ");
      linhas.push({ texto: cellTexts, tipo: "tabela" });
    }
    return "";
  });

  // Parágrafos restantes
  const paragrafos = html.split(/<p[^>]*>|<\/p>/gi).filter((s) => s.trim());
  for (const p of paragrafos) {
    const texto = limpar(p);
    if (texto) linhas.push({ texto, tipo: "p" });
  }

  return linhas;
}

// ─── Gerador Principal ───────────────────────────────────────────────────────

export async function gerarPDFModelo(opcoes: OpcoesPDFModelo): Promise<Buffer> {
  const {
    conteudoHtml,
    logoUrl,
    marcaDaguaUrl,
    logoAlinhamento = "esquerda",
    margemSuperior = 40,
    margemInferior = 40,
    margemEsquerda = 50,
    margemDireita = 50,
    variaveis = {},
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
  if (marcaDaguaUrl) {
    try {
      const imgBuffer = await baixarImagem(marcaDaguaUrl);
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const imgW = pageW * 0.6;
      const imgH = imgW;
      doc.save();
      doc.opacity(0.08);
      doc.rotate(-45, { origin: [pageW / 2, pageH / 2] });
      doc.image(imgBuffer, (pageW - imgW) / 2, (pageH - imgH) / 2, { width: imgW, height: imgH });
      doc.restore();
    } catch {
      // Ignora erro de marca d'água
    }
  }

  // ── Logo ──────────────────────────────────────────────────────────────────
  let yAtual = margemSuperior;
  if (logoUrl) {
    try {
      const imgBuffer = await baixarImagem(logoUrl);
      const logoH = 60;
      const logoW = 180;
      let logoX = margemEsquerda;
      if (logoAlinhamento === "centro") logoX = (doc.page.width - logoW) / 2;
      if (logoAlinhamento === "direita") logoX = doc.page.width - margemDireita - logoW;
      doc.image(imgBuffer, logoX, yAtual, { height: logoH, fit: [logoW, logoH] });
      yAtual += logoH + 16;
      doc.moveTo(margemEsquerda, yAtual).lineTo(doc.page.width - margemDireita, yAtual).strokeColor("#cccccc").lineWidth(0.5).stroke();
      yAtual += 12;
    } catch {
      // Ignora erro de logo
    }
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

    switch (linha.tipo) {
      case "h1":
        doc.font("Helvetica-Bold").fontSize(18).fillColor("#1a1a2e");
        doc.text(linha.texto, { width: larguraUtil, align: "center" });
        doc.moveDown(0.5);
        break;
      case "h2":
        doc.font("Helvetica-Bold").fontSize(15).fillColor("#1a1a2e");
        doc.text(linha.texto, { width: larguraUtil });
        doc.moveDown(0.3);
        break;
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        doc.font("Helvetica-Bold").fontSize(12).fillColor("#333333");
        doc.text(linha.texto, { width: larguraUtil });
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
      default: // "p"
        doc.font("Helvetica").fontSize(11).fillColor("#333333");
        // Suporte básico a negrito inline **texto**
        if (linha.texto.includes("**")) {
          const partes = linha.texto.split(/(\*\*.*?\*\*)/g);
          let x = doc.x;
          const y = doc.y;
          for (const parte of partes) {
            if (parte.startsWith("**") && parte.endsWith("**")) {
              doc.font("Helvetica-Bold").text(parte.slice(2, -2), x, y, { continued: true });
            } else if (parte) {
              doc.font("Helvetica").text(parte, { continued: true });
            }
          }
          doc.text(""); // finaliza linha
        } else {
          doc.text(linha.texto, { width: larguraUtil });
        }
        doc.moveDown(0.4);
    }
  }

  // ── Numeração de páginas ──────────────────────────────────────────────────
  const totalPaginas = (doc as any).bufferedPageRange().count;
  for (let i = 0; i < totalPaginas; i++) {
    doc.switchToPage(i);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#999999")
      .text(
        `Página ${i + 1} de ${totalPaginas}`,
        margemEsquerda,
        doc.page.height - margemInferior + 10,
        { width: larguraUtil, align: "center" }
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

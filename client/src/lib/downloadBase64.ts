export type PdfBase64 = {
  base64: string;
  nomeArquivo: string;
  mimeType: "application/pdf";
};

const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** Só aceita o conteúdo PDF entregue pelo servidor autenticado, nunca URL livre. */
export function criarBlobPdfBase64(arquivo: PdfBase64): Blob {
  if (arquivo.mimeType !== "application/pdf") {
    throw new Error("O arquivo recebido não é um PDF.");
  }
  if (!arquivo.base64 || arquivo.base64.length > Math.ceil(MAX_PDF_BYTES / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(arquivo.base64)) {
    throw new Error("Conteúdo do PDF inválido ou acima do limite de 20 MB.");
  }
  const binario = atob(arquivo.base64);
  if (!binario.startsWith("%PDF-") || binario.length > MAX_PDF_BYTES) {
    throw new Error("O conteúdo recebido não é um PDF válido.");
  }
  const bytes = Uint8Array.from(binario, char => char.charCodeAt(0));
  return new Blob([bytes], { type: "application/pdf" });
}

export function nomeSeguroPdf(nomeArquivo: string): string {
  const nome = nomeArquivo.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return nome && nome.toLowerCase().endsWith(".pdf") ? nome : "boleto-btg.pdf";
}

/** A URL temporária existe apenas durante a entrega e é sempre revogada. */
export function baixarPdfBase64(arquivo: PdfBase64): void {
  const blob = criarBlobPdfBase64(arquivo);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = nomeSeguroPdf(arquivo.nomeArquivo);
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Permite que o navegador consuma o clique antes de liberar o recurso.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}

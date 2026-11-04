import { TRPCError } from "@trpc/server";
import { DOCUMENTO_CONDOMINIO_MAX_BASE64, DOCUMENTO_CONDOMINIO_MAX_BYTES, validarArquivoDocumentoCondominio } from "../shared/documentos-condominio";

export function decodificarDocumentoCondominio(input: { fileBase64: string; fileName: string; mimeType: string }): Buffer {
  const rejeitar = (message: string): never => { throw new TRPCError({ code: "BAD_REQUEST", message }); };
  const base64 = input.fileBase64;
  // Conferir limites antes de alocar o Buffer. Base64 do FileReader é canônico,
  // com padding e sem data-URL; não aceitar caracteres silenciosamente ignorados.
  if (!base64.length) rejeitar("O documento está vazio.");
  if (base64.length > DOCUMENTO_CONDOMINIO_MAX_BASE64) rejeitar("Arquivo muito grande. Máximo 50 MB.");
  if (base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(base64)) rejeitar("Conteúdo base64 inválido.");
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const primeiroPadding = base64.indexOf("=");
  if (primeiroPadding !== -1 && primeiroPadding !== base64.length - padding) rejeitar("Conteúdo base64 inválido.");
  const tamanho = base64.length / 4 * 3 - padding;
  if (tamanho > DOCUMENTO_CONDOMINIO_MAX_BYTES) rejeitar("Arquivo muito grande. Máximo 50 MB.");
  const erro = validarArquivoDocumentoCondominio({ name: input.fileName, type: input.mimeType, size: tamanho });
  if (erro) rejeitar(erro);
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length !== tamanho || buffer.length > DOCUMENTO_CONDOMINIO_MAX_BYTES) rejeitar("Tamanho do documento inválido.");
  // Verificação preliminar do formato, não substitui antivírus/análise de PDF.
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") rejeitar("O conteúdo enviado não é um arquivo PDF.");
  return buffer;
}

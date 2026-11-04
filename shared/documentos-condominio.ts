// Limite binário por PDF; compartilhado entre clique, arraste e backend.
export const DOCUMENTO_CONDOMINIO_MAX_MB = 200;
export const DOCUMENTO_CONDOMINIO_MAX_BYTES = DOCUMENTO_CONDOMINIO_MAX_MB * 1024 * 1024;
export const DOCUMENTO_CONDOMINIO_MAX_BASE64 = Math.ceil(DOCUMENTO_CONDOMINIO_MAX_BYTES / 3) * 4;
export const DOCUMENTO_CONDOMINIO_PROCEDURE = "condominios.uploadDocumento";
export const DOCUMENTO_CONDOMINIO_UPLOAD_PATH = `/api/trpc/${DOCUMENTO_CONDOMINIO_PROCEDURE}`;
export const DOCUMENTO_CONDOMINIO_JSON_LIMIT = "300mb";

export function validarArquivoDocumentoCondominio(arquivo: { name: string; type: string; size: number }): string | null {
  const mime = arquivo.type.toLowerCase();
  if (!/\.pdf$/i.test(arquivo.name) || !["", "application/pdf", "application/octet-stream"].includes(mime)) {
    return "Apenas arquivos PDF são aceitos.";
  }
  if (!Number.isSafeInteger(arquivo.size) || arquivo.size <= 0) return "O documento está vazio ou tem tamanho inválido.";
  if (arquivo.size > DOCUMENTO_CONDOMINIO_MAX_BYTES) return `Arquivo muito grande. Máximo ${DOCUMENTO_CONDOMINIO_MAX_MB} MB.`;
  return null;
}

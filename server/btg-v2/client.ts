import { obterAccessTokenBtg } from "../btg-oauth";
import {
  normalizarRespostaBolePixV2,
  type BtgV2BolePixPayload,
  type BtgV2BolePixResponse,
} from "./bolepix";
import { BtgV2ConfigurationError, getBtgV2ServerConfig } from "./config";

function getHeaders(accessToken: string, contentType = false): Record<string, string> {
  const config = getBtgV2ServerConfig();
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  if (contentType) headers["Content-Type"] = "application/json";

  // O Sandbox BTG exige a seleção explícita de resposta estática. Esse header
  // nunca é transmitido para produção.
  if (config.ambiente === "sandbox") headers["x-response"] = "success";
  return headers;
}

function parseCollectionRecords(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  if (!data || typeof data !== "object") return [];
  const payload = data as Record<string, unknown>;
  const records = payload.data;
  return Array.isArray(records)
    ? records.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

/** Cliente de Collections v2. Só é usado depois de a emissão já estar reservada no banco. */
export async function criarBolePixBtgV2(
  payload: BtgV2BolePixPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<BtgV2BolePixResponse> {
  const config = getBtgV2ServerConfig();
  const accessToken = await obterAccessTokenBtg();
  const response = await fetchImpl(
    `${config.apiBaseUrl}/${config.companyId}/banking/collections`,
    { method: "POST", headers: getHeaders(accessToken, true), body: JSON.stringify(payload) },
  );

  if (!response.ok) {
    throw new BtgV2ConfigurationError(`O BTG recusou a emissão BolePix (HTTP ${response.status}).`);
  }

  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new BtgV2ConfigurationError("O BTG retornou uma resposta de emissão inválida.");
  }
  return normalizarRespostaBolePixV2(data as Record<string, unknown>);
}

export interface BtgV2ConsultaCobranca {
  collectionId: string;
  status: string;
  paidAt: string | null;
  paidAmount: number | null;
  bankSlipUrl: string | null;
  pixQrCode: string | null;
  pixCopiaECola: string | null;
  codigoBarras: string | null;
  linhaDigitavel: string | null;
  nossoNumero: string | null;
}

/** Consulta paginada por collectionId. O endpoint oficial de listagem exige pageSize e pageNumber. */
export async function consultarCobrancaBtgV2(
  collectionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BtgV2ConsultaCobranca | null> {
  const config = getBtgV2ServerConfig();
  const accessToken = await obterAccessTokenBtg();
  const query = new URLSearchParams({ pageSize: "1", pageNumber: "1", id: collectionId });
  const response = await fetchImpl(
    `${config.apiBaseUrl}/${config.companyId}/banking/collections?${query.toString()}`,
    { method: "GET", headers: getHeaders(accessToken) },
  );
  if (!response.ok) {
    throw new BtgV2ConfigurationError(`O BTG recusou a consulta de cobrança (HTTP ${response.status}).`);
  }

  const data: unknown = await response.json();
  const found = parseCollectionRecords(data).find((item) => item.collectionId === collectionId);
  if (!found) return null;
  const normalized = normalizarRespostaBolePixV2(found);
  const paidAt = typeof found.paidAt === "string" ? found.paidAt : null;
  const paidAmount = typeof found.paidAmount === "number"
    ? found.paidAmount
    : typeof found.amountPaid === "number"
      ? found.amountPaid
      : null;
  return { ...normalized, paidAt, paidAmount };
}

/** Cancela uma cobrança v2 pelo collectionId; o BTG responde HTTP 204 em caso de sucesso. */
export async function cancelarCobrancaBtgV2(
  collectionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const config = getBtgV2ServerConfig();
  const accessToken = await obterAccessTokenBtg();
  const response = await fetchImpl(
    `${config.apiBaseUrl}/${config.companyId}/banking/collections/${encodeURIComponent(collectionId)}`,
    { method: "DELETE", headers: getHeaders(accessToken) },
  );
  if (response.status !== 204) {
    throw new BtgV2ConfigurationError(`O BTG recusou o cancelamento da cobrança (HTTP ${response.status}).`);
  }
}

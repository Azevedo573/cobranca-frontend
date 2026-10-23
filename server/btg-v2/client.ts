import { obterAccessTokenBtg } from "../btg-oauth";
import {
  normalizarRespostaBolePixV2,
  type BtgV2BolePixPayload,
  type BtgV2BolePixResponse,
} from "./bolepix";
import { BtgV2ConfigurationError, getBtgV2ServerConfig } from "./config";

/** Cliente de Collections v2. Só é usado depois de a emissão já estar reservada no banco. */
export async function criarBolePixBtgV2(
  payload: BtgV2BolePixPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<BtgV2BolePixResponse> {
  const config = getBtgV2ServerConfig();
  const accessToken = await obterAccessTokenBtg();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  // O Sandbox BTG exige a seleção explícita de resposta estática. Esse header
  // nunca é transmitido para produção.
  if (config.ambiente === "sandbox") headers["x-response"] = "success";

  const response = await fetchImpl(
    `${config.apiBaseUrl}/${config.companyId}/banking/collections`,
    { method: "POST", headers, body: JSON.stringify(payload) },
  );

  if (!response.ok) {
    throw new BtgV2ConfigurationError(
      `O BTG recusou a emissão BolePix (HTTP ${response.status}).`,
    );
  }

  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new BtgV2ConfigurationError("O BTG retornou uma resposta de emissão inválida.");
  }
  return normalizarRespostaBolePixV2(data as Record<string, unknown>);
}

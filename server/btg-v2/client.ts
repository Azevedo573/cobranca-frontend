import { obterAccessTokenBtg } from "../btg-oauth";
import {
  normalizarRespostaBolePixV2,
  type BtgV2BolePixPayload,
  type BtgV2BolePixResponse,
} from "./bolepix";
import { BtgV2ConfigurationError, getBtgV2ServerConfig } from "./config";
import { criarErroHttpBtgV2, criarErroHttpBtgV2DoCorpo, parseJsonBytesBtgV2, vincularCapturaHttpErroBtg } from "./errors";
import type { BtgHttpCaptura } from "./diagnosticos";
import { valorPagoBtgEmCentavos, metodoPagamentoBtg } from "./valores";

const LIMITE_CAPTURA_BYTES = 64 * 1024;
const PRAZO_RESPOSTA_MS = 5000;

/** Guarda o prefixo byte-exato; cancelamento hostil não impede o fallback. */
async function lerRespostaCapturavel(response: Response): Promise<{ bytes: Uint8Array; completa: boolean }> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let completa = false;
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    reader = response.body?.getReader();
    if (!reader) return { bytes: new Uint8Array(), completa: response.body === null };
    const expirado = Symbol("prazo-resposta");
    const prazo = new Promise<typeof expirado>(resolve => {
      timer = setTimeout(() => resolve(expirado), PRAZO_RESPOSTA_MS);
    });
    const inicio = Date.now();
    while (Date.now() - inicio < PRAZO_RESPOSTA_MS) {
      const chunk = await Promise.race([reader.read(), prazo]);
      if (chunk === expirado) break;
      if (chunk.done) { completa = true; break; }
      if (!(chunk.value instanceof Uint8Array)) break;
      const restante = LIMITE_CAPTURA_BYTES - total;
      const retidos = chunk.value.slice(0, restante);
      chunks.push(retidos);
      total += retidos.byteLength;
      if (chunk.value.byteLength > restante) break;
    }
  } catch {
    // Falha de leitura preserva somente bytes já recebidos, nunca causa/body em erro.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (reader) {
      if (!completa) {
        try { void reader.cancel().catch(() => {}); } catch { /* Não aguardar cancelamento. */ }
      }
      try { reader.releaseLock(); } catch { /* Leitura ainda pendente. */ }
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { bytes, completa };
}

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
  captura?: BtgHttpCaptura,
): Promise<BtgV2BolePixResponse> {
  if (!captura) throw new BtgV2ConfigurationError("A captura protegida é obrigatória antes de enviar BolePix ao BTG.");
  let capturaId: number | null = null;
  let envioIniciado = false;
  let erroSeguro: Error | undefined;
  try {
    const config = getBtgV2ServerConfig();
    const accessToken = await obterAccessTokenBtg();
    const headers = getHeaders(accessToken, true);
    // Uma única serialização. A MESMA string é persistida e transmitida.
    const body = JSON.stringify(payload);
    if (typeof body !== "string" || Buffer.byteLength(body, "utf8") > LIMITE_CAPTURA_BYTES) {
      erroSeguro = new BtgV2ConfigurationError("O corpo BolePix excede o limite da captura protegida ou é inválido; nenhum envio foi realizado.");
      throw erroSeguro;
    }
    capturaId = await captura.preparar(body);
    if (!Number.isSafeInteger(capturaId) || capturaId <= 0 || captura.id !== capturaId) {
      capturaId = null;
      throw new Error("captura-invalida");
    }
    await captura.iniciar();
    envioIniciado = true;
    let response: Response;
    try {
      response = await fetchImpl(
        `${config.apiBaseUrl}/${config.companyId}/banking/collections`,
        { method: "POST", headers, body },
      );
    } catch {
      try { await captura.semResposta(); } catch { /* A evidência inicial permanece. */ }
      erroSeguro = new BtgV2ConfigurationError("O envio BolePix ao BTG ficou sem resposta confirmada; revise a emissão incerta, sem reenviar.");
      throw erroSeguro;
    }
    const { bytes, completa } = await lerRespostaCapturavel(response);
    // Persistir antes do parse, inclusive HTML, campos desconhecidos e UTF-8 inválido.
    await captura.responder(response.status, bytes, completa);
    if (!response.ok) {
      erroSeguro = criarErroHttpBtgV2DoCorpo(response, bytes, completa, "emissao");
      throw erroSeguro;
    }
    const data = parseJsonBytesBtgV2(bytes, completa);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      erroSeguro = new BtgV2ConfigurationError(completa
        ? "O BTG retornou uma resposta de emissão inválida."
        : "A resposta BolePix do BTG está incompleta ou limitada; revise a emissão incerta, sem reenviar.");
      throw erroSeguro;
    }
    try { return normalizarRespostaBolePixV2(data as Record<string, unknown>); }
    catch {
      erroSeguro = new BtgV2ConfigurationError("A resposta do BTG não contém collectionId e status válidos.");
      throw erroSeguro;
    }
  } catch {
    const error = erroSeguro ?? new BtgV2ConfigurationError(envioIniciado
      ? "Não foi possível persistir o retorno protegido do BTG; revise a emissão incerta, sem reenviar."
      : "Não foi possível preparar a captura protegida do BTG; nenhum envio foi realizado.");
    vincularCapturaHttpErroBtg(error, { capturaId, envioIniciado });
    throw error;
  }
}

export interface BtgV2ConsultaCobranca {
  collectionId: string;
  status: string;
  paidAt: string | null;
  paidAmount: number | null;
  settledAt?: string | null;
  paymentMethod?: string | null;
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
    throw await criarErroHttpBtgV2(response, "consulta");
  }

  const data: unknown = await response.json();
  const found = parseCollectionRecords(data).find((item) => item.collectionId === collectionId);
  if (!found) return null;
  const normalized = normalizarRespostaBolePixV2(found);
  const paidAt = typeof found.paidAt === "string" ? found.paidAt : null;
  const paidAmount = valorPagoBtgEmCentavos(found);
  const settledAt = typeof found.settledAt === "string" ? found.settledAt : null;
  const paymentMethod = metodoPagamentoBtg(found.paymentMethod) ?? null;
  return { ...normalized, paidAt, paidAmount, settledAt, paymentMethod };
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
    throw await criarErroHttpBtgV2(response, "cancelamento");
  }
}

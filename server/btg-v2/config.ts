import { getBtgOAuthConfig, obterAccessTokenBtg } from "../btg-oauth";

export type BtgV2Ambiente = "sandbox" | "producao";

export class BtgV2ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BtgV2ConfigurationError";
  }
}

export interface BtgV2ServerConfig {
  ambiente: BtgV2Ambiente;
  companyId: string;
  apiBaseUrl: string;
}

export interface BtgContaRecebedoraNormalizada {
  accountId: string;
  agencia: string;
  numero: string;
  documentoBeneficiario: string | null;
  nomeBeneficiario: string | null;
}

type BtgAccountApiRecord = Record<string, unknown>;

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function digits(value: string | null): string | null {
  const normalized = value?.replace(/\D/g, "") ?? "";
  return normalized || null;
}

function getFirstString(record: BtgAccountApiRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return null;
}

/**
 * Resolve o ambiente uma única vez a partir da configuração OAuth aprovada.
 * A tela nunca decide endpoint, CNPJ ou ambiente; essas decisões ficam no servidor.
 */
export function getBtgV2ServerConfig(): BtgV2ServerConfig {
  const oauth = getBtgOAuthConfig();
  return {
    ambiente: oauth.ambiente,
    companyId: oauth.companyId,
    apiBaseUrl: oauth.ambiente === "sandbox"
      ? "https://api.sandbox.empresas.btgpactual.com"
      : "https://api.empresas.btgpactual.com",
  };
}

/**
 * Normaliza somente a informação necessária para seleção de conta recebedora.
 * A API Accounts tem exemplos com nomenclaturas diferentes entre operações;
 * por isso são aceitas as variações documentadas, sem inventar valores ausentes.
 */
export function normalizarContaRecebedoraBtg(record: BtgAccountApiRecord): BtgContaRecebedoraNormalizada {
  const accountId = getFirstString(record, ["accountId", "id"]);
  const agencia = getFirstString(record, ["branch", "branchCode", "agency", "agencyCode"]);
  const numero = getFirstString(record, ["number", "accountNumber"]);

  if (!accountId) {
    throw new BtgV2ConfigurationError("A API do BTG não retornou o identificador da conta.");
  }
  if (!agencia || !numero) {
    throw new BtgV2ConfigurationError("A conta retornada pelo BTG não trouxe agência e número válidos.");
  }

  return {
    accountId,
    agencia,
    numero,
    documentoBeneficiario: digits(getFirstString(record, ["taxId", "document", "documentNumber"])),
    nomeBeneficiario: getFirstString(record, ["legalName", "name", "companyName", "holderName"]),
  };
}

export function validarVinculoContaRecebedora(input: {
  condominioId: number;
  integracaoAtiva: boolean;
  vinculoAtivo: boolean;
  conta: BtgContaRecebedoraNormalizada | null;
}): void {
  if (!input.integracaoAtiva) {
    throw new BtgV2ConfigurationError("A integração BTG selecionada não está ativa.");
  }
  if (!input.vinculoAtivo || !input.conta) {
    throw new BtgV2ConfigurationError(
      `O condomínio ${input.condominioId} não possui conta recebedora BTG ativa vinculada.`,
    );
  }
}

/**
 * Consulta é disparada apenas por ação explícita do administrador. Nenhum dado
 * bancário é buscado durante o carregamento de tela ou a emissão futura.
 */
export async function consultarContasRecebedorasBtg(
  fetchImpl: typeof fetch = fetch,
): Promise<BtgContaRecebedoraNormalizada[]> {
  const config = getBtgV2ServerConfig();
  const accessToken = await obterAccessTokenBtg();
  const response = await fetchImpl(
    `${config.apiBaseUrl}/${config.companyId}/banking/accounts`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new BtgV2ConfigurationError(
      `Não foi possível consultar as contas BTG agora (HTTP ${response.status}).`,
    );
  }

  const payload: unknown = await response.json();
  const records = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? Array.isArray((payload as Record<string, unknown>).accounts)
        ? (payload as Record<string, unknown>).accounts as unknown[]
        : [payload]
      : [];

  const contas = records.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new BtgV2ConfigurationError("A API do BTG retornou uma conta em formato inválido.");
    }
    return normalizarContaRecebedoraBtg(record as BtgAccountApiRecord);
  });

  if (contas.length === 0) {
    throw new BtgV2ConfigurationError("Nenhuma conta recebedora foi retornada pelo BTG.");
  }

  return contas;
}

export function mascararNumeroConta(numero: string): string {
  const visible = numero.slice(-4);
  return `${"•".repeat(Math.max(0, numero.length - 4))}${visible}`;
}

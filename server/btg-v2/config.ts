import { createHash } from "crypto";
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

export interface BtgContaManualSandboxNormalizada extends BtgContaRecebedoraNormalizada {
  origemCadastro: "manual_sandbox";
  rotulo: string;
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

function somenteDigitosObrigatorio(valor: string, campo: "agência" | "conta"): string {
  const normalizado = valor.trim();
  if (!normalizado) {
    throw new BtgV2ConfigurationError("Agência e conta são obrigatórios para o cadastro manual.");
  }
  if (!/^\d+$/.test(normalizado)) {
    throw new BtgV2ConfigurationError(`A ${campo} deve conter somente dígitos, sem hífen ou formatação.`);
  }
  return normalizado;
}

/**
 * Valida dados digitados por administrador para homologação quando o BTG não
 * disponibiliza o escopo Banking Accounts. O identificador é interno e não
 * representa nem reproduz o accountId oficial do BTG.
 */
export function normalizarContaManualSandbox(input: {
  rotulo: string;
  agencia: string;
  numero: string;
  documentoBeneficiario?: string | null;
  nomeBeneficiario?: string | null;
}): BtgContaManualSandboxNormalizada {
  const rotulo = input.rotulo.trim();
  if (rotulo.length < 3 || rotulo.length > 255) {
    throw new BtgV2ConfigurationError("O rótulo da conta manual deve ter entre 3 e 255 caracteres.");
  }
  const agencia = somenteDigitosObrigatorio(input.agencia, "agência");
  const numero = somenteDigitosObrigatorio(input.numero, "conta");
  if (agencia.length > 30 || numero.length > 50) {
    throw new BtgV2ConfigurationError("A agência ou a conta excede o tamanho permitido.");
  }

  const documentoBeneficiario = input.documentoBeneficiario?.replace(/\D/g, "") || null;
  if (documentoBeneficiario && ![11, 14].includes(documentoBeneficiario.length)) {
    throw new BtgV2ConfigurationError("O documento do beneficiário deve conter 11 ou 14 dígitos.");
  }
  const nomeBeneficiario = input.nomeBeneficiario?.trim() || null;
  if (nomeBeneficiario && nomeBeneficiario.length > 255) {
    throw new BtgV2ConfigurationError("O nome do beneficiário excede o tamanho permitido.");
  }

  const idSeed = `${agencia}|${numero}|${documentoBeneficiario ?? ""}`;
  const accountId = `manual-sandbox:${createHash("sha256").update(idSeed).digest("hex").slice(0, 48)}`;
  return { accountId, origemCadastro: "manual_sandbox", agencia, numero, documentoBeneficiario, nomeBeneficiario, rotulo };
}

export function validarCadastroManualSandbox(input: {
  ambiente: BtgV2Ambiente;
  oauthConectado: boolean;
}): void {
  if (input.ambiente !== "sandbox") {
    throw new BtgV2ConfigurationError("O cadastro manual de conta é permitido apenas no Sandbox.");
  }
  if (!input.oauthConectado) {
    throw new BtgV2ConfigurationError("Conecte a conta BTG Sandbox antes de cadastrar uma conta manual.");
  }
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
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  if (config.ambiente === "sandbox") headers["x-response"] = "success";
  const response = await fetchImpl(
    `${config.apiBaseUrl}/${config.companyId}/banking/accounts`,
    {
      method: "GET",
      headers,
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
        : Array.isArray((payload as Record<string, unknown>).data)
          ? (payload as Record<string, unknown>).data as unknown[]
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

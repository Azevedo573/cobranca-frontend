import { createHash } from "crypto";
import { consultaContasBtgHabilitada, getBtgOAuthConfig, obterAccessTokenBtg } from "../btg-oauth";

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

/** Aceita somente CNPJ numérico, com ou sem a formatação oficial, e verifica os dois DVs. */
export function normalizarCnpjBtg(valor: string): string {
  const texto = valor.trim();
  if (!/^\d{14}$/.test(texto) && !/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(texto)) {
    throw new BtgV2ConfigurationError("Informe um CNPJ válido do escritório titular da integração.");
  }
  const cnpj = texto.replace(/\D/g, "");
  const digito = (base: string) => {
    let peso = base.length - 7;
    const soma = base.split("").reduce((total, numero) => {
      const resultado = total + Number(numero) * peso;
      peso = peso === 2 ? 9 : peso - 1;
      return resultado;
    }, 0);
    const resto = soma % 11;
    return resto < 2 ? "0" : String(11 - resto);
  };
  if (/^(\d)\1{13}$/.test(cnpj) || digito(cnpj.slice(0, 12)) !== cnpj[12] || digito(cnpj.slice(0, 13)) !== cnpj[13]) {
    throw new BtgV2ConfigurationError("O CNPJ informado é inválido; confira os dígitos verificadores.");
  }
  return cnpj;
}

export function normalizarContaManualProducao(input: {
  rotulo: string;
  agencia: string;
  numero: string;
  documentoBeneficiario: string;
  nomeBeneficiario: string;
}, companyId: string): BtgContaRecebedoraNormalizada & { origemCadastro: "manual_producao"; rotulo: string } {
  const rotulo = input.rotulo.trim();
  const nomeBeneficiario = input.nomeBeneficiario.trim();
  if (rotulo.length < 3 || rotulo.length > 255) {
    throw new BtgV2ConfigurationError("O rótulo da conta manual deve ter entre 3 e 255 caracteres.");
  }
  if (!nomeBeneficiario || nomeBeneficiario.length > 255) {
    throw new BtgV2ConfigurationError("O nome do beneficiário é obrigatório e deve ter até 255 caracteres.");
  }
  const agencia = somenteDigitosObrigatorio(input.agencia, "agência");
  const numero = somenteDigitosObrigatorio(input.numero, "conta");
  if (agencia.length > 30 || numero.length > 50) {
    throw new BtgV2ConfigurationError("A agência ou a conta excede o tamanho permitido.");
  }
  const documentoBeneficiario = normalizarCnpjBtg(input.documentoBeneficiario);
  if (documentoBeneficiario !== normalizarCnpjBtg(companyId)) {
    throw new BtgV2ConfigurationError("O CNPJ da conta deve ser o do escritório titular da integração.");
  }
  const seed = `producao|${documentoBeneficiario}|${agencia}|${numero}`;
  const accountId = `manual-producao:${createHash("sha256").update(seed).digest("hex").slice(0, 48)}`;
  return { accountId, origemCadastro: "manual_producao", rotulo, agencia, numero, documentoBeneficiario, nomeBeneficiario };
}

export function validarCadastroManualProducao(input: { ambiente: BtgV2Ambiente; oauthConectado: boolean }): void {
  if (input.ambiente !== "producao") {
    throw new BtgV2ConfigurationError("O cadastro manual de Produção exige o servidor configurado para Produção.");
  }
  if (!input.oauthConectado) {
    throw new BtgV2ConfigurationError("Conecte a conta BTG de Produção antes de cadastrar uma conta manual.");
  }
}

export interface BtgIntegracaoParaValidacao {
  id: number;
  ambiente: BtgV2Ambiente;
  companyId: string;
  ativo: number;
}

export interface BtgContaParaValidacao extends BtgContaRecebedoraNormalizada {
  btgIntegracaoId: number;
  ativo: number;
  origemCadastro: string;
  confirmadoPorId?: number | null;
  confirmadoEm?: Date | null;
}

export function validarIntegracaoRuntimeBtg(integracao: BtgIntegracaoParaValidacao, serverConfig: BtgV2ServerConfig): void {
  if (integracao.ambiente !== serverConfig.ambiente) {
    throw new BtgV2ConfigurationError("A integração BTG pertence a outro ambiente.");
  }
  const companyId = serverConfig.ambiente === "producao" ? normalizarCnpjBtg(integracao.companyId) : digits(integracao.companyId);
  const companyIdAtual = serverConfig.ambiente === "producao" ? normalizarCnpjBtg(serverConfig.companyId) : digits(serverConfig.companyId);
  if (!companyId || companyId !== companyIdAtual) {
    throw new BtgV2ConfigurationError("O CNPJ da integração BTG diverge do CNPJ configurado atualmente. Revise a integração; contas antigas não serão migradas automaticamente.");
  }
}

/** Guarda autoritativa: usar no vínculo, prévia, liberação e antes de reservar/enviar. */
export function validarContaRecebedoraParaAmbiente(input: {
  conta: BtgContaParaValidacao;
  integracao: BtgIntegracaoParaValidacao;
  serverConfig: BtgV2ServerConfig;
}): void {
  const { conta, integracao, serverConfig } = input;
  validarIntegracaoRuntimeBtg(integracao, serverConfig);
  if (integracao.ativo !== 1 || conta.ativo !== 1 || conta.btgIntegracaoId !== integracao.id) {
    throw new BtgV2ConfigurationError("A conta selecionada não está ativa ou não pertence à integração BTG atual.");
  }
  if (conta.origemCadastro === "api") {
    if (/^manual[-:]/i.test(conta.accountId)) {
      throw new BtgV2ConfigurationError("Um identificador interno manual não pode representar uma conta oficial BTG.");
    }
    // Contas API legadas sem documento não têm titularidade inferida. Se informado, nunca ignorar divergência.
    if (serverConfig.ambiente === "producao" && conta.documentoBeneficiario !== null &&
        normalizarCnpjBtg(conta.documentoBeneficiario) !== normalizarCnpjBtg(serverConfig.companyId)) {
      throw new BtgV2ConfigurationError("O CNPJ da conta API diverge do escritório titular da integração.");
    }
    return;
  }
  if (serverConfig.ambiente === "sandbox" && conta.origemCadastro === "manual_sandbox" && conta.accountId.startsWith("manual-sandbox:")) return;
  if (serverConfig.ambiente !== "producao" || conta.origemCadastro !== "manual_producao") {
    throw new BtgV2ConfigurationError("A origem da conta não é elegível neste ambiente BTG; contas manuais Sandbox nunca são aceitas em Produção.");
  }
  if (!Number.isInteger(conta.confirmadoPorId) || (conta.confirmadoPorId ?? 0) <= 0 ||
      !(conta.confirmadoEm instanceof Date) || Number.isNaN(conta.confirmadoEm.getTime())) {
    throw new BtgV2ConfigurationError("A conta manual de Produção exige confirmação administrativa com usuário e data.");
  }
  const normalizada = normalizarContaManualProducao({
    rotulo: "Conta recebedora", agencia: conta.agencia, numero: conta.numero,
    documentoBeneficiario: conta.documentoBeneficiario ?? "", nomeBeneficiario: conta.nomeBeneficiario ?? "",
  }, serverConfig.companyId);
  if (conta.accountId !== normalizada.accountId) {
    throw new BtgV2ConfigurationError("O identificador interno da conta manual de Produção não corresponde aos dados confirmados.");
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
  if (/^manual[-:]/i.test(accountId)) {
    throw new BtgV2ConfigurationError("A API BTG retornou um identificador reservado para contas manuais internas.");
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
  if (!consultaContasBtgHabilitada()) {
    throw new BtgV2ConfigurationError("A consulta Accounts BTG está desativada no servidor. Utilize o cadastro manual de conta no ambiente correspondente; OAuth Collections continua obrigatório para emissão.");
  }
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

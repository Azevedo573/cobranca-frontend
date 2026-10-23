import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { btgOauthEstados, btgOauthTokens } from "../drizzle/schema";
import { getDb } from "./db";

const BTG_SANDBOX_COMPANY_ID = "30306294000145";
const TOKEN_RENEWAL_MARGIN_MS = 5 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;

type BtgOAuthEnvironment = "sandbox" | "producao";
type BtgTokenStatus = "conectado" | "requer_reconexao";
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type BtgOAuthErrorCode =
  | "CONFIG_INVALID"
  | "DATABASE_UNAVAILABLE"
  | "STATE_INVALID"
  | "TOKEN_EXCHANGE_FAILED"
  | "TOKEN_REFRESH_FAILED"
  | "TOKEN_NOT_CONNECTED"
  | "TOKEN_DECRYPT_FAILED";

export class BtgOAuthError extends Error {
  constructor(
    public readonly code: BtgOAuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BtgOAuthError";
  }
}

export interface BtgOAuthConfig {
  ambiente: BtgOAuthEnvironment;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  companyId: string;
  encryptionKey: string;
  scopes: string[];
}

interface BtgTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string | null;
}

function hasValidEncryptionKey(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}

function getEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new BtgOAuthError(
      "CONFIG_INVALID",
      "A chave de criptografia dos tokens BTG é inválida.",
    );
  }
  return key;
}

export function getBtgOAuthConfig(): BtgOAuthConfig {
  const ambiente: BtgOAuthEnvironment = process.env.BTG_SANDBOX === "true" ? "sandbox" : "producao";
  const clientId = process.env.BTG_CLIENT_ID?.trim();
  const clientSecret = process.env.BTG_CLIENT_SECRET?.trim();
  const redirectUri = process.env.BTG_REDIRECT_URI?.trim();
  const encryptionKey = process.env.BTG_TOKEN_ENCRYPTION_KEY?.trim();
  const companyId = ambiente === "sandbox"
    ? BTG_SANDBOX_COMPANY_ID
    : process.env.BTG_COMPANY_ID?.replace(/\D/g, "");

  if (!clientId || !clientSecret || !redirectUri || !encryptionKey || !companyId) {
    throw new BtgOAuthError(
      "CONFIG_INVALID",
      "A integração BTG não está completamente configurada. Verifique as variáveis seguras do servidor.",
    );
  }

  let redirectUrl: URL;
  try {
    redirectUrl = new URL(redirectUri);
  } catch {
    throw new BtgOAuthError("CONFIG_INVALID", "A URI de retorno do BTG é inválida.");
  }

  if (redirectUrl.protocol !== "https:") {
    throw new BtgOAuthError("CONFIG_INVALID", "A URI de retorno do BTG deve usar HTTPS.");
  }

  getEncryptionKey(encryptionKey);

  return {
    ambiente,
    authorizationUrl: ambiente === "sandbox"
      ? "https://id.sandbox.btgpactual.com/oauth2/authorize"
      : "https://id.btgpactual.com/oauth2/authorize",
    tokenUrl: ambiente === "sandbox"
      ? "https://id.sandbox.btgpactual.com/oauth2/token"
      : "https://id.btgpactual.com/oauth2/token",
    clientId,
    clientSecret,
    redirectUri: redirectUrl.toString(),
    companyId,
    encryptionKey,
    scopes: [
      "openid",
      "brn:btg:empresas:banking:collections",
      "empresas.btgpactual.com/accounts.readonly",
    ],
  };
}

export function gerarStateBtg(): string {
  return randomBytes(32).toString("base64url");
}

export function hashStateBtg(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function construirUrlAutorizacaoBtg(config: BtgOAuthConfig, state: string): string {
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("prompt", "login");
  url.searchParams.set("state", state);
  return url.toString();
}

export function cifrarTokenBtg(value: string, encryptionKey: string): string {
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(encryptionKey), iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
  } catch (error) {
    if (error instanceof BtgOAuthError) throw error;
    throw new BtgOAuthError("CONFIG_INVALID", "Não foi possível proteger o token BTG.");
  }
}

export function decifrarTokenBtg(value: string, encryptionKey: string): string {
  try {
    const [version, ivEncoded, tagEncoded, ciphertextEncoded] = value.split(":");
    if (version !== "v1" || !ivEncoded || !tagEncoded || !ciphertextEncoded) {
      throw new Error("Formato inválido");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(encryptionKey),
      Buffer.from(ivEncoded, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch (error) {
    if (error instanceof BtgOAuthError && error.code === "CONFIG_INVALID") throw error;
    throw new BtgOAuthError("TOKEN_DECRYPT_FAILED", "Não foi possível acessar a autorização BTG armazenada.");
  }
}

export function isStateBtgUtilizavel(
  state: { expiresAt: Date; usedAt: Date | null },
  now = new Date(),
): boolean {
  return !state.usedAt && state.expiresAt.getTime() > now.getTime();
}

/**
 * Drizzle/mysql2 pode retornar ResultSetHeader diretamente ou como primeiro
 * item de uma tupla. Ambos os formatos precisam confirmar exatamente uma linha
 * para que o state de autorização nunca seja reutilizado.
 */
export function obterLinhasAfetadasBtg(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  if (!header || typeof header !== "object" || !("affectedRows" in header)) return 0;
  const affectedRows = (header as { affectedRows?: unknown }).affectedRows;
  return typeof affectedRows === "number" && Number.isFinite(affectedRows) ? affectedRows : 0;
}

function basicAuth(config: BtgOAuthConfig): string {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
}

async function solicitarTokenBtg(
  config: BtgOAuthConfig,
  params: URLSearchParams,
  failureCode: "TOKEN_EXCHANGE_FAILED" | "TOKEN_REFRESH_FAILED",
  failureMessage: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<BtgTokenResponse> {
  let response: Response;
  try {
    response = await fetchImpl(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "Authorization": basicAuth(config),
      },
      body: params.toString(),
    });
  } catch {
    throw new BtgOAuthError(failureCode, failureMessage);
  }

  if (!response.ok) {
    throw new BtgOAuthError(failureCode, failureMessage);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    throw new BtgOAuthError(failureCode, failureMessage);
  }

  const accessToken = typeof payload.access_token === "string" ? payload.access_token : null;
  const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : null;
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : Number(payload.expires_in);
  const scope = typeof payload.scope === "string" ? payload.scope : null;

  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new BtgOAuthError(failureCode, failureMessage);
  }

  return { accessToken, refreshToken, expiresIn, scope };
}

export async function trocarCodigoBtg(
  config: BtgOAuthConfig,
  code: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<BtgTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });

  return solicitarTokenBtg(
    config,
    params,
    "TOKEN_EXCHANGE_FAILED",
    "Não foi possível concluir a autorização no BTG.",
    fetchImpl,
  );
}

export async function renovarTokenBtg(
  config: BtgOAuthConfig,
  refreshToken: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<BtgTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  return solicitarTokenBtg(
    config,
    params,
    "TOKEN_REFRESH_FAILED",
    "A autorização BTG expirou ou não pôde ser renovada. Conecte novamente.",
    fetchImpl,
  );
}

function calcularExpiracao(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}

async function getDatabaseOrThrow() {
  const db = await getDb();
  if (!db) {
    throw new BtgOAuthError("DATABASE_UNAVAILABLE", "Não foi possível acessar a configuração BTG.");
  }
  return db;
}

async function persistirTokensBtg(
  config: BtgOAuthConfig,
  token: BtgTokenResponse,
): Promise<void> {
  const db = await getDatabaseOrThrow();
  const now = new Date();
  const expiresAt = calcularExpiracao(token.expiresIn);

  await db.insert(btgOauthTokens).values({
    ambiente: config.ambiente,
    accessTokenCifrado: cifrarTokenBtg(token.accessToken, config.encryptionKey),
    refreshTokenCifrado: cifrarTokenBtg(token.refreshToken, config.encryptionKey),
    tokenExpiresAt: expiresAt,
    scopes: token.scope,
    companyId: config.companyId,
    status: "conectado",
    lastErrorCode: null,
    connectedAt: now,
    refreshedAt: now,
  }).onDuplicateKeyUpdate({
    set: {
      accessTokenCifrado: cifrarTokenBtg(token.accessToken, config.encryptionKey),
      refreshTokenCifrado: cifrarTokenBtg(token.refreshToken, config.encryptionKey),
      tokenExpiresAt: expiresAt,
      scopes: token.scope,
      companyId: config.companyId,
      status: "conectado",
      lastErrorCode: null,
      refreshedAt: now,
    },
  });
}

export async function iniciarAutorizacaoBtg(adminUserId: number): Promise<{
  authorizationUrl: string;
  expiresAt: Date;
}> {
  const config = getBtgOAuthConfig();
  const db = await getDatabaseOrThrow();
  const state = gerarStateBtg();
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);

  await db.insert(btgOauthEstados).values({
    stateHash: hashStateBtg(state),
    adminUserId,
    ambiente: config.ambiente,
    redirectUri: config.redirectUri,
    expiresAt,
  });

  return {
    authorizationUrl: construirUrlAutorizacaoBtg(config, state),
    expiresAt,
  };
}

async function consumirStateBtg(state: string) {
  const config = getBtgOAuthConfig();
  const db = await getDatabaseOrThrow();
  const stateHash = hashStateBtg(state);
  const rows = await db.select().from(btgOauthEstados)
    .where(eq(btgOauthEstados.stateHash, stateHash))
    .limit(1);
  const registro = rows[0];

  if (!registro || registro.ambiente !== config.ambiente || !isStateBtgUtilizavel(registro)) {
    throw new BtgOAuthError("STATE_INVALID", "A autorização é inválida ou expirou. Inicie a conexão novamente.");
  }

  const updateResult = await db.update(btgOauthEstados)
    .set({ usedAt: new Date() })
    .where(and(eq(btgOauthEstados.id, registro.id), isNull(btgOauthEstados.usedAt)));
  const affectedRows = obterLinhasAfetadasBtg(updateResult);

  if (affectedRows !== 1) {
    throw new BtgOAuthError("STATE_INVALID", "A autorização já foi utilizada. Inicie a conexão novamente.");
  }

  return { config, registro };
}

export async function concluirAutorizacaoBtg(code: string, state: string): Promise<{
  ambiente: BtgOAuthEnvironment;
  adminUserId: number;
}> {
  const { config, registro } = await consumirStateBtg(state);
  const token = await trocarCodigoBtg(config, code);
  await persistirTokensBtg(config, token);
  return { ambiente: config.ambiente, adminUserId: registro.adminUserId };
}

export async function registrarRecusaAutorizacaoBtg(state: string): Promise<void> {
  const { registro } = await consumirStateBtg(state);
  const db = await getDatabaseOrThrow();
  await db.update(btgOauthEstados)
    .set({ errorCode: "CONSENTIMENTO_NEGADO" })
    .where(eq(btgOauthEstados.id, registro.id));
}

async function marcarRequerReconexao(config: BtgOAuthConfig): Promise<void> {
  const db = await getDatabaseOrThrow();
  await db.update(btgOauthTokens)
    .set({ status: "requer_reconexao", lastErrorCode: "TOKEN_REFRESH_FAILED" })
    .where(eq(btgOauthTokens.ambiente, config.ambiente));
}

export async function obterAccessTokenBtg(): Promise<string> {
  const config = getBtgOAuthConfig();
  const db = await getDatabaseOrThrow();
  const rows = await db.select().from(btgOauthTokens)
    .where(eq(btgOauthTokens.ambiente, config.ambiente))
    .limit(1);
  const token = rows[0];

  if (!token || token.status !== "conectado") {
    throw new BtgOAuthError("TOKEN_NOT_CONNECTED", "Conecte a conta BTG antes de emitir ou consultar cobranças.");
  }

  if (token.tokenExpiresAt.getTime() > Date.now() + TOKEN_RENEWAL_MARGIN_MS) {
    return decifrarTokenBtg(token.accessTokenCifrado, config.encryptionKey);
  }

  try {
    const refreshToken = decifrarTokenBtg(token.refreshTokenCifrado, config.encryptionKey);
    const renewed = await renovarTokenBtg(config, refreshToken);
    await persistirTokensBtg(config, renewed);
    return renewed.accessToken;
  } catch (error) {
    await marcarRequerReconexao(config);
    if (error instanceof BtgOAuthError) throw error;
    throw new BtgOAuthError("TOKEN_REFRESH_FAILED", "A autorização BTG expirou ou não pôde ser renovada. Conecte novamente.");
  }
}

export async function getStatusOAuthBtg(): Promise<{
  ambiente: BtgOAuthEnvironment;
  configuracaoCompleta: boolean;
  redirectUri: string | null;
  status: "nao_configurado" | "nao_conectado" | BtgTokenStatus;
  tokenExpiresAt: Date | null;
  companyIdMasked: string | null;
}> {
  const ambiente: BtgOAuthEnvironment = process.env.BTG_SANDBOX === "true" ? "sandbox" : "producao";
  const configHasRequiredValues = Boolean(
    process.env.BTG_CLIENT_ID?.trim()
    && process.env.BTG_CLIENT_SECRET?.trim()
    && process.env.BTG_REDIRECT_URI?.trim()
    && hasValidEncryptionKey(process.env.BTG_TOKEN_ENCRYPTION_KEY?.trim())
    && (ambiente === "sandbox" || process.env.BTG_COMPANY_ID?.replace(/\D/g, "")),
  );

  if (!configHasRequiredValues) {
    return {
      ambiente,
      configuracaoCompleta: false,
      redirectUri: process.env.BTG_REDIRECT_URI?.trim() || null,
      status: "nao_configurado",
      tokenExpiresAt: null,
      companyIdMasked: null,
    };
  }

  const config = getBtgOAuthConfig();
  const db = await getDb();
  if (!db) {
    return {
      ambiente,
      configuracaoCompleta: true,
      redirectUri: config.redirectUri,
      status: "nao_conectado",
      tokenExpiresAt: null,
      companyIdMasked: `***${config.companyId.slice(-4)}`,
    };
  }

  const rows = await db.select().from(btgOauthTokens)
    .where(eq(btgOauthTokens.ambiente, config.ambiente))
    .limit(1);
  const token = rows[0];

  return {
    ambiente: config.ambiente,
    configuracaoCompleta: true,
    redirectUri: config.redirectUri,
    status: token?.status ?? "nao_conectado",
    tokenExpiresAt: token?.tokenExpiresAt ?? null,
    companyIdMasked: `***${config.companyId.slice(-4)}`,
  };
}

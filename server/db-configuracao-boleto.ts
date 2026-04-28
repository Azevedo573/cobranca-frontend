/**
 * Helpers de banco de dados para Configuração de Boleto/CNAB por condomínio.
 * Cada condomínio tem exatamente 1 registro de configuração (UNIQUE condominioId).
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  configuracaoBoleto,
  type ConfiguracaoBoleto,
  type InsertConfiguracaoBoleto,
} from "../drizzle/schema";

/** Busca a configuração de boleto de um condomínio. Retorna null se não existir. */
export async function getConfiguracaoBoleto(
  condominioId: number
): Promise<ConfiguracaoBoleto | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(configuracaoBoleto)
    .where(eq(configuracaoBoleto.condominioId, condominioId))
    .limit(1);
  return rows[0] ?? null;
}

/** Cria ou atualiza a configuração de boleto de um condomínio (upsert). */
export async function upsertConfiguracaoBoleto(
  condominioId: number,
  data: Omit<InsertConfiguracaoBoleto, "id" | "condominioId" | "createdAt" | "updatedAt">
): Promise<ConfiguracaoBoleto> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getConfiguracaoBoleto(condominioId);
  if (existing) {
    await db
      .update(configuracaoBoleto)
      .set({ ...data })
      .where(eq(configuracaoBoleto.condominioId, condominioId));
    const updated = await getConfiguracaoBoleto(condominioId);
    return updated!;
  } else {
    await db.insert(configuracaoBoleto).values({ condominioId, ...data });
    const created = await getConfiguracaoBoleto(condominioId);
    return created!;
  }
}

/**
 * Incrementa o número sequencial do arquivo CNAB e retorna o número anterior (para uso na remessa).
 * Também incrementa o nosso número atual pelo total de títulos.
 */
export async function incrementarSequencialArquivo(
  condominioId: number,
  totalTitulos: number
): Promise<{ numeroSequencial: number; nossoNumeroInicio: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const config = await getConfiguracaoBoleto(condominioId);
  if (!config) throw new Error("Configuração de boleto não encontrada para este condomínio");

  const numeroSequencial = config.numeroSequencialArquivo;
  const nossoNumeroInicio = config.nossoNumeroAtual;

  await db
    .update(configuracaoBoleto)
    .set({
      numeroSequencialArquivo: config.numeroSequencialArquivo + 1,
      nossoNumeroAtual: config.nossoNumeroAtual + totalTitulos,
    })
    .where(eq(configuracaoBoleto.condominioId, condominioId));

  return { numeroSequencial, nossoNumeroInicio };
}

/** Retorna os dados bancários no formato DadosBanco usado pelo gerador CNAB */
export function configParaDadosBanco(config: ConfiguracaoBoleto, nomeCondominio: string) {
  return {
    codigoBanco: config.banco,
    agencia: config.agencia,
    digitoAgencia: config.digitoAgencia,
    conta: config.conta,
    digitoConta: config.digitoConta,
    convenio: config.convenio,
    cedente: config.nomeBeneficiario || nomeCondominio,
    cnpjCedente: config.cnpjBeneficiario || "00000000000000",
  };
}

/** Gera o nome do arquivo de remessa conforme padrão configurado (ex: BTG_ddmmyyyy.txt) */
export function gerarNomeArquivoRemessa(
  padrao: string,
  data: Date = new Date()
): string {
  const dd = data.getDate().toString().padStart(2, "0");
  const mm = (data.getMonth() + 1).toString().padStart(2, "0");
  const yyyy = data.getFullYear().toString();
  const hhmm = data.getHours().toString().padStart(2, "0") +
               data.getMinutes().toString().padStart(2, "0");

  return padrao
    .replace("ddmmyyyy", `${dd}${mm}${yyyy}`)
    .replace("ddmmaa", `${dd}${mm}${yyyy.slice(2)}`)
    .replace("yyyymmdd", `${yyyy}${mm}${dd}`)
    .replace("hhmm", hhmm)
    // Garante extensão .rem se o padrão terminar em .txt
    .replace(/\.txt$/i, ".rem");
}

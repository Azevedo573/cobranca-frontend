/**
 * Helpers para a Configuração Global CNAB 240.
 * Existe apenas um registro (id=1) para toda a instalação do sistema.
 * Contém os dados bancários do portador (empresa/escritório).
 * Os dados do beneficiário (nome, CNPJ) permanecem por condomínio em configuracaoBoleto.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { cnabConfigGlobal, type CnabConfigGlobal, type InsertCnabConfigGlobal } from "../drizzle/schema";

const GLOBAL_ID = 1;

/** Busca a configuração global CNAB. Retorna null se ainda não foi configurada. */
export async function getCnabConfigGlobal(): Promise<CnabConfigGlobal | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(cnabConfigGlobal).where(eq(cnabConfigGlobal.id, GLOBAL_ID)).limit(1);
  return rows[0] ?? null;
}

/** Cria ou atualiza a configuração global CNAB (upsert no registro id=1). */
export async function upsertCnabConfigGlobal(
  data: Omit<InsertCnabConfigGlobal, "id" | "createdAt" | "updatedAt">
): Promise<CnabConfigGlobal> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getCnabConfigGlobal();
  if (existing) {
    await db.update(cnabConfigGlobal).set({ ...data }).where(eq(cnabConfigGlobal.id, GLOBAL_ID));
  } else {
    await db.insert(cnabConfigGlobal).values({ id: GLOBAL_ID, ...data });
  }
  const result = await getCnabConfigGlobal();
  return result!;
}

/**
 * Incrementa o número sequencial do arquivo CNAB e o nosso número atual.
 * Retorna os valores ANTES do incremento (para uso na remessa).
 */
export async function incrementarSequencialGlobal(
  totalTitulos: number
): Promise<{ numeroSequencial: number; nossoNumeroInicio: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const config = await getCnabConfigGlobal();
  if (!config) throw new Error("Configuração global CNAB não encontrada. Configure em Configurações > CNAB 240.");

  const numeroSequencial = config.numeroSequencialArquivo;
  const nossoNumeroInicio = config.nossoNumeroAtual;

  await db
    .update(cnabConfigGlobal)
    .set({
      numeroSequencialArquivo: config.numeroSequencialArquivo + 1,
      nossoNumeroAtual: config.nossoNumeroAtual + totalTitulos,
    })
    .where(eq(cnabConfigGlobal.id, GLOBAL_ID));

  return { numeroSequencial, nossoNumeroInicio };
}

/** Retorna os dados bancários no formato DadosBanco usado pelo gerador CNAB.
 *  O cedente (nome/CNPJ) vem da config do condomínio para identificar o beneficiário no boleto.
 */
export function cnabGlobalParaDadosBanco(
  config: CnabConfigGlobal,
  nomeBeneficiario: string,
  cnpjBeneficiario: string
) {
  return {
    codigoBanco: config.banco,
    agencia: config.agencia,
    digitoAgencia: config.digitoAgencia,
    conta: config.conta,
    digitoConta: config.digitoConta,
    convenio: config.convenio,
    cedente: nomeBeneficiario,
    cnpjCedente: cnpjBeneficiario || "00000000000000",
  };
}

/** Gera o nome do arquivo de remessa conforme padrão configurado (ex: REMESSA_ddmmyyyy.rem) */
export function gerarNomeArquivoRemessaGlobal(
  padrao: string,
  data: Date = new Date()
): string {
  const dd = data.getDate().toString().padStart(2, "0");
  const mm = (data.getMonth() + 1).toString().padStart(2, "0");
  const yyyy = data.getFullYear().toString();
  const hhmm =
    data.getHours().toString().padStart(2, "0") +
    data.getMinutes().toString().padStart(2, "0");

  return padrao
    .replace("ddmmyyyy", `${dd}${mm}${yyyy}`)
    .replace("ddmmaa", `${dd}${mm}${yyyy.slice(2)}`)
    .replace("yyyymmdd", `${yyyy}${mm}${dd}`)
    .replace("hhmm", hhmm)
    .replace(/\.txt$/i, ".rem");
}

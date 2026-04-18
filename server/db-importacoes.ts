import { eq, desc, and, inArray } from "drizzle-orm";
import { getDb } from "./db";
import {
  historicoImportacoes,
  cobrancas,
  devedores,
  type InsertHistoricoImportacao,
} from "../drizzle/schema";

// ─── Histórico de Importações ─────────────────────────────────────────────────

export async function listarHistoricoImportacoes(condominioId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const where = condominioId
    ? eq(historicoImportacoes.condominioId, condominioId)
    : undefined;

  return db
    .select()
    .from(historicoImportacoes)
    .where(where)
    .orderBy(desc(historicoImportacoes.createdAt))
    .limit(200);
}

export async function criarHistoricoImportacao(data: InsertHistoricoImportacao) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(historicoImportacoes).values(data);
  return result;
}

export async function atualizarHistoricoImportacao(
  id: number,
  data: Partial<{
    status: "processando" | "concluido" | "erro";
    totalRegistros: number;
    registrosSucesso: number;
    registrosErro: number;
    detalhesErros: string;
    urlArquivo: string;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(historicoImportacoes)
    .set(data)
    .where(eq(historicoImportacoes.id, id));
}

// ─── Baixa em Lote ────────────────────────────────────────────────────────────

export interface ItemBaixaLote {
  /** ID da cobrança ou nosso número */
  cobrancaId?: number;
  nossoNumero?: string;
  dataPagamento: string; // ISO date string
  valorPago: number; // em centavos
  linha: number; // número da linha no arquivo (para relatório)
}

export interface ResultadoBaixaLote {
  sucesso: number;
  erros: number;
  detalhes: Array<{
    linha: number;
    cobrancaId?: number;
    status: "sucesso" | "erro";
    mensagem: string;
  }>;
}

export async function executarBaixaEmLote(
  itens: ItemBaixaLote[],
  condominioId: number,
  usuarioId: number
): Promise<ResultadoBaixaLote> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const resultado: ResultadoBaixaLote = {
    sucesso: 0,
    erros: 0,
    detalhes: [],
  };

  for (const item of itens) {
    try {
      if (!item.cobrancaId) {
        resultado.erros++;
        resultado.detalhes.push({
          linha: item.linha,
          status: "erro",
          mensagem: "ID da cobrança não informado",
        });
        continue;
      }

      // Verificar se a cobrança existe e pertence ao condomínio
      const [cobranca] = await db
        .select()
        .from(cobrancas)
        .where(
          and(
            eq(cobrancas.id, item.cobrancaId),
            eq(cobrancas.condominioId, condominioId)
          )
        )
        .limit(1);

      if (!cobranca) {
        resultado.erros++;
        resultado.detalhes.push({
          linha: item.linha,
          cobrancaId: item.cobrancaId,
          status: "erro",
          mensagem: `Cobrança #${item.cobrancaId} não encontrada neste condomínio`,
        });
        continue;
      }

      if (cobranca.status === "pago") {
        resultado.erros++;
        resultado.detalhes.push({
          linha: item.linha,
          cobrancaId: item.cobrancaId,
          status: "erro",
          mensagem: `Cobrança #${item.cobrancaId} já está marcada como paga`,
        });
        continue;
      }

      // Marcar como paga
      await db
        .update(cobrancas)
        .set({
          status: "pago",
          paidAt: new Date(item.dataPagamento),
          paidAmount: item.valorPago,
        })
        .where(eq(cobrancas.id, item.cobrancaId));

      resultado.sucesso++;
      resultado.detalhes.push({
        linha: item.linha,
        cobrancaId: item.cobrancaId,
        status: "sucesso",
        mensagem: `Cobrança #${item.cobrancaId} baixada com sucesso`,
      });
    } catch (err: any) {
      resultado.erros++;
      resultado.detalhes.push({
        linha: item.linha,
        cobrancaId: item.cobrancaId,
        status: "erro",
        mensagem: err.message || "Erro desconhecido",
      });
    }
  }

  return resultado;
}

// ─── Parser CSV para baixa em lote ───────────────────────────────────────────
// Formato esperado: cobrancaId,dataPagamento,valorPago
// Exemplo: 123,2024-03-15,150.00

export function parsearCSVBaixaLote(conteudo: string): ItemBaixaLote[] {
  const linhas = conteudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const itens: ItemBaixaLote[] = [];
  let inicio = 0;

  // Pular cabeçalho se existir
  const primeiraLinha = linhas[0]?.toLowerCase() || "";
  if (
    primeiraLinha.includes("cobranca") ||
    primeiraLinha.includes("id") ||
    primeiraLinha.includes("data")
  ) {
    inicio = 1;
  }

  for (let i = inicio; i < linhas.length; i++) {
    const cols = linhas[i].split(/[,;|\t]/);
    if (cols.length < 3) continue;

    const cobrancaId = parseInt(cols[0].trim());
    const dataPagamento = cols[1].trim();
    const valorStr = cols[2].trim().replace(",", ".");
    const valorPago = Math.round(parseFloat(valorStr) * 100);

    if (isNaN(cobrancaId) || isNaN(valorPago)) continue;

    itens.push({
      cobrancaId,
      dataPagamento,
      valorPago,
      linha: i + 1,
    });
  }

  return itens;
}

// ─── Alteração de Status em Lote ─────────────────────────────────────────────

export type StatusCobranca =
  | "pendente"
  | "pago"
  | "em_negociacao"
  | "suspenso"
  | "judicial"
  | "acordo"
  | "cancelado";

export async function alterarStatusEmLote(
  cobrancaIds: number[],
  novoStatus: StatusCobranca,
  condominioId: number
): Promise<{ alterados: number; erros: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (cobrancaIds.length === 0) return { alterados: 0, erros: 0 };

  try {
    const result = await db
      .update(cobrancas)
      .set({ status: novoStatus })
      .where(
        and(
          inArray(cobrancas.id, cobrancaIds),
          eq(cobrancas.condominioId, condominioId)
        )
      );

    const alterados = (result as any).affectedRows ?? cobrancaIds.length;
    return { alterados, erros: 0 };
  } catch (err) {
    return { alterados: 0, erros: cobrancaIds.length };
  }
}

import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { execucoesOperacionais } from "../drizzle/schema";

export type OrigemExecucaoOperacional = "manual" | "agendada" | "sistema" | "webhook";
export type StatusExecucaoOperacional = "sucesso" | "alerta" | "falha";

type IniciarExecucaoInput = {
  chave: string;
  nome: string;
  origem: OrigemExecucaoOperacional;
  escopo?: Record<string, unknown>;
  iniciadoPor?: { id?: number | null; nome?: string | null };
};

type FinalizarExecucaoInput = {
  id: number | null;
  iniciadoEm: Date;
  status: StatusExecucaoOperacional;
  registrosProcessados?: number;
  registrosCriados?: number;
  registrosAtualizados?: number;
  registrosIgnorados?: number;
  erros?: number;
  resultado?: Record<string, unknown>;
  mensagemErro?: string;
};

const CAMPOS_SENSIVEIS = new Set([
  "senha", "password", "passwordHash", "token", "secret", "apiKey",
  "authorization", "accessToken", "refreshToken", "clientSecret",
]);

export function sanitizarDadosOperacionais(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sanitizarDadosOperacionais);
  if (!valor || typeof valor !== "object") return valor;

  return Object.fromEntries(Object.entries(valor as Record<string, unknown>).map(([chave, item]) => [
    chave,
    CAMPOS_SENSIVEIS.has(chave) ? "[REDACTED]" : sanitizarDadosOperacionais(item),
  ]));
}

function serializarSeguro(valor?: Record<string, unknown>): string | null {
  if (!valor) return null;
  const conteudo = JSON.stringify(sanitizarDadosOperacionais(valor));
  return conteudo.length > 15_000 ? `${conteudo.slice(0, 15_000)}…` : conteudo;
}

/** Cria um registro operacional sem interromper a tarefa principal se o log falhar. */
export async function iniciarExecucaoOperacional(input: IniciarExecucaoInput) {
  const iniciadoEm = new Date();
  try {
    const db = await getDb();
    if (!db) return { id: null, iniciadoEm };

    const [resultado] = await db.insert(execucoesOperacionais).values({
      chave: input.chave,
      nome: input.nome,
      origem: input.origem,
      status: "em_andamento",
      iniciadoEm,
      escopoJson: serializarSeguro(input.escopo),
      iniciadoPorId: input.iniciadoPor?.id ?? null,
      iniciadoPorNome: input.iniciadoPor?.nome ?? null,
    });
    return { id: Number((resultado as { insertId?: number }).insertId ?? 0) || null, iniciadoEm };
  } catch {
    return { id: null, iniciadoEm };
  }
}

/** Finaliza um registro operacional. Falhas de observabilidade não quebram o fluxo de negócio. */
export async function finalizarExecucaoOperacional(input: FinalizarExecucaoInput) {
  if (!input.id) return;
  try {
    const db = await getDb();
    if (!db) return;

    await db.update(execucoesOperacionais)
      .set({
        status: input.status,
        finalizadoEm: new Date(),
        duracaoMs: Math.max(0, Date.now() - input.iniciadoEm.getTime()),
        registrosProcessados: input.registrosProcessados ?? 0,
        registrosCriados: input.registrosCriados ?? 0,
        registrosAtualizados: input.registrosAtualizados ?? 0,
        registrosIgnorados: input.registrosIgnorados ?? 0,
        erros: input.erros ?? 0,
        resultadoJson: serializarSeguro(input.resultado),
        mensagemErro: input.mensagemErro?.slice(0, 15_000) ?? null,
      })
      .where(eq(execucoesOperacionais.id, input.id));
  } catch {
    // Observabilidade não deve interromper o fluxo principal.
  }
}

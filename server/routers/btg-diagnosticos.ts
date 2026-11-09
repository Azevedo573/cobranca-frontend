import { TRPCError } from "@trpc/server";
import { createHash } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  acordos, auditLogs, btgContasRecebedoras, btgCobrancasEmitidas,
  btgHttpDiagnosticos, btgIntegracoes, btgRemessaItens, btgRemessas, condominios,
  btgRecuperacoes, devedores, parcelasAcordo, users,
} from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { getBtgV2ServerConfig } from "../btg-v2/config";
import { aadDiagnosticoBtg, decifrarDiagnosticoBtg } from "../btg-v2/diagnosticos-crypto";
import type { BtgTransaction } from "../btg-v2/manual-producao";

const RETENCAO_MS = 30 * 24 * 60 * 60 * 1000;
const LIMITE_BYTES = 64 * 1024;
const idSchema = z.number().int().positive().max(2_147_483_647);
type Diagnostico = typeof btgHttpDiagnosticos.$inferSelect;
type ContextoAtual = { usuarioId: number; integracaoId: number; ambiente: "sandbox" | "producao" };

// Projeção deliberada: consultas de lista sequer carregam os criptogramas.
const metadataColumns = {
  id: btgHttpDiagnosticos.id, ambiente: btgHttpDiagnosticos.ambiente,
  btgIntegracaoId: btgHttpDiagnosticos.btgIntegracaoId,
  btgCobrancaEmitidaId: btgHttpDiagnosticos.btgCobrancaEmitidaId,
  btgRemessaId: btgHttpDiagnosticos.btgRemessaId,
  parcelaAcordoId: btgHttpDiagnosticos.parcelaAcordoId,
  condominioId: btgHttpDiagnosticos.condominioId,
  estadoCaptura: btgHttpDiagnosticos.estadoCaptura, httpStatus: btgHttpDiagnosticos.httpStatus,
  payloadBytes: btgHttpDiagnosticos.payloadBytes, respostaBytes: btgHttpDiagnosticos.respostaBytes,
  respostaCompleta: btgHttpDiagnosticos.respostaCompleta,
  capturaCriadaEm: btgHttpDiagnosticos.capturaCriadaEm,
  respostaRecebidaEm: btgHttpDiagnosticos.respostaRecebidaEm,
  conteudoExpurgadoEm: btgHttpDiagnosticos.conteudoExpurgadoEm,
  updatedAt: btgHttpDiagnosticos.updatedAt,
};
type Metadata = Pick<Diagnostico, keyof typeof metadataColumns>;

function naoEncontrado(): never {
  // Mesmo erro para ID inexistente ou contexto inconsistente; não revela IDs relacionados.
  throw new TRPCError({ code: "NOT_FOUND", message: "Diagnóstico BTG não disponível." });
}
function expirou(row: Pick<Diagnostico, "capturaCriadaEm">, now: Date) {
  const criadaEm = row.capturaCriadaEm.getTime();
  return !Number.isFinite(criadaEm) || now.getTime() >= criadaEm + RETENCAO_MS;
}
function metadataSegura(row: Metadata, now: Date) {
  const expirado = expirou(row, now);
  return {
    id: row.id, btgCobrancaEmitidaId: row.btgCobrancaEmitidaId,
    parcelaAcordoId: row.parcelaAcordoId,
    estadoCaptura: row.estadoCaptura, httpStatus: row.httpStatus,
    payloadBytes: row.payloadBytes, respostaBytes: row.respostaBytes,
    respostaCompleta: row.respostaCompleta === 1,
    capturaCriadaEm: row.capturaCriadaEm, respostaRecebidaEm: row.respostaRecebidaEm,
    conteudoExpurgadoEm: row.conteudoExpurgadoEm, updatedAt: row.updatedAt,
    podeVisualizar: !expirado && !row.conteudoExpurgadoEm,
    podeExpurgar: expirado && !row.conteudoExpurgadoEm,
  };
}

async function comContextoAtual<T>(ctx: TrpcContext,
  run: (tx: BtgTransaction, atual: ContextoAtual) => Promise<T>): Promise<T> {
  try {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    return await db.transaction(async tx => {
      // A sessão não é fonte de verdade de perfil/atividade. Lock preserva a
      // autorização até o commit que precede o retorno de plaintext ao caller.
      const [ator] = await tx.select({ id: users.id, role: users.role,
        isActive: users.isActive, isDeleted: users.isDeleted }).from(users)
        .where(eq(users.id, ctx.user!.id)).limit(1).for("share");
      if (!ator || ator.role !== "admin" || ator.isActive !== 1 || ator.isDeleted !== 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso administrativo não disponível." });
      }
      const config = getBtgV2ServerConfig();
      const [integracao] = await tx.select({ id: btgIntegracoes.id,
        ambiente: btgIntegracoes.ambiente, companyId: btgIntegracoes.companyId }).from(btgIntegracoes)
        .where(eq(btgIntegracoes.ambiente, config.ambiente)).limit(1).for("share");
      if (!integracao || integracao.companyId !== config.companyId) naoEncontrado();
      return run(tx, { usuarioId: ator.id, integracaoId: integracao.id, ambiente: integracao.ambiente });
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    // Nunca encadear cause: erros de DB/crypto podem conter corpos ou segredos.
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível acessar o diagnóstico BTG agora." });
  }
}

async function validarRemessa(tx: BtgTransaction, atual: ContextoAtual, remessaId: number) {
  const [remessa] = await tx.select({ id: btgRemessas.id, condominioId: btgRemessas.condominioId,
    btgContaRecebedoraId: btgRemessas.btgContaRecebedoraId }).from(btgRemessas)
    .where(and(eq(btgRemessas.id, remessaId), eq(btgRemessas.btgIntegracaoId, atual.integracaoId)))
    .limit(1).for("share");
  if (!remessa) naoEncontrado();
  const [condominio] = await tx.select({ id: condominios.id }).from(condominios)
    .where(eq(condominios.id, remessa.condominioId)).limit(1).for("share");
  const [conta] = await tx.select({ id: btgContasRecebedoras.id }).from(btgContasRecebedoras)
    .where(and(eq(btgContasRecebedoras.id, remessa.btgContaRecebedoraId),
      eq(btgContasRecebedoras.btgIntegracaoId, atual.integracaoId))).limit(1).for("share");
  if (!condominio || !conta) naoEncontrado();
  return remessa;
}

async function validarEmissao(tx: BtgTransaction, atual: ContextoAtual, emissaoId: number) {
  const [emissao] = await tx.select({ id: btgCobrancasEmitidas.id,
    condominioId: btgCobrancasEmitidas.condominioId, origemTipo: btgCobrancasEmitidas.origemTipo,
    origemId: btgCobrancasEmitidas.origemId, btgRemessaId: btgCobrancasEmitidas.btgRemessaId,
    btgContaRecebedoraId: btgCobrancasEmitidas.btgContaRecebedoraId }).from(btgCobrancasEmitidas)
    .where(and(eq(btgCobrancasEmitidas.id, emissaoId),
      eq(btgCobrancasEmitidas.btgIntegracaoId, atual.integracaoId))).limit(1).for("share");
  if (!emissao || emissao.origemTipo !== "parcela_acordo") naoEncontrado();
  const [parcela] = await tx.select({ id: parcelasAcordo.id, acordoId: parcelasAcordo.acordoId }).from(parcelasAcordo)
    .where(eq(parcelasAcordo.id, emissao.origemId)).limit(1).for("share");
  if (!parcela) naoEncontrado();
  const [acordo] = await tx.select({ id: acordos.id, devedorId: acordos.devedorId }).from(acordos)
    .where(and(eq(acordos.id, parcela.acordoId), eq(acordos.condominioId, emissao.condominioId)))
    .limit(1).for("share");
  if (!acordo) naoEncontrado();
  const [devedor] = await tx.select({ id: devedores.id }).from(devedores)
    .where(and(eq(devedores.id, acordo.devedorId), eq(devedores.condominioId, emissao.condominioId)))
    .limit(1).for("share");
  const [condominio] = await tx.select({ id: condominios.id }).from(condominios)
    .where(eq(condominios.id, emissao.condominioId)).limit(1).for("share");
  const [conta] = await tx.select({ id: btgContasRecebedoras.id }).from(btgContasRecebedoras)
    .where(and(eq(btgContasRecebedoras.id, emissao.btgContaRecebedoraId),
      eq(btgContasRecebedoras.btgIntegracaoId, atual.integracaoId))).limit(1).for("share");
  if (!devedor || !condominio || !conta) naoEncontrado();
  if (emissao.btgRemessaId !== null) {
    const remessa = await validarRemessa(tx, atual, emissao.btgRemessaId);
    if (remessa.condominioId !== emissao.condominioId || remessa.btgContaRecebedoraId !== emissao.btgContaRecebedoraId) naoEncontrado();
    const [item] = await tx.select({ id: btgRemessaItens.id,
      btgCobrancaEmitidaId: btgRemessaItens.btgCobrancaEmitidaId }).from(btgRemessaItens)
      .where(and(eq(btgRemessaItens.btgRemessaId, emissao.btgRemessaId),
        eq(btgRemessaItens.parcelaAcordoId, emissao.origemId))).limit(1).for("share");
    if (!item) naoEncontrado();
    if (item.btgCobrancaEmitidaId !== null && item.btgCobrancaEmitidaId !== emissao.id) {
      const cadeia = await tx.select().from(btgRecuperacoes)
        .where(and(eq(btgRecuperacoes.parcelaAcordoId, emissao.origemId),eq(btgRecuperacoes.btgIntegracaoId,atual.integracaoId)));
      let cursor = emissao.id;
      const visitados = new Set<number>();
      while (cursor !== item.btgCobrancaEmitidaId && !visitados.has(cursor) && visitados.size < 100) {
        visitados.add(cursor);
        const passos = cadeia.filter(r=>r.emissaoAnteriorId===cursor && r.estado==='consumida' && r.acao==='reenviar' && r.condominioId===emissao.condominioId && r.btgRemessaId===emissao.btgRemessaId && r.novaEmissaoId!==null);
        if (passos.length !== 1) naoEncontrado();
        cursor = passos[0].novaEmissaoId!;
        const [destino] = await tx.select().from(btgCobrancasEmitidas).where(eq(btgCobrancasEmitidas.id,cursor)).limit(1).for('share');
        if (!destino || destino.btgIntegracaoId!==atual.integracaoId || destino.btgContaRecebedoraId!==emissao.btgContaRecebedoraId || destino.condominioId!==emissao.condominioId || destino.btgRemessaId!==emissao.btgRemessaId || destino.origemTipo!==emissao.origemTipo || destino.origemId!==emissao.origemId) naoEncontrado();
      }
      if (cursor !== item.btgCobrancaEmitidaId) naoEncontrado();
    }
  }
  return emissao;
}

async function validarDiagnostico(tx: BtgTransaction, atual: ContextoAtual, row: Metadata) {
  if (row.btgIntegracaoId !== atual.integracaoId || row.ambiente !== atual.ambiente) naoEncontrado();
  const emissao = await validarEmissao(tx, atual, row.btgCobrancaEmitidaId);
  if (emissao.condominioId !== row.condominioId || emissao.origemId !== row.parcelaAcordoId ||
    emissao.btgRemessaId !== row.btgRemessaId) naoEncontrado();
}

async function obterDiagnosticoBloqueado(tx: BtgTransaction, atual: ContextoAtual,
  diagnosticoId: number, modo: "share" | "update") {
  // A primeira leitura não bloqueia diagnóstico. Compartilha a ordem do writer:
  // usuário/integração -> emissão/contexto -> diagnóstico, nunca diag -> emissão.
  const [inicial] = await tx.select(metadataColumns).from(btgHttpDiagnosticos)
    .where(eq(btgHttpDiagnosticos.id, diagnosticoId)).limit(1);
  if (!inicial) naoEncontrado();
  await validarDiagnostico(tx, atual, inicial);
  const [row] = await tx.select().from(btgHttpDiagnosticos)
    .where(eq(btgHttpDiagnosticos.id, diagnosticoId)).limit(1).for(modo);
  if (!row || row.btgIntegracaoId !== inicial.btgIntegracaoId || row.ambiente !== inicial.ambiente ||
    row.btgCobrancaEmitidaId !== inicial.btgCobrancaEmitidaId || row.parcelaAcordoId !== inicial.parcelaAcordoId ||
    row.btgRemessaId !== inicial.btgRemessaId || row.condominioId !== inicial.condominioId) naoEncontrado();
  // TTL/cifras/AAD são consumidos exclusivamente desta releitura bloqueada.
  return row;
}

async function auditarDiagnostico(tx: BtgTransaction, atual: ContextoAtual, row: Diagnostico,
  evento: "diagnostico_visualizado" | "diagnostico_expurgado") {
  // Apenas IDs, ator e motivo controlado. Nem finalidade livre, nomes, headers,
  // hashes, criptogramas ou mensagens recebidas entram nesta fronteira.
  await tx.insert(auditLogs).values({
    userId: atual.usuarioId, userRole: "admin", action: evento,
    entity: "btg_http_diagnostico", entityId: String(row.id), condominioId: row.condominioId,
    metadata: JSON.stringify({ integracao: "btg-v2", evento,
      finalidade: "diagnostico_integ", diagnosticoId: row.id,
      btgIntegracaoId: row.btgIntegracaoId, btgCobrancaEmitidaId: row.btgCobrancaEmitidaId,
      btgRemessaId: row.btgRemessaId, parcelaAcordoId: row.parcelaAcordoId,
      condominioId: row.condominioId, usuarioId: atual.usuarioId }),
    ipAddress: "unknown", severity: "warning", success: 1,
  });
}

function decifrarVerificado(ciphertext: string, aad: string, bytes: number, sha256: string): Buffer {
  const plain = decifrarDiagnosticoBtg(ciphertext, aad);
  if (plain.byteLength > LIMITE_BYTES || plain.byteLength !== bytes ||
    createHash("sha256").update(plain).digest("hex") !== sha256) throw new Error("invalid evidence");
  return plain;
}
function textoInerte(bytes: Buffer): { texto: string; utf8Invalido: boolean } {
  try { return { texto: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), utf8Invalido: false }; }
  catch { return { texto: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes), utf8Invalido: true }; }
}

export const btgDiagnosticosRouter = router({
  listarPorEmissao: adminProcedure.input(z.object({ emissaoId: idSchema })).query(({ ctx, input }) =>
    comContextoAtual(ctx, async (tx, atual) => {
      await validarEmissao(tx, atual, input.emissaoId);
      const rows = await tx.select(metadataColumns).from(btgHttpDiagnosticos)
        .where(eq(btgHttpDiagnosticos.btgCobrancaEmitidaId, input.emissaoId)).orderBy(desc(btgHttpDiagnosticos.id));
      for (const row of rows) await validarDiagnostico(tx, atual, row);
      const now = new Date();
      return rows.map(row => metadataSegura(row, now));
    })),
  listarPorRemessa: adminProcedure.input(z.object({ remessaId: idSchema })).query(({ ctx, input }) =>
    comContextoAtual(ctx, async (tx, atual) => {
      await validarRemessa(tx, atual, input.remessaId);
      const rows = await tx.select(metadataColumns).from(btgHttpDiagnosticos)
        .where(eq(btgHttpDiagnosticos.btgRemessaId, input.remessaId)).orderBy(desc(btgHttpDiagnosticos.id));
      for (const row of rows) await validarDiagnostico(tx, atual, row);
      const now = new Date();
      return rows.map(row => metadataSegura(row, now));
    })),
  visualizar: adminProcedure.input(z.object({ diagnosticoId: idSchema,
    confirmacao: z.literal(true), finalidade: z.string().trim().min(10).max(200) }))
    .mutation(({ ctx, input }) => comContextoAtual(ctx, async (tx, atual) => {
      const row = await obterDiagnosticoBloqueado(tx, atual, input.diagnosticoId, "share");
      if (expirou(row, new Date()) || row.conteudoExpurgadoEm || !row.payloadCifrado) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Conteúdo do diagnóstico expirado ou indisponível." });
      }
      if (row.operacao !== "emissao" || row.versaoCriptografia !== "v1" ||
        (row.respostaCifrada === null && row.respostaCompleta === 1)) throw new Error("invalid evidence");
      const aad = aadDiagnosticoBtg(row);
      const payload = textoInerte(decifrarVerificado(row.payloadCifrado, aad, row.payloadBytes, row.payloadSha256));
      const resposta = row.respostaCifrada !== null ? textoInerte(decifrarVerificado(
        row.respostaCifrada, aadDiagnosticoBtg(row, "resposta"), row.respostaBytes ?? -1, row.respostaSha256 ?? "")) : null;
      // Não usar logAudit best-effort: commit/auditoria falhos impedem a entrega.
      await auditarDiagnostico(tx, atual, row, "diagnostico_visualizado");
      return { id: row.id, payload: payload.texto, resposta: resposta?.texto ?? null,
        httpStatus: row.httpStatus, estadoCaptura: row.estadoCaptura,
        payloadBytes: row.payloadBytes, respostaBytes: row.respostaBytes,
        respostaCompleta: row.respostaCompleta === 1,
        respostaLimitada: resposta !== null && (row.respostaCompleta !== 1 || resposta.utf8Invalido),
        payloadUtf8Invalido: payload.utf8Invalido, respostaUtf8Invalido: resposta?.utf8Invalido ?? false,
      };
    })),
  expurgar: adminProcedure.input(z.object({ diagnosticoId: idSchema,
    confirmacao: z.literal("EXPURGAR DIAGNOSTICO BTG") }))
    .mutation(({ ctx, input }) => comContextoAtual(ctx, async (tx, atual) => {
      const row = await obterDiagnosticoBloqueado(tx, atual, input.diagnosticoId, "update");
      const now = new Date();
      if (!expirou(row, now) || row.conteudoExpurgadoEm) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Expurgo disponível apenas para conteúdo expirado ainda não expurgado." });
      }
      await tx.update(btgHttpDiagnosticos).set({ payloadCifrado: null, respostaCifrada: null,
        conteudoExpurgadoEm: now, updatedAt: now }).where(eq(btgHttpDiagnosticos.id, row.id));
      await auditarDiagnostico(tx, atual, row, "diagnostico_expurgado");
      return { id: row.id, conteudoExpurgadoEm: now };
    })),
});

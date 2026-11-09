import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import {
  acordos,
  btgCancelamentos,
  btgContasRecebedoras,
  btgCobrancasEmitidas,
  btgIntegracoes,
  btgRecuperacoes,
  condominios,
  devedores,
  parcelasAcordo,
  users,
} from "../../drizzle/schema";
import type { BtgTransaction } from "./manual-producao";

export const erroTituloBtg = () =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Título bancário indisponível ou divergente; confira a parcela e a emissão.",
  });
export type EmissaoTituloBtg = typeof btgCobrancasEmitidas.$inferSelect;
export type ParcelaTituloBtg = typeof parcelasAcordo.$inferSelect;
export type OperacaoTituloBtg = { estado: string; chaveOperacao?: string };

export function validarCadeiaTituloBtg(
  emissoes: EmissaoTituloBtg[],
  recuperacoes: Pick<
    typeof btgRecuperacoes.$inferSelect,
    | "estado"
    | "acao"
    | "emissaoAnteriorId"
    | "novaEmissaoId"
    | "btgIntegracaoId"
    | "parcelaAcordoId"
  >[]
): boolean {
  if (!emissoes.length) return true;
  const ordenadas = [...emissoes].sort((a, b) => b.revisao - a.revisao);
  const atual = ordenadas[0];
  if (
    ordenadas.some(
      e =>
        e.btgIntegracaoId !== atual.btgIntegracaoId ||
        e.condominioId !== atual.condominioId ||
        e.origemTipo !== "parcela_acordo" ||
        e.origemId !== atual.origemId ||
        e.btgContaRecebedoraId !== atual.btgContaRecebedoraId
    )
  )
    return false;
  if (new Set(ordenadas.map(e => e.revisao)).size !== ordenadas.length)
    return false;
  return ordenadas.slice(1).every((anterior, index) => {
    const destino = ordenadas[index];
    return (
      destino.revisao === anterior.revisao + 1 &&
      recuperacoes.some(
        r =>
          r.estado === "consumida" &&
          r.acao === "reenviar" &&
          r.emissaoAnteriorId === anterior.id &&
          r.novaEmissaoId === destino.id &&
          r.btgIntegracaoId === atual.btgIntegracaoId &&
          r.parcelaAcordoId === atual.origemId
      )
    );
  });
}

export function situacaoDocumentoTituloBtg(input: {
  parcela: Pick<
    ParcelaTituloBtg,
    "status" | "amount" | "dueDate" | "canalBancario"
  >;
  emissao: EmissaoTituloBtg | null;
  identidadeValida: boolean;
  operacoes?: OperacaoTituloBtg[];
}) {
  const e = input.emissao;
  const operacaoAtiva = (input.operacoes ?? []).some(o =>
    ["solicitada", "em_confirmacao", "conflito_pagamento"].includes(o.estado)
  );
  if (input.parcela.canalBancario !== "api_btg_v2" && !e)
    return {
      codigo: "nao_emitida",
      mensagem: "Parcela ainda não emitida no BTG.",
      pagamentoPermitido: false,
    };
  if (!e)
    return {
      codigo: "nao_emitida",
      mensagem: "Parcela ainda não emitida no BTG.",
      pagamentoPermitido: false,
    };
  if (
    !input.identidadeValida ||
    e.amount !== input.parcela.amount ||
    e.dueDate.getTime() !== input.parcela.dueDate.getTime()
  )
    return {
      codigo: "divergente",
      mensagem: "Dados bancários divergentes; geração bloqueada para revisão.",
      pagamentoPermitido: false,
    };
  if (operacaoAtiva)
    return {
      codigo: "cancelamento_pendente",
      mensagem:
        "Cancelamento em confirmação; meios de pagamento indisponíveis.",
      pagamentoPermitido: false,
    };
  if (
    ["pago", "cancelado"].includes(input.parcela.status) ||
    ["paga", "cancelada", "expirada"].includes(e.status)
  )
    return {
      codigo: "historico",
      mensagem:
        "Título encerrado; registro preservado como histórico, não disponível para novo pagamento.",
      pagamentoPermitido: false,
    };
  if (
    e.status !== "emitida" ||
    !e.btgCollectionId ||
    /PAYMENT|PAGAMENTO|DOC_TITULO/i.test(e.erroCodigo ?? "")
  )
    return {
      codigo: "incerta",
      mensagem:
        "Não há confirmação suficiente para disponibilizar este boleto para pagamento.",
      pagamentoPermitido: false,
    };
  return {
    codigo:
      e.codigoBarras && e.linhaDigitavel
        ? "dados_presentes"
        : "dados_pendentes",
    mensagem:
      e.codigoBarras && e.linhaDigitavel
        ? "Dados bancários disponíveis; validar integridade antes de usar."
        : "Emitida no BTG; dados do boleto ainda pendentes.",
    pagamentoPermitido: true,
  };
}

export async function assertAdministradorTituloBtg(
  tx: BtgTransaction,
  usuarioId: number
) {
  const [ator] = await tx
    .select()
    .from(users)
    .where(eq(users.id, usuarioId))
    .limit(1)
    .for("share");
  if (
    !ator ||
    ator.role !== "admin" ||
    ator.isActive !== 1 ||
    ator.isDeleted !== 0
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Acesso administrativo indisponível.",
    });
  return ator;
}

export async function carregarTituloBtg(
  tx: BtgTransaction,
  usuarioId: number,
  parcelaId: number
) {
  await assertAdministradorTituloBtg(tx, usuarioId);
  const [parcela] = await tx
    .select()
    .from(parcelasAcordo)
    .where(eq(parcelasAcordo.id, parcelaId))
    .limit(1);
  if (!parcela) throw erroTituloBtg();
  const [acordo] = await tx
    .select()
    .from(acordos)
    .where(eq(acordos.id, parcela.acordoId))
    .limit(1);
  if (!acordo) throw erroTituloBtg();
  const [devedor] = await tx
    .select()
    .from(devedores)
    .where(eq(devedores.id, acordo.devedorId))
    .limit(1);
  const [condominio] = await tx
    .select()
    .from(condominios)
    .where(eq(condominios.id, acordo.condominioId))
    .limit(1);
  if (!devedor || !condominio || devedor.condominioId !== acordo.condominioId)
    throw erroTituloBtg();
  const emissoes = await tx
    .select()
    .from(btgCobrancasEmitidas)
    .where(
      and(
        eq(btgCobrancasEmitidas.origemTipo, "parcela_acordo"),
        eq(btgCobrancasEmitidas.origemId, parcelaId)
      )
    )
    .orderBy(desc(btgCobrancasEmitidas.revisao));
  const recuperacoes = await tx
    .select()
    .from(btgRecuperacoes)
    .where(eq(btgRecuperacoes.parcelaAcordoId, parcelaId));
  const emissao = emissoes[0] ?? null;
  const [integracao] = emissao
    ? await tx
        .select()
        .from(btgIntegracoes)
        .where(eq(btgIntegracoes.id, emissao.btgIntegracaoId))
        .limit(1)
    : [];
  const [conta] = emissao
    ? await tx
        .select()
        .from(btgContasRecebedoras)
        .where(eq(btgContasRecebedoras.id, emissao.btgContaRecebedoraId))
        .limit(1)
    : [];
  const ambienteRuntime =
    process.env.BTG_SANDBOX === "true" ? "sandbox" : "producao";
  const identidadeValida = !!(
    emissao &&
    integracao &&
    conta &&
    integracao.ativo === 1 &&
    conta.btgIntegracaoId === integracao.id &&
    integracao.ambiente === ambienteRuntime &&
    emissao.condominioId === acordo.condominioId &&
    parcela.canalBancario === "api_btg_v2" &&
    conta.agencia === emissao.agenciaRecebedora &&
    conta.numero === emissao.contaRecebedora &&
    conta.documentoBeneficiario === emissao.documentoBeneficiario &&
    validarCadeiaTituloBtg(emissoes, recuperacoes)
  );
  const operacoes: OperacaoTituloBtg[] = emissao
    ? await tx
        .select({
          estado: btgCancelamentos.estado,
          chaveOperacao: btgCancelamentos.chaveOperacao,
        })
        .from(btgCancelamentos)
        .where(eq(btgCancelamentos.btgCobrancaEmitidaId, emissao.id))
        .orderBy(desc(btgCancelamentos.id))
    : [];
  return {
    parcela,
    acordo,
    devedor,
    condominio,
    emissao,
    integracao: integracao ?? null,
    conta: conta ?? null,
    emissoes,
    recuperacoes,
    identidadeValida,
    operacoes,
    situacao: situacaoDocumentoTituloBtg({
      parcela,
      emissao,
      identidadeValida,
      operacoes,
    }),
  };
}
export type ContextoTituloBtg = Awaited<ReturnType<typeof carregarTituloBtg>>;

export async function carregarTituloPorEmissaoBtg(
  tx: BtgTransaction,
  usuarioId: number,
  emissaoId: number
) {
  await assertAdministradorTituloBtg(tx, usuarioId);
  const [e] = await tx
    .select()
    .from(btgCobrancasEmitidas)
    .where(eq(btgCobrancasEmitidas.id, emissaoId))
    .limit(1);
  if (!e || e.origemTipo !== "parcela_acordo") throw erroTituloBtg();
  const c = await carregarTituloBtg(tx, usuarioId, e.origemId);
  if (!c.identidadeValida || c.emissao?.id !== emissaoId) throw erroTituloBtg();
  return c;
}

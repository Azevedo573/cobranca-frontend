import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ne } from "drizzle-orm";
import {
  acordos,
  auditLogs,
  btgCancelamentos,
  btgContaRecebedoraCondominios,
  btgCobrancasEmitidas,
  parcelasAcordo,
} from "../../drizzle/schema";
import {
  getBtgV2ServerConfig,
  validarContaRecebedoraParaAmbiente,
} from "./config";
import { bloquearIntegracaoBtg, type BtgTransaction } from "./manual-producao";
import {
  assertAdministradorTituloBtg,
  carregarTituloPorEmissaoBtg,
} from "./titulo-contexto";
import {
  consultarSituacaoRecuperacaoBtg,
  type BtgConsultaRecuperacao,
  type BtgCobrancaRecuperacao,
} from "./reenvio-consulta";
import { cancelarCobrancaBtgV2 } from "./client";
import {
  cifrarDiagnosticoBtg,
  decifrarDiagnosticoBtg,
} from "./diagnosticos-crypto";
import { obterDiagnosticoHttpBtg } from "./errors";

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;
type Operacao = typeof btgCancelamentos.$inferSelect;
export const TTL_CANCELAMENTO_BTG_MS = 5 * 60 * 1000;
export const CONFIRMACAO_CANCELAMENTO_BTG = "CANCELAR COBRANÇA BTG" as const;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const erro = () =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Cancelamento indisponível ou prévia desatualizada; confira a situação bancária pelo fluxo seguro.",
  });
const erroPersistencia = () =>
  new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message:
      "Não foi possível registrar a operação segura; consulte o resultado sem repetir o cancelamento.",
  });
const aad = (
  r: Pick<
    Operacao,
    "chaveOperacao" | "usuarioId" | "btgIntegracaoId" | "btgCobrancaEmitidaId"
  >,
  parte: "consulta" | "motivo"
) =>
  JSON.stringify([
    "btg-cancelamento-v1",
    parte,
    r.chaveOperacao,
    r.usuarioId,
    r.btgIntegracaoId,
    r.btgCobrancaEmitidaId,
  ]);
const cifrar = (
  r: Parameters<typeof aad>[0],
  parte: Parameters<typeof aad>[1],
  value: unknown
) => cifrarDiagnosticoBtg(Buffer.from(JSON.stringify(value)), aad(r, parte));
const idValido = (id: number) => Number.isSafeInteger(id) && id > 0;

/** Provider compartilhado é de leitura. Esta borda adquire locks na ordem comum,
 * antes de carregar novamente a identidade fresca. Nenhuma chamada de rede aqui. */
async function carregarBloqueado(
  tx: BtgTransaction,
  usuarioId: number,
  emissaoId: number
) {
  await assertAdministradorTituloBtg(tx, usuarioId);
  const [hint] = await tx
    .select()
    .from(btgCobrancasEmitidas)
    .where(eq(btgCobrancasEmitidas.id, emissaoId))
    .limit(1);
  if (!hint || hint.origemTipo !== "parcela_acordo") throw erro();
  const config = getBtgV2ServerConfig();
  const integracao = await bloquearIntegracaoBtg(tx, config);
  if (hint.btgIntegracaoId !== integracao.id) throw erro();
  const [vinculo] = await tx
    .select()
    .from(btgContaRecebedoraCondominios)
    .where(
      and(
        eq(btgContaRecebedoraCondominios.btgIntegracaoId, integracao.id),
        eq(btgContaRecebedoraCondominios.condominioId, hint.condominioId)
      )
    )
    .limit(1)
    .for("share");
  if (
    !vinculo ||
    vinculo.ativo !== 1 ||
    vinculo.btgContaRecebedoraId !== hint.btgContaRecebedoraId
  )
    throw erro();
  const [parcelaHint] = await tx
    .select()
    .from(parcelasAcordo)
    .where(eq(parcelasAcordo.id, hint.origemId))
    .limit(1);
  if (!parcelaHint) throw erro();
  await tx
    .select()
    .from(acordos)
    .where(eq(acordos.id, parcelaHint.acordoId))
    .limit(1)
    .for("update");
  const [parcela] = await tx
    .select()
    .from(parcelasAcordo)
    .where(eq(parcelasAcordo.id, hint.origemId))
    .limit(1)
    .for("update");
  if (!parcela || parcela.acordoId !== parcelaHint.acordoId) throw erro();
  await tx
    .select()
    .from(btgCobrancasEmitidas)
    .where(
      and(
        eq(btgCobrancasEmitidas.origemTipo, "parcela_acordo"),
        eq(btgCobrancasEmitidas.origemId, parcela.id)
      )
    )
    .orderBy(desc(btgCobrancasEmitidas.revisao))
    .for("update");
  const c = await carregarTituloPorEmissaoBtg(tx, usuarioId, emissaoId);
  if (
    !c.identidadeValida ||
    !c.emissao ||
    !c.integracao ||
    !c.conta ||
    c.emissao.id !== emissaoId ||
    c.integracao.id !== integracao.id ||
    c.conta.ativo !== 1
  )
    throw erro();
  if (
    vinculo.condominioId !== c.acordo.condominioId ||
    vinculo.btgContaRecebedoraId !== c.conta.id
  )
    throw erro();
  validarContaRecebedoraParaAmbiente({
    conta: c.conta,
    integracao: c.integracao,
    serverConfig: config,
  });
  return { ...c, emissao: c.emissao, integracao: c.integracao, conta: c.conta };
}
type Contexto = Awaited<ReturnType<typeof carregarBloqueado>>;
function identidade(c: Contexto) {
  const e = c.emissao;
  return {
    emissaoId: e.id,
    parcelaId: c.parcela.id,
    acordoId: c.acordo.id,
    condominioId: c.acordo.condominioId,
    integracaoId: c.integracao.id,
    ambiente: c.integracao.ambiente,
    companyId: c.integracao.companyId,
    contaId: c.conta.id,
    revisao: e.revisao,
    collectionId: e.btgCollectionId,
    externalId: e.externalId,
    documentNumber: `PA${c.parcela.id}R${e.revisao}`,
    correlationId: `btgv2-${e.id}`,
    type: "BANKSLIP_QRCODE",
    valorCentavos: e.amount,
    dueDate: e.dueDate.toISOString().slice(0, 10),
    agencia: e.agenciaRecebedora,
    conta: e.contaRecebedora,
    documentoBeneficiario: e.documentoBeneficiario,
  };
}
function contextoHash(c: Contexto) {
  return hash({
    identidade: identidade(c),
    parcela: c.parcela,
    acordo: c.acordo,
    devedor: c.devedor,
    conta: c.conta,
    integracao: c.integracao,
    emissao: c.emissao,
  });
}
function pagamentoLocal(c: Contexto) {
  return (
    c.emissao.status === "paga" ||
    c.parcela.status === "pago" ||
    c.parcela.paymentDate != null ||
    /PAYMENT|PAGAMENTO|PARCIAL/i.test(c.emissao.erroCodigo ?? "") ||
    c.acordo.status === "pago"
  );
}
function pagamentoRemoto(r: BtgCobrancaRecuperacao) {
  const value = r as unknown as Record<string, unknown>;
  return (
    /PAID|PAYMENT|PARTIAL/.test(r.status ?? "") ||
    [
      "paidAt",
      "paymentDate",
      "paidAmount",
      "amountPaid",
      "valorPagoCentavos",
      "paidAmountCentavos",
      "paymentAmount",
      "paid",
      "hasPayment",
      "pagamentoDetectado",
    ].some(
      k =>
        value[k] !== undefined &&
        value[k] !== null &&
        value[k] !== 0 &&
        value[k] !== false
    )
  );
}
function identidadeRemota(c: Contexto, r: BtgCobrancaRecuperacao) {
  const e = c.emissao;
  return (
    !!e.btgCollectionId &&
    r.collectionId === e.btgCollectionId &&
    r.correlationId === `btgv2-${e.id}` &&
    r.type === "BANKSLIP_QRCODE" &&
    r.valorCentavos === e.amount &&
    r.dueDate === e.dueDate.toISOString().slice(0, 10) &&
    !!e.documentoBeneficiario &&
    r.agencia === e.agenciaRecebedora &&
    r.conta === e.contaRecebedora &&
    r.documentoBeneficiario === e.documentoBeneficiario &&
    (r.documentNumber === `PA${c.parcela.id}R${e.revisao}` ||
      r.externalId === e.externalId) &&
    (!r.externalId || r.externalId === e.externalId) &&
    (!r.documentNumber || r.documentNumber === `PA${c.parcela.id}R${e.revisao}`)
  );
}
function decidir(c: Contexto, consulta: BtgConsultaRecuperacao) {
  if (pagamentoLocal(c)) return "CONFLITO_PAGAMENTO";
  if (!consulta.completa || consulta.cobrancas.length !== 1)
    return "RESULTADO_INCERTO";
  const remoto = consulta.cobrancas[0];
  if (!identidadeRemota(c, remoto)) return "IDENTIDADE_DIVERGENTE";
  if (pagamentoRemoto(remoto)) return "CONFLITO_PAGAMENTO";
  if (remoto.status === "CANCELED") return "CANCELED";
  if (remoto.status === "CANCELING") return "CANCELING";
  if (remoto.status === "CANCEL_FAILED") return "CANCEL_FAILED";
  if (!["CREATED", "PROCESSING", "OVERDUE"].includes(remoto.status ?? ""))
    return "RESULTADO_INCERTO";
  if (
    c.emissao.status !== "emitida" ||
    !["pendente", "atrasado"].includes(c.parcela.status) ||
    c.acordo.status !== "ativo" ||
    c.parcela.amount !== c.emissao.amount ||
    c.parcela.dueDate.getTime() !== c.emissao.dueDate.getTime()
  )
    return "CONTEXTO_BLOQUEADO";
  return "PODE_CANCELAR";
}
async function consultar(c: Contexto): Promise<BtgConsultaRecuperacao> {
  try {
    return await consultarSituacaoRecuperacaoBtg({
      correlationId: `btgv2-${c.emissao.id}`,
      ...(c.emissao.btgCollectionId
        ? { collectionId: c.emissao.btgCollectionId }
        : {}),
    });
  } catch {
    return { completa: false, motivo: "CONSULTA_INDISPONIVEL", cobrancas: [] };
  }
}
function evidencia(c: Contexto, consulta: BtgConsultaRecuperacao) {
  // Não persistir meios de pagamento nem respostas arbitrárias. A identidade
  // congelada liga ambiente/conta/revisão à evidência cifrada da prévia.
  return {
    versao: 1,
    identidadeHash: hash(identidade(c)),
    consultaHash: hash(consulta),
    completa: consulta.completa,
    motivo: consulta.motivo,
    status:
      consulta.cobrancas.length === 1
        ? (consulta.cobrancas[0].status ?? null)
        : null,
  };
}
function validarOperacao(c: Contexto, r: Operacao, usuarioId: number) {
  if (
    r.usuarioId !== usuarioId ||
    r.btgCobrancaEmitidaId !== c.emissao.id ||
    r.parcelaAcordoId !== c.parcela.id ||
    r.btgIntegracaoId !== c.integracao.id ||
    r.condominioId !== c.acordo.condominioId ||
    !r.consultaCifrada
  )
    throw erro();
  const prova = JSON.parse(
    decifrarDiagnosticoBtg(r.consultaCifrada, aad(r, "consulta")).toString()
  ) as ReturnType<typeof evidencia>;
  if (prova.versao !== 1 || prova.identidadeHash !== hash(identidade(c)))
    throw erro();
}
async function operacoes(tx: BtgTransaction, emissaoId: number) {
  return tx
    .select()
    .from(btgCancelamentos)
    .where(eq(btgCancelamentos.btgCobrancaEmitidaId, emissaoId))
    .orderBy(desc(btgCancelamentos.id))
    .for("update");
}
function resultado(r: Operacao) {
  const mensagens: Record<string, string> = {
    preparada:
      "Revise a prévia e confirme. Cancelar o título BTG não altera nem perdoa a dívida.",
    solicitada:
      "Solicitação registrada; consulte o resultado, sem repetir o cancelamento.",
    em_confirmacao:
      "Cancelamento sem confirmação final; consulte o resultado, sem repetir a solicitação.",
    recusada:
      "Cancelamento não confirmado ou recusado; o título não foi marcado como cancelado.",
    cancelada:
      "Cancelamento confirmado pelo BTG. Dívida e histórico permanecem preservados.",
    conflito_pagamento:
      "Há indício de pagamento; cancelamento bloqueado e baixa financeira preservada.",
  };
  return {
    operacaoId: r.chaveOperacao,
    emissaoId: r.btgCobrancaEmitidaId,
    estado: r.estado,
    codigo: r.codigo,
    mensagem: mensagens[r.estado],
    expiraEm: r.expiraEm,
    solicitadaEm: r.solicitadaEm,
    confirmadaEm: r.confirmadaEm,
  };
}
async function auditar(
  tx: BtgTransaction,
  c: Contexto,
  r: Operacao,
  evento: string
) {
  await tx
    .insert(auditLogs)
    .values({
      userId: r.usuarioId,
      userRole: "admin",
      action: "config_change",
      entity: "configuracao",
      entityId: `btg-cancelamento:${r.chaveOperacao}`,
      condominioId: c.acordo.condominioId,
      metadata: JSON.stringify({
        evento,
        operacaoId: r.chaveOperacao,
        emissaoId: c.emissao.id,
        parcelaId: c.parcela.id,
        ambiente: c.integracao.ambiente,
        estado: r.estado,
        codigo: r.codigo,
        httpStatus: r.httpStatus,
      }),
      success: 1,
      severity: "warning",
      ipAddress: "unknown",
    });
}
async function atualizar(
  tx: BtgTransaction,
  r: Operacao,
  values: Partial<typeof btgCancelamentos.$inferInsert>
) {
  const change = await tx
    .update(btgCancelamentos)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(eq(btgCancelamentos.id, r.id), eq(btgCancelamentos.estado, r.estado))
    );
  if (!Array.isArray(change) || !change[0] || change[0].affectedRows !== 1)
    throw erroPersistencia();
  return { ...r, ...values, updatedAt: new Date() } as Operacao;
}
async function resolver(
  tx: BtgTransaction,
  c: Contexto,
  r: Operacao,
  consulta: BtgConsultaRecuperacao,
  httpStatus?: number | null
) {
  validarOperacao(c, r, r.usuarioId);
  const codigo = decidir(c, consulta);
  let estado: Operacao["estado"] = r.estado;
  if (codigo === "CONFLITO_PAGAMENTO") estado = "conflito_pagamento";
  else if (r.estado === "conflito_pagamento") estado = "conflito_pagamento";
  else if (codigo === "CANCELED") {
    if (c.emissao.status !== "cancelada") {
      const update = await tx
        .update(btgCobrancasEmitidas)
        .set({ status: "cancelada", updatedAt: new Date() })
        .where(
          and(
            eq(btgCobrancasEmitidas.id, c.emissao.id),
            eq(btgCobrancasEmitidas.status, c.emissao.status),
            ne(btgCobrancasEmitidas.status, "paga")
          )
        );
      if (!Array.isArray(update) || !update[0] || update[0].affectedRows !== 1)
        throw erroPersistencia();
    }
    estado = "cancelada";
  } else if (codigo === "CANCEL_FAILED") estado = "recusada";
  else if (r.estado !== "recusada" && r.estado !== "cancelada")
    estado = "em_confirmacao";
  const row = await atualizar(tx, r, {
    estado,
    codigo:
      estado === "conflito_pagamento"
        ? "CONFLITO_PAGAMENTO"
        : codigo === "PODE_CANCELAR"
          ? "RESULTADO_INCERTO"
          : codigo,
    consultaCifrada: cifrar(r, "consulta", evidencia(c, consulta)),
    httpStatus: httpStatus === undefined ? r.httpStatus : httpStatus,
    confirmadaEm:
      estado === "cancelada" ? (r.confirmadaEm ?? new Date()) : r.confirmadaEm,
  });
  await auditar(tx, c, row, "resultado_consultado");
  return row;
}

export async function prepararCancelamentoBtg(input: {
  db: Db;
  usuarioId: number;
  emissaoId: number;
}) {
  if (!idValido(input.emissaoId) || !idValido(input.usuarioId)) throw erro();
  const inicial = await input.db.transaction(async tx => {
    const c = await carregarBloqueado(tx, input.usuarioId, input.emissaoId);
    const existentes = await operacoes(tx, c.emissao.id);
    for (const r of existentes) {
      if (
        r.solicitadaEm ||
        [
          "solicitada",
          "em_confirmacao",
          "cancelada",
          "conflito_pagamento",
        ].includes(r.estado) ||
        (r.estado === "preparada" && r.expiraEm.getTime() > Date.now())
      ) {
        validarOperacao(c, r, input.usuarioId);
        return { c, r };
      }
      if (r.estado === "preparada") {
        const expirada = await atualizar(tx, r, {
          estado: "recusada",
          codigo: "PREVIA_EXPIRADA",
        });
        await auditar(tx, c, expirada, "previa_expirada");
      }
    }
    return { c, r: null };
  });
  if (inicial.r) return { ...resultado(inicial.r), resumo: resumo(inicial.c) };
  const consulta = await consultar(inicial.c);
  return input.db.transaction(async tx => {
    const c = await carregarBloqueado(tx, input.usuarioId, input.emissaoId);
    if (contextoHash(c) !== contextoHash(inicial.c)) throw erro();
    const existentes = await operacoes(tx, c.emissao.id);
    const ativa = existentes.find(
      r =>
        r.solicitadaEm ||
        [
          "solicitada",
          "em_confirmacao",
          "cancelada",
          "conflito_pagamento",
        ].includes(r.estado) ||
        (r.estado === "preparada" && r.expiraEm.getTime() > Date.now())
    );
    if (ativa) {
      validarOperacao(c, ativa, input.usuarioId);
      return { ...resultado(ativa), resumo: resumo(c) };
    }
    const codigo = decidir(c, consulta);
    const values = {
      chaveOperacao: randomUUID(),
      btgCobrancaEmitidaId: c.emissao.id,
      parcelaAcordoId: c.parcela.id,
      btgIntegracaoId: c.integracao.id,
      condominioId: c.acordo.condominioId,
      usuarioId: input.usuarioId,
      estado: (codigo === "PODE_CANCELAR"
        ? "preparada"
        : codigo === "CONFLITO_PAGAMENTO"
          ? "conflito_pagamento"
          : "recusada") as Operacao["estado"],
      contextoHash: contextoHash(c),
      criadaEm: new Date(),
      expiraEm: new Date(Date.now() + TTL_CANCELAMENTO_BTG_MS),
      solicitadaEm: null,
      confirmadaEm: null,
      motivoCifrado: null,
      httpStatus: null,
      codigo,
      updatedAt: new Date(),
    };
    await tx
      .insert(btgCancelamentos)
      .values({
        ...values,
        consultaCifrada: cifrar(values, "consulta", evidencia(c, consulta)),
      });
    const [r] = await tx
      .select()
      .from(btgCancelamentos)
      .where(eq(btgCancelamentos.chaveOperacao, values.chaveOperacao))
      .limit(1);
    if (!r) throw erroPersistencia();
    await auditar(tx, c, r, "previa_preparada");
    return { ...resultado(r), resumo: resumo(c) };
  });
}
function resumo(c: Contexto) {
  return {
    parcelaId: c.parcela.id,
    acordoId: c.acordo.id,
    revisao: c.emissao.revisao,
    valorCentavos: c.emissao.amount,
    vencimento: c.emissao.dueDate,
    ambiente: c.integracao.ambiente,
    contaMascara: `Ag. ${c.conta.agencia} · ••••${c.conta.numero.slice(-4)}`,
    naoAlteraDivida: true as const,
  };
}
async function inicialOperacao(input: {
  db: Db;
  usuarioId: number;
  operacaoId: string;
}) {
  if (
    !idValido(input.usuarioId) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.operacaoId
    )
  )
    throw erro();
  return input.db.transaction(async tx => {
    await assertAdministradorTituloBtg(tx, input.usuarioId);
    const [hint] = await tx
      .select()
      .from(btgCancelamentos)
      .where(eq(btgCancelamentos.chaveOperacao, input.operacaoId))
      .limit(1);
    if (!hint || hint.usuarioId !== input.usuarioId) throw erro();
    const c = await carregarBloqueado(
      tx,
      input.usuarioId,
      hint.btgCobrancaEmitidaId
    );
    const rows = await operacoes(tx, c.emissao.id);
    const r = rows.find(r => r.chaveOperacao === input.operacaoId);
    if (!r) throw erro();
    validarOperacao(c, r, input.usuarioId);
    return { c, r };
  });
}
export async function confirmarCancelamentoBtg(input: {
  db: Db;
  usuarioId: number;
  operacaoId: string;
  motivo: string;
  confirmacao: typeof CONFIRMACAO_CANCELAMENTO_BTG;
  ciente: true;
}) {
  const motivo = typeof input.motivo === "string" ? input.motivo.trim() : "";
  if (
    input.confirmacao !== CONFIRMACAO_CANCELAMENTO_BTG ||
    input.ciente !== true ||
    motivo.length < 5 ||
    motivo.length > 500 ||
    /[\u0000-\u001f\u007f]/.test(motivo)
  )
    throw erro();
  const inicial = await inicialOperacao(input);
  if (inicial.r.estado !== "preparada" || inicial.r.solicitadaEm)
    return resultado(inicial.r);
  if (inicial.r.expiraEm.getTime() <= Date.now()) throw erro();
  const consulta = await consultar(inicial.c);
  const reserva = await input.db.transaction(async tx => {
    const c = await carregarBloqueado(
      tx,
      input.usuarioId,
      inicial.c.emissao.id
    );
    const rows = await operacoes(tx, c.emissao.id);
    const r = rows.find(r => r.id === inicial.r.id);
    if (!r) throw erro();
    validarOperacao(c, r, input.usuarioId);
    if (r.estado !== "preparada" || r.solicitadaEm)
      return { c, r, enviar: false };
    if (r.expiraEm.getTime() <= Date.now()) throw erro();
    const codigo = decidir(c, consulta);
    if (codigo !== "PODE_CANCELAR")
      return { c, r: await resolver(tx, c, r, consulta), enviar: false };
    if (
      r.contextoHash !== contextoHash(c) ||
      contextoHash(inicial.c) !== contextoHash(c)
    )
      throw erro();
    // Emissão, operação UUID e auditoria persistidas ANTES do DELETE. O estado
    // incerto já é durável caso o processo pare após o efeito externo.
    const consumida = await atualizar(tx, r, {
      estado: "em_confirmacao",
      codigo: "RESULTADO_INCERTO",
      solicitadaEm: new Date(),
      motivoCifrado: cifrar(r, "motivo", motivo),
      consultaCifrada: cifrar(r, "consulta", evidencia(c, consulta)),
    });
    await auditar(tx, c, consumida, "cancelamento_solicitado");
    return { c, r: consumida, enviar: true };
  });
  if (!reserva.enviar) return resultado(reserva.r);
  // Nova autorização fresca após a reserva durável. Não reseta nem consome
  // novamente; revogação/pagamento/mudança de revisão impede o DELETE.
  try {
    const pronto = await input.db.transaction(async tx => {
      const c = await carregarBloqueado(
        tx,
        input.usuarioId,
        reserva.c.emissao.id
      );
      const r = (await operacoes(tx, c.emissao.id)).find(
        row => row.id === reserva.r.id
      );
      if (!r) throw erro();
      validarOperacao(c, r, input.usuarioId);
      if (r.estado !== "em_confirmacao" || !r.solicitadaEm)
        return { c, r, enviar: false };
      if (pagamentoLocal(c)) {
        const row = await atualizar(tx, r, {
          estado: "conflito_pagamento",
          codigo: "CONFLITO_PAGAMENTO",
        });
        await auditar(tx, c, row, "pagamento_detectado_antes_delete");
        return { c, r: row, enviar: false };
      }
      if (r.contextoHash !== contextoHash(c)) throw erro();
      return { c, r, enviar: true };
    });
    if (!pronto.enviar) return resultado(pronto.r);
  } catch {
    return resultado(reserva.r);
  }
  let httpStatus: number | null = null;
  try {
    await deleteLimitado(reserva.c.emissao.btgCollectionId!);
    httpStatus = 204;
  } catch (error) {
    httpStatus = obterDiagnosticoHttpBtg(error)?.httpStatus ?? null;
  }
  if (httpStatus !== null && [400, 403, 422].includes(httpStatus)) {
    try {
      return await input.db.transaction(async tx => {
        const c = await carregarBloqueado(
          tx,
          input.usuarioId,
          reserva.c.emissao.id
        );
        const r = (await operacoes(tx, c.emissao.id)).find(
          r => r.id === reserva.r.id
        );
        if (!r) throw erro();
        validarOperacao(c, r, input.usuarioId);
        if (["cancelada", "conflito_pagamento"].includes(r.estado))
          return resultado(r);
        const row = await atualizar(tx, r, {
          estado: pagamentoLocal(c) ? "conflito_pagamento" : "recusada",
          codigo: pagamentoLocal(c) ? "CONFLITO_PAGAMENTO" : "HTTP_RECUSADO",
          httpStatus,
        });
        await auditar(tx, c, row, "cancelamento_recusado");
        return resultado(row);
      });
    } catch {
      return resultado(reserva.r);
    }
  }
  // 204 apenas aceita o comando; timeout, 404 e 5xx permanecem incertos.
  // Consulta nova nunca repete DELETE e não mantém uma TX aberta na rede.
  try {
    return await consultarResultadoInterno(input, httpStatus);
  } catch {
    return resultado(reserva.r);
  }
}
async function deleteLimitado(collectionId: string) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("prazo-cancelamento"));
    }, 10_000);
  });
  const fetchLimitado: typeof fetch = (url, init) =>
    controller.signal.aborted
      ? Promise.reject(new Error("prazo-cancelamento"))
      : fetch(url, { ...init, redirect: "error", signal: controller.signal });
  try {
    await Promise.race([
      cancelarCobrancaBtgV2(collectionId, fetchLimitado),
      prazo,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}
async function consultarResultadoInterno(
  input: { db: Db; usuarioId: number; operacaoId: string },
  httpStatus?: number | null
) {
  const inicial = await inicialOperacao(input);
  const consulta = await consultar(inicial.c);
  return input.db.transaction(async tx => {
    const c = await carregarBloqueado(
      tx,
      input.usuarioId,
      inicial.c.emissao.id
    );
    const r = (await operacoes(tx, c.emissao.id)).find(
      r => r.id === inicial.r.id
    );
    if (!r) throw erro();
    validarOperacao(c, r, input.usuarioId);
    // Prévia ainda não consumida não é enviada por consulta. Pagamento e
    // cancelamento remoto, contudo, são sempre registrados sem baixa de dívida.
    if (r.estado === "preparada" && decidir(c, consulta) === "PODE_CANCELAR") {
      await auditar(tx, c, r, "previa_consultada");
      return resultado(r);
    }
    return resultado(await resolver(tx, c, r, consulta, httpStatus));
  });
}
export async function consultarResultadoCancelamentoBtg(input: {
  db: Db;
  usuarioId: number;
  operacaoId: string;
}) {
  return consultarResultadoInterno(input);
}
export const preparar = prepararCancelamentoBtg;
export const confirmar = confirmarCancelamentoBtg;
export const consultarResultado = consultarResultadoCancelamentoBtg;

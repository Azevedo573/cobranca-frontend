import { createHash } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  acordos,
  btgContaRecebedoraCondominios,
  btgContasRecebedoras,
  btgCobrancasEmitidas,
  btgHttpDiagnosticos,
  btgIntegracoes,
  btgRecuperacoes,
  btgRemessaItens,
  btgRemessas,
  devedores,
  parcelasAcordo,
} from "../../drizzle/schema";
import { criarBolePixBtgV2 } from "./client";
import { BtgV2BolePixError, gerarDocumentoParcelaBtgV2, montarPayloadBolePixV2 } from "./bolepix";
import { BtgV2ConfigurationError, getBtgV2ServerConfig, validarVinculoContaRecebedora, validarContaRecebedoraParaAmbiente, validarIntegracaoRuntimeBtg } from "./config";
import { getStatusOAuthBtg } from "../btg-oauth";
import { bloquearIntegracaoBtg } from "./manual-producao";
import { bloquearParcelasParaCanal, idsComEmissaoV2 } from "../btg-canais";
import { avaliarElegibilidadeCanalParcela, type EstadoBancarioParcela } from "../../shared/btg-canais";
import { obterCapturaHttpErroBtg, obterDiagnosticoHttpBtg, obterVinculoEmissaoErroBtg, vincularEmissaoErroBtg, type BtgV2DiagnosticoHttp } from "./errors";
import { criarCapturaHttpBtg, type BtgHttpCaptura } from "./diagnosticos";
import { consumirAutorizacaoReenvioBtg, hashContextoEnvioBtg, type AutorizacaoReenvioBtg, type ContextoAutorizacaoReenvioBtg } from "./reenvio-autorizacao";
import { classificarProvaReenvioBtg } from "./reenvio-provas";

export { BtgV2ConfigurationError } from "./config";

export type BtgV2OrigemTipo = "parcela_acordo";

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

export interface BtgV2EmissaoResultado {
  id: number;
  status: "emitida" | "reservada" | "enviando" | "incerta" | "falha" | "paga" | "cancelada" | "expirada";
  jaExistia: boolean;
  collectionId: string | null;
  bankSlipUrl: string | null;
  pixQrCode: string | null;
  pixCopiaECola: string | null;
  codigoBarras: string | null;
  linhaDigitavel: string | null;
  nossoNumero: string | null;
  capturaId?: number;
}

export function gerarExternalIdBtgV2(ambiente: "sandbox" | "producao", origemTipo: BtgV2OrigemTipo, origemId: number, revisao = 1): string {
  const prefixo = ambiente === "sandbox" ? "sbx" : "prd";
  return `v2:${prefixo}:${origemTipo}:${origemId}:r${revisao}`;
}

export function gerarIdempotencyKeyBtgV2(externalId: string): string {
  return createHash("sha256").update(`btg-v2:${externalId}`).digest("hex");
}

export function calcularDataLimiteBtgV2(dueDate: Date, diasLimitePagamento: number): Date {
  if (!Number.isInteger(diasLimitePagamento) || diasLimitePagamento < 1 || diasLimitePagamento > 365) {
    throw new BtgV2ConfigurationError("O limite de pagamento BTG deve estar entre 1 e 365 dias.");
  }
  const result = new Date(dueDate);
  if (Number.isNaN(result.getTime())) throw new BtgV2ConfigurationError("A data de vencimento da cobrança é inválida.");
  result.setUTCDate(result.getUTCDate() + diasLimitePagamento);
  return result;
}

export interface ParcelaAcordoBtgV2Elegibilidade extends EstadoBancarioParcela {
  id?: number;
  acordoId?: number;
  installmentNumber?: number;
  status: string;
  elegivel?: boolean;
  motivoBloqueio?: string | null;
}

export function avaliarElegibilidadeParcelaAcordoBtgV2(parcela: ParcelaAcordoBtgV2Elegibilidade) {
  return avaliarElegibilidadeCanalParcela(parcela, "api_btg_v2");
}

/** Somente flags; não inclui payload Pix, boleto ou dados de outra integração na revisão. */
export function prepararEstadoCanalParcelaBtgV2(parcela: ParcelaAcordoBtgV2Elegibilidade & Pick<typeof parcelasAcordo.$inferSelect, "nossoNumeroOrigem" | "canalBancario">, emissaoV2Existente: boolean, acordoStatus = "ativo") {
  const avaliacao = avaliarElegibilidadeParcelaAcordoBtgV2({ ...parcela, btgEmissaoV2Existente: emissaoV2Existente });
  const acordoAtivo = acordoStatus === "ativo";
  return {
    nossoNumeroOrigem: parcela.nossoNumeroOrigem ?? null,
    canalBancario: parcela.canalBancario ?? null,
    btgEmissaoV2Existente: emissaoV2Existente,
    elegivel: acordoAtivo && avaliacao.elegivel,
    motivoBloqueio: acordoAtivo ? avaliacao.motivo : "Acordo não está ativo",
    codigo: acordoAtivo ? avaliacao.codigo : "acordo_inativo" as const,
    podeConfirmarReserva: acordoAtivo && avaliacao.confirmarReservaDisponivel,
  };
}

/** Qualquer emissão/revisão/ambiente bloqueia NOVA operação, mesmo falha ou cancelada. */
export async function consultarParcelasComEmissaoV2Btg(db: Pick<Db, "select">, parcelaIds: number[]): Promise<Set<number>> {
  return idsComEmissaoV2(db, parcelaIds);
}

export function validarAcordoAtivoBtgV2(status: string): void {
  if (status !== "ativo") {
    throw new BtgV2ConfigurationError("A emissão BolePix está disponível apenas para acordo ativo.");
  }
}

export function validarSelecaoParcelasAcordoBtgV2(input: {
  acordoId: number;
  parcelaIds: number[];
  parcelas: ParcelaAcordoBtgV2Elegibilidade[];
  reutilizarEmissaoExistente?: boolean;
}): ParcelaAcordoBtgV2Elegibilidade[] {
  if (input.parcelaIds.length === 0) {
    throw new BtgV2ConfigurationError("Selecione ao menos uma parcela do acordo para enviar ao BTG.");
  }
  const idsUnicos = new Set(input.parcelaIds);
  if (idsUnicos.size !== input.parcelaIds.length) {
    throw new BtgV2ConfigurationError("A seleção de parcelas contém itens duplicados.");
  }
  const porId = new Map(input.parcelas.map((parcela) => [parcela.id, parcela]));
  return input.parcelaIds.map((parcelaId) => {
    const parcela = porId.get(parcelaId);
    if (!parcela) {
      throw new BtgV2ConfigurationError(`A parcela ${parcelaId} não foi encontrada.`);
    }
    if (parcela.acordoId !== input.acordoId) {
      throw new BtgV2ConfigurationError(`A parcela ${parcelaId} não pertence ao acordo informado.`);
    }
    const elegibilidade = avaliarElegibilidadeParcelaAcordoBtgV2(parcela);
    // Esta exceção só encaminha ao emissor; ele ainda valida a origem/contexto
    // e exige o registro canônico da integração atual, sem novo POST.
    if ((!elegibilidade.elegivel || parcela.elegivel === false) && !(input.reutilizarEmissaoExistente && parcela.btgEmissaoV2Existente)) {
      throw new BtgV2ConfigurationError(`A parcela ${parcelaId} não pode ser enviada: ${(parcela.motivoBloqueio ?? elegibilidade.motivo)?.toLowerCase()}.`);
    }
    return parcela;
  });
}

export interface BtgV2ParcelaAcordoParaEmissao extends ParcelaAcordoBtgV2Elegibilidade {
  id: number;
  acordoId: number;
  installmentNumber: number;
  amount: number;
  dueDate: Date;
  nossoNumeroOrigem: typeof parcelasAcordo.$inferSelect["nossoNumeroOrigem"];
  canalBancario: typeof parcelasAcordo.$inferSelect["canalBancario"];
  elegivel: boolean;
  motivoBloqueio: string | null;
  codigo: ReturnType<typeof prepararEstadoCanalParcelaBtgV2>["codigo"];
  podeConfirmarReserva: boolean;
}

export async function validarContaVinculadaAtualBtgV2(input: { db: Pick<Db, "select">; condominioId: number; paraEmissao?: boolean }) {
  const serverConfig = getBtgV2ServerConfig();
  const [integracao] = await input.db.select().from(btgIntegracoes)
    .where(eq(btgIntegracoes.ambiente, serverConfig.ambiente)).limit(1);
  if (!integracao) throw new BtgV2ConfigurationError("Configure a integração BTG antes de utilizar uma conta recebedora.");
  validarIntegracaoRuntimeBtg(integracao, serverConfig);
  const [accountRow] = await input.db.select({ vinculoAtivo: btgContaRecebedoraCondominios.ativo, conta: btgContasRecebedoras })
    .from(btgContaRecebedoraCondominios)
    .innerJoin(btgContasRecebedoras, eq(btgContasRecebedoras.id, btgContaRecebedoraCondominios.btgContaRecebedoraId))
    .where(and(eq(btgContaRecebedoraCondominios.btgIntegracaoId, integracao.id), eq(btgContaRecebedoraCondominios.condominioId, input.condominioId))).limit(1);
  validarVinculoContaRecebedora({ condominioId: input.condominioId, integracaoAtiva: integracao.ativo === 1,
    vinculoAtivo: accountRow?.vinculoAtivo === 1 && accountRow?.conta.ativo === 1, conta: accountRow?.conta ?? null });
  if (!accountRow) throw new BtgV2ConfigurationError("A conta recebedora não foi encontrada.");
  validarContaRecebedoraParaAmbiente({ conta: accountRow.conta, integracao, serverConfig });
  if (input.paraEmissao) {
    if (integracao.emissaoHabilitada !== 1) throw new BtgV2ConfigurationError("A emissão BolePix v2 não está habilitada para este ambiente.");
    const oauth = await getStatusOAuthBtg();
    if (oauth.status !== "conectado") throw new BtgV2ConfigurationError("Conecte a conta BTG antes de emitir cobranças.");
    if (serverConfig.ambiente === "producao" && !process.env.BTG_WEBHOOK_SECRET?.trim()) {
      throw new BtgV2ConfigurationError("Configure o segredo do webhook BTG para Authorization: Bearer antes de emitir em Produção. Não use Client Secret nem access token OAuth.");
    }
  }
  return { integracao, accountRow, serverConfig };
}

export async function prepararEmissaoParcelasAcordoBtgV2(input: {
  db: Db;
  acordoId: number;
}): Promise<{ acordoId: number; parcelas: BtgV2ParcelaAcordoParaEmissao[] }> {
  const [acordo] = await input.db.select().from(acordos).where(eq(acordos.id, input.acordoId)).limit(1);
  if (!acordo) throw new BtgV2ConfigurationError("Acordo não encontrado.");
  validarAcordoAtivoBtgV2(acordo.status);
  await validarContaVinculadaAtualBtgV2({ db: input.db, condominioId: acordo.condominioId });

  const parcelas = await input.db.select().from(parcelasAcordo)
    .where(eq(parcelasAcordo.acordoId, acordo.id));
  const comEmissao = await consultarParcelasComEmissaoV2Btg(input.db, parcelas.map(parcela => parcela.id));
  return {
    acordoId: acordo.id,
    parcelas: parcelas.map((parcela) => {
      return {
        id: parcela.id,
        acordoId: parcela.acordoId,
        installmentNumber: parcela.installmentNumber,
        amount: parcela.amount,
        dueDate: parcela.dueDate,
        status: parcela.status,
        nossoNumero: parcela.nossoNumero,
        remessaId: parcela.remessaId,
        statusRemessa: parcela.statusRemessa,
        btgCollectionId: parcela.btgCollectionId,
        ...prepararEstadoCanalParcelaBtgV2(parcela, comEmissao.has(parcela.id), acordo.status),
      };
    }),
  };
}

export interface BtgV2ResultadoEmissaoParcelaAcordo {
  parcelaId: number;
  installmentNumber: number;
  resultado: "simulada" | "emitida" | "ja_existia" | "falha";
  mensagem: string;
  diagnosticoHttp?: BtgV2DiagnosticoHttp;
  emissao?: BtgV2EmissaoResultado;
  emissaoId?: number;
  capturaId?: number;
}

export async function emitirParcelasAcordoBtgV2(input: {
  db: Db;
  acordoId: number;
  parcelaIds: number[];
  usuarioId?: number;
}): Promise<{ acordoId: number; resultados: BtgV2ResultadoEmissaoParcelaAcordo[] }> {
  const preparacao = await prepararEmissaoParcelasAcordoBtgV2({ db: input.db, acordoId: input.acordoId });
  const selecionadas = validarSelecaoParcelasAcordoBtgV2({
    acordoId: input.acordoId,
    parcelaIds: input.parcelaIds,
    parcelas: preparacao.parcelas,
    reutilizarEmissaoExistente: true,
  });
  const resultados: BtgV2ResultadoEmissaoParcelaAcordo[] = [];
  const ambiente = getBtgV2ServerConfig().ambiente;

  for (const parcela of selecionadas) {
    try {
      const emissao = await emitirBolePixV2({ db: input.db, parcelaId: parcela.id!, acordoIdEsperado: input.acordoId, usuarioId: input.usuarioId });
      const existenteSemSucesso = emissao.jaExistia && !["emitida", "paga"].includes(emissao.status);
      resultados.push({
        parcelaId: parcela.id!,
        installmentNumber: parcela.installmentNumber ?? 0,
        resultado: existenteSemSucesso ? "falha" : emissao.jaExistia ? "ja_existia" : ambiente === "sandbox" ? "simulada" : "emitida",
        mensagem: existenteSemSucesso
          ? "Emissão existente sem sucesso confirmado; revisar situação, sem reenviar."
          : emissao.jaExistia
          ? "Emissão já registrada para esta parcela."
          : ambiente === "sandbox"
            ? "Resposta simulada do BTG Sandbox recebida."
            : "Cobrança BolePix enviada ao BTG em Produção.",
        emissao,
      });
    } catch (error) {
      const diagnosticoHttp = obterDiagnosticoHttpBtg(error);
      const vinculo = obterVinculoEmissaoErroBtg(error);
      resultados.push({
        parcelaId: parcela.id!,
        installmentNumber: parcela.installmentNumber ?? 0,
        resultado: "falha",
        mensagem: error instanceof BtgV2ConfigurationError ? error.message : "Não foi possível emitir esta parcela no BTG.",
        ...(diagnosticoHttp ? { diagnosticoHttp } : {}),
        ...(vinculo && vinculo.parcelaId === parcela.id ? { emissaoId: vinculo.emissaoId,
          ...(vinculo.capturaId ? { capturaId: vinculo.capturaId } : {}) } : {}),
      });
    }
  }

  return { acordoId: input.acordoId, resultados };
}

function toResult(row: typeof btgCobrancasEmitidas.$inferSelect, jaExistia: boolean): BtgV2EmissaoResultado {
  return {
    id: row.id,
    status: row.status,
    jaExistia,
    collectionId: row.btgCollectionId,
    bankSlipUrl: row.bankSlipUrl,
    pixQrCode: row.pixQrCode,
    pixCopiaECola: row.pixCopiaECola,
    codigoBarras: row.codigoBarras,
    linhaDigitavel: row.linhaDigitavel,
    nossoNumero: row.nossoNumero,
  };
}

function isDuplicate(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate|unique|1062/i.test(message);
}

async function findExisting(db: Pick<Db, "select">, integracaoId: number, origemTipo: BtgV2OrigemTipo, origemId: number) {
  const rows = await db.select().from(btgCobrancasEmitidas)
    .where(and(
      eq(btgCobrancasEmitidas.btgIntegracaoId, integracaoId),
      eq(btgCobrancasEmitidas.origemTipo, origemTipo),
      eq(btgCobrancasEmitidas.origemId, origemId),
    ))
    .orderBy(desc(btgCobrancasEmitidas.revisao))
    .limit(1);
  return rows[0] ?? null;
}

function validarRegistroCanonicoBtgV2(row: typeof btgCobrancasEmitidas.$inferSelect, input: {
  integracaoId: number; parcelaId: number; condominioId: number; contaId: number;
}) {
  if (row.btgIntegracaoId !== input.integracaoId || row.origemTipo !== "parcela_acordo" || row.origemId !== input.parcelaId ||
      !Number.isSafeInteger(row.revisao) || row.revisao < 1 || row.condominioId !== input.condominioId || row.btgContaRecebedoraId !== input.contaId) {
    throw new BtgV2ConfigurationError("A emissão existente não corresponde à origem, condomínio ou conta atuais. Revise o registro canônico.");
  }
}

function validarParcelaPreparadaBtgV2(atual: typeof parcelasAcordo.$inferSelect, preparada: typeof parcelasAcordo.$inferSelect) {
  if (atual.acordoId !== preparada.acordoId || atual.installmentNumber !== preparada.installmentNumber ||
      atual.amount !== preparada.amount || atual.dueDate.getTime() !== preparada.dueDate.getTime()) {
    throw new BtgV2ConfigurationError("O acordo, valor ou vencimento da parcela foi alterado durante a preparação; revise a emissão.");
  }
}

/** Decisão já commitada pelo service; não cria revisão nem altera a tentativa anterior. */
async function validarRecuperacaoReservadaBtgV2(tx: Pick<Db, "select">, autorizacao: Readonly<ContextoAutorizacaoReenvioBtg>, contexto: {
  parcela: typeof parcelasAcordo.$inferSelect; acordo: typeof acordos.$inferSelect;
  devedor: typeof devedores.$inferSelect; integracao: typeof btgIntegracoes.$inferSelect;
  conta: typeof btgContasRecebedoras.$inferSelect;
}) {
  const negar = () => new BtgV2ConfigurationError("A autorização de reenvio ou o histórico de tentativas foi alterado; revise a recuperação BTG, sem novo envio.");
  if (hashContextoEnvioBtg(contexto) !== autorizacao.contextoHash) throw negar();
  const emissoes = await tx.select().from(btgCobrancasEmitidas)
    .where(and(eq(btgCobrancasEmitidas.origemTipo, "parcela_acordo"), eq(btgCobrancasEmitidas.origemId, autorizacao.parcelaId))).for("update");
  const decisoes = await tx.select().from(btgRecuperacoes)
    .where(eq(btgRecuperacoes.parcelaAcordoId, autorizacao.parcelaId)).for("update");
  const nova = emissoes.find(row => row.id === autorizacao.emissaoId);
  const decisao = decisoes.find(row => row.id === autorizacao.analiseId);
  const corresponde = (row: typeof btgRecuperacoes.$inferSelect) => row.estado === "consumida" && row.acao === "reenviar" && row.consumidaEm !== null &&
    row.btgIntegracaoId === contexto.integracao.id && row.parcelaAcordoId === contexto.parcela.id && row.condominioId === contexto.acordo.condominioId &&
    row.consultaCompleta === 1 && ["falha_local_comprovada", "rejeicao_definitiva"].includes(row.codigo) && /^[a-f0-9]{64}$/.test(row.provaHash);
  if (!nova || nova.revisao !== autorizacao.revisao || nova.revisao < 2 || nova.status !== "reservada" ||
      !decisao || !corresponde(decisao) || decisao.emissaoAnteriorId !== autorizacao.emissaoAnteriorId || decisao.novaEmissaoId !== nova.id ||
      decisao.usuarioId !== autorizacao.usuarioId || decisao.contextoHash !== autorizacao.contextoHash || decisao.btgRemessaId !== nova.btgRemessaId) throw negar();
  validarRegistroCanonicoBtgV2(nova, { integracaoId: contexto.integracao.id, parcelaId: contexto.parcela.id, condominioId: contexto.acordo.condominioId, contaId: contexto.conta.id });
  if (nova.externalId !== gerarExternalIdBtgV2(contexto.integracao.ambiente, "parcela_acordo", contexto.parcela.id, nova.revisao) ||
      nova.idempotencyKey !== gerarIdempotencyKeyBtgV2(nova.externalId) || nova.amount !== contexto.parcela.amount || nova.dueDate.getTime() !== contexto.parcela.dueDate.getTime() ||
      nova.agenciaRecebedora !== contexto.conta.agencia || nova.contaRecebedora !== contexto.conta.numero ||
      nova.documentoBeneficiario !== contexto.conta.documentoBeneficiario || nova.nomeBeneficiario !== contexto.conta.nomeBeneficiario) throw negar();
  // Cada revisão anterior precisa alcançar ESTA reserva por decisões explícitas.
  // Outra integração, revisão concorrente, lacuna, ciclo ou tentativa sem decisão bloqueia.
  if (emissoes.some(row => row.btgIntegracaoId !== contexto.integracao.id || row.condominioId !== contexto.acordo.condominioId ||
      row.btgContaRecebedoraId !== contexto.conta.id || row.amount !== nova.amount || row.dueDate.getTime() !== nova.dueDate.getTime() || row.btgRemessaId !== nova.btgRemessaId ||
      !Number.isSafeInteger(row.revisao) || row.revisao < 1 || row.revisao > nova.revisao) ||
      new Set(emissoes.map(row => row.revisao)).size !== emissoes.length || emissoes.length !== nova.revisao) throw negar();
  for (const anterior of emissoes.filter(row => row.id !== nova.id)) {
    if (!["reservada", "incerta", "falha"].includes(anterior.status) || anterior.btgCollectionId || anterior.bankSlipUrl || anterior.pixQrCode ||
        anterior.pixCopiaECola || anterior.codigoBarras || anterior.linhaDigitavel || anterior.nossoNumero || anterior.emitidaEm) throw negar();
    const proxima = emissoes.find(row => row.revisao === anterior.revisao + 1);
    const resolucoes = decisoes.filter(row => corresponde(row) && row.emissaoAnteriorId === anterior.id);
    if (!proxima || resolucoes.length !== 1 || resolucoes[0].novaEmissaoId !== proxima.id) throw negar();
    if (proxima.id === nova.id && anterior.id !== autorizacao.emissaoAnteriorId) throw negar();
  }
  if (nova.btgCollectionId || nova.emitidaEm || nova.falhaAntesEnvioEm || nova.erroCodigo) throw negar();
  const anterior = emissoes.find(row => row.id === autorizacao.emissaoAnteriorId);
  if (!anterior) throw negar();
  const [diagnostico] = await tx.select().from(btgHttpDiagnosticos)
    .where(eq(btgHttpDiagnosticos.btgCobrancaEmitidaId, anterior.id)).limit(1).for("share");
  const provaAtual = classificarProvaReenvioBtg(anterior, diagnostico ?? null, new Date());
  if (provaAtual.codigo === "incerta" || provaAtual.codigo !== decisao.codigo || provaAtual.hashProva !== decisao.provaHash ||
      provaAtual.diagnosticoId !== decisao.diagnosticoId) throw negar();
  return nova;
}

async function validarContextoRemessaBtgV2(db: Pick<Db, "select">, remessaId: number | undefined, input: {
  integracaoId: number; condominioId: number; contaId: number; parcelaId: number; amount: number;
  recuperacao?: Readonly<ContextoAutorizacaoReenvioBtg>;
}) {
  if (remessaId === undefined) return;
  const [remessa] = await db.select().from(btgRemessas).where(eq(btgRemessas.id, remessaId)).limit(1);
  const [item] = await db.select().from(btgRemessaItens)
    .where(and(eq(btgRemessaItens.btgRemessaId, remessaId), eq(btgRemessaItens.parcelaAcordoId, input.parcelaId))).limit(1);
  if (!remessa || !item || remessa.btgIntegracaoId !== input.integracaoId || remessa.condominioId !== input.condominioId ||
      remessa.btgContaRecebedoraId !== input.contaId || item.valorCentavos !== input.amount ||
      (input.recuperacao
        ? !["falha", "processada_parcialmente"].includes(remessa.status) || item.resultado !== "falha" || item.btgCobrancaEmitidaId !== input.recuperacao.emissaoId
        : !["rascunho", "enviando"].includes(remessa.status))) {
    throw new BtgV2ConfigurationError("A parcela ou conta não corresponde ao contexto atual da remessa BTG.");
  }
}

export async function emitirBolePixV2(input: {
  db: Db;
  parcelaId: number;
  btgRemessaId?: number;
  acordoIdEsperado?: number;
  condominioIdEsperado?: number;
  valorCentavosEsperado?: number;
  usuarioId?: number;
  recuperacao?: AutorizacaoReenvioBtg;
}): Promise<BtgV2EmissaoResultado> {
  const { db, parcelaId } = input;
  let btgRemessaId = input.btgRemessaId;
  const recuperacao = input.recuperacao === undefined ? null : consumirAutorizacaoReenvioBtg(input.recuperacao);
  if (input.recuperacao !== undefined && (!recuperacao || recuperacao.parcelaId !== parcelaId || recuperacao.usuarioId !== input.usuarioId)) {
    throw new BtgV2ConfigurationError("A autorização interna de reenvio BTG é inválida ou já foi utilizada.");
  }
  if (recuperacao) {
    const [nova] = await db.select().from(btgCobrancasEmitidas).where(eq(btgCobrancasEmitidas.id, recuperacao.emissaoId)).limit(1);
    if (!nova || (btgRemessaId !== undefined && btgRemessaId !== nova.btgRemessaId)) {
      throw new BtgV2ConfigurationError("A reserva autorizada não corresponde ao contexto de reenvio BTG.");
    }
    btgRemessaId = nova.btgRemessaId ?? undefined;
  }
  const origemTipo: BtgV2OrigemTipo = "parcela_acordo";
  const serverConfig = getBtgV2ServerConfig();
  const [integracao] = await db.select().from(btgIntegracoes)
    .where(eq(btgIntegracoes.ambiente, serverConfig.ambiente))
    .limit(1);

  if (!integracao || integracao.ativo !== 1 || integracao.emissaoHabilitada !== 1) {
    throw new BtgV2ConfigurationError("A emissão BolePix v2 não está habilitada para este ambiente.");
  }
  validarIntegracaoRuntimeBtg(integracao, serverConfig);

  let origem: {
    condominioId: number;
    devedorId: number;
    amount: number;
    dueDate: Date;
    description: string;
  };

  const [parcela] = await db.select().from(parcelasAcordo).where(eq(parcelasAcordo.id, parcelaId)).limit(1);
  if (!parcela) throw new BtgV2ConfigurationError("Parcela do acordo não encontrada.");
  const [acordo] = await db.select().from(acordos).where(eq(acordos.id, parcela.acordoId)).limit(1);
  if (!acordo) throw new BtgV2ConfigurationError("Acordo da parcela não encontrado.");
  validarAcordoAtivoBtgV2(acordo.status);
  if ((input.acordoIdEsperado !== undefined && acordo.id !== input.acordoIdEsperado) ||
      (input.condominioIdEsperado !== undefined && acordo.condominioId !== input.condominioIdEsperado) ||
      (input.valorCentavosEsperado !== undefined && parcela.amount !== input.valorCentavosEsperado)) {
    throw new BtgV2ConfigurationError("A parcela não corresponde ao acordo, condomínio ou valor selecionados; revise a emissão.");
  }
  origem = {
    condominioId: acordo.condominioId,
    devedorId: acordo.devedorId,
    amount: parcela.amount,
    dueDate: parcela.dueDate,
    description: `Parcela ${parcela.installmentNumber} do acordo #${acordo.id}`,
  };

  const [devedor] = await db.select().from(devedores).where(eq(devedores.id, origem.devedorId)).limit(1);
  if (!devedor || devedor.condominioId !== origem.condominioId) {
    throw new BtgV2ConfigurationError("O pagador da cobrança é inválido para o condomínio selecionado.");
  }

  const accountRows = await db.select({
    vinculoAtivo: btgContaRecebedoraCondominios.ativo,
    conta: btgContasRecebedoras,
  }).from(btgContaRecebedoraCondominios)
    .innerJoin(btgContasRecebedoras, eq(btgContasRecebedoras.id, btgContaRecebedoraCondominios.btgContaRecebedoraId))
    .where(and(
      eq(btgContaRecebedoraCondominios.btgIntegracaoId, integracao.id),
      eq(btgContaRecebedoraCondominios.condominioId, origem.condominioId),
    ))
    .limit(1);
  const accountRow = accountRows[0];
  validarVinculoContaRecebedora({
    condominioId: origem.condominioId,
    integracaoAtiva: integracao.ativo === 1,
    vinculoAtivo: accountRow?.vinculoAtivo === 1 && accountRow?.conta.ativo === 1,
    conta: accountRow ? {
      accountId: accountRow.conta.accountId,
      agencia: accountRow.conta.agencia,
      numero: accountRow.conta.numero,
      documentoBeneficiario: accountRow.conta.documentoBeneficiario,
      nomeBeneficiario: accountRow.conta.nomeBeneficiario,
    } : null,
  });
  if (!accountRow) throw new BtgV2ConfigurationError("A conta recebedora não foi encontrada.");
  validarContaRecebedoraParaAmbiente({ conta: accountRow.conta, integracao, serverConfig });
  const contextoCanonico = { integracaoId: integracao.id, parcelaId, condominioId: origem.condominioId, contaId: accountRow.conta.id };
  const contextoRemessa = { ...contextoCanonico, amount: origem.amount, ...(recuperacao ? { recuperacao } : {}) };
  await validarContextoRemessaBtgV2(db, btgRemessaId, contextoRemessa);

  // O próprio canal reservado não é um motivo para rejeitar a consulta canônica.
  // Guards de ator/carteira seguem no router; origem/conta/condomínio são validados aqui.
  const existenteAntesDaReserva = await findExisting(db, integracao.id, origemTipo, parcelaId);
  if (existenteAntesDaReserva && !recuperacao) {
    validarRegistroCanonicoBtgV2(existenteAntesDaReserva, contextoCanonico);
    return toResult(existenteAntesDaReserva, true);
  }
  // Obrigatório para um novo comando; consulta canônica histórica não cria captura.
  if (!Number.isSafeInteger(input.usuarioId) || input.usuarioId! <= 0) {
    throw new BtgV2ConfigurationError("Um usuário autenticado válido é obrigatório para capturar uma nova emissão BolePix.");
  }
  const comEmissao = await consultarParcelasComEmissaoV2Btg(db, [parcelaId]);
  if (recuperacao && parcela.canalBancario !== "api_btg_v2") throw new BtgV2ConfigurationError("O canal da parcela não corresponde à reserva de reenvio BTG.");
  const elegibilidade = avaliarElegibilidadeParcelaAcordoBtgV2({ ...parcela, ...(recuperacao ? { canalBancario: null } : {}), btgEmissaoV2Existente: !recuperacao && comEmissao.has(parcelaId) });
  if (!elegibilidade.elegivel) {
    throw new BtgV2ConfigurationError(`Esta parcela não pode ser enviada: ${elegibilidade.motivo?.toLowerCase()}.`);
  }
  const oauth = await getStatusOAuthBtg();
  if (oauth.status !== "conectado") throw new BtgV2ConfigurationError("Conecte a conta BTG antes de emitir cobranças.");
  if (serverConfig.ambiente === "producao" && !process.env.BTG_WEBHOOK_SECRET?.trim()) {
    throw new BtgV2ConfigurationError("Configure o segredo do webhook BTG para Authorization: Bearer antes de emitir em Produção. Não use Client Secret nem access token OAuth.");
  }

  const externalId = gerarExternalIdBtgV2(integracao.ambiente, origemTipo, parcelaId, recuperacao?.revisao ?? 1);
  const idempotencyKey = gerarIdempotencyKeyBtgV2(externalId);
  const now = new Date();

  let reservada: { row: typeof btgCobrancasEmitidas.$inferSelect; jaExistia: boolean };
  try {
    reservada = await db.transaction(async tx => {
      const atual = await bloquearIntegracaoBtg(tx, getBtgV2ServerConfig());
      if (atual.id !== integracao.id) throw new BtgV2ConfigurationError("O ambiente da integração foi alterado; revise a emissão.");
      if (atual.emissaoHabilitada !== 1) throw new BtgV2ConfigurationError("A emissão BolePix v2 não está habilitada para este ambiente.");
      const [vinculada] = await tx.select({ vinculoAtivo: btgContaRecebedoraCondominios.ativo, conta: btgContasRecebedoras })
        .from(btgContaRecebedoraCondominios)
        .innerJoin(btgContasRecebedoras, eq(btgContasRecebedoras.id, btgContaRecebedoraCondominios.btgContaRecebedoraId))
        .where(and(eq(btgContaRecebedoraCondominios.btgIntegracaoId, atual.id), eq(btgContaRecebedoraCondominios.condominioId, origem.condominioId)))
        .limit(1).for("update");
      if (!vinculada || vinculada.vinculoAtivo !== 1) throw new BtgV2ConfigurationError("O vínculo da conta foi alterado; revise a emissão.");
      validarContaRecebedoraParaAmbiente({ conta: vinculada.conta, integracao: atual, serverConfig: getBtgV2ServerConfig() });
      if (vinculada.conta.id !== accountRow.conta.id || vinculada.conta.agencia !== accountRow.conta.agencia ||
          vinculada.conta.numero !== accountRow.conta.numero || vinculada.conta.documentoBeneficiario !== accountRow.conta.documentoBeneficiario ||
          vinculada.conta.nomeBeneficiario !== accountRow.conta.nomeBeneficiario) {
        throw new BtgV2ConfigurationError("A conta recebedora foi alterada durante a preparação; revise a emissão.");
      }
      const [bloqueada] = await bloquearParcelasParaCanal(tx, [parcelaId], origem.condominioId);
      if (!bloqueada || bloqueada.parcela.acordoId !== acordo.id || bloqueada.condominioId !== origem.condominioId) {
        throw new BtgV2ConfigurationError("A parcela não corresponde mais ao acordo ou condomínio selecionados.");
      }
      validarAcordoAtivoBtgV2(bloqueada.acordoStatus);
      const [acordoAtual] = await tx.select().from(acordos).where(eq(acordos.id, acordo.id)).limit(1);
      if (!acordoAtual || acordoAtual.devedorId !== origem.devedorId) {
        throw new BtgV2ConfigurationError("O pagador do acordo foi alterado durante a preparação; revise a emissão.");
      }
      if (recuperacao) {
        validarParcelaPreparadaBtgV2(bloqueada.parcela, parcela);
        const [pagadorAtual] = await tx.select().from(devedores).where(eq(devedores.id, origem.devedorId)).limit(1).for("update");
        if (!pagadorAtual || pagadorAtual.condominioId !== origem.condominioId || bloqueada.parcela.canalBancario !== "api_btg_v2") {
          throw new BtgV2ConfigurationError("O pagador ou canal da recuperação BTG foi alterado; revise o reenvio.");
        }
        const estado = avaliarElegibilidadeParcelaAcordoBtgV2({ ...bloqueada.parcela, canalBancario: null, btgEmissaoV2Existente: false });
        if (!estado.elegivel) throw new BtgV2ConfigurationError(`Esta parcela não pode ser reenviada: ${estado.motivo?.toLowerCase()}.`);
        const row = await validarRecuperacaoReservadaBtgV2(tx, recuperacao, { parcela: bloqueada.parcela, acordo: acordoAtual, devedor: pagadorAtual, integracao: atual, conta: vinculada.conta });
        await validarContextoRemessaBtgV2(tx, btgRemessaId, contextoRemessa);
        return { row, jaExistia: false };
      }
      const existente = await findExisting(tx, atual.id, origemTipo, parcelaId);
      if (existente) {
        validarRegistroCanonicoBtgV2(existente, contextoCanonico);
        return { row: existente, jaExistia: true };
      }
      validarParcelaPreparadaBtgV2(bloqueada.parcela, parcela);
      const liberdade = avaliarElegibilidadeParcelaAcordoBtgV2({ ...bloqueada.parcela, btgEmissaoV2Existente: bloqueada.emissaoV2Existente });
      if (!liberdade.elegivel) throw new BtgV2ConfigurationError(`Esta parcela não pode ser enviada: ${liberdade.motivo?.toLowerCase()}.`);
      await validarContextoRemessaBtgV2(tx, btgRemessaId, { ...contextoCanonico, amount: origem.amount });
      await tx.insert(btgCobrancasEmitidas).values({
        btgIntegracaoId: integracao.id,
        btgContaRecebedoraId: accountRow.conta.id,
        btgRemessaId: btgRemessaId ?? null,
        condominioId: origem.condominioId,
        origemTipo,
        origemId: parcelaId,
        revisao: 1,
        instrumento: "bolepix",
        externalId,
        idempotencyKey,
        status: "reservada",
        amount: origem.amount,
        dueDate: origem.dueDate,
        agenciaRecebedora: accountRow.conta.agencia,
        contaRecebedora: accountRow.conta.numero,
        documentoBeneficiario: accountRow.conta.documentoBeneficiario,
        nomeBeneficiario: accountRow.conta.nomeBeneficiario,
        createdAt: now,
        updatedAt: now,
      });
      const row = await findExisting(tx, atual.id, origemTipo, parcelaId);
      if (!row) throw new BtgV2ConfigurationError("Não foi possível reservar a emissão BolePix.");
      validarRegistroCanonicoBtgV2(row, contextoCanonico);
      // Nenhuma mudança de numeração, origem, snapshots ou campos bancários legados.
      // Falha em qualquer etapa desta transação desfaz reserva e canal juntos.
      await tx.update(parcelasAcordo).set({ canalBancario: "api_btg_v2" }).where(eq(parcelasAcordo.id, parcelaId));
      return { row, jaExistia: false };
    });
  } catch (error) {
    if (recuperacao || !isDuplicate(error)) throw error;
    const existingAfterRace = await findExisting(db, integracao.id, origemTipo, parcelaId);
    if (existingAfterRace) {
      validarRegistroCanonicoBtgV2(existingAfterRace, contextoCanonico);
      return toResult(existingAfterRace, true);
    }
    throw error;
  }

  if (reservada.jaExistia) return toResult(reservada.row, true);
  const reserva = reservada.row;
  let captura: BtgHttpCaptura | undefined;
  let clienteInvocado = false;
  let envioReivindicado = false;

  try {
    captura = criarCapturaHttpBtg({ db, emissaoId: reserva.id, usuarioId: input.usuarioId! });

    // Nova leitura antes do POST: o runtime pode ter mudado durante a reserva.
    // Se invalidada, a reserva permanece e nunca gera um retry bancário automático.
    const antesDoEnvio = await validarContaVinculadaAtualBtgV2({ db, condominioId: origem.condominioId, paraEmissao: true });
    if (antesDoEnvio.integracao.id !== integracao.id || antesDoEnvio.accountRow.conta.id !== accountRow.conta.id ||
        antesDoEnvio.accountRow.conta.agencia !== reserva.agenciaRecebedora || antesDoEnvio.accountRow.conta.numero !== reserva.contaRecebedora ||
        antesDoEnvio.accountRow.conta.documentoBeneficiario !== reserva.documentoBeneficiario || antesDoEnvio.accountRow.conta.nomeBeneficiario !== reserva.nomeBeneficiario) {
      throw new BtgV2ConfigurationError("A conta recebedora foi alterada depois da reserva; nenhum envio foi realizado. Revise a emissão reservada.");
    }

    await db.transaction(async tx => {
      const atual = await bloquearIntegracaoBtg(tx, getBtgV2ServerConfig());
      if (atual.id !== integracao.id || atual.emissaoHabilitada !== 1) throw new BtgV2ConfigurationError("A integração foi alterada depois da reserva; revise a emissão reservada.");
      const [vinculada] = await tx.select({ vinculoAtivo: btgContaRecebedoraCondominios.ativo, conta: btgContasRecebedoras })
        .from(btgContaRecebedoraCondominios)
        .innerJoin(btgContasRecebedoras, eq(btgContasRecebedoras.id, btgContaRecebedoraCondominios.btgContaRecebedoraId))
        .where(and(eq(btgContaRecebedoraCondominios.btgIntegracaoId, atual.id), eq(btgContaRecebedoraCondominios.condominioId, origem.condominioId)))
        .limit(1).for("update");
      if (!vinculada || vinculada.vinculoAtivo !== 1 || vinculada.conta.id !== accountRow.conta.id ||
          vinculada.conta.agencia !== reserva.agenciaRecebedora || vinculada.conta.numero !== reserva.contaRecebedora ||
          vinculada.conta.documentoBeneficiario !== reserva.documentoBeneficiario || vinculada.conta.nomeBeneficiario !== reserva.nomeBeneficiario) {
        throw new BtgV2ConfigurationError("A conta recebedora foi alterada depois da reserva; revise a emissão reservada.");
      }
      validarContaRecebedoraParaAmbiente({ conta: vinculada.conta, integracao: atual, serverConfig: getBtgV2ServerConfig() });
      const [bloqueada] = await bloquearParcelasParaCanal(tx, [parcelaId], origem.condominioId);
      if (!bloqueada || bloqueada.condominioId !== origem.condominioId) throw new BtgV2ConfigurationError("O condomínio da parcela foi alterado depois da reserva.");
      validarAcordoAtivoBtgV2(bloqueada.acordoStatus);
      validarParcelaPreparadaBtgV2(bloqueada.parcela, parcela);
      if (bloqueada.parcela.canalBancario !== "api_btg_v2") throw new BtgV2ConfigurationError("O canal da parcela foi alterado depois da reserva; revise a emissão reservada.");
      // CNAB/legado nunca são ignorados. Revisões anteriores exigem decisão explícita abaixo.
      const estado = avaliarElegibilidadeParcelaAcordoBtgV2({ ...bloqueada.parcela, canalBancario: null, btgEmissaoV2Existente: false });
      if (!estado.elegivel) throw new BtgV2ConfigurationError(`A parcela foi alterada depois da reserva: ${estado.motivo?.toLowerCase()}.`);
      const [acordoAtual] = await tx.select().from(acordos).where(eq(acordos.id, acordo.id)).limit(1);
      const [pagadorAtual] = await tx.select().from(devedores).where(eq(devedores.id, origem.devedorId)).limit(1).for("update");
      if (!acordoAtual || acordoAtual.devedorId !== origem.devedorId || !pagadorAtual || pagadorAtual.condominioId !== origem.condominioId ||
          ["name", "cpfCnpj", "email", "phone", "address", "addressNumber", "addressComplement", "neighborhood", "city", "state", "zipCode", "unitNumber"].some(
            key => pagadorAtual[key as keyof typeof pagadorAtual] !== devedor[key as keyof typeof devedor])) {
        throw new BtgV2ConfigurationError("O pagador da cobrança foi alterado depois da reserva; revise a emissão reservada.");
      }
      await validarContextoRemessaBtgV2(tx, btgRemessaId, contextoRemessa);
      const canonica = recuperacao
        ? await validarRecuperacaoReservadaBtgV2(tx, recuperacao, { parcela: bloqueada.parcela, acordo: acordoAtual, devedor: pagadorAtual, integracao: atual, conta: vinculada.conta })
        : await findExisting(tx, integracao.id, origemTipo, parcelaId);
      if (!canonica || canonica.id !== reserva.id || canonica.status !== "reservada") throw new BtgV2ConfigurationError("O estado da reserva foi alterado; nenhum novo envio foi realizado.");
      validarRegistroCanonicoBtgV2(canonica, contextoCanonico);
      if (canonica.amount !== origem.amount || canonica.dueDate.getTime() !== origem.dueDate.getTime() ||
          canonica.agenciaRecebedora !== reserva.agenciaRecebedora || canonica.contaRecebedora !== reserva.contaRecebedora ||
          canonica.documentoBeneficiario !== reserva.documentoBeneficiario || canonica.nomeBeneficiario !== reserva.nomeBeneficiario) {
        throw new BtgV2ConfigurationError("Os dados da reserva canônica foram alterados; nenhum novo envio foi realizado.");
      }
      const outrasEmissoes = await tx.select({ id: btgCobrancasEmitidas.id }).from(btgCobrancasEmitidas)
        .where(and(eq(btgCobrancasEmitidas.origemTipo, origemTipo), eq(btgCobrancasEmitidas.origemId, parcelaId)));
      if (!recuperacao && outrasEmissoes.some(row => row.id !== reserva.id)) throw new BtgV2ConfigurationError("Outra emissão foi identificada depois da reserva; nenhum novo envio foi realizado.");
      await tx.update(btgCobrancasEmitidas).set({ status: "enviando", updatedAt: new Date() })
        .where(and(eq(btgCobrancasEmitidas.id, reserva.id), eq(btgCobrancasEmitidas.status, "reservada")));
    });
    envioReivindicado = true;

    const payload = montarPayloadBolePixV2({
      amountCentavos: origem.amount,
      dueDate: origem.dueDate,
      overDueDate: calcularDataLimiteBtgV2(origem.dueDate, integracao.diasLimitePagamento),
      description: integracao.instrucoes?.trim() || origem.description,
      externalId,
      documentNumber: gerarDocumentoParcelaBtgV2(parcelaId, reserva.revisao),
      correlationId: `btgv2-${reserva.id}`,
      account: { agencia: accountRow.conta.agencia, numero: accountRow.conta.numero },
      payer: {
        name: devedor.name?.trim() || `Unidade ${devedor.unitNumber}`,
        document: devedor.cpfCnpj ?? "",
        email: devedor.email,
        phone: devedor.phone,
        address: {
          street: devedor.address,
          number: devedor.addressNumber,
          complement: devedor.addressComplement,
          neighborhood: devedor.neighborhood,
          city: devedor.city,
          state: devedor.state,
          zipCode: devedor.zipCode,
        },
      },
    });
    clienteInvocado = true;
    const resposta = await criarBolePixBtgV2(payload, undefined, captura);
    const emittedAt = new Date();
    await db.update(btgCobrancasEmitidas).set({
      btgCollectionId: resposta.collectionId,
      status: resposta.status === "PAID" ? "paga" : "emitida",
      bankSlipUrl: resposta.bankSlipUrl,
      pixQrCode: resposta.pixQrCode,
      pixCopiaECola: resposta.pixCopiaECola,
      codigoBarras: resposta.codigoBarras,
      linhaDigitavel: resposta.linhaDigitavel,
      nossoNumero: resposta.nossoNumero,
      erroCodigo: null,
      emitidaEm: emittedAt,
      updatedAt: emittedAt,
    }).where(eq(btgCobrancasEmitidas.id, reserva.id));
    const [emitted] = await db.select().from(btgCobrancasEmitidas).where(eq(btgCobrancasEmitidas.id, reserva.id)).limit(1);
    if (!emitted) throw new BtgV2ConfigurationError("A emissão foi concluída sem registro local.");
    return { ...toResult(emitted, false), ...(captura.id ? { capturaId: captura.id } : {}) };
  } catch (error) {
    const contexto = obterCapturaHttpErroBtg(error);
    // Em defeito desconhecido do cliente, assumir envio evita qualquer retry inseguro.
    const envioIniciado = contexto?.envioIniciado ?? clienteInvocado;
    const seguro = error instanceof BtgV2ConfigurationError ? error
      : !envioIniciado && error instanceof BtgV2BolePixError
        ? new BtgV2ConfigurationError(error.message)
        : new BtgV2ConfigurationError(envioIniciado
          ? "A emissão BolePix ficou sem confirmação local; revise a emissão incerta, sem reenviar."
          : "Não foi possível preparar a emissão BolePix; nenhum envio foi realizado e a reserva foi preservada.");
    vincularEmissaoErroBtg(seguro, {
      emissaoId: reserva.id, capturaId: contexto?.capturaId ?? captura?.id ?? null,
      parcelaId, btgRemessaId: btgRemessaId ?? null,
      btgIntegracaoId: integracao.id, condominioId: origem.condominioId, btgContaRecebedoraId: accountRow.conta.id,
    });
    try {
      await db.update(btgCobrancasEmitidas)
        .set({ status: envioIniciado ? "incerta" : "reservada", erroCodigo: envioIniciado ? "EMISSAO_SEM_CONFIRMACAO" : "FALHA_ANTES_POST_COMPROVADA",
          ...(!envioIniciado ? { falhaAntesEnvioEm: new Date() } : {}), updatedAt: new Date() })
        .where(and(eq(btgCobrancasEmitidas.id, reserva.id), inArray(btgCobrancasEmitidas.status, envioReivindicado ? ["enviando", "reservada"] : ["reservada"])));
    } catch { /* Falha local não apaga vínculo, não libera o canal e não repete POST. */ }
    throw seguro;
  }
}

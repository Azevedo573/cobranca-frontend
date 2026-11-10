import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { acordos, auditLogs, cnabConfigGlobal, condominios, devedores, parcelasAcordo, remessasCNAB, type ParcelaAcordo } from "../drizzle/schema";
import { avaliarElegibilidadeCanalParcela, type CanalEnvioBancario } from "../shared/btg-canais";
import { bloquearParcelasParaCanal, idsComEmissaoV2 } from "./btg-canais";
import { getDb } from "./db";
import type { TrpcContext } from "./_core/context";
import { assertCondominioAccess, getCondominiosAtivosDoUsuario, type TenantActor } from "./tenant-guard";
import { cnabGlobalParaDadosBanco, gerarNomeArquivoRemessaGlobal } from "./db-cnab-config-global";
import { getConfiguracaoBoleto } from "./db-configuracao-boleto";
import { gerarArquivoRemessaCNAB240, type TituloRemessa } from "./db-cnab";
import { formatarEnderecoSacado, validarEnderecoSacadoParaCNAB } from "./endereco-sacado";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type ParcelaBloqueada = Awaited<ReturnType<typeof bloquearParcelasParaCanal>>[number];

export function validarIdsEncaminhamento(ids: number[]): number[] {
  if (!ids.length || ids.some(id => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Informe parcelas válidas e sem duplicidade." });
  }
  return [...ids].sort((a, b) => a - b);
}

async function validarSelecao(ctx: TrpcContext, ids: number[], rows: ParcelaBloqueada[], canal: CanalEnvioBancario, condominioId?: number) {
  if (rows.length !== ids.length || rows.some(r => !ids.includes(r.parcela.id))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Uma ou mais parcelas não foram encontradas no condomínio selecionado." });
  }
  const condominiosSelecionados = new Set(rows.map(r => r.condominioId));
  if (condominiosSelecionados.size !== 1 || (condominioId !== undefined && !condominiosSelecionados.has(condominioId))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cada lote deve conter parcelas de um único condomínio." });
  }
  const condId = rows[0].condominioId;
  await assertCondominioAccess(ctx.user!, condId);
  for (const row of rows) {
    if (row.acordoStatus !== "ativo") throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Acordo da parcela ${row.parcela.id} não está ativo.` });
    const elegibilidade = avaliarElegibilidadeCanalParcela({ ...row.parcela, btgEmissaoV2Existente: row.emissaoV2Existente }, canal);
    if (!elegibilidade.elegivel) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Parcela ${row.parcela.id}: ${elegibilidade.motivo}` });
  }
  return condId;
}

async function auditar(tx: Tx, ctx: TrpcContext, condominioId: number, evento: string, ids: number[], metadata: Record<string, unknown> = {}) {
  // Auditoria estrita na mesma transação; não incluir documento, credenciais ou conteúdo Pix.
  await tx.insert(auditLogs).values({
    userId: ctx.user!.id, userName: ctx.user!.name, userRole: ctx.user!.role,
    action: evento === "cnab_gerado" ? "generate_remessa" : "update", entity: "parcela",
    condominioId, metadata: JSON.stringify({ evento, parcelaIds: ids, ...metadata }), severity: "warning",
  });
}

/** Reserva persistente ANTES do POST legado. Nunca liberar automaticamente em erro/timeout. */
export async function reservarParcelaParaEmissorLegado(ctx: TrpcContext, parcelaEsperada: ParcelaAcordo, condominioId: number): Promise<ParcelaAcordo> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
  const ids = validarIdsEncaminhamento([parcelaEsperada.id]);
  return db.transaction(async tx => {
    const rows = await bloquearParcelasParaCanal(tx, ids, condominioId);
    await validarSelecao(ctx, ids, rows, "legado", condominioId);
    const atual = rows[0].parcela;
    if (atual.acordoId !== parcelaEsperada.acordoId || atual.amount !== parcelaEsperada.amount ||
        new Date(atual.dueDate).getTime() !== new Date(parcelaEsperada.dueDate).getTime()) {
      throw new TRPCError({ code: "CONFLICT", message: "A parcela mudou durante a revisão. Revise novamente antes de emitir." });
    }
    await tx.update(parcelasAcordo).set({ canalBancario: "legado" }).where(eq(parcelasAcordo.id, atual.id));
    await auditar(tx, ctx, condominioId, "legado_reservado", ids, { canal: "legado" });
    return { ...atual, canalBancario: "legado" };
  });
}

/** Filas usam a mesma política, com todos os vínculos e emissões em quaisquer integrações. */
export async function enriquecerFilaCnab<T extends { parcelaId: number }>(db: Db, rows: T[]) {
  if (!rows.length) return [] as (T & { nossoNumeroOrigem: ParcelaAcordo["nossoNumeroOrigem"]; canalBancario: ParcelaAcordo["canalBancario"]; elegivelCnab: boolean; motivoBloqueioCnab: string | null; codigoBloqueioCnab: string | null; confirmarReservaDisponivel: boolean })[];
  const ids = rows.map(r => r.parcelaId);
  const atuais = await db.select({ parcela: parcelasAcordo, acordoStatus: acordos.status }).from(parcelasAcordo)
    .innerJoin(acordos, eq(parcelasAcordo.acordoId, acordos.id)).where(inArray(parcelasAcordo.id, ids));
  const emitidas = await idsComEmissaoV2(db, ids);
  return rows.map(row => {
    const atual = atuais.find(r => r.parcela.id === row.parcelaId);
    const politica = atual ? avaliarElegibilidadeCanalParcela({ ...atual.parcela, btgEmissaoV2Existente: emitidas.has(row.parcelaId) }, "cnab240") : null;
    const ativo = atual?.acordoStatus === "ativo";
    return { ...row, nossoNumeroOrigem: atual?.parcela.nossoNumeroOrigem ?? null, canalBancario: atual?.parcela.canalBancario ?? null,
      elegivelCnab: ativo && politica?.elegivel === true,
      motivoBloqueioCnab: !ativo ? "Acordo não está ativo" : politica?.motivo ?? null,
      codigoBloqueioCnab: !ativo ? "acordo_inativo" : politica?.codigo ?? null,
      confirmarReservaDisponivel: ativo && politica?.confirmarReservaDisponivel === true };
  });
}

export async function condominiosPermitidosFilaCnab(actor: TenantActor): Promise<number[] | undefined> {
  // Somente admin conserva visão global. Perfis locais utilizam toda sua carteira ativa.
  const carteira = await (await import("./escopo-explicito")).getCarteiraExplicita(actor);
  if (carteira) {
    if (!carteira.ids.length) throw new TRPCError({ code: "FORBIDDEN", message: "Nenhum condomínio ativo autorizado." });
    return carteira.ids;
  }
  return actor.role === "admin" ? undefined : getCondominiosAtivosDoUsuario(actor);
}

/**
 * Reserva o lote inteiro atomicamente e só depois gera o arquivo. Falhas em geração,
 * upload ou vinculação NÃO removem o canal; conciliação/revisão deve decidir seu destino.
 * Layout/cálculos existentes são reutilizados, inclusive a apresentação global legada.
 */
export async function gerarRemessaAcordosCnab(ctx: TrpcContext, parcelaIds: number[], condominioId?: number) {
  const ids = validarIdsEncaminhamento(parcelaIds);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
  const global = condominioId === undefined;
  const reserva = await db.transaction(async tx => {
    const rows = await bloquearParcelasParaCanal(tx, ids, condominioId);
    const condId = await validarSelecao(ctx, ids, rows, "cnab240", condominioId);
    // Sequencial global protegido na MESMA transação da reserva das parcelas.
    const [config] = await tx.select().from(cnabConfigGlobal).where(eq(cnabConfigGlobal.id, 1)).for("update");
    if (!config) throw new TRPCError({ code: "BAD_REQUEST", message: "Configure o portador bancário global em Banco > Configuração CNAB 240 antes de gerar remessa." });
    const boleto = await getConfiguracaoBoleto(condId);
    const [cond] = await tx.select().from(condominios).where(eq(condominios.id, condId)).limit(1);
    if (!cond) throw new TRPCError({ code: "NOT_FOUND", message: "Condomínio não encontrado." });
    const dadosBanco = cnabGlobalParaDadosBanco(config, boleto?.nomeBeneficiario || cond.name || "CONDOMINIO", boleto?.cnpjBeneficiario || "");
    const documento = dadosBanco.cnpjCedente?.replace(/[.\-\/]/g, "").trim();
    if (!documento || documento === "00000000000000" || documento.length < 11) throw new TRPCError({ code: "BAD_REQUEST", message: "CNPJ/CPF do beneficiário não configurado. Acesse Banco > Configuração de Boleto, aba Dados do Beneficiário." });
    const sacados = await tx.select({ acordoId: acordos.id, devedor: devedores }).from(acordos)
      .innerJoin(devedores, eq(acordos.devedorId, devedores.id)).where(inArray(acordos.id, rows.map(r => r.parcela.acordoId)));
    let numerosNovos = 0;
    const parcelas = rows.map(r => ({ ...r.parcela, nossoNumero: r.parcela.nossoNumero || String(config.nossoNumeroAtual + numerosNovos++).padStart(10, "0") }));
    const hoje = new Date();
    const titulos: TituloRemessa[] = parcelas.map(p => {
      const sacado = sacados.find(s => s.acordoId === p.acordoId)?.devedor;
      if (!sacado || sacado.condominioId !== condId) throw new TRPCError({ code: "NOT_FOUND", message: "Devedor não encontrado no condomínio do acordo." });
      const endereco = global ? { endereco: "", cidade: "", uf: "", cep: "" } : formatarEnderecoSacado(sacado);
      if (!global) {
        try { validarEnderecoSacadoParaCNAB(endereco); }
        catch (error) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Endereço do devedor inválido." }); }
      }
      const raw = p.dueDate;
      const iso = raw instanceof Date ? raw.toISOString() : String(raw);
      const [y, m, d] = iso.substring(0, 10).split("-").map(Number);
      return { cobrancaId: p.id, nossoNumero: p.nossoNumero, devedorNome: sacado.name || "NAO INFORMADO", devedorCpfCnpj: sacado.cpfCnpj || "",
        devedorEndereco: endereco.endereco, devedorCidade: endereco.cidade, devedorUF: endereco.uf, devedorCEP: endereco.cep,
        valorNominal: Math.round(Number(p.amount)), dataVencimento: new Date(y, m - 1, d), dataEmissao: hoje,
        instrucao1: (config.instrucoesCaixa || "").replace("#MULTA#", config.taxaMulta + "%").replace("#JUROS#", config.taxaJurosDia + "% ao dia"),
        instrucao2: config.localPagamento || "PAGAVEL EM QUALQUER BANCO ATE O VENCIMENTO",
        taxaJurosDia: Math.round(parseFloat(config.taxaJurosDia) * 100), taxaMulta: Math.round(parseFloat(config.taxaMulta) * 100),
        carteira: config.carteira || "1", especieDocumento: config.especieDocumento || "01", aceite: config.aceite || "N", enviarProtesto: config.enviarInstrucoesProtesto === 1 };
    });
    // Toda a seleção/dados foi validada antes da primeira escrita.
    for (const p of parcelas) {
      const original = rows.find(r => r.parcela.id === p.id)!.parcela;
      await tx.update(parcelasAcordo).set({ canalBancario: "cnab240", ...(!original.nossoNumero ? { nossoNumero: p.nossoNumero, nossoNumeroOrigem: "reserva_local" as const } : {}) }).where(eq(parcelasAcordo.id, p.id));
    }
    await tx.update(cnabConfigGlobal).set({ numeroSequencialArquivo: config.numeroSequencialArquivo + 1, nossoNumeroAtual: config.nossoNumeroAtual + numerosNovos }).where(eq(cnabConfigGlobal.id, config.id));
    await auditar(tx, ctx, condId, "cnab_reservado", ids, { canal: "cnab240", numeroRemessa: config.numeroSequencialArquivo });
    return { condId, config, dadosBanco, titulos, parcelas };
  });

  const { config, dadosBanco, titulos, condId, parcelas } = reserva;
  const nomeArquivo = gerarNomeArquivoRemessaGlobal(config.padraoNomeArquivo || "REMESSA_ddmmyyyy.rem", new Date());
  const conteudo = gerarArquivoRemessaCNAB240(dadosBanco, titulos, config.numeroSequencialArquivo);
  let urlArquivo: string | undefined;
  try {
    const { storagePut } = await import("./storage");
    const fileKey = `remessas-cnab/${condId}/${global ? "global" : "acordos"}-${Date.now()}-${nomeArquivo}`;
    urlArquivo = (await storagePut(fileKey, Buffer.from(conteudo, "utf-8"), "text/plain")).url;
  } catch (error) { console.error("[CNAB] Falha ao salvar arquivo; reserva de canal preservada", error); }

  // Evidência imutável fora da transação de vínculo: se o vínculo/auditoria final
  // falhar, a reserva anterior e a identificação do arquivo continuam disponíveis.
  await db.transaction(tx => auditar(tx, ctx, condId, "cnab_arquivo_gerado", ids, {
    canal: "cnab240", nomeArquivo, numeroRemessa: config.numeroSequencialArquivo,
    arquivoSha256: createHash("sha256").update(conteudo).digest("hex"),
    urlArquivo: urlArquivo ?? null, enviadoAoBanco: false,
  }));
  const remessaId = await db.transaction(async tx => {
    const atuais = await bloquearParcelasParaCanal(tx, ids, condId);
    if (atuais.length !== parcelas.length || atuais.some(r => {
      const anterior = parcelas.find(p => p.id === r.parcela.id);
      // Ignorar somente a NOSSA marca de canal para avaliar os demais impedimentos atuais.
      const politica = avaliarElegibilidadeCanalParcela({ ...r.parcela, canalBancario: null, btgEmissaoV2Existente: r.emissaoV2Existente }, "cnab240");
      return !anterior || r.acordoStatus !== "ativo" || r.parcela.canalBancario !== "cnab240" || !politica.elegivel ||
        r.parcela.acordoId !== anterior.acordoId || r.parcela.nossoNumero !== anterior.nossoNumero ||
        r.parcela.amount !== anterior.amount || new Date(r.parcela.dueDate).getTime() !== new Date(anterior.dueDate).getTime();
    })) {
      throw new TRPCError({ code: "CONFLICT", message: "A reserva CNAB mudou durante a geração. Reserva preservada para revisão." });
    }
    const [result] = await tx.insert(remessasCNAB).values({ condominioId: condId, usuarioId: ctx.user!.id, banco: dadosBanco.codigoBanco,
      nomeArquivo, urlArquivo, totalTitulos: titulos.length, nossoNumeroInicio: parcelas[0].nossoNumero, nossoNumeroFim: parcelas[parcelas.length - 1].nossoNumero });
    const id = Number(result.insertId);
    if (!id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao obter ID da remessa. Reserva preservada." });
    await tx.update(parcelasAcordo).set({ statusRemessa: "remessa_gerada", remessaId: id, nossoNumeroOrigem: "legado" })
      .where(and(inArray(parcelasAcordo.id, ids), eq(parcelasAcordo.canalBancario, "cnab240")));
    await auditar(tx, ctx, condId, "cnab_gerado", ids, { canal: "cnab240", remessaId: id, arquivoGerado: true, enviadoAoBanco: false });
    return id;
  });
  return { nomeArquivo, conteudo, totalParcelas: titulos.length, remessaId };
}

/** PDF local é reapresentação CNAB, nunca uma nova emissão a partir de uma reserva livre ou API. */
export async function validarReapresentacaoBoletoCnab(ctx: TrpcContext, ids: number[], condominioId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
  return db.transaction(async tx => {
    const rows = await bloquearParcelasParaCanal(tx, validarIdsEncaminhamento(ids), condominioId);
    if (rows.length !== ids.length) throw new TRPCError({ code: "NOT_FOUND", message: "Parcela não encontrada." });
    await assertCondominioAccess(ctx.user!, condominioId);
    for (const row of rows) {
      const p = row.parcela;
      const evidenciaCnab = (p.remessaId != null && ["remessa_gerada", "enviado", "retorno_recebido"].includes(p.statusRemessa || "")) || Boolean(p.pixCopiaCola?.trim());
      if (row.emissaoV2Existente || p.canalBancario === "api_btg_v2" || p.canalBancario === "legado" ||
          p.btgCollectionId || p.btgBankSlipUrl || p.btgPixQrCode || p.btgPixCopiaECola || p.btgStatus || p.btgEmitidoEm ||
          !p.nossoNumero || !evidenciaCnab) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Parcela ${p.id}: boleto local exige remessa CNAB já gerada; use o resultado canônico para boletos API.` });
      }
    }
  });
}

import { and, eq } from "drizzle-orm";
import { auditLogs, btgCobrancasEmitidas } from "../../drizzle/schema";
import {
  consultarSituacaoRecuperacaoBtg,
  type BtgCobrancaRecuperacao,
} from "./reenvio-consulta";
import {
  carregarTituloBtg,
  erroTituloBtg,
  type ContextoTituloBtg,
} from "./titulo-contexto";
import { validarDadosBancariosBtg, validarPixBtg } from "./boleto-bancario";
import { projetarBoletoBtg } from "./boleto-projecao";

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;
function corresponder(c: ContextoTituloBtg, r: BtgCobrancaRecuperacao) {
  const e = c.emissao;
  if (!e || !c.identidadeValida) return false;
  return (
    r.collectionId === e.btgCollectionId &&
    r.correlationId === `btgv2-${e.id}` &&
    r.type === "BANKSLIP_QRCODE" &&
    r.valorCentavos === e.amount &&
    r.dueDate === e.dueDate.toISOString().slice(0, 10) &&
    r.agencia === e.agenciaRecebedora &&
    r.conta === e.contaRecebedora &&
    r.documentoBeneficiario === e.documentoBeneficiario &&
    (r.externalId === e.externalId ||
      r.documentNumber === `PA${e.origemId}R${e.revisao}`) &&
    (!r.externalId || r.externalId === e.externalId) &&
    (!r.documentNumber || r.documentNumber === `PA${e.origemId}R${e.revisao}`)
  );
}
export async function consultarDadosBoletoBtg(input: {
  db: Db;
  usuarioId: number;
  parcelaId: number;
}) {
  const inicial = await input.db.transaction(tx =>
    carregarTituloBtg(tx, input.usuarioId, input.parcelaId)
  );
  if (
    !inicial.emissao ||
    !inicial.identidadeValida ||
    !inicial.emissao.btgCollectionId
  )
    throw erroTituloBtg();
  const consulta = await consultarSituacaoRecuperacaoBtg({
    collectionId: inicial.emissao.btgCollectionId,
    correlationId: `btgv2-${inicial.emissao.id}`,
  });
  if (!consulta.completa || consulta.cobrancas.length !== 1)
    throw erroTituloBtg();
  return input.db.transaction(async tx => {
    await tx
      .select()
      .from(btgCobrancasEmitidas)
      .where(eq(btgCobrancasEmitidas.id, inicial.emissao!.id))
      .limit(1)
      .for("update");
    const c = await carregarTituloBtg(tx, input.usuarioId, input.parcelaId),
      r = consulta.cobrancas[0];
    if (c.emissao?.id !== inicial.emissao!.id || !corresponder(c, r))
      throw erroTituloBtg();
    const e = c.emissao!;
    const values: Partial<typeof btgCobrancasEmitidas.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (r.status === "PAID" || r.pagamentoDetectado)
      values.erroCodigo = "PAGAMENTO_REQUER_CONCILIACAO";
    else if (
      ["CANCELED", "CANCELING", "CANCEL_FAILED", "FAILED"].includes(
        r.status ?? ""
      )
    )
      values.erroCodigo = "DOC_TITULO_INDISPONIVEL";
    else if (
      ["CREATED", "PROCESSING", "OVERDUE"].includes(r.status ?? "") &&
      e.status === "emitida"
    ) {
      // Uma resposta parcial não apaga campos. Dados divergentes não substituem os anteriores.
      for (const key of [
        "codigoBarras",
        "linhaDigitavel",
        "nossoNumero",
        "pixCopiaECola",
      ] as const) {
        const v = r[key];
        if (v) {
          const anterior = e[key];
          if (anterior) {
            const igual =
              key === "linhaDigitavel"
                ? anterior.replace(/[ .]/g, "") === v.replace(/[ .]/g, "")
                : anterior === v;
            if (!igual) throw erroTituloBtg();
          } else values[key] = v;
        }
      }
      const barras = values.codigoBarras ?? e.codigoBarras,
        linha = values.linhaDigitavel ?? e.linhaDigitavel;
      if (barras && linha)
        validarDadosBancariosBtg({
          codigoBarras: barras,
          linhaDigitavel: linha,
          valorCentavos: e.amount,
          vencimento: e.dueDate,
          banco: "208",
        });
      const pix = values.pixCopiaECola ?? e.pixCopiaECola;
      if (pix) validarPixBtg(pix);
      if (e.erroCodigo === "DOC_TITULO_INDISPONIVEL") values.erroCodigo = null;
    } else throw erroTituloBtg();
    await tx
      .update(btgCobrancasEmitidas)
      .set(values)
      .where(
        and(
          eq(btgCobrancasEmitidas.id, e.id),
          eq(btgCobrancasEmitidas.status, e.status)
        )
      );
    await tx
      .insert(auditLogs)
      .values({
        userId: input.usuarioId,
        userRole: "admin",
        action: "config_change",
        entity: "configuracao",
        entityId: `btg-boleto:${e.id}`,
        condominioId: e.condominioId,
        metadata: JSON.stringify({
          evento: "dados_documentais_consultados",
          emissaoId: e.id,
          revisao: e.revisao,
          statusRemoto: r.status,
        }),
        success: 1,
        severity: "info",
        ipAddress: "unknown",
      });
    return projetarBoletoBtg(
      tx,
      await carregarTituloBtg(tx, input.usuarioId, input.parcelaId),
      input.usuarioId
    );
  });
}

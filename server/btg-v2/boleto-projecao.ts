import { validarDadosBancariosBtg, validarPixBtg } from "./boleto-bancario";
import type { BtgTransaction } from "./manual-producao";
import type { ContextoTituloBtg } from "./titulo-contexto";
import { obterSnapshotBoletoBtg } from "./boleto-snapshot";

export async function projetarBoletoBtg(
  tx: BtgTransaction,
  c: ContextoTituloBtg,
  usuarioId: number
) {
  let codigo = c.situacao.codigo,
    mensagem = c.situacao.mensagem;
  let permitido = c.situacao.pagamentoPermitido;
  const e = c.emissao;
  let codigos: ReturnType<typeof validarDadosBancariosBtg> | null = null,
    pix: string | null = null,
    snapshotDisponivel = false;
  if (e && permitido) {
    if (e.codigoBarras && e.linhaDigitavel) {
      try {
        codigos = validarDadosBancariosBtg({
          codigoBarras: e.codigoBarras,
          linhaDigitavel: e.linhaDigitavel,
          valorCentavos: e.amount,
          vencimento: e.dueDate,
          banco: "208",
        });
      } catch {
        codigo = "dados_divergentes";
        mensagem =
          "Códigos bancários inválidos ou divergentes; consulta e revisão necessárias.";
        permitido = false;
      }
    }
    if (permitido && e.pixCopiaECola) {
      try {
        pix = validarPixBtg(e.pixCopiaECola);
      } catch {
        pix = null;
      }
    }
    try {
      snapshotDisponivel = !!(await obterSnapshotBoletoBtg(
        tx,
        e,
        usuarioId,
        false
      ));
    } catch {
      snapshotDisponivel = false;
    }
  }
  const operacao = c.operacoes.find(o =>
    [
      "solicitada",
      "em_confirmacao",
      "recusada",
      "cancelada",
      "conflito_pagamento",
    ].includes(o.estado)
  );
  const pdfDisponivel = !!(
    permitido &&
    codigos &&
    e?.nossoNumero &&
    snapshotDisponivel
  );
  if (permitido && codigos && !snapshotDisponivel) {
    codigo = "snapshot_indisponivel";
    mensagem =
      "Dados de pagamento disponíveis; PDF exige histórico documental comprovado.";
  }
  return {
    parcelaId: c.parcela.id,
    acordoId: c.acordo.id,
    emissaoId: e?.id ?? null,
    revisao: e?.revisao ?? null,
    ambiente: c.integracao?.ambiente ?? null,
    fonte: e
      ? ("btg_api" as const)
      : c.parcela.canalBancario === "cnab240"
        ? ("cnab" as const)
        : ("nao_emitida" as const),
    statusBancario: e?.status ?? null,
    estadoDocumento: pdfDisponivel ? "disponivel" : codigo,
    codigo,
    mensagem,
    pdfDisponivel,
    pagamentoPermitido: permitido,
    linhaDigitavel: permitido ? (codigos?.linhaDigitavel ?? null) : null,
    codigoBarras: permitido ? (codigos?.codigoBarras ?? null) : null,
    pixCopiaECola: permitido ? pix : null,
    nossoNumero: permitido ? (e?.nossoNumero ?? null) : null,
    operacaoCancelamento: operacao
      ? { operacaoId: operacao.chaveOperacao, estado: operacao.estado }
      : null,
    valorCentavos: c.parcela.amount,
    vencimento: c.parcela.dueDate,
  };
}

import type { DadosBoleto } from "../boleto-pdf";
import { montarContextoBoletoAcordo } from "../boleto-acordo";
import {
  montarOrigemDividaAcordo,
  type VinculoOrigemDocumento,
} from "../origem-divida-acordo";
import type { ContextoTituloBtg, ParcelaTituloBtg } from "./titulo-contexto";
import type { SnapshotBoletoBtg } from "./boleto-snapshot-dominio";

/** Não consulta cadastro atual de pagador/conta para preencher dados bancários. */
export function montarDadosPdfBtg(
  c: ContextoTituloBtg,
  s: SnapshotBoletoBtg,
  plano: ParcelaTituloBtg[],
  origem: VinculoOrigemDocumento[],
  codigoBarras: string,
  linhaDigitavel: string,
  pixCopiaCola?: string
): DadosBoleto {
  const e = c.emissao;
  if (
    !e ||
    !c.identidadeValida ||
    !c.situacao.pagamentoPermitido ||
    !e.nossoNumero
  )
    throw new Error(
      "Dados bancários incompletos ou título indisponível para pagamento."
    );
  if (
    s.emissaoId !== e.id ||
    s.revisao !== e.revisao ||
    s.valorCentavos !== e.amount ||
    s.vencimento !== e.dueDate.toISOString().slice(0, 10)
  )
    throw new Error("Snapshot documental incompatível com a emissão.");
  const origemDivida = montarOrigemDividaAcordo(origem, plano);
  const planoCongelado = s.contextoAcordo?.parcelas.map(p => ({
    ...p,
    dueDate: new Date(p.dueDate),
    status:
      plano.find(
        atual =>
          atual.id === p.id &&
          atual.amount === p.amount &&
          atual.dueDate.getTime() === new Date(p.dueDate).getTime()
      )?.status ?? p.status,
  }));
  const contextoAcordo =
    s.contextoAcordo?.acordoId === c.acordo.id && planoCongelado
      ? montarContextoBoletoAcordo({
          acordoId: c.acordo.id,
          valorOrigem:
            origemDivida.totalFechamento ?? origemDivida.principal ?? 0,
          totalNegociado: s.contextoAcordo.totalNegociado,
          parcelaAtualId: c.parcela.id,
          parcelas: planoCongelado,
        })
      : undefined;
  const a = s.pagador.endereco;
  return {
    nomeBeneficiario: s.beneficiario.nome,
    cnpjBeneficiario: s.beneficiario.documento,
    enderecoBeneficiario: "",
    banco: "208",
    nomeBanco: "BTG PACTUAL S/A",
    agencia: s.beneficiario.agencia,
    digitoAgencia: "",
    conta: s.beneficiario.conta,
    digitoConta: "",
    carteira: "",
    convenio: "",
    nossoNumero: e.nossoNumero,
    dataVencimento: e.dueDate,
    dataEmissao: e.emitidaEm ?? e.createdAt,
    valor: e.amount,
    especieDocumento: "DM",
    aceite: "N",
    nomeSacado: s.pagador.nome,
    cpfCnpjSacado: s.pagador.documento,
    enderecoSacado: `${a.rua}, ${a.numero}${a.complemento ? ` — ${a.complemento}` : ""} — ${a.bairro}`,
    cidadeSacado: a.cidade,
    ufSacado: a.uf,
    cepSacado: a.cep,
    credorTitulo: s.contextoAcordo?.credorTitulo,
    localPagamento: "Pagamento conforme título registrado no BTG",
    instrucoes: [
      "Documento Luminus com dados da mesma emissão bancária BTG.",
      "O valor exigível deste documento é exclusivamente o da parcela indicada.",
      ...(!contextoAcordo
        ? [
            "Resumo histórico do acordo indisponível no pedido original; consulte o demonstrativo separado.",
          ]
        : []),
    ],
    seuNumero: s.documentNumber,
    ...(pixCopiaCola ? { pixCopiaCola } : {}),
    contextoAcordo,
    origemDivida,
    ...({
      pagamentoBancario: { origem: "btg_api", codigoBarras, linhaDigitavel },
    } as Pick<DadosBoleto, "pagamentoBancario">),
  };
}

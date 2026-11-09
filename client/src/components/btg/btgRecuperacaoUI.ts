export const CONFIRMACAO_REENVIO_BTG = "REENVIAR PARCELA BTG" as const;
export const CONFIRMACAO_RECUPERACAO_BTG = "RECUPERAR VINCULO BTG" as const;
export const ERRO_ANALISE_BTG =
  "Não foi possível concluir a análise. O estado bancário permanece incerto; revise a autorização e consulte novamente, sem reenviar às cegas.";
export const ERRO_CONFIRMACAO_BTG =
  "Não foi possível confirmar o resultado. Pode ter ocorrido envio ao banco; consulte novamente antes de qualquer nova tentativa. Não haverá repetição automática.";

// Modelos locais de apresentação; não contêm payload, resposta bancária ou dados do pagador.
export type BtgRecuperacaoAlvo = {
  itemId: number;
  parcelaId: number;
  remessaId: number;
  emissaoId: number | null;
};
export type BtgRecuperacaoAnalise = {
  analiseId: string;
  emissaoId: number;
  revisaoAtual: number;
  acao: "bloqueada" | "reenviar" | "recuperar_vinculo";
  codigo: string;
  mensagem: string;
  expiraEm: Date;
  resumo: {
    parcelaId: number;
    acordoId: number;
    installmentNumber: number;
    valorCentavos: number;
    vencimento: Date;
    ambiente: "sandbox" | "producao";
    contaMascara: string;
  };
  novaRevisao: number | null;
};
export type BtgRecuperacaoResultado = {
  acao: string;
  emissaoId: number;
  mensagem: string;
  status: string;
};

type ItemRecuperacao = {
  id: number;
  parcelaAcordoId: number;
  btgCobrancaEmitidaId: number | null;
  resultado: string;
};
const idValido = (id: number) => Number.isSafeInteger(id) && id > 0;

export function alvoRecuperacaoDoItem(
  item: ItemRecuperacao,
  remessaId: number
): BtgRecuperacaoAlvo | null {
  if (
    item.resultado !== "falha" ||
    !idValido(item.id) ||
    !idValido(item.parcelaAcordoId) ||
    !idValido(remessaId)
  )
    return null;
  if (
    item.btgCobrancaEmitidaId !== null &&
    !idValido(item.btgCobrancaEmitidaId)
  )
    return null;
  return {
    itemId: item.id,
    parcelaId: item.parcelaAcordoId,
    remessaId,
    // Somente FK do item. Nunca deduzir a canônica pela sequência, diagnóstico ou parcela.
    emissaoId: item.btgCobrancaEmitidaId,
  };
}

export function inputAnaliseRecuperacao(alvo: BtgRecuperacaoAlvo) {
  // Inclusive em itens antigos sem vínculo, o backend resolve a emissão canônica.
  return { parcelaId: alvo.parcelaId, remessaId: alvo.remessaId };
}

export function literalRecuperacao(acao: BtgRecuperacaoAnalise["acao"]) {
  if (acao === "reenviar") return CONFIRMACAO_REENVIO_BTG;
  if (acao === "recuperar_vinculo") return CONFIRMACAO_RECUPERACAO_BTG;
  return null;
}

export function analiseRecuperacaoExpirada(
  analise: BtgRecuperacaoAnalise,
  agora = Date.now()
) {
  const prazo = new Date(analise.expiraEm).getTime();
  return !Number.isFinite(prazo) || agora >= prazo;
}

export function analiseCorrespondeAoAlvo(
  analise: BtgRecuperacaoAnalise,
  alvo: BtgRecuperacaoAlvo
) {
  return (
    Boolean(analise.analiseId) &&
    idValido(analise.emissaoId) &&
    analise.resumo.parcelaId === alvo.parcelaId &&
    idValido(analise.resumo.acordoId) &&
    Number.isSafeInteger(analise.revisaoAtual) &&
    analise.revisaoAtual >= 1 &&
    Number.isSafeInteger(analise.resumo.installmentNumber) &&
    analise.resumo.installmentNumber >= 0 &&
    Number.isSafeInteger(analise.resumo.valorCentavos) &&
    analise.resumo.valorCentavos > 0 &&
    Number.isFinite(new Date(analise.resumo.vencimento).getTime()) &&
    (analise.resumo.ambiente === "sandbox" ||
      analise.resumo.ambiente === "producao") &&
    Boolean(analise.resumo.contaMascara) &&
    (analise.acao === "bloqueada" ||
      (analise.acao === "recuperar_vinculo" && analise.novaRevisao === null) ||
      (analise.acao === "reenviar" &&
        analise.novaRevisao !== null &&
        Number.isSafeInteger(analise.novaRevisao) &&
        analise.novaRevisao > analise.revisaoAtual))
  );
}

export function podeConfirmarRecuperacaoUI({
  analise,
  alvo,
  confirmacao,
  ciente,
  pendente,
  agora = Date.now(),
}: {
  analise: BtgRecuperacaoAnalise | null;
  alvo: BtgRecuperacaoAlvo;
  confirmacao: string;
  ciente: boolean;
  pendente: boolean;
  agora?: number;
}) {
  if (
    !analise ||
    pendente ||
    !ciente ||
    !analiseCorrespondeAoAlvo(analise, alvo) ||
    analiseRecuperacaoExpirada(analise, agora)
  )
    return false;
  const literal = literalRecuperacao(analise.acao);
  // Literal exato, sem trim, conversão de caixa ou tolerância.
  return literal !== null && confirmacao === literal;
}

export function copiarAnaliseRecuperacao(
  resultado: BtgRecuperacaoAnalise
): BtgRecuperacaoAnalise {
  // Allowlist explícita: propriedades inesperadas nunca chegam ao estado da tela.
  const {
    analiseId,
    emissaoId,
    revisaoAtual,
    acao,
    codigo,
    mensagem,
    expiraEm,
    novaRevisao,
  } = resultado;
  const {
    parcelaId,
    acordoId,
    installmentNumber,
    valorCentavos,
    vencimento,
    ambiente,
    contaMascara,
  } = resultado.resumo;
  return {
    analiseId,
    emissaoId,
    revisaoAtual,
    acao,
    codigo,
    mensagem,
    expiraEm,
    novaRevisao,
    resumo: {
      parcelaId,
      acordoId,
      installmentNumber,
      valorCentavos,
      vencimento,
      ambiente,
      contaMascara,
    },
  };
}

// Reserva síncrona impede dois cliques antes do rerender. Geração rejeita respostas
// após fechar/trocar contexto e respostas de pedidos anteriores. Não é lock financeiro.
export function criarGuardaRecuperacao() {
  let ativa = true;
  let geracao = 0;
  let ocupado = false;
  return {
    iniciar: () => {
      if (!ativa || ocupado) return null;
      ocupado = true;
      return ++geracao;
    },
    aceita: (pedido: number) => ativa && pedido === geracao,
    finalizar: (pedido: number) => {
      if (pedido === geracao) ocupado = false;
    },
    encerrar: () => {
      ativa = false;
      ocupado = false;
      geracao += 1;
    },
    ativar: () => {
      ativa = true;
    },
  };
}

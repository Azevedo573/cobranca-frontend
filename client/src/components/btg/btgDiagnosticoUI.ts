export const CONFIRMACAO_EXPURGO_BTG = "EXPURGAR DIAGNOSTICO BTG" as const;
export const RETENCAO_DIAGNOSTICO_BTG_MS = 30 * 24 * 60 * 60 * 1000;
export const ERRO_DIAGNOSTICO_BTG =
  "Diagnóstico indisponível. O serviço, a autorização, a chave ou o prazo de acesso podem estar indisponíveis. Nenhum conteúdo foi exibido; solicite revisão administrativa.";

// Contrato deliberadamente limitado a metadados: nunca adicionar corpos ou segredos.
export type BtgDiagnosticoMeta = {
  id: number;
  btgCobrancaEmitidaId: number;
  parcelaAcordoId: number;
  estadoCaptura: string;
  httpStatus: number | null;
  payloadBytes: number;
  respostaBytes: number | null;
  respostaCompleta: boolean;
  capturaCriadaEm: Date | string;
  respostaRecebidaEm: Date | string | null;
  conteudoExpurgadoEm: Date | string | null;
  podeVisualizar: boolean;
  podeExpurgar: boolean;
};

export type BtgDiagnosticoConteudo = {
  payload: string;
  resposta: string | null;
  httpStatus: number | null;
  respostaCompleta: boolean;
  estadoCaptura: string;
  respostaLimitada?: boolean;
  payloadUtf8Invalido?: boolean;
  respostaUtf8Invalido?: boolean;
};

export function diagnosticosDaParcela(
  diagnosticos: readonly BtgDiagnosticoMeta[],
  parcelaAcordoId: number
) {
  // O item pode não ter emissão vinculada após uma falha. Não fazer join por emissaoId.
  return diagnosticos.filter(d => d.parcelaAcordoId === parcelaAcordoId);
}

export function finalidadeDiagnosticoValida(finalidade: string) {
  const tamanho = finalidade.trim().length;
  return tamanho >= 10 && tamanho <= 200;
}

export function diagnosticoExpirado(
  diagnostico: Pick<BtgDiagnosticoMeta, "capturaCriadaEm">,
  agora = Date.now()
) {
  const criadaEm = new Date(diagnostico.capturaCriadaEm).getTime();
  return (
    Number.isFinite(criadaEm) && agora >= criadaEm + RETENCAO_DIAGNOSTICO_BTG_MS
  );
}

export function podeVisualizarDiagnosticoUI(
  diagnostico: BtgDiagnosticoMeta,
  agora = Date.now()
) {
  return (
    diagnostico.podeVisualizar &&
    !diagnostico.conteudoExpurgadoEm &&
    !diagnosticoExpirado(diagnostico, agora)
  );
}

export function podeExpurgarDiagnosticoUI(
  diagnostico: BtgDiagnosticoMeta,
  agora = Date.now()
) {
  return (
    diagnostico.podeExpurgar &&
    !diagnostico.conteudoExpurgadoEm &&
    diagnosticoExpirado(diagnostico, agora)
  );
}

export function estadoCapturaRotulo(estado: string) {
  const rotulos: Record<string, string> = {
    preparado: "Preparado · não comprova envio ao banco",
    enviando: "Envio iniciado · recebimento não confirmado",
    resposta_recebida: "Resposta recebida · não comprova emissão",
    resposta_incompleta: "Resposta limitada ou incompleta",
    sem_resposta: "Sem resposta · transporte sem confirmação",
  };
  return rotulos[estado] ?? "Estado de captura não reconhecido";
}

export function situacaoRespostaDiagnostico(
  diagnostico: Pick<
    BtgDiagnosticoMeta,
    "estadoCaptura" | "respostaRecebidaEm" | "respostaCompleta"
  >
) {
  if (diagnostico.estadoCaptura === "resposta_incompleta")
    return "Resposta limitada/incompleta; não representa o retorno integral.";
  if (
    !diagnostico.respostaRecebidaEm ||
    diagnostico.estadoCaptura === "sem_resposta"
  )
    return "Resposta ausente; não há confirmação de recebimento pelo banco.";
  return diagnostico.respostaCompleta
    ? "Resposta completa capturada; não confirma sucesso financeiro."
    : "Resposta limitada/incompleta; não representa o retorno integral.";
}

export function dataDiagnostico(valor: Date | string | null) {
  if (!valor) return "—";
  const date = new Date(valor);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : "—";
}

// Guarda só IDs/geração, nunca plaintext. Fechar/cancelar invalida uma resposta em voo.
export function criarGuardaDiagnostico() {
  let geracao = 0;
  let ativa = true;
  return {
    iniciar: () => ++geracao,
    aceita: (pedido: number) => ativa && pedido === geracao,
    cancelar: () => {
      geracao += 1;
    },
    encerrar: () => {
      ativa = false;
      geracao += 1;
    },
    ativar: () => {
      ativa = true;
    },
  };
}

// Copia apenas os corpos para o estado local e zera o objeto ANTES do cache de mutação.
// Também deve ser chamado para respostas tardias descartadas.
export function retirarConteudoDoResultado<T extends BtgDiagnosticoConteudo>(
  resultado: T
) {
  const conteudo: BtgDiagnosticoConteudo = {
    payload: resultado.payload,
    resposta: resultado.resposta,
    httpStatus: resultado.httpStatus,
    respostaCompleta: resultado.respostaCompleta,
    estadoCaptura: resultado.estadoCaptura,
    respostaLimitada: resultado.respostaLimitada,
    payloadUtf8Invalido: resultado.payloadUtf8Invalido,
    respostaUtf8Invalido: resultado.respostaUtf8Invalido,
  };
  resultado.payload = "";
  resultado.resposta = null;
  return conteudo;
}

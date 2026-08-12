export type DadosPublicacaoTratamento = {
  numeroProcesso?: string | null;
  tipo?: string | null;
  tribunal?: string | null;
  orgao?: string | null;
  data?: string | Date | null;
  texto?: string | null;
};

export function contextoPublicacaoTratamento(pub: DadosPublicacaoTratamento): string {
  const data = pub.data
    ? new Date(typeof pub.data === "string" ? `${pub.data.slice(0, 10)}T12:00:00` : pub.data).toLocaleDateString("pt-BR")
    : "não informada";
  return [
    "Origem: Publicação PJe",
    pub.numeroProcesso ? `Processo: ${pub.numeroProcesso}` : null,
    pub.tribunal ? `Tribunal: ${pub.tribunal}` : null,
    pub.orgao ? `Órgão: ${pub.orgao}` : null,
    pub.tipo ? `Tipo: ${pub.tipo}` : null,
    `Data da publicação: ${data}`,
    pub.texto ? `Conteúdo: ${pub.texto.slice(0, 1800)}` : null,
  ].filter(Boolean).join("\n");
}

export function tituloTratamentoPublicacao(tipo: "prazo" | "audiencia" | "evento" | "historico", pub: DadosPublicacaoTratamento): string {
  const processo = pub.numeroProcesso ? ` — ${pub.numeroProcesso}` : "";
  const tipoPublicacao = pub.tipo ? `: ${pub.tipo}` : "";
  const nomes = { prazo: "Prazo", audiencia: "Audiência", evento: "Evento", historico: "Histórico" };
  return `${nomes[tipo]} originado de publicação PJe${tipoPublicacao}${processo}`;
}

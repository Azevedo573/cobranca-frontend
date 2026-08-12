export type CampoDetalheTJRJ = {
  chave: string;
  rotulo: string;
  valor: string;
};

export function parsePayloadTJRJ(json?: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const payload = JSON.parse(json);
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

function formatarValor(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "string" || typeof valor === "number") return String(valor);
  return null;
}

export function extrairCamposDetalheTJRJ(payload: Record<string, unknown> | null): CampoDetalheTJRJ[] {
  if (!payload) return [];

  const campos: Array<[string, string]> = [
    ["descrMov", "Movimentação"],
    ["descrTipMov", "Tipo da movimentação"],
    ["descrTipAto", "Tipo do ato"],
    ["descrAto", "Ato"],
    ["dtMovimento", "Data da movimentação"],
    ["dtAlt", "Data de atualização"],
    ["dtConclusao", "Data de conclusão"],
    ["dtDevolucao", "Data de devolução"],
    ["dtJuntada", "Data de juntada"],
    ["nomeJuiz", "Juiz"],
    ["nomeDestinatario", "Destinatário"],
    ["prazo", "Prazo"],
    ["ordem", "Ordem TJRJ"],
    ["numeroDocumento", "Número do documento"],
    ["numeroProtocolo", "Número do protocolo"],
    ["indPublicado", "Publicado"],
  ];

  return campos.flatMap(([chave, rotulo]) => {
    const valor = formatarValor(payload[chave]);
    return valor ? [{ chave, rotulo, valor }] : [];
  });
}

export function tituloMovimentacaoTJRJ(json: string | null | undefined, fallback: string): string {
  const payload = parsePayloadTJRJ(json);
  const titulo = formatarValor(payload?.descrMov) ?? formatarValor(payload?.descricao);
  return titulo && titulo.trim() ? titulo : fallback || "Movimentação";
}

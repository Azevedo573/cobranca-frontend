export type ReferenciaDocumentoTJRJ = { id: string; rotulo: string; url: string; codigo: string };

const URL_GED_TJRJ = "https://www3.tjrj.jus.br/gedcacheweb/default.aspx?GEDID=";

export function criarUrlGedTJRJ(codigo: unknown): string | null {
  const valor = String(codigo ?? "").trim();
  return /^[A-Za-z0-9]{12,160}$/.test(valor) ? `${URL_GED_TJRJ}${encodeURIComponent(valor)}` : null;
}

function urlOficialTJRJ(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" && (url.hostname === "www3.tjrj.jus.br" || url.hostname.endsWith(".tjrj.jus.br")) ? url.toString() : null;
  } catch { return null; }
}

/** Extrai apenas referências retornadas pelo payload oficial, sem baixar arquivos externos. */
export function normalizarReferenciasDocumentaisTJRJ(mov: any): ReferenciaDocumentoTJRJ[] {
  const referencias: ReferenciaDocumentoTJRJ[] = [];
  const adicionarCodigo = (codigo: unknown, rotulo: string, id: string) => {
    const url = criarUrlGedTJRJ(codigo);
    if (url) referencias.push({ id, rotulo, url, codigo: String(codigo) });
  };
  const adicionarUrl = (urlOriginal: unknown, rotulo: string, id: string) => {
    const url = urlOficialTJRJ(urlOriginal);
    if (url) referencias.push({ id, rotulo, url, codigo: url });
  };

  adicionarCodigo(mov?.pseudoDocEletronico, "Documento eletrônico", "pseudo-documento");
  for (const [indice, sub] of (Array.isArray(mov?.movimentosExibicao) ? mov.movimentosExibicao : []).entries()) {
    adicionarCodigo(sub?.codDocAtoAssinadoDig, sub?.tipoMovimento ? `Ato assinado — ${sub.tipoMovimento}` : "Ato assinado digitalmente", `ato-${indice}`);
    const documentos = Array.isArray(sub?.docEletronico) ? sub.docEletronico : [];
    documentos.forEach((documento: any, documentoIndice: number) => {
      adicionarCodigo(documento?.codigo ?? documento?.id ?? documento?.gedId, documento?.descricao ?? documento?.nome ?? "Documento eletrônico", `documento-codigo-${indice}-${documentoIndice}`);
      adicionarUrl(documento?.url ?? documento?.urlDocumento ?? documento?.link ?? documento?.href, documento?.descricao ?? documento?.nome ?? "Documento eletrônico", `documento-url-${indice}-${documentoIndice}`);
    });
  }
  return referencias.filter((referencia, indice, lista) => lista.findIndex((item) => item.url === referencia.url) === indice);
}

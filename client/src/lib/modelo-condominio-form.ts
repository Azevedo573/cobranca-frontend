import {
  detectarVariaveisModelo,
  ehVariavelCondominio,
  normalizarChaveModelo,
  escaparTextoDocumento,
  substituirVariaveisTexto,
  type DadosPreenchimentoCondominio,
} from "@shared/modelo-condominio";

export type OrigemCampoModelo = "cadastro" | "manual" | "ausente" | "padrao";
export interface FormularioModelo {
  identidade: string;
  modeloId: number;
  chaves: string[];
  vinculados: string[];
  condominioId: number | null;
  revisao: number;
  status: "selecao" | "carregando" | "pronto" | "erro";
  nomeFonte: string;
  valores: Record<string, string>;
  origens: Record<string, OrigemCampoModelo>;
  editados: string[];
}

export function criarFormularioModelo(
  identidade: string,
  modeloId: number,
  chaves: readonly string[],
  agora = new Date()
): FormularioModelo {
  const presentes = Array.from(new Set(chaves.map(normalizarChaveModelo)));
  const valores = Object.fromEntries(
    presentes.map(chave => [
      chave,
      chave === "dataDocumento" || chave === "dataAtual"
        ? agora.toLocaleDateString("pt-BR")
        : chave === "dataAtualExtenso"
          ? agora.toLocaleDateString("pt-BR", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })
          : "",
    ])
  );
  return {
    identidade,
    modeloId,
    chaves: presentes,
    vinculados: presentes.filter(ehVariavelCondominio),
    condominioId: null,
    revisao: 0,
    status: "selecao",
    nomeFonte: "",
    valores,
    origens: Object.fromEntries(
      presentes.map(chave => [chave, valores[chave] ? "padrao" : "manual"])
    ),
    editados: [],
  };
}

export function editarCampoModelo(
  estado: FormularioModelo,
  chaveOriginal: string,
  valor: string
): FormularioModelo {
  const chave = normalizarChaveModelo(chaveOriginal);
  if (!estado.chaves.includes(chave)) return estado;
  return {
    ...estado,
    valores: { ...estado.valores, [chave]: valor },
    origens: { ...estado.origens, [chave]: "manual" },
    editados: Array.from(new Set([...estado.editados, chave])),
  };
}

export function precisaConfirmarTroca(
  estado: FormularioModelo,
  condominioId: number
): boolean {
  return (
    estado.condominioId !== condominioId &&
    estado.editados.some(chave => estado.vinculados.includes(chave))
  );
}

function limparVinculados(estado: FormularioModelo): FormularioModelo {
  return {
    ...estado,
    nomeFonte: "",
    valores: {
      ...estado.valores,
      ...Object.fromEntries(estado.vinculados.map(chave => [chave, ""])),
    },
    origens: {
      ...estado.origens,
      ...Object.fromEntries(
        estado.vinculados.map(chave => [chave, "ausente" as const])
      ),
    },
    editados: estado.editados.filter(
      chave => !estado.vinculados.includes(chave)
    ),
  };
}

export function selecionarCondominioModelo(
  estado: FormularioModelo,
  condominioId: number
): FormularioModelo {
  if (estado.condominioId === condominioId) return estado;
  return {
    ...limparVinculados(estado),
    condominioId,
    revisao: estado.revisao + 1,
    status: "carregando",
  };
}

export function aplicarDadosCondominioModelo(
  estado: FormularioModelo,
  dados: DadosPreenchimentoCondominio,
  revisao: number,
  identidade: string
): FormularioModelo {
  if (
    estado.status === "erro" ||
    estado.modeloId !== dados.modeloId ||
    estado.condominioId !== dados.condominioId ||
    estado.revisao !== revisao ||
    estado.identidade !== identidade
  )
    return estado;
  const valores = { ...estado.valores };
  const origens = { ...estado.origens };
  for (const chave of estado.vinculados) {
    if (estado.editados.includes(chave)) continue;
    const valor = Object.prototype.hasOwnProperty.call(dados.valores, chave)
      ? dados.valores[chave]
      : "";
    valores[chave] = typeof valor === "string" ? valor : "";
    origens[chave] = valores[chave].trim() ? "cadastro" : "ausente";
  }
  return {
    ...estado,
    nomeFonte: dados.nomeCondominio,
    valores,
    origens,
    status: "pronto",
  };
}

export function falharDadosCondominioModelo(
  estado: FormularioModelo,
  revisao: number
): FormularioModelo {
  if (estado.revisao !== revisao) return estado;
  return { ...limparVinculados(estado), status: "erro" };
}

export function camposPendentesModelo(estado: FormularioModelo): string[] {
  return estado.chaves.filter(chave => !estado.valores[chave]?.trim());
}

/** Mesmo HTML para prévia isolada e impressão. CSP bloqueia scripts inclusive do modelo. */
export function criarHtmlDocumentoModelo(
  nome: string,
  html: string,
  valores: Record<string, string>
): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escaparTextoDocumento(nome)}</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#000;background:#fff;font-size:14px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}a{pointer-events:none}@media print{body{margin:20mm}}</style></head><body>${substituirVariaveisTexto(html, valores)}</body></html>`;
}

export const variaveisPresentesModelo = detectarVariaveisModelo;

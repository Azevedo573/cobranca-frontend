/**
 * Serviço de integração com a API PJe (comunicaapi.pje.jus.br)
 * Busca publicações judiciais por nome de advogado
 */

const PJE_API_BASE = "https://comunicaapi.pje.jus.br/api/v1";

export interface PjeDestinatario {
  nome: string;
  comunicacao_id: number;
  polo: string;
}

export interface PjeAdvogado {
  id: number;
  nome: string;
  numero_oab: string;
  uf_oab: string;
}

export interface PjeDestinatarioAdvogado {
  id: number;
  comunicacao_id: number;
  advogado_id: number;
  advogado: PjeAdvogado;
}

export interface PjeComunicacao {
  id: number;
  data_disponibilizacao: string;
  siglaTribunal: string;
  tipoComunicacao: string;
  nomeOrgao: string;
  idOrgao: number;
  texto: string;
  numero_processo: string;
  meio: string;
  link: string | null;
  tipoDocumento: string;
  nomeClasse: string;
  codigoClasse: string;
  numeroComunicacao: number;
  ativo: boolean;
  hash: string;
  status: string;
  datadisponibilizacao: string;
  meiocompleto: string;
  numeroprocessocommascara: string;
  destinatarios: PjeDestinatario[];
  destinatarioadvogados: PjeDestinatarioAdvogado[];
}

export interface PjeResponse {
  status: string;
  message: string;
  count: number;
  items: PjeComunicacao[];
}

export interface BuscarPublicacoesParams {
  nomeAdvogado: string;
  siglaTribunal?: string;
  dataInicio?: string; // YYYY-MM-DD
  dataFim?: string;    // YYYY-MM-DD
  pagina?: number;
  itensPorPagina?: number;
}

/**
 * Busca publicações na API PJe
 */
export async function buscarPublicacoesPJe(params: BuscarPublicacoesParams): Promise<PjeResponse> {
  const {
    nomeAdvogado,
    siglaTribunal = "TJRJ",
    dataInicio,
    dataFim,
    pagina = 1,
    itensPorPagina = 100,
  } = params;

  const hoje = new Date().toISOString().split("T")[0];
  const inicio = dataInicio || hoje;
  const fim = dataFim || hoje;

  const url = new URL(`${PJE_API_BASE}/comunicacao`);
  url.searchParams.set("pagina", String(pagina));
  url.searchParams.set("itensPorPagina", String(itensPorPagina));
  url.searchParams.set("siglaTribunal", siglaTribunal);
  url.searchParams.set("dataDisponibilizacaoInicio", inicio);
  url.searchParams.set("dataDisponibilizacaoFim", fim);
  url.searchParams.set("nomeAdvogado", nomeAdvogado);

  const response = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "User-Agent": "GomesSilvaAdvogados/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`API PJe retornou status ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<PjeResponse>;
}

/**
 * Busca todas as páginas de publicações para um advogado em um período
 */
export async function buscarTodasPublicacoesPJe(params: BuscarPublicacoesParams): Promise<PjeComunicacao[]> {
  const itensPorPagina = 100;
  let pagina = 1;
  const todos: PjeComunicacao[] = [];

  while (true) {
    const resp = await buscarPublicacoesPJe({ ...params, pagina, itensPorPagina });
    todos.push(...resp.items);

    if (todos.length >= resp.count || resp.items.length < itensPorPagina) {
      break;
    }
    pagina++;
  }

  return todos;
}

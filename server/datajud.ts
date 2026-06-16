/**
 * DataJud — Integração com a API Pública do CNJ
 * Documentação: https://datajud-wiki.cnj.jus.br/api-publica/
 *
 * A chave pública é fornecida pelo CNJ e pode ser alterada a qualquer momento.
 * Fonte: https://datajud-wiki.cnj.jus.br/api-publica/acesso
 */

const DATAJUD_BASE_URL = "https://api-publica.datajud.cnj.jus.br";
const DATAJUD_API_KEY = "APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

// Mapa de tribunais: sigla → alias DataJud
export const TRIBUNAIS_ALIASES: Record<string, string> = {
  // Tribunais Superiores
  STF: "api_publica_stf",
  STJ: "api_publica_stj",
  TST: "api_publica_tst",
  TSE: "api_publica_tse",
  STM: "api_publica_stm",
  // Justiça Federal
  TRF1: "api_publica_trf1",
  TRF2: "api_publica_trf2",
  TRF3: "api_publica_trf3",
  TRF4: "api_publica_trf4",
  TRF5: "api_publica_trf5",
  TRF6: "api_publica_trf6",
  // Justiça Estadual
  TJAC: "api_publica_tjac",
  TJAL: "api_publica_tjal",
  TJAM: "api_publica_tjam",
  TJAP: "api_publica_tjap",
  TJBA: "api_publica_tjba",
  TJCE: "api_publica_tjce",
  TJDF: "api_publica_tjdft",
  TJES: "api_publica_tjes",
  TJGO: "api_publica_tjgo",
  TJMA: "api_publica_tjma",
  TJMG: "api_publica_tjmg",
  TJMS: "api_publica_tjms",
  TJMT: "api_publica_tjmt",
  TJPA: "api_publica_tjpa",
  TJPB: "api_publica_tjpb",
  TJPE: "api_publica_tjpe",
  TJPI: "api_publica_tjpi",
  TJPR: "api_publica_tjpr",
  TJRJ: "api_publica_tjrj",
  TJRN: "api_publica_tjrn",
  TJRO: "api_publica_tjro",
  TJRR: "api_publica_tjrr",
  TJRS: "api_publica_tjrs",
  TJSC: "api_publica_tjsc",
  TJSE: "api_publica_tjse",
  TJSP: "api_publica_tjsp",
  TJTO: "api_publica_tjto",
  // Justiça do Trabalho
  TRT1: "api_publica_trt1",
  TRT2: "api_publica_trt2",
  TRT3: "api_publica_trt3",
  TRT4: "api_publica_trt4",
  TRT5: "api_publica_trt5",
  TRT6: "api_publica_trt6",
  TRT7: "api_publica_trt7",
  TRT8: "api_publica_trt8",
  TRT9: "api_publica_trt9",
  TRT10: "api_publica_trt10",
  TRT11: "api_publica_trt11",
  TRT12: "api_publica_trt12",
  TRT13: "api_publica_trt13",
  TRT14: "api_publica_trt14",
  TRT15: "api_publica_trt15",
  TRT16: "api_publica_trt16",
  TRT17: "api_publica_trt17",
  TRT18: "api_publica_trt18",
  TRT19: "api_publica_trt19",
  TRT20: "api_publica_trt20",
  TRT21: "api_publica_trt21",
  TRT22: "api_publica_trt22",
  TRT23: "api_publica_trt23",
  TRT24: "api_publica_trt24",
};

export interface DataJudMovimento {
  codigo: number;
  nome: string;
  dataHora: string;
  complementosTabelados?: Array<{ codigo: number; valor: number; nome: string; descricao: string }>;
}

export interface DataJudParte {
  nome: string;
  tipo?: string;
  documento?: string;
  advogados?: Array<{ nome: string; documento?: string }>;
}

export interface DataJudProcesso {
  _id: string;
  _source: {
    id: string;
    numeroProcesso: string;
    tribunal: string;
    grau: string;
    dataAjuizamento?: string;
    dataHoraUltimaAtualizacao?: string;
    classe?: { codigo: number; nome: string };
    assuntos?: Array<{ codigo: number; nome: string }>;
    orgaoJulgador?: { codigo: number; nome: string; codigoMunicipioIBGE?: number };
    partes?: DataJudParte[];
    movimentos?: DataJudMovimento[];
    nivelSigilo?: number;
    sistema?: { codigo: number; nome: string };
    formato?: { codigo: number; nome: string };
  };
}

export interface DataJudSearchResult {
  total: number;
  processos: DataJudProcesso[];
  error?: string;
}

/**
 * Busca um processo pelo número CNJ em um tribunal específico.
 * O número CNJ deve ser informado sem formatação (apenas dígitos).
 */
export async function buscarProcessoPorNumero(
  numeroCNJ: string,
  tribunalAlias: string
): Promise<DataJudSearchResult> {
  // Remove formatação do número CNJ (pontos, hífens)
  const numeroLimpo = numeroCNJ.replace(/[.\-]/g, "");

  const url = `${DATAJUD_BASE_URL}/${tribunalAlias}/_search`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: DATAJUD_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          match: {
            numeroProcesso: numeroLimpo,
          },
        },
      }),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!response.ok) {
      return {
        total: 0,
        processos: [],
        error: `DataJud retornou status ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json() as {
      hits?: {
        total?: { value: number };
        hits?: DataJudProcesso[];
      };
    };

    return {
      total: data.hits?.total?.value ?? 0,
      processos: data.hits?.hits ?? [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      total: 0,
      processos: [],
      error: `Erro ao consultar DataJud: ${msg}`,
    };
  }
}

/**
 * Detecta automaticamente o tribunal a partir do número CNJ.
 * O número CNJ tem o formato: NNNNNNN-DD.AAAA.J.TT.OOOO
 * onde J = segmento da justiça e TT = código do tribunal.
 */
export function detectarTribunalPorCNJ(numeroCNJ: string): { tribunal: string; alias: string } | null {
  // Remove formatação
  const limpo = numeroCNJ.replace(/[.\-]/g, "");
  if (limpo.length < 20) return null;

  // Posições 13-14: segmento J (1 dígito) e tribunal TT (2 dígitos)
  // Formato: NNNNNNN DD AAAA J TT OOOO (sem separadores)
  // Índices:  0-6     7-8  9-12 13 14-15 16-19
  const segmento = limpo[13];
  const codigoTribunal = limpo.substring(14, 16);

  const mapa: Record<string, Record<string, string>> = {
    "1": { "00": "STF" },
    "2": { "00": "CNJ" },
    "3": { "00": "STJ" },
    "4": {
      "01": "TRF1", "02": "TRF2", "03": "TRF3",
      "04": "TRF4", "05": "TRF5", "06": "TRF6",
    },
    "5": {
      "01": "TRT1", "02": "TRT2", "03": "TRT3", "04": "TRT4",
      "05": "TRT5", "06": "TRT6", "07": "TRT7", "08": "TRT8",
      "09": "TRT9", "10": "TRT10", "11": "TRT11", "12": "TRT12",
      "13": "TRT13", "14": "TRT14", "15": "TRT15", "16": "TRT16",
      "17": "TRT17", "18": "TRT18", "19": "TRT19", "20": "TRT20",
      "21": "TRT21", "22": "TRT22", "23": "TRT23", "24": "TRT24",
      "00": "TST",
    },
    "6": {
      "01": "TJAC", "02": "TJAL", "03": "TJAP", "04": "TJAM",
      "05": "TJBA", "06": "TJCE", "07": "TJDF", "08": "TJES",
      "09": "TJGO", "10": "TJMA", "11": "TJMT", "12": "TJMS",
      "13": "TJMG", "14": "TJPA", "15": "TJPB", "16": "TJPR",
      "17": "TJPE", "18": "TJPI", "19": "TJRJ", "20": "TJRN",
      "21": "TJRS", "22": "TJRO", "23": "TJRR", "24": "TJSC",
      "25": "TJSE", "26": "TJSP", "27": "TJTO",
    },
    "7": { "00": "TSE" },
    "8": { "00": "STM" },
    "9": { "00": "CJF" },
  };

  const sigla = mapa[segmento]?.[codigoTribunal];
  if (!sigla) return null;

  const alias = TRIBUNAIS_ALIASES[sigla];
  if (!alias) return null;

  return { tribunal: sigla, alias };
}

/**
 * Busca processos pelo nome do advogado (campo partes.nome) em um tribunal específico.
 * Usa match para busca full-text — funciona bem para nomes únicos.
 * Para nomes comuns, combine com filtros adicionais (tribunal, período).
 */
export async function buscarProcessosPorNomeAdvogado(
  nomeAdvogado: string,
  tribunalAlias: string,
  pagina = 0,
  tamanho = 20
): Promise<DataJudSearchResult> {
  const url = `${DATAJUD_BASE_URL}/${tribunalAlias}/_search`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: DATAJUD_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          bool: {
            should: [
              // Busca no nome das partes (inclui advogados representantes)
              { match: { "partes.nome": { query: nomeAdvogado, operator: "and" } } },
              // Busca nos advogados das partes (campo aninhado)
              { match: { "partes.advogados.nome": { query: nomeAdvogado, operator: "and" } } },
            ],
            minimum_should_match: 1,
          },
        },
        from: pagina * tamanho,
        size: tamanho,
        sort: [{ dataAjuizamento: { order: "desc" } }],
        _source: [
          "numeroProcesso", "tribunal", "grau", "dataAjuizamento",
          "dataHoraUltimaAtualizacao", "classe", "assuntos",
          "orgaoJulgador", "partes",
        ],
      }),
      signal: AbortSignal.timeout(20000), // 20s timeout (busca por nome é mais pesada)
    });

    if (!response.ok) {
      return {
        total: 0,
        processos: [],
        error: `DataJud retornou status ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json() as {
      hits?: {
        total?: { value: number };
        hits?: DataJudProcesso[];
      };
    };

    return {
      total: data.hits?.total?.value ?? 0,
      processos: data.hits?.hits ?? [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      total: 0,
      processos: [],
      error: `Erro ao consultar DataJud: ${msg}`,
    };
  }
}

/**
 * Busca processos por nome do advogado em múltiplos tribunais simultaneamente.
 * Retorna resultados consolidados de todos os tribunais informados.
 */
export async function buscarProcessosPorNomeAdvogadoMultiTribunal(
  nomeAdvogado: string,
  tribunaisAliases: string[],
  tamanho = 10
): Promise<{ tribunal: string; resultado: DataJudSearchResult }[]> {
  const resultados = await Promise.allSettled(
    tribunaisAliases.map(async (alias) => ({
      tribunal: alias,
      resultado: await buscarProcessosPorNomeAdvogado(nomeAdvogado, alias, 0, tamanho),
    }))
  );

  return resultados
    .filter((r): r is PromiseFulfilledResult<{ tribunal: string; resultado: DataJudSearchResult }> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((r) => r.resultado.total > 0 || r.resultado.error);
}

/**
 * Lista todos os tribunais disponíveis com suas siglas e aliases.
 */
export function listarTribunais(): Array<{ sigla: string; alias: string; nome: string }> {
  const nomes: Record<string, string> = {
    STF: "Supremo Tribunal Federal",
    STJ: "Superior Tribunal de Justiça",
    TST: "Tribunal Superior do Trabalho",
    TSE: "Tribunal Superior Eleitoral",
    STM: "Superior Tribunal Militar",
    TRF1: "TRF 1ª Região", TRF2: "TRF 2ª Região", TRF3: "TRF 3ª Região",
    TRF4: "TRF 4ª Região", TRF5: "TRF 5ª Região", TRF6: "TRF 6ª Região",
    TJAC: "TJAC - Acre", TJAL: "TJAL - Alagoas", TJAM: "TJAM - Amazonas",
    TJAP: "TJAP - Amapá", TJBA: "TJBA - Bahia", TJCE: "TJCE - Ceará",
    TJDF: "TJDF - Distrito Federal", TJES: "TJES - Espírito Santo",
    TJGO: "TJGO - Goiás", TJMA: "TJMA - Maranhão", TJMG: "TJMG - Minas Gerais",
    TJMS: "TJMS - Mato Grosso do Sul", TJMT: "TJMT - Mato Grosso",
    TJPA: "TJPA - Pará", TJPB: "TJPB - Paraíba", TJPE: "TJPE - Pernambuco",
    TJPI: "TJPI - Piauí", TJPR: "TJPR - Paraná", TJRJ: "TJRJ - Rio de Janeiro",
    TJRN: "TJRN - Rio Grande do Norte", TJRO: "TJRO - Rondônia",
    TJRR: "TJRR - Roraima", TJRS: "TJRS - Rio Grande do Sul",
    TJSC: "TJSC - Santa Catarina", TJSE: "TJSE - Sergipe",
    TJSP: "TJSP - São Paulo", TJTO: "TJTO - Tocantins",
    TRT1: "TRT 1ª Região (RJ)", TRT2: "TRT 2ª Região (SP)", TRT3: "TRT 3ª Região (MG)",
    TRT4: "TRT 4ª Região (RS)", TRT5: "TRT 5ª Região (BA)", TRT6: "TRT 6ª Região (PE)",
    TRT7: "TRT 7ª Região (CE)", TRT8: "TRT 8ª Região (PA/AP)", TRT9: "TRT 9ª Região (PR)",
    TRT10: "TRT 10ª Região (DF/TO)", TRT11: "TRT 11ª Região (AM/RR)",
    TRT12: "TRT 12ª Região (SC)", TRT13: "TRT 13ª Região (PB)",
    TRT14: "TRT 14ª Região (RO/AC)", TRT15: "TRT 15ª Região (Campinas)",
    TRT16: "TRT 16ª Região (MA)", TRT17: "TRT 17ª Região (ES)",
    TRT18: "TRT 18ª Região (GO)", TRT19: "TRT 19ª Região (AL)",
    TRT20: "TRT 20ª Região (SE)", TRT21: "TRT 21ª Região (RN)",
    TRT22: "TRT 22ª Região (PI)", TRT23: "TRT 23ª Região (MT)",
    TRT24: "TRT 24ª Região (MS)",
  };

  return Object.entries(TRIBUNAIS_ALIASES).map(([sigla, alias]) => ({
    sigla,
    alias,
    nome: nomes[sigla] ?? sigla,
  }));
}

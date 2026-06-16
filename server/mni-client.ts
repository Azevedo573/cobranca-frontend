/**
 * Cliente SOAP para o MNI (Modelo Nacional de Interoperabilidade) do TJRJ.
 *
 * Operações implementadas:
 *  1. consultarProcesso        — dados completos do processo (partes, movimentos, documentos)
 *  2. consultarAvisosPendentes — intimações/comunicações ainda não visualizadas
 *  3. consultarTeorComunicacao — inteiro teor de uma comunicação pelo idAviso
 *  4. consultarAlteracao       — processos com movimentação desde uma data de referência
 *
 * Autenticação: login + senha fornecidos pelo TJRJ (sem certificado digital).
 * Cada chamada envia idConsultante + senhaConsultante no envelope SOAP.
 *
 * Referência: Modelo Nacional de Interoperabilidade — TJRJ (37 páginas)
 * URL de homologação: https://www12.tjrj.jus.br/MNI/Servico.svc
 * URL de produção:    https://www.tjrj.jus.br/MNI/Servico.svc  (confirmar com TJRJ)
 */

import * as soap from "soap";

// ─── Tipos de entrada ─────────────────────────────────────────────────────────

export interface MniCredenciais {
  idConsultante: string;
  senhaConsultante: string;
  urlWsdl?: string;
  ambiente?: "homologacao" | "producao";
}

export interface ConsultarProcessoInput {
  numeroProcesso: string;       // Formato CNJ sem máscara: 00014763120208190208
  dataReferencia?: string;      // AAAA/MM/DD — retorna apenas movimentos a partir desta data
  incluirDocumentos?: boolean;  // Se true, inclui identificadores dos documentos
  movimentosDesde?: string;     // Alias para dataReferencia
}

export interface ConsultarAvisosPendentesInput {
  idRepresentado?: string;      // CPF/CNPJ do representado (sem máscara)
  dataReferencia?: string;      // AAAA/MM/DD — avisos a partir desta data
}

export interface ConsultarTeorComunicacaoInput {
  idAviso: string;              // Identificador do aviso retornado em consultarAvisosPendentes
}

export interface ConsultarAlteracaoInput {
  dataReferencia: string;       // AAAA/MM/DD — processos alterados desde esta data
  idRepresentado?: string;      // CPF/CNPJ do representado
}

// ─── Tipos de saída ───────────────────────────────────────────────────────────

export interface MniParte {
  nome: string;
  tipo: string;           // "AT" = ativo/autor, "PA" = passivo/réu, "TP" = terceiro
  cpfCnpj?: string;
  advogados?: Array<{ nome: string; inscricao?: string; tipoRepresentante?: string }>;
}

export interface MniMovimento {
  codigo: number;
  nome: string;
  dataHora: string;       // AAAA/MM/DD/HH/MI/SS
  complementos?: Array<{ nome: string; valor: string }>;
  nomeOrgao?: string;
  tipoComunicacao?: string;
  meioPublicacao?: string;
}

export interface MniProcesso {
  numeroProcesso: string;
  classe: string;
  assunto: string;
  orgaoJulgador: string;
  comarca?: string;
  vara?: string;
  grau?: string;
  nivelSigilo?: number;
  valorCausa?: number;
  dataAjuizamento?: string;
  partes: MniParte[];
  movimentos: MniMovimento[];
  documentos?: string[];
  outrosParametros?: Record<string, string>;
}

export interface MniAviso {
  idAviso: string;
  numeroProcesso: string;
  tipoAviso: string;          // "CIT" = citação, "INT" = intimação
  tipoComunicacao?: string;   // INTMPC, INTIBP, etc.
  dataDisponibilizacao: string;
  dataPublicacao?: string;
  orgao?: string;
  vara?: string;
  comarca?: string;
  partes?: MniParte[];
  prazoResposta?: number;
}

export interface MniTeorComunicacao {
  idAviso: string;
  numeroProcesso: string;
  teor: string;               // Inteiro teor da comunicação
  parametros?: Record<string, string>;
  partes?: MniParte[];
  dataDecisao?: string;
  tipoDecisao?: string;
  numPecaOrigem?: string;
}

// ─── URLs padrão ──────────────────────────────────────────────────────────────

const URLS = {
  homologacao: "https://www12.tjrj.jus.br/MNI/Servico.svc?wsdl",
  producao: "https://www.tjrj.jus.br/MNI/Servico.svc?wsdl",
};

// ─── Utilitários ─────────────────────────────────────────────────────────────

/**
 * Formata número de processo para o padrão MNI (20 dígitos sem máscara).
 * Aceita: "0001476-31.2020.8.19.0208" ou "00014763120208190208"
 */
export function formatarNumeroCNJParaMNI(numero: string): string {
  return numero.replace(/[^0-9]/g, "");
}

/**
 * Converte data do formato MNI (AAAA/MM/DD ou AAAA/MM/DD/HH/MI/SS) para ISO.
 */
export function parseMniDate(mniDate: string): Date | null {
  if (!mniDate) return null;
  const parts = mniDate.split("/");
  if (parts.length < 3) return null;
  const [year, month, day, hour = "00", min = "00", sec = "00"] = parts;
  return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}.000Z`);
}

/**
 * Normaliza tipo de parte do MNI para o nosso sistema.
 */
export function normalizarTipoParte(tipo: string): "autor" | "reu" | "terceiro" | "outro" {
  const t = (tipo || "").toUpperCase();
  if (t === "AT" || t.includes("ATIVO") || t.includes("AUTOR")) return "autor";
  if (t === "PA" || t.includes("PASSIVO") || t.includes("REU") || t.includes("RÉU")) return "reu";
  if (t === "TP" || t.includes("TERCEIRO")) return "terceiro";
  return "outro";
}

// ─── Classe principal ─────────────────────────────────────────────────────────

export class MniClient {
  private credenciais: MniCredenciais;
  private wsdlUrl: string;
  private clientCache: soap.Client | null = null;

  constructor(credenciais: MniCredenciais) {
    this.credenciais = credenciais;
    this.wsdlUrl =
      credenciais.urlWsdl ||
      URLS[credenciais.ambiente || "homologacao"];
  }

  // ── Inicialização do cliente SOAP ──────────────────────────────────────────

  private async getClient(): Promise<soap.Client> {
    if (this.clientCache) return this.clientCache;
    this.clientCache = await soap.createClientAsync(this.wsdlUrl, {
      wsdl_options: { timeout: 30000 },
    });
    return this.clientCache;
  }

  /**
   * Envelope de autenticação padrão para todas as chamadas MNI.
   */
  private authArgs() {
    return {
      idConsultante: this.credenciais.idConsultante,
      senhaConsultante: this.credenciais.senhaConsultante,
    };
  }

  // ── 1. Consultar Processo ──────────────────────────────────────────────────

  async consultarProcesso(input: ConsultarProcessoInput): Promise<MniProcesso> {
    const client = await this.getClient();
    const numeroFormatado = formatarNumeroCNJParaMNI(input.numeroProcesso);

    const args: Record<string, unknown> = {
      ...this.authArgs(),
      numeroProcesso: numeroFormatado,
      movimentos: true,
      incluirDocumentos: input.incluirDocumentos ?? false,
    };

    if (input.dataReferencia || input.movimentosDesde) {
      args.dataReferencia = input.dataReferencia || input.movimentosDesde;
    }

    const [result] = await (client as any).consultarProcessoAsync(args);
    return this.parseProcesso(result);
  }

  // ── 2. Consultar Avisos Pendentes ──────────────────────────────────────────

  async consultarAvisosPendentes(input: ConsultarAvisosPendentesInput = {}): Promise<MniAviso[]> {
    const client = await this.getClient();

    const args: Record<string, unknown> = {
      ...this.authArgs(),
    };

    if (input.idRepresentado) args.idRepresentado = input.idRepresentado;
    if (input.dataReferencia) args.dataReferencia = input.dataReferencia;

    const [result] = await (client as any).consultarAvisosPendentesAsync(args);
    return this.parseAvisos(result);
  }

  // ── 3. Consultar Teor da Comunicação ──────────────────────────────────────

  async consultarTeorComunicacao(input: ConsultarTeorComunicacaoInput): Promise<MniTeorComunicacao> {
    const client = await this.getClient();

    const args = {
      ...this.authArgs(),
      identificadorAviso: input.idAviso,
    };

    const [result] = await (client as any).consultarTeorComunicacaoAsync(args);
    return this.parseTeor(result, input.idAviso);
  }

  // ── 4. Consultar Alteração ─────────────────────────────────────────────────

  async consultarAlteracao(input: ConsultarAlteracaoInput): Promise<string[]> {
    const client = await this.getClient();

    const args: Record<string, unknown> = {
      ...this.authArgs(),
      dataReferencia: input.dataReferencia,
    };

    if (input.idRepresentado) args.idRepresentado = input.idRepresentado;

    const [result] = await (client as any).consultarAlteracaoAsync(args);
    return this.parseAlteracao(result);
  }

  // ── 5. Testar Conexão ──────────────────────────────────────────────────────

  async testarConexao(): Promise<{ ok: boolean; mensagem: string }> {
    try {
      const client = await this.getClient();
      // Tenta consultar avisos pendentes sem parâmetros — se autenticar, a conexão está ok
      await (client as any).consultarAvisosPendentesAsync(this.authArgs());
      return { ok: true, mensagem: "Conexão estabelecida com sucesso" };
    } catch (err: any) {
      const msg = err?.message || String(err);
      // Erro de autenticação = credenciais inválidas
      if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("autenticacao")) {
        return { ok: false, mensagem: "Credenciais inválidas — verifique idConsultante e senha" };
      }
      // Erro de conexão = URL errada ou tribunal fora do ar
      if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND") || msg.includes("timeout")) {
        return { ok: false, mensagem: "Não foi possível conectar ao servidor do TJRJ — verifique a URL e tente novamente" };
      }
      return { ok: false, mensagem: `Erro: ${msg.substring(0, 200)}` };
    }
  }

  // ─── Parsers ───────────────────────────────────────────────────────────────

  private parseProcesso(raw: any): MniProcesso {
    if (!raw) throw new Error("Resposta vazia do MNI");

    // Navega pela estrutura do envelope SOAP
    const proc = raw?.processo || raw?.retorno?.processo || raw;

    const partes: MniParte[] = this.extractArray(proc?.partes?.parte || proc?.parte).map((p: any) => ({
      nome: p?.nome || p?.nomeRepresentado || "",
      tipo: p?.polo || p?.tipoParte || "",
      cpfCnpj: p?.documento?.codigoDocumento || p?.cpfCnpj || undefined,
      advogados: this.extractArray(p?.advogados?.advogado || p?.advogado).map((a: any) => ({
        nome: a?.nome || "",
        inscricao: a?.inscricaoOAB || a?.numeroInscricao || undefined,
        tipoRepresentante: a?.tipoRepresentante || undefined,
      })),
    }));

    const movimentos: MniMovimento[] = this.extractArray(
      proc?.movimentos?.movimento || proc?.movimento
    ).map((m: any) => ({
      codigo: parseInt(m?.codigo || m?.codigoNacional || "0", 10),
      nome: m?.nome || m?.descricao || "",
      dataHora: m?.dataHora || m?.data || "",
      complementos: this.extractArray(m?.complementosTabelados?.complementoTabelado || m?.complemento).map(
        (c: any) => ({ nome: c?.nome || "", valor: c?.valor || "" })
      ),
      nomeOrgao: m?.orgaoJulgador?.nomeOrgao || m?.nomeOrgao || undefined,
      tipoComunicacao: m?.tipoComunicacao || undefined,
      meioPublicacao: m?.meioPublicacao || undefined,
    }));

    return {
      numeroProcesso: proc?.numeroProcesso || proc?.numero || "",
      classe: proc?.classe?.nome || proc?.classe || "",
      assunto: this.extractArray(proc?.assuntos?.assunto || proc?.assunto)
        .map((a: any) => a?.nome || a)
        .join(", "),
      orgaoJulgador: proc?.orgaoJulgador?.nomeOrgao || proc?.orgaoJulgador || "",
      comarca: proc?.orgaoJulgador?.codigoLocalidade || proc?.comarca || undefined,
      vara: proc?.orgaoJulgador?.nomeOrgao || undefined,
      grau: proc?.grau || undefined,
      nivelSigilo: parseInt(proc?.nivelSigilo || "0", 10),
      valorCausa: proc?.valorCausa ? parseInt(String(proc.valorCausa).replace(/\D/g, ""), 10) : undefined,
      dataAjuizamento: proc?.dataAjuizamento || undefined,
      partes,
      movimentos,
      documentos: this.extractArray(proc?.documentos?.documento || proc?.documento).map(
        (d: any) => d?.idDocumento || d?.id || String(d)
      ),
      outrosParametros: this.parseOutrosParametros(proc?.outroParametro),
    };
  }

  private parseAvisos(raw: any): MniAviso[] {
    if (!raw) return [];
    const avisos = this.extractArray(
      raw?.aviso || raw?.retorno?.aviso || raw?.avisos?.aviso
    );
    return avisos.map((a: any) => ({
      idAviso: a?.idAviso || a?.identificadorAviso || "",
      numeroProcesso: a?.numeroProcesso || a?.processo?.numeroProcesso || "",
      tipoAviso: a?.tipoComunicacao || a?.tipo || "",
      tipoComunicacao: a?.parametros?.parametro?.find?.((p: any) => p?.nome === "TIPO_COMUNICACAO_LOCAL")?.valor || undefined,
      dataDisponibilizacao: a?.dataDisponibilizacao || a?.data || "",
      dataPublicacao: a?.dataPublicacao || undefined,
      orgao: a?.orgaoJulgador?.nomeOrgao || a?.orgao || undefined,
      vara: a?.orgaoJulgador?.nomeOrgao || undefined,
      comarca: a?.orgaoJulgador?.codigoLocalidade || undefined,
      partes: this.extractArray(a?.partes?.parte || a?.parte).map((p: any) => ({
        nome: p?.nome || "",
        tipo: p?.polo || "",
        advogados: [],
      })),
      prazoResposta: a?.prazoResposta ? parseInt(a.prazoResposta, 10) : undefined,
    }));
  }

  private parseTeor(raw: any, idAviso: string): MniTeorComunicacao {
    if (!raw) throw new Error("Teor não encontrado");
    const teor = raw?.comunicacaoProcessual || raw?.retorno || raw;
    return {
      idAviso,
      numeroProcesso: teor?.numeroProcesso || teor?.processo?.numeroProcesso || "",
      teor: teor?.teor || teor?.conteudo || teor?.texto || "",
      parametros: this.parseOutrosParametros(teor?.outroParametro || teor?.parametros?.parametro),
      partes: this.extractArray(teor?.partes?.parte || teor?.parte).map((p: any) => ({
        nome: p?.nome || "",
        tipo: p?.polo || "",
        advogados: this.extractArray(p?.advogados?.advogado || p?.advogado).map((a: any) => ({
          nome: a?.nome || "",
          inscricao: a?.inscricaoOAB || undefined,
        })),
      })),
      dataDecisao: teor?.dataDecisao || undefined,
      tipoDecisao: teor?.tipoDecisao || undefined,
      numPecaOrigem: teor?.numPecaOrigem || undefined,
    };
  }

  private parseAlteracao(raw: any): string[] {
    if (!raw) return [];
    return this.extractArray(raw?.processo || raw?.retorno?.processo || []).map(
      (p: any) => p?.numeroProcesso || String(p)
    );
  }

  private parseOutrosParametros(raw: any): Record<string, string> {
    const result: Record<string, string> = {};
    if (!raw) return result;
    this.extractArray(raw).forEach((p: any) => {
      if (p?.nome && p?.valor) result[p.nome] = p.valor;
    });
    return result;
  }

  private extractArray(val: any): any[] {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return [val];
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Cria um MniClient a partir das credenciais armazenadas no banco.
 */
export function criarMniClient(credenciais: {
  idConsultante: string;
  senhaConsultante: string;
  urlWsdl?: string | null;
  ambiente?: string | null;
}): MniClient {
  return new MniClient({
    idConsultante: credenciais.idConsultante,
    senhaConsultante: credenciais.senhaConsultante,
    urlWsdl: credenciais.urlWsdl || undefined,
    ambiente: (credenciais.ambiente as "homologacao" | "producao") || "homologacao",
  });
}

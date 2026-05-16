/**
 * Parser do arquivo de retorno CNAB 240 - BTG Pactual (Banco 208)
 *
 * Layout mapeado a partir do arquivo BTG_12052026(1)-202605125454.ret
 *
 * Estrutura do arquivo:
 *   - Header de Arquivo (tipo 0, lote 0000)
 *   - Header de Lote   (tipo 1)
 *   - Detalhe Segmento T (tipo 3, seg T) — dados do título
 *   - Detalhe Segmento U (tipo 3, seg U) — valores e datas complementares
 *   - Detalhe Segmento Y-04 (tipo 3, seg Y, id 03) — dados do Bolepix (opcional)
 *   - Trailer de Lote  (tipo 5)
 *   - Trailer de Arquivo (tipo 9)
 *
 * Segmento T — offsets confirmados via análise do arquivo real:
 *   001-003  banco (3)
 *   004-007  lote (4)
 *   008      tipo registro = '3' (1)
 *   009-013  nº sequencial (5)
 *   014      segmento = 'T' (1)
 *   015      branco (1)
 *   016-017  código de movimento retorno (2) — 02=entrada confirmada, 06=liquidação, 09=baixa
 *   018-022  agência (5)
 *   023      dígito agência (1)
 *   024-035  conta (12)
 *   036      dígito conta (1)
 *   037      dígito ag/conta (1)
 *   038-057  nosso número (20)
 *   058-060  carteira (3)
 *   061-073  número do documento (13)
 *   074-081  data de vencimento DDMMAAAA (8)
 *   082-096  valor do título (15, em centavos)
 *   097-099  banco cobrador (3)
 *   100-103  agência cobradora (4)
 *   104-123  seu número (20)
 *   124-130  data da ocorrência DDMMAAAA (7 — pode estar vazio)
 *   131-133  código de ocorrência (3) — 091=entrada confirmada BTG
 *   134-137  quantidade de ocorrências (4)
 *   138-148  CPF/CNPJ do pagador (11 ou 14 chars — 11 para CPF)
 *   149-188  nome do pagador (40)
 *   189-240  brancos/complemento (52)
 *
 * Segmento U — offsets confirmados:
 *   001-017  identificação (banco/lote/tipo/seq/seg/branco/cod)
 *   038-052  juros/mora (15)
 *   053-067  desconto (15)
 *   068-082  abatimento (15)
 *   083-097  IOF (15)
 *   098-112  valor pago (15)
 *   113-127  valor líquido (15)
 *   128-132  outras deduções (5)
 *   133-137  outros acréscimos (5)
 *   138-145  data da ocorrência DDMMAAAA (8)
 *   146-153  data do crédito DDMMAAAA (8) — pode ser 00000000 para entrada confirmada
 *
 * Segmento Y-04 (Bolepix) — layout FEBRABAN V10.11:
 *   001-003  banco (3)
 *   004-007  lote (4)
 *   008      tipo registro = '3' (1)
 *   009-013  nº sequencial (5)
 *   014      segmento = 'Y' (1)
 *   015      branco (1)
 *   016-017  código de movimento (2)
 *   018-019  identificação registro opcional = '03' para Pix (2)
 *   020-069  e-mail (50) — geralmente brancos no BTG
 *   070-071  DDD (2)
 *   072-080  número celular (9)
 *   081      tipo de chave Pix: 1=CPF, 2=CNPJ, 3=Telefone, 4=E-mail, 5=Aleatória (1)
 *   082-158  chave Pix / URL do QRCode (77)
 *   159-193  TXID — código de identificação do QRCode (35)
 *   194-240  brancos (47)
 */

// Códigos de movimento retorno BTG CNAB 240
export const CODIGOS_MOVIMENTO: Record<string, string> = {
  "02": "Entrada Confirmada",
  "03": "Entrada Rejeitada",
  "06": "Liquidação Normal",
  "07": "Liquidação Parcial",
  "09": "Baixa Automática",
  "10": "Baixa por Solicitação",
  "14": "Vencimento Alterado",
  "15": "Abatimento Concedido",
  "16": "Abatimento Cancelado",
  "17": "Alteração de Dados",
  "19": "Confirmação de Instrução de Protesto",
  "20": "Confirmação de Sustação de Protesto",
  "23": "Remessa a Cartório",
  "24": "Retirada de Cartório",
  "25": "Protestado e Baixado",
  "27": "Confirmação de Alteração de Outros Dados",
  "28": "Débito de Tarifas/Custas",
  "30": "Alteração de Outros Dados Rejeitada",
  "32": "Instrução Rejeitada",
  "33": "Confirmação Pedido Negativação",
  "34": "Confirmação Pedido Exclusão Negativação",
  "35": "Negativação Rejeitada",
  "36": "Exclusão Negativação Rejeitada",
  "40": "Estorno de Pagamento",
  "55": "Sustado Judicial",
  "91": "Entrada Confirmada BTG",
};

// Códigos de ocorrência BTG (campo pos 131-133 no Segmento T)
export const CODIGOS_OCORRENCIA_BTG: Record<string, string> = {
  "091": "Entrada Confirmada",
  "006": "Liquidação Normal",
  "009": "Baixa Automática",
  "010": "Baixa por Solicitação",
  "003": "Entrada Rejeitada",
};

export interface RetornoHeaderArquivo {
  banco: string;
  cnpjBeneficiario: string;
  agencia: string;
  conta: string;
  digitoConta: string;
  nomeBanco: string;
  codRetorno: string; // '2' = retorno
  dataGeracao: string; // DDMMAAAA
  horaGeracao: string;
  numeroSequencial: string;
}

export interface RetornoSegmentoT {
  lote: string;
  sequencial: string;
  codMovimento: string;
  descMovimento: string;
  agencia: string;
  conta: string;
  nossoNumero: string;
  carteira: string;
  numeroDocumento: string;
  dataVencimento: string; // DDMMAAAA
  valorTitulo: number; // em centavos
  seuNumero: string;
  dataOcorrencia: string; // DDMMAAAA
  codOcorrencia: string;
  descOcorrencia: string;
  cpfCnpjPagador: string;
  nomePagador: string;
}

export interface RetornoSegmentoU {
  lote: string;
  sequencial: string;
  codMovimento: string;
  jurosMora: number;
  desconto: number;
  abatimento: number;
  iof: number;
  valorPago: number;
  valorLiquido: number;
  dataOcorrencia: string; // DDMMAAAA
  dataCredito: string; // DDMMAAAA
}

export interface RetornoSegmentoY04 {
  lote: string;
  sequencial: string;
  codMovimento: string;
  idRegistro: string; // '03' = Pix/Bolepix
  tipoChavePix: string; // '1'=CPF, '2'=CNPJ, '3'=Telefone, '4'=E-mail, '5'=Aleatória
  descTipoChavePix: string;
  chavePix: string; // Chave Pix ou URL do QRCode
  txid: string; // Código de identificação do QRCode (35 chars)
}

export const TIPOS_CHAVE_PIX: Record<string, string> = {
  "1": "CPF",
  "2": "CNPJ",
  "3": "Telefone",
  "4": "E-mail",
  "5": "Chave Aleatória",
};

export interface RetornoPar {
  segmentoT: RetornoSegmentoT;
  segmentoU: RetornoSegmentoU;
  segmentoY04?: RetornoSegmentoY04; // Opcional — presente apenas para Bolepix
}

export interface RetornoArquivo {
  header: RetornoHeaderArquivo;
  pares: RetornoPar[];
  totalRegistros: number;
  totalLotes: number;
  temBolepix: boolean; // true se algum par tiver Segmento Y-04
}

function parseDateDDMMAAAA(s: string): string {
  const clean = s.trim();
  if (!clean || clean === "00000000" || clean.length < 8) return "";
  return `${clean.substring(4, 8)}-${clean.substring(2, 4)}-${clean.substring(0, 2)}`;
}

function parseValor(s: string): number {
  const clean = s.trim().replace(/\D/g, "");
  if (!clean) return 0;
  return parseInt(clean, 10);
}

export function parseRetornoCNAB240(conteudo: string): RetornoArquivo {
  // Suporta CRLF e LF
  const linhas = conteudo.split(/\r?\n/).filter(l => l.trim().length > 0);

  let header: RetornoHeaderArquivo | null = null;
  const pares: RetornoPar[] = [];
  let totalRegistros = 0;
  let totalLotes = 0;

  // Mapa temporário: sequencial do lote → segmento T pendente
  const pendentesT = new Map<string, RetornoSegmentoT>();
  // Mapa temporário: chave do par (lote-seqT) → segmento Y-04 pendente
  const pendentesY04 = new Map<string, RetornoSegmentoY04>();

  for (const linha of linhas) {
    if (linha.length < 240) continue;

    const tipoReg = linha[7]; // pos 008 (0-indexed: 7)
    const segmento = linha[13]; // pos 014 (0-indexed: 13)

    // Header de Arquivo (tipo 0)
    if (tipoReg === "0" && linha.substring(3, 7) === "0000") {
      header = {
        banco: linha.substring(0, 3),
        cnpjBeneficiario: linha.substring(18, 32).trim(),
        agencia: linha.substring(52, 57).trim(),
        conta: linha.substring(58, 70).trim(),
        digitoConta: linha.substring(70, 71).trim(),
        nomeBanco: linha.substring(102, 132).trim(),
        codRetorno: linha.substring(142, 143),
        dataGeracao: linha.substring(143, 151),
        horaGeracao: linha.substring(151, 157),
        numeroSequencial: linha.substring(157, 163).trim(),
      };
      continue;
    }

    // Trailer de Arquivo (tipo 9)
    // pos 018-023 (0-indexed 17-23) = total de lotes (6 chars)
    // pos 024-029 (0-indexed 23-29) = total de registros (6 chars)
    if (tipoReg === "9") {
      totalLotes = parseInt(linha.substring(17, 23).trim() || "0", 10);
      totalRegistros = parseInt(linha.substring(23, 29).trim() || "0", 10);
      continue;
    }

    // Detalhe Segmento T (tipo 3, segmento T)
    if (tipoReg === "3" && segmento === "T") {
      const lote = linha.substring(3, 7);
      const sequencial = linha.substring(8, 13);
      const codMovimento = linha.substring(15, 17).trim();

      const segT: RetornoSegmentoT = {
        lote,
        sequencial,
        codMovimento,
        descMovimento: CODIGOS_MOVIMENTO[codMovimento] || `Código ${codMovimento}`,
        agencia: linha.substring(17, 22).trim(),
        conta: linha.substring(23, 35).trim(),
        nossoNumero: linha.substring(37, 57).trim(),
        carteira: linha.substring(57, 60).trim(),
        numeroDocumento: linha.substring(60, 73).trim(),
        dataVencimento: parseDateDDMMAAAA(linha.substring(73, 81)),
        valorTitulo: parseValor(linha.substring(81, 96)),
        seuNumero: linha.substring(103, 123).trim(),
        dataOcorrencia: parseDateDDMMAAAA(linha.substring(123, 130)),
        codOcorrencia: linha.substring(130, 133).trim(),
        descOcorrencia: CODIGOS_OCORRENCIA_BTG[linha.substring(130, 133).trim()] ||
                        CODIGOS_MOVIMENTO[linha.substring(15, 17).trim()] ||
                        `Ocorrência ${linha.substring(130, 133).trim()}`,
        cpfCnpjPagador: linha.substring(137, 148).trim(),
        nomePagador: linha.substring(148, 188).trim(),
      };

      pendentesT.set(`${lote}-${sequencial}`, segT);
      continue;
    }

    // Detalhe Segmento U (tipo 3, segmento U)
    if (tipoReg === "3" && segmento === "U") {
      const lote = linha.substring(3, 7);
      const sequencial = linha.substring(8, 13);
      const codMovimento = linha.substring(15, 17).trim();

      // O Segmento U corresponde ao Segmento T imediatamente anterior
      // Sequencial do T = sequencial do U - 1
      const seqT = String(parseInt(sequencial, 10) - 1).padStart(5, "0");
      const chaveT = `${lote}-${seqT}`;
      const segTRef = pendentesT.get(chaveT);

      const segU: RetornoSegmentoU = {
        lote,
        sequencial,
        codMovimento,
        jurosMora: parseValor(linha.substring(37, 52)),
        desconto: parseValor(linha.substring(52, 67)),
        abatimento: parseValor(linha.substring(67, 82)),
        iof: parseValor(linha.substring(82, 97)),
        valorPago: parseValor(linha.substring(97, 112)),
        valorLiquido: parseValor(linha.substring(112, 127)),
        dataOcorrencia: parseDateDDMMAAAA(linha.substring(137, 145)),
        dataCredito: parseDateDDMMAAAA(linha.substring(145, 153)),
      };

      if (segTRef) {
        pares.push({ segmentoT: segTRef, segmentoU: segU });
        pendentesT.delete(chaveT);
      }
      continue;
    }

    // Detalhe Segmento Y-04 (tipo 3, segmento Y, identificação '03' = Bolepix)
    if (tipoReg === "3" && segmento === "Y") {
      const idRegistro = linha.substring(17, 19).trim();
      // Apenas processar registros Y-04 (Pix/Bolepix)
      if (idRegistro !== "03") continue;

      const lote = linha.substring(3, 7);
      const sequencial = linha.substring(8, 13);
      const codMovimento = linha.substring(15, 17).trim();

      // O Segmento Y-04 segue o par T+U: sequencial do T = sequencial do Y - 2
      // (T=seq, U=seq+1, Y-04=seq+2)
      const seqT = String(parseInt(sequencial, 10) - 2).padStart(5, "0");
      const chaveT = `${lote}-${seqT}`;

      const tipoChavePix = linha.substring(80, 81).trim();
      const segY04: RetornoSegmentoY04 = {
        lote,
        sequencial,
        codMovimento,
        idRegistro,
        tipoChavePix,
        descTipoChavePix: TIPOS_CHAVE_PIX[tipoChavePix] || `Tipo ${tipoChavePix}`,
        chavePix: linha.substring(81, 158).trim(),
        txid: linha.substring(158, 193).trim(),
      };

      // Associar ao par já criado (busca pelo chaveT)
      const parExistente = pares.findLast(p => p.segmentoT.lote === lote && p.segmentoT.sequencial === seqT);
      if (parExistente) {
        parExistente.segmentoY04 = segY04;
      } else {
        // Guardar para associar quando o par for criado (caso Y-04 venha antes do U)
        pendentesY04.set(chaveT, segY04);
      }
      continue;
    }
  }

  // Associar Y-04 pendentes a pares já criados
  pendentesY04.forEach((segY04, chaveT) => {
    const dashIdx = chaveT.indexOf("-");
    const lote = chaveT.substring(0, dashIdx);
    const seqT = chaveT.substring(dashIdx + 1);
    const par = pares.findLast(p => p.segmentoT.lote === lote && p.segmentoT.sequencial === seqT);
    if (par) par.segmentoY04 = segY04;
  });

  if (!header) {
    throw new Error("Arquivo de retorno inválido: Header de Arquivo não encontrado");
  }

  const temBolepix = pares.some(p => p.segmentoY04 !== undefined);

  return {
    header,
    pares,
    totalRegistros,
    totalLotes,
    temBolepix,
  };
}

/**
 * Determina o novo status da cobrança com base no código de movimento/ocorrência do retorno.
 * Retorna null se o status não deve ser alterado.
 */
export function determinarNovoStatus(
  codMovimento: string,
  codOcorrencia: string
): "pendente" | "em_cobranca" | "pago" | "cancelado" | null {
  // Liquidação = pago
  if (["06", "07"].includes(codMovimento)) return "pago";
  if (["006", "007"].includes(codOcorrencia)) return "pago";

  // Baixa = cancelado
  if (["09", "10"].includes(codMovimento)) return "cancelado";
  if (["009", "010"].includes(codOcorrencia)) return "cancelado";

  // Entrada confirmada = em_cobranca
  if (["02"].includes(codMovimento)) return "em_cobranca";
  if (["091", "002"].includes(codOcorrencia)) return "em_cobranca";

  // Entrada rejeitada = pendente (volta ao estado anterior)
  if (["03"].includes(codMovimento)) return "pendente";
  if (["003"].includes(codOcorrencia)) return "pendente";

  return null;
}

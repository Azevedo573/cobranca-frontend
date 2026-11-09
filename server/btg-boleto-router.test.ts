import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inflateSync } from "node:zlib";
import type { TrpcContext } from "./_core/context";
import type { DadosBoleto } from "./boleto-pdf";
import type { EmissaoTituloBtg } from "./btg-v2/titulo-contexto";
import { criarDbCanaisEmMemoria } from "./btg-canais-test-db";
import {
  cifrarSnapshotBoletoBtg,
  hashBoletoBtg,
  snapshotDoPedidoBtg,
} from "./btg-v2/boleto-snapshot-dominio";
import {
  aadDiagnosticoBtg,
  cifrarDiagnosticoBtg,
} from "./btg-v2/diagnosticos-crypto";

const mock = vi.hoisted(() => ({
  db: vi.fn(),
  render: vi.fn(),
  consulta: vi.fn(),
  post: vi.fn(),
  get: vi.fn(),
  cancel: vi.fn(),
  storagePut: vi.fn(),
  storageGet: vi.fn(),
  conciliar: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: mock.db }));
vi.mock("./boleto-pdf", async importOriginal => ({
  ...(await importOriginal<typeof import("./boleto-pdf")>()),
  gerarBoletoPDF: mock.render,
}));
vi.mock("./btg-v2/boleto-consulta", () => ({
  consultarDadosBoletoBtg: mock.consulta,
}));
vi.mock("./btg-v2/client", () => ({
  criarBolePixBtgV2: mock.post,
  consultarBolePixBtgV2: mock.get,
  cancelarBolePixBtgV2: mock.cancel,
}));
vi.mock("./storage", () => ({
  storagePut: mock.storagePut,
  storageGet: mock.storageGet,
}));
vi.mock("./btg-v2/settlement", () => ({
  cancelarEmissaoBolePixV2: mock.cancel,
  conciliarEmissaoBolePixV2: mock.conciliar,
}));
import { btgBoletosRouter } from "./routers/btg-boletos";

// Mesma fixture 44/47 dígitos e mesmo decodificador I25 de btg-boleto-pdf.test.ts.
// Reutilizados aqui sem importar a suíte nem modificar arquivo de outro responsável.
const codigoBarras = "20898100000000050000012345678901234567890123";
const linhaDigitavel = "20890012304567890123745678901237810000000005000";
const linhaFormatada = "20890.01230 45678.901237 45678.901237 8 10000000005000";
const bytesMock = Buffer.from("%PDF-1.7\nDocumento sintético local\n");
const dueDate = new Date("2025-02-22T00:30:00Z");
const agora = new Date("2026-11-09T14:00:00Z");

function comCrc(corpo: string) {
  const prefixo = corpo + "6304";
  let crc = 0xffff;
  for (const byte of Buffer.from(prefixo)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++)
      crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  return prefixo + crc.toString(16).toUpperCase().padStart(4, "0");
}
const tlv = (id: string, valor: string) =>
  id + String(Buffer.byteLength(valor)).padStart(2, "0") + valor;
const pix = comCrc(
  tlv("00", "01") +
    tlv("01", "12") +
    tlv("26", tlv("00", "BR.GOV.BCB.PIX") + tlv("25", "qr.example.test/807")) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", "50.00") +
    tlv("58", "BR") +
    tlv("59", " PAGADOR  TESTE ") +
    tlv("60", "SAO PAULO ") +
    tlv("62", tlv("05", "***"))
);

function emissao(values: Partial<EmissaoTituloBtg> = {}): EmissaoTituloBtg {
  return {
    id: 40,
    btgIntegracaoId: 1,
    btgContaRecebedoraId: 2,
    btgRemessaId: null,
    condominioId: 3,
    origemTipo: "parcela_acordo",
    origemId: 10,
    revisao: 1,
    status: "emitida",
    instrumento: "bolepix",
    amount: 5000,
    dueDate,
    agenciaRecebedora: "0050",
    contaRecebedora: "0000432260",
    nomeBeneficiario: "Beneficiário Histórico",
    documentoBeneficiario: "00000000000000",
    externalId: "v2:sbx:parcela_acordo:10:r1",
    btgCollectionId: "col-40",
    erroCodigo: null,
    codigoBarras,
    linhaDigitavel,
    nossoNumero: "00001234567890123456789012345678901234",
    pixCopiaECola: pix,
    bankSlipUrl: "https://bank.example.test/nao-baixar.pdf",
    emitidaEm: new Date("2025-02-20T00:30:00Z"),
    createdAt: new Date("2025-02-20T00:30:00Z"),
    ...values,
  } as EmissaoTituloBtg;
}
function pedido(e = emissao()) {
  return JSON.stringify({
    amount: e.amount / 100,
    type: "BANKSLIP_QRCODE",
    dueDate: e.dueDate.toISOString().slice(0, 10),
    account: { branch: e.agenciaRecebedora, number: e.contaRecebedora },
    detail: {
      externalId: e.externalId,
      documentNumber: `PA${e.origemId}R${e.revisao}`,
      correlationId: `btgv2-${e.id}`,
    },
    payer: {
      name: "Pagador Histórico",
      taxId: "00000000000",
      address: {
        street: "Rua da Emissão",
        number: "807",
        neighborhood: "Centro",
        city: "Rio de Janeiro",
        state: "RJ",
        zipCode: "20000000",
      },
    },
  });
}
function snapshotRow(e = emissao()) {
  const s = snapshotDoPedidoBtg(pedido(e), e);
  s.contextoAcordo = {
    acordoId: 4,
    totalNegociado: 5000,
    credorTitulo: "Credor Histórico",
    parcelas: [
      {
        id: e.origemId,
        installmentNumber: 1,
        amount: 5000,
        dueDate: dueDate.toISOString(),
        status: "pendente",
      },
    ],
  };
  return {
    id: 80,
    btgCobrancaEmitidaId: e.id,
    btgIntegracaoId: e.btgIntegracaoId,
    parcelaAcordoId: e.origemId,
    condominioId: e.condominioId,
    revisao: e.revisao,
    diagnosticoId: null,
    usuarioId: 5,
    estado: "completo",
    dadosCifrados: cifrarSnapshotBoletoBtg(s, e),
    dadosSha256: hashBoletoBtg(JSON.stringify(s)),
    payloadSha256: hashBoletoBtg(pedido(e)),
    criadoEm: agora,
  };
}
function fixture() {
  return criarDbCanaisEmMemoria({
    users: [{ id: 5, role: "admin", isActive: 1, isDeleted: 0 }],
    parcelasAcordo: [
      {
        id: 10,
        acordoId: 4,
        installmentNumber: 1,
        status: "pendente",
        amount: 5000,
        dueDate,
        canalBancario: "api_btg_v2",
      },
    ],
    acordos: [
      {
        id: 4,
        condominioId: 3,
        devedorId: 6,
        status: "ativo",
        agreedAmount: 999999,
      },
    ],
    devedores: [
      {
        id: 6,
        condominioId: 3,
        name: "Nome Atual NÃO USAR",
        cpfCnpj: "99999999999",
        street: "Rua Atual NÃO USAR",
      },
    ],
    condominios: [{ id: 3, name: "Credor Atual NÃO USAR" }],
    btgCobrancasEmitidas: [emissao()],
    btgIntegracoes: [{ id: 1, ambiente: "sandbox", ativo: 1 }],
    btgContasRecebedoras: [
      {
        id: 2,
        btgIntegracaoId: 1,
        agencia: "0050",
        numero: "0000432260",
        documentoBeneficiario: "00000000000000",
      },
    ],
    btgRecuperacoes: [],
    btgCancelamentos: [],
    btgBoletoSnapshots: [snapshotRow()],
    btgHttpDiagnosticos: [],
    acordoCobrancas: [{ acordoId: 4, cobrancaId: 7, valorOriginal: 5000 }],
    cobrancas: [
      {
        id: 7,
        condominioId: 3,
        devedorId: 6,
        description: "Origem histórica sintética",
        dueDate,
      },
    ],
    auditLogs: [],
  });
}
let f: ReturnType<typeof fixture>;
function caller(role: string | null = "admin", id = 5) {
  return btgBoletosRouter.createCaller({
    user: role === null ? null : { id, role },
    req: { headers: {}, socket: {} },
    res: {},
  } as unknown as TrpcContext);
}
const gerar = () => caller().gerarPdf({ parcelaId: 10 });
function captura() {
  f.state.tables.btgBoletoSnapshots = [];
  const bytes = Buffer.from(pedido());
  const d = {
    id: 70,
    chaveCaptura: "cd35ec80-c530-4cae-85cf-a144148f9371",
    ambiente: "sandbox",
    btgIntegracaoId: 1,
    btgCobrancaEmitidaId: 40,
    parcelaAcordoId: 10,
    condominioId: 3,
    respostaCompleta: 1,
    httpStatus: 201,
    capturaCriadaEm: agora,
    conteudoExpurgadoEm: null,
    payloadCifrado: "",
    payloadSha256: hashBoletoBtg(bytes),
    payloadBytes: bytes.length,
  };
  d.payloadCifrado = cifrarDiagnosticoBtg(bytes, aadDiagnosticoBtg(d));
  f.state.tables.btgHttpDiagnosticos.push(d);
}
function novaRevisao() {
  const e = emissao({
    id: 41,
    revisao: 2,
    externalId: "v2:sbx:parcela_acordo:10:r2",
  });
  f.state.tables.btgCobrancasEmitidas.push(e);
  f.state.tables.btgRecuperacoes.push({
    estado: "consumida",
    acao: "reenviar",
    emissaoAnteriorId: 40,
    novaEmissaoId: 41,
    btgIntegracaoId: 1,
    parcelaAcordoId: 10,
  });
  f.state.tables.btgBoletoSnapshots.push(snapshotRow(e));
  return e;
}
function outraParcela(
  id: number,
  acordoId = 4,
  patch: Record<string, unknown> = {}
) {
  f.state.tables.parcelasAcordo.push({
    ...f.state.tables.parcelasAcordo[0],
    id,
    acordoId,
    ...patch,
  });
  if (!f.state.tables.acordos.some(a => a.id === acordoId))
    f.state.tables.acordos.push({ ...f.state.tables.acordos[0], id: acordoId });
  const e = emissao({
    id: 40 + id,
    origemId: id,
    externalId: `v2:sbx:parcela_acordo:${id}:r1`,
  });
  f.state.tables.btgCobrancasEmitidas.push(e);
  f.state.tables.btgBoletoSnapshots.push(snapshotRow(e));
}
function streamsPdf(pdf: Buffer): Buffer[] {
  const regex = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/gs;
  return [...pdf.toString("latin1").matchAll(regex)].map(m => {
    const b = Buffer.from(m[2], "latin1");
    return /\/FlateDecode/.test(m[1]) ? inflateSync(b) : b;
  });
}
function decodificarI25Pdf(pdf: Buffer): string {
  const barras = streamsPdf(pdf).flatMap(stream =>
    [
      ...stream
        .toString("latin1")
        .matchAll(/([\d.]+) ([\d.]+) ([\d.]+) 44 re\b/g),
    ].map(m => ({ x: Number(m[1]), largura: Number(m[3]) }))
  );
  expect(barras).toHaveLength(114);
  const modulo = Math.min(...barras.map(b => b.largura));
  const padroes = [
    "00110",
    "10001",
    "01001",
    "11000",
    "00101",
    "10100",
    "01100",
    "00011",
    "10010",
    "01010",
  ];
  const bit = (largura: number) => {
    expect(
      Math.min(Math.abs(largura / modulo - 1), Math.abs(largura / modulo - 3))
    ).toBeLessThan(0.001);
    return largura / modulo > 2 ? "1" : "0";
  };
  let resultado = "";
  for (let par = 0; par < 22; par++) {
    let pBarra = "",
      pEspaco = "";
    for (let j = 0; j < 5; j++) {
      const i = 2 + par * 5 + j;
      pBarra += bit(barras[i].largura);
      pEspaco += bit(barras[i + 1].x - barras[i].x - barras[i].largura);
    }
    const d1 = padroes.indexOf(pBarra),
      d2 = padroes.indexOf(pEspaco);
    expect(d1).toBeGreaterThanOrEqual(0);
    expect(d2).toBeGreaterThanOrEqual(0);
    resultado += `${d1}${d2}`;
  }
  return resultado;
}
function textoStreams(pdf: Buffer) {
  return streamsPdf(pdf)
    .map(stream =>
      [...stream.toString("latin1").matchAll(/\[([^\]]*)\] TJ/g)]
        .map(m =>
          [...m[1].matchAll(/<([0-9a-f]+)>/gi)]
            .map(hex => Buffer.from(hex[1], "hex").toString("latin1"))
            .join("")
        )
        .join("")
    )
    .join("");
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BTG_SANDBOX", "true");
  vi.stubEnv(
    "BTG_TOKEN_ENCRYPTION_KEY",
    Buffer.alloc(32, 17).toString("base64")
  );
  vi.spyOn(Date, "now").mockReturnValue(agora.getTime());
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Rede real proibida");
    })
  );
  f = fixture();
  mock.db.mockResolvedValue(f.db);
  mock.render.mockResolvedValue(bytesMock);
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  for (const forbidden of [
    mock.consulta,
    mock.post,
    mock.get,
    mock.cancel,
    mock.storagePut,
    mock.storageGet,
    mock.conciliar,
  ])
    expect(forbidden).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("router BTG: fronteira administrativa e entrada", () => {
  it.each([null, "cobrador", "colaborador", "sindico", "administradora"])(
    "nega sessão/perfil %s antes de DB/render em todas as rotas locais",
    async role => {
      const c = caller(role);
      for (const promise of [
        c.situacaoParcela({ parcelaId: 10 }),
        c.listarAcordo({ acordoId: 4 }),
        c.gerarPdf({ parcelaId: 10 }),
        c.gerarLote({ acordoId: 4, parcelaIds: [10] }),
      ])
        await expect(promise).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mock.db).not.toHaveBeenCalled();
      expect(mock.render).not.toHaveBeenCalled();
    }
  );

  it.each([
    { role: "colaborador" },
    { isActive: 0 },
    { isDeleted: 1 },
    { id: 999 },
  ])("reconsulta admin fresco %j apesar de sessão admin", async patch => {
    Object.assign(f.state.tables.users[0], patch);
    const c = caller();
    for (const promise of [
      c.situacaoParcela({ parcelaId: 10 }),
      c.listarAcordo({ acordoId: 4 }),
      c.gerarPdf({ parcelaId: 10 }),
      c.gerarLote({ acordoId: 4, parcelaIds: [10] }),
    ])
      await expect(promise).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.state.locks).toContain("users:share");
    expect(mock.render).not.toHaveBeenCalled();
    expect(f.state.writes).toHaveLength(0);
  });

  it.each([0, -1, 1.5, NaN, Infinity])(
    "nega parcelaId inválido %s antes do DB",
    async parcelaId => {
      await expect(caller().gerarPdf({ parcelaId })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(mock.db).not.toHaveBeenCalled();
      expect(mock.render).not.toHaveBeenCalled();
    }
  );

  it.each([
    { acordoId: 4, parcelaIds: [] },
    { acordoId: 4, parcelaIds: Array.from({ length: 101 }, () => 10) },
    { acordoId: 0, parcelaIds: [10] },
    { acordoId: 4, parcelaIds: [10, -1] },
  ])("nega lote inválido sem banco %j", async input => {
    await expect(caller().gerarLote(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mock.db).not.toHaveBeenCalled();
    expect(mock.render).not.toHaveBeenCalled();
  });

  it("nega banco indisponível sem render", async () => {
    mock.db.mockResolvedValue(null);
    await expect(gerar()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message:
        "Não foi possível obter o documento bancário. Confira o estado e os dados da emissão.",
    });
    expect(mock.render).not.toHaveBeenCalled();
  });

  it("IDs não localizados não usam emissão ou acordo alheios", async () => {
    await expect(caller().gerarPdf({ parcelaId: 999 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    await expect(
      caller().listarAcordo({ acordoId: 999 })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mock.render).not.toHaveBeenCalled();
    expect(f.state.writes).toHaveLength(0);
  });
});

describe("router BTG: identidade/estado e integridade bloqueiam antes de render", () => {
  const casos: [string, () => void][] = [
    [
      "devedor de outro condomínio",
      () => {
        f.state.tables.devedores[0].condominioId = 99;
      },
    ],
    [
      "devedor ausente",
      () => {
        f.state.tables.devedores = [];
      },
    ],
    [
      "condomínio ausente",
      () => {
        f.state.tables.condominios = [];
      },
    ],
    [
      "acordo ausente",
      () => {
        f.state.tables.acordos = [];
      },
    ],
    [
      "emissão de outra parcela",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].origemId = 999;
      },
    ],
    [
      "emissão de outro tipo",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].origemTipo = "cobranca";
      },
    ],
    [
      "emissão de outro condomínio",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].condominioId = 99;
      },
    ],
    [
      "integração alheia",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].btgIntegracaoId = 99;
      },
    ],
    [
      "conta alheia",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].btgContaRecebedoraId = 99;
      },
    ],
    [
      "conta de outra integração",
      () => {
        f.state.tables.btgContasRecebedoras[0].btgIntegracaoId = 99;
      },
    ],
    [
      "agência divergente",
      () => {
        f.state.tables.btgContasRecebedoras[0].agencia = "50";
      },
    ],
    [
      "conta sem zeros divergente",
      () => {
        f.state.tables.btgContasRecebedoras[0].numero = "432260";
      },
    ],
    [
      "beneficiário divergente",
      () => {
        f.state.tables.btgContasRecebedoras[0].documentoBeneficiario =
          "11111111111111";
      },
    ],
    [
      "integração inativa",
      () => {
        f.state.tables.btgIntegracoes[0].ativo = 0;
      },
    ],
    [
      "ambiente diferente",
      () => {
        f.state.tables.btgIntegracoes[0].ambiente = "producao";
      },
    ],
    [
      "canal CNAB",
      () => {
        f.state.tables.parcelasAcordo[0].canalBancario = "cnab240";
      },
    ],
    [
      "canal legado",
      () => {
        f.state.tables.parcelasAcordo[0].canalBancario = "legado";
      },
    ],
    [
      "canal ausente",
      () => {
        f.state.tables.parcelasAcordo[0].canalBancario = null;
      },
    ],
    [
      "valor da parcela divergente",
      () => {
        f.state.tables.parcelasAcordo[0].amount++;
      },
    ],
    [
      "vencimento da parcela divergente",
      () => {
        f.state.tables.parcelasAcordo[0].dueDate = new Date("2025-02-23Z");
      },
    ],
    [
      "revisão sem recuperação comprovada",
      () => {
        f.state.tables.btgCobrancasEmitidas.push(
          emissao({ id: 41, revisao: 2 })
        );
      },
    ],
    [
      "revisão duplicada",
      () => {
        f.state.tables.btgCobrancasEmitidas.push(emissao({ id: 41 }));
      },
    ],
    [
      "barras ausentes",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].codigoBarras = null;
      },
    ],
    [
      "linha ausente",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].linhaDigitavel = null;
      },
    ],
    [
      "nosso número ausente",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].nossoNumero = null;
      },
    ],
    [
      "URL bancária sem dados não é fallback",
      () => {
        Object.assign(f.state.tables.btgCobrancasEmitidas[0], {
          codigoBarras: null,
          linhaDigitavel: null,
          bankSlipUrl: "https://bank.example.test/nao-baixar.pdf",
        });
      },
    ],
    [
      "DV barras inválido",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].codigoBarras =
          "0" + codigoBarras.slice(1);
      },
    ],
    [
      "DV linha inválido",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].linhaDigitavel =
          linhaDigitavel.slice(0, 9) + "1" + linhaDigitavel.slice(10);
      },
    ],
    [
      "valor bancário não coincide",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].amount++;
        f.state.tables.parcelasAcordo[0].amount++;
      },
    ],
    [
      "fator vencimento não coincide",
      () => {
        const date = new Date("2025-02-23T00:30:00Z");
        f.state.tables.btgCobrancasEmitidas[0].dueDate = date;
        f.state.tables.parcelasAcordo[0].dueDate = date;
      },
    ],
    [
      "snapshot ausente",
      () => {
        f.state.tables.btgBoletoSnapshots = [];
      },
    ],
    [
      "snapshot incompleto",
      () => {
        f.state.tables.btgBoletoSnapshots[0].estado = "incompleto";
      },
    ],
    [
      "snapshot hash adulterado",
      () => {
        f.state.tables.btgBoletoSnapshots[0].dadosSha256 = "0".repeat(64);
      },
    ],
    [
      "snapshot cifra adulterada",
      () => {
        f.state.tables.btgBoletoSnapshots[0].dadosCifrados = "v1:invalido";
      },
    ],
    [
      "snapshot metadata divergente",
      () => {
        f.state.tables.btgBoletoSnapshots[0].revisao = 99;
      },
    ],
  ];
  it.each(casos)(
    "bloqueia %s sem render/network/escrita",
    async (_nome, mudar) => {
      mudar();
      await expect(gerar()).rejects.toThrow();
      expect(mock.render).not.toHaveBeenCalled();
      expect(f.state.writes).toHaveLength(0);
    }
  );

  it.each([
    "paga",
    "cancelada",
    "expirada",
    "incerta",
    "enviando",
    "reservada",
    "falha",
  ])(
    "bloqueia emissão %s antes de render e não oferece meios na projeção",
    async status => {
      f.state.tables.btgCobrancasEmitidas[0].status = status;
      await expect(gerar()).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
      expect(await caller().situacaoParcela({ parcelaId: 10 })).toMatchObject({
        pdfDisponivel: false,
        pagamentoPermitido: false,
        codigoBarras: null,
        linhaDigitavel: null,
        pixCopiaECola: null,
        nossoNumero: null,
      });
      expect(mock.render).not.toHaveBeenCalled();
      expect(f.state.writes).toHaveLength(0);
    }
  );

  it.each(["pago", "cancelado"])(
    "bloqueia parcela %s antes de render",
    async status => {
      f.state.tables.parcelasAcordo[0].status = status;
      await expect(gerar()).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
      expect(mock.render).not.toHaveBeenCalled();
      expect(f.state.writes).toHaveLength(0);
    }
  );

  it.each(["solicitada", "em_confirmacao", "conflito_pagamento"])(
    "cancelamento ativo %s retira meios de pagamento e bloqueia PDF",
    async estado => {
      f.state.tables.btgCancelamentos.push({
        id: 20,
        btgCobrancaEmitidaId: 40,
        estado,
        chaveOperacao: "op-40",
      });
      await expect(gerar()).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
      expect(await caller().situacaoParcela({ parcelaId: 10 })).toMatchObject({
        codigo: "cancelamento_pendente",
        pdfDisponivel: false,
        pagamentoPermitido: false,
        codigoBarras: null,
        linhaDigitavel: null,
        pixCopiaECola: null,
        operacaoCancelamento: { operacaoId: "op-40", estado },
      });
      expect(mock.render).not.toHaveBeenCalled();
      expect(f.state.writes).toHaveLength(0);
    }
  );

  it.each(["PAGAMENTO_REQUER_CONCILIACAO", "DOC_TITULO_INDISPONIVEL"])(
    "bloqueia resultado remoto %s sem refresh automático",
    async erroCodigo => {
      f.state.tables.btgCobrancasEmitidas[0].erroCodigo = erroCodigo;
      await expect(gerar()).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
      expect(mock.render).not.toHaveBeenCalled();
    }
  );
});

describe("router BTG: documento local fiel, sem URL/POST/storage/fallback CNAB", () => {
  it("entrega apenas contrato base64/nome/MIME e audita emissão/revisão sem alterar título", async () => {
    const antes = structuredClone(f.state.tables.btgCobrancasEmitidas);
    expect(await gerar()).toEqual({
      parcelaId: 10,
      base64: bytesMock.toString("base64"),
      nomeArquivo: "boleto-btg-parcela-10-r1.pdf",
      mimeType: "application/pdf",
    });
    expect(f.state.tables.btgCobrancasEmitidas).toEqual(antes);
    expect(f.state.transactions).toBe(2);
    expect(f.state.locks).toContain("parcelasAcordo:share");
    expect(f.state.locks).toContain("btgCobrancasEmitidas:share");
    expect(f.state.writes.map(w => w.table)).toEqual(["auditLogs"]);
    expect(f.state.tables.auditLogs[0]).toMatchObject({
      userId: 5,
      userRole: "admin",
      condominioId: 3,
      entityId: "btg-boleto:40",
      success: 1,
    });
    expect(JSON.parse(f.state.tables.auditLogs[0].metadata)).toEqual({
      evento: "pdf_btg_gerado",
      emissaoId: 40,
      revisao: 1,
      parcelaId: 10,
    });
  });

  it("ignora body/IDs/URL arbitrários e utiliza somente snapshot histórico e códigos recebidos", async () => {
    await caller().gerarPdf({
      parcelaId: 10,
      emissaoId: 999,
      acordoId: 999,
      url: "https://evil.example.test/pdf",
      pagamentoBancario: { origem: "cnab", codigoBarras: "0".repeat(44) },
      nomeSacado: "Injetado",
      valor: 1,
    } as any);
    const dados = mock.render.mock.calls[0][0] as DadosBoleto;
    expect(dados).toMatchObject({
      valor: 5000,
      nomeSacado: "Pagador Histórico",
      cpfCnpjSacado: "00000000000",
      nomeBeneficiario: "Beneficiário Histórico",
      agencia: "0050",
      conta: "0000432260",
      carteira: "",
      convenio: "",
      nossoNumero: emissao().nossoNumero,
      seuNumero: "PA10R1",
      pixCopiaCola: pix,
      pagamentoBancario: { origem: "btg_api", codigoBarras, linhaDigitavel },
      credorTitulo: "Credor Histórico",
      contextoAcordo: { totalNegociado: 5000 },
    });
    expect(dados.enderecoSacado).toContain("Rua da Emissão, 807");
    expect(JSON.stringify(dados)).not.toMatch(
      /NÃO USAR|Injetado|evil|bank\.example/
    );
    expect(f.state.writes.map(w => w.table)).toEqual(["auditLogs"]);
  });

  it("entrega PDF real cujas barras I25 e linha visível reproduzem os mesmos 44/47 dígitos", async () => {
    const real =
      await vi.importActual<typeof import("./boleto-pdf")>("./boleto-pdf");
    mock.render.mockImplementation(real.gerarBoletoPDF);
    const result = await gerar();
    const pdf = Buffer.from(result.base64, "base64");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(decodificarI25Pdf(pdf)).toBe(codigoBarras);
    const texto = textoStreams(pdf);
    expect(texto).toContain(linhaFormatada);
    expect(texto).toContain(emissao().nossoNumero!);
    expect(texto).toContain("Rua da Emissão, 807");
    expect(texto).not.toContain("NÃO USAR");
  });

  it("linha originalmente formatada é normalizada nas duas fases sem falso bloqueio", async () => {
    f.state.tables.btgCobrancasEmitidas[0].linhaDigitavel = linhaFormatada;
    expect(await gerar()).toMatchObject({ mimeType: "application/pdf" });
    expect(mock.render.mock.calls[0][0].pagamentoBancario.linhaDigitavel).toBe(
      linhaDigitavel
    );
  });

  it("usa a revisão atual somente quando cadeia de recuperação é válida", async () => {
    novaRevisao();
    const result = await gerar();
    expect(result.nomeArquivo).toBe("boleto-btg-parcela-10-r2.pdf");
    expect(mock.render.mock.calls[0][0].seuNumero).toBe("PA10R2");
    expect(JSON.parse(f.state.tables.auditLogs[0].metadata)).toMatchObject({
      emissaoId: 41,
      revisao: 2,
    });
  });

  it("Pix inválido não é substituído por Pix estático ou reconstruído do cadastro", async () => {
    f.state.tables.btgCobrancasEmitidas[0].pixCopiaECola = "EMV-INVALIDO";
    await gerar();
    expect(mock.render.mock.calls[0][0].pixCopiaCola).toBeUndefined();
    expect(mock.render.mock.calls[0][0].pagamentoBancario).toEqual({
      origem: "btg_api",
      codigoBarras,
      linhaDigitavel,
    });
  });

  it("leitura de situação/lista não deriva captura, audita, grava ou consulta banco BTG", async () => {
    captura();
    outraParcela(11, 99);
    expect(await caller().situacaoParcela({ parcelaId: 10 })).toMatchObject({
      pdfDisponivel: true,
      codigoBarras,
      linhaDigitavel,
    });
    const lista = await caller().listarAcordo({ acordoId: 4 });
    expect(lista.parcelas.map(p => p.parcelaId)).toEqual([10]);
    expect(
      f.state.tables.btgBoletoSnapshots.some(s => s.btgCobrancaEmitidaId === 40)
    ).toBe(false);
    expect(f.state.writes).toHaveLength(0);
    expect(mock.render).not.toHaveBeenCalled();
  });

  it.each([
    "hash",
    "tamanho",
    "cifra",
    "pedido_parcial",
    "metadata",
    "prazo",
    "resposta_incompleta",
  ])(
    "projeção não habilita PDF por metadata superficial de captura inválida: %s",
    async caso => {
      captura();
      const d = f.state.tables.btgHttpDiagnosticos[0];
      if (caso === "hash") d.payloadSha256 = "0".repeat(64);
      if (caso === "tamanho") d.payloadBytes++;
      if (caso === "cifra") d.payloadCifrado = "v1:adulterado";
      if (caso === "metadata") d.condominioId = 99;
      if (caso === "prazo")
        d.capturaCriadaEm = new Date(
          agora.getTime() - 30 * 24 * 60 * 60 * 1000 - 1
        );
      if (caso === "resposta_incompleta") d.respostaCompleta = 0;
      if (caso === "pedido_parcial") {
        const p = JSON.parse(pedido());
        delete p.payer.address.city;
        const bytes = Buffer.from(JSON.stringify(p));
        d.payloadCifrado = cifrarDiagnosticoBtg(bytes, aadDiagnosticoBtg(d));
        d.payloadSha256 = hashBoletoBtg(bytes);
        d.payloadBytes = bytes.length;
      }
      expect(await caller().situacaoParcela({ parcelaId: 10 })).toMatchObject({
        pdfDisponivel: false,
        codigo: "snapshot_indisponivel",
        codigoBarras,
        linhaDigitavel,
      });
      expect(f.state.tables.btgBoletoSnapshots).toHaveLength(0);
      expect(f.state.writes).toHaveLength(0);
      expect(mock.render).not.toHaveBeenCalled();
    }
  );

  it("PDF deriva snapshot antigo comprovado, sem resumo do acordo atual", async () => {
    captura();
    await gerar();
    expect(mock.render.mock.calls[0][0]).toMatchObject({
      nomeSacado: "Pagador Histórico",
      contextoAcordo: undefined,
    });
    expect(f.state.tables.btgBoletoSnapshots).toHaveLength(1);
    expect(
      f.state.tables.auditLogs.map(a => JSON.parse(a.metadata).evento)
    ).toEqual(["snapshot_derivado_captura", "pdf_btg_gerado"]);
  });

  it("primeira fase reverte derivação se auditoria falha, sem renderização", async () => {
    captura();
    f.state.failAudit = true;
    const erro = await gerar().catch(e => e);
    expect(erro).toMatchObject({
      code: "PRECONDITION_FAILED",
      message:
        "Não foi possível obter o documento bancário. Confira o estado e os dados da emissão.",
    });
    expect(erro.message).not.toMatch(/audit unavailable|SQL|INSERT|auditLogs/i);
    expect(mock.render).not.toHaveBeenCalled();
    expect(f.state.tables.btgBoletoSnapshots).toHaveLength(0);
    expect(f.state.tables.auditLogs).toHaveLength(0);
    expect(f.state.writes).toHaveLength(0);
  });
});

describe("router BTG: lote pré-validado e falhas por item sem refresh", () => {
  it.each([{ parcelaIds: [10, 11] }, { parcelaIds: [11, 10] }])(
    "qualquer ID de outro acordo invalida todo lote antes de gerar: %j",
    async ({ parcelaIds }) => {
      outraParcela(11, 99);
      await expect(
        caller().gerarLote({ acordoId: 4, parcelaIds })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(mock.render).not.toHaveBeenCalled();
      expect(f.state.writes).toHaveLength(0);
    }
  );

  it("ID inexistente no fim invalida lote inteiro antes de qualquer documento", async () => {
    await expect(
      caller().gerarLote({ acordoId: 4, parcelaIds: [10, 999] })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mock.render).not.toHaveBeenCalled();
    expect(f.state.writes).toHaveLength(0);
  });

  it("lote deduplica IDs, preserva ordem e retorna estados inaptos como falhas de item", async () => {
    outraParcela(11, 4, { status: "pago" });
    outraParcela(12);
    f.state.tables.btgCobrancasEmitidas.find(e => e.origemId === 12)!.status =
      "cancelada";
    outraParcela(13);
    f.state.tables.btgCobrancasEmitidas.find(
      e => e.origemId === 13
    )!.codigoBarras = null;
    outraParcela(14);
    f.state.tables.btgCancelamentos.push({
      id: 90,
      btgCobrancaEmitidaId: 54,
      estado: "em_confirmacao",
    });
    const result = await caller().gerarLote({
      acordoId: 4,
      parcelaIds: [11, 10, 12, 13, 14, 10],
    });
    expect(
      result.itens.map(i => ({ parcelaId: i.parcelaId, ok: i.ok }))
    ).toEqual([
      { parcelaId: 11, ok: false },
      { parcelaId: 10, ok: true },
      { parcelaId: 12, ok: false },
      { parcelaId: 13, ok: false },
      { parcelaId: 14, ok: false },
    ]);
    for (const item of result.itens.filter(i => !i.ok))
      expect(item).toEqual({
        ok: false,
        parcelaId: item.parcelaId,
        mensagem:
          "Documento indisponível; confira a situação e os dados da emissão.",
      });
    expect(mock.render).toHaveBeenCalledTimes(1);
    expect(f.state.tables.auditLogs).toHaveLength(1);
  });

  it("falha local de render não expõe detalhes e não impede próximo item", async () => {
    outraParcela(11);
    mock.render
      .mockRejectedValueOnce(new Error("Bearer segredo/PII interna"))
      .mockResolvedValueOnce(bytesMock);
    const result = await caller().gerarLote({
      acordoId: 4,
      parcelaIds: [10, 11],
    });
    expect(result.itens[0]).toMatchObject({ ok: false, parcelaId: 10 });
    expect(result.itens[1]).toMatchObject({
      ok: true,
      parcelaId: 11,
      mimeType: "application/pdf",
    });
    expect(JSON.stringify(result)).not.toMatch(/Bearer|segredo|PII/);
    expect(f.state.tables.auditLogs).toHaveLength(1);
  });
});

describe("router BTG: segunda fase aborta antes de entregar bytes se contexto muda durante render", () => {
  const corridas: [string, () => void, string][] = [
    [
      "admin perde role",
      () => {
        f.state.tables.users[0].role = "colaborador";
      },
      "FORBIDDEN",
    ],
    [
      "admin inativado",
      () => {
        f.state.tables.users[0].isActive = 0;
      },
      "FORBIDDEN",
    ],
    [
      "admin excluído",
      () => {
        f.state.tables.users[0].isDeleted = 1;
      },
      "FORBIDDEN",
    ],
    [
      "parcela paga",
      () => {
        f.state.tables.parcelasAcordo[0].status = "pago";
      },
      "PRECONDITION_FAILED",
    ],
    [
      "parcela cancelada",
      () => {
        f.state.tables.parcelasAcordo[0].status = "cancelado";
      },
      "PRECONDITION_FAILED",
    ],
    [
      "emissão paga",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].status = "paga";
      },
      "PRECONDITION_FAILED",
    ],
    [
      "emissão cancelada",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].status = "cancelada";
      },
      "PRECONDITION_FAILED",
    ],
    [
      "cancelamento solicitado",
      () => {
        f.state.tables.btgCancelamentos.push({
          id: 90,
          btgCobrancaEmitidaId: 40,
          estado: "solicitada",
        });
      },
      "PRECONDITION_FAILED",
    ],
    [
      "revisão nova válida",
      () => {
        novaRevisao();
      },
      "PRECONDITION_FAILED",
    ],
    [
      "emissão ID substituído",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].id = 99;
      },
      "PRECONDITION_FAILED",
    ],
    [
      "valor parcela e emissão mudou",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].amount++;
        f.state.tables.parcelasAcordo[0].amount++;
      },
      "PRECONDITION_FAILED",
    ],
    [
      "data parcela e emissão mudou",
      () => {
        const d = new Date("2025-02-23Z");
        f.state.tables.btgCobrancasEmitidas[0].dueDate = d;
        f.state.tables.parcelasAcordo[0].dueDate = d;
      },
      "PRECONDITION_FAILED",
    ],
    [
      "barras removidas",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].codigoBarras = null;
      },
      "PRECONDITION_FAILED",
    ],
    [
      "linha removida",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].linhaDigitavel = null;
      },
      "PRECONDITION_FAILED",
    ],
    [
      "nosso número mudou",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].nossoNumero = "outro";
      },
      "PRECONDITION_FAILED",
    ],
    [
      "Pix mudou",
      () => {
        f.state.tables.btgCobrancasEmitidas[0].pixCopiaECola = "outro";
      },
      "PRECONDITION_FAILED",
    ],
    [
      "canal mudou para CNAB",
      () => {
        f.state.tables.parcelasAcordo[0].canalBancario = "cnab240";
      },
      "PRECONDITION_FAILED",
    ],
    [
      "identidade conta mudou",
      () => {
        f.state.tables.btgContasRecebedoras[0].numero = "outra";
      },
      "PRECONDITION_FAILED",
    ],
  ];
  it.each(corridas)(
    "%s: descarta bytes já renderizados e não audita sucesso",
    async (_nome, mudar, code) => {
      mock.render.mockImplementationOnce(async () => {
        mudar();
        return bytesMock;
      });
      const entregou = vi.fn();
      await expect(
        gerar().then(result => {
          entregou(result);
          return result;
        })
      ).rejects.toMatchObject({ code });
      expect(mock.render).toHaveBeenCalledTimes(1);
      expect(entregou).not.toHaveBeenCalled();
      expect(f.state.transactions).toBe(2);
      expect(f.state.tables.auditLogs).toHaveLength(0);
      expect(f.state.writes).toHaveLength(0);
    }
  );

  it("segunda validação permite só mudança de separadores, não códigos divergentes", async () => {
    mock.render.mockImplementationOnce(async () => {
      f.state.tables.btgCobrancasEmitidas[0].linhaDigitavel = linhaFormatada;
      return bytesMock;
    });
    expect(await gerar()).toMatchObject({
      base64: bytesMock.toString("base64"),
    });
    expect(f.state.tables.auditLogs).toHaveLength(1);
  });

  it("linha adulterada durante render aborta pela segunda validação sem entregar/auditar", async () => {
    mock.render.mockImplementationOnce(async () => {
      f.state.tables.btgCobrancasEmitidas[0].linhaDigitavel =
        "0" + linhaDigitavel.slice(1);
      return bytesMock;
    });
    const entregou = vi.fn();
    await expect(gerar().then(entregou)).rejects.toThrow();
    expect(entregou).not.toHaveBeenCalled();
    expect(f.state.tables.auditLogs).toHaveLength(0);
    expect(f.state.writes).toHaveLength(0);
  });

  it("auditoria final indisponível aborta entrega e reverte escrita da segunda fase", async () => {
    mock.render.mockImplementationOnce(async () => {
      f.state.failAudit = true;
      return bytesMock;
    });
    const entregou = vi.fn();
    const erro = await gerar()
      .then(entregou)
      .catch(e => e);
    expect(erro).toMatchObject({
      code: "PRECONDITION_FAILED",
      message:
        "Não foi possível obter o documento bancário. Confira o estado e os dados da emissão.",
    });
    expect(erro.message).not.toMatch(/audit unavailable|SQL|INSERT|auditLogs/i);
    expect(entregou).not.toHaveBeenCalled();
    expect(mock.render).toHaveBeenCalledTimes(1);
    expect(f.state.tables.auditLogs).toHaveLength(0);
    expect(f.state.writes).toHaveLength(0);
    expect(f.state.tables.btgBoletoSnapshots).toHaveLength(1);
  });

  it("render rejeitado nunca executa fase final nem registra sucesso do PDF", async () => {
    mock.render.mockRejectedValueOnce(
      new Error("Falha local de render: Bearer segredo SQL interno")
    );
    const erro = await gerar().catch(e => e);
    expect(erro).toMatchObject({
      code: "PRECONDITION_FAILED",
      message:
        "Não foi possível obter o documento bancário. Confira o estado e os dados da emissão.",
    });
    expect(erro.message).not.toMatch(/Falha local|Bearer|segredo|SQL/i);
    expect(f.state.transactions).toBe(1);
    expect(f.state.tables.auditLogs).toHaveLength(0);
    expect(f.state.writes).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarDbCanaisEmMemoria } from "./btg-canais-test-db";

const mock = vi.hoisted(() => ({ consulta: vi.fn(), contexto: vi.fn() }));
vi.mock("./btg-v2/reenvio-consulta", () => ({ consultarSituacaoRecuperacaoBtg: mock.consulta }));
vi.mock("./btg-v2/titulo-contexto", async original => ({
  ...(await original<typeof import("./btg-v2/titulo-contexto")>()),
  carregarTituloBtg: mock.contexto,
}));
vi.mock("./btg-v2/boleto-snapshot", () => ({ obterSnapshotBoletoBtg: vi.fn(async () => null) }));
import { consultarDadosBoletoBtg } from "./btg-v2/boleto-consulta";

const barras = "20898100000000050000012345678901234567890123";
const linha = "20890012304567890123745678901237810000000005000";
const vencimento = new Date("2025-02-22T00:00:00Z");
function tlv(id: string, value: string) {
  return id + String(Buffer.byteLength(value)).padStart(2, "0") + value;
}
function pixFixture(gui = "br.gov.bcb.pix") {
  const corpo = tlv("00", "01") + tlv("01", "12") + tlv("26", tlv("00", gui) + tlv("25", "qr.example.test/ficticio"))
    + tlv("52", "0000") + tlv("53", "986") + tlv("58", "BR") + tlv("59", "BENEFICIARIO FICTICIO")
    + tlv("60", "RIO DE JANEIRO") + tlv("62", tlv("05", "***")) + "6304";
  let crc = 0xffff;
  for (const byte of Buffer.from(corpo)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  return corpo + crc.toString(16).toUpperCase().padStart(4, "0");
}
function fixture(pixAnterior: string | null = null) {
  const emissao = {
    id: 40, origemId: 10, revisao: 1, status: "emitida", amount: 5000, dueDate: vencimento,
    btgCollectionId: "col-ficticia", agenciaRecebedora: "0050", contaRecebedora: "0000432260",
    documentoBeneficiario: "00000000000000", externalId: "v2:sbx:parcela_acordo:10:r1", condominioId: 3,
    codigoBarras: barras, linhaDigitavel: linha, nossoNumero: "0000123", pixCopiaECola: pixAnterior,
  };
  const f = criarDbCanaisEmMemoria({ btgCobrancasEmitidas: [emissao], auditLogs: [] });
  // A autorização e identidade reais possuem suíte própria. Aqui isolamos o merge e o validador Pix.
  mock.contexto.mockImplementation(async () => ({
    emissao: f.state.tables.btgCobrancasEmitidas[0], identidadeValida: true,
    situacao: { codigo: "disponivel", mensagem: "Título fictício válido", pagamentoPermitido: true },
    parcela: { id: 10, amount: 5000, dueDate: vencimento }, acordo: { id: 4 },
    integracao: { ambiente: "sandbox" }, operacoes: [],
  }));
  return f;
}
function resposta(pix?: string) {
  return { completa: true, cobrancas: [{
    collectionId: "col-ficticia", correlationId: "btgv2-40", type: "BANKSLIP_QRCODE",
    valorCentavos: 5000, dueDate: "2025-02-22", agencia: "0050", conta: "0000432260",
    documentoBeneficiario: "00000000000000", externalId: "v2:sbx:parcela_acordo:10:r1",
    documentNumber: "PA10R1", status: "CREATED", ...(pix ? { pixCopiaECola: pix } : {}),
  }] };
}
beforeEach(() => vi.clearAllMocks());

describe("consulta documental BTG preserva Pix com GUI minúsculo", () => {
  it("merge persiste exatamente os bytes novos e devolve Pix na projeção sem alterar o título", async () => {
    const f = fixture(), payload = pixFixture();
    mock.consulta.mockResolvedValue(resposta(payload));
    const result = await consultarDadosBoletoBtg({ db: f.db as never, usuarioId: 5, parcelaId: 10 });
    expect(result.pixCopiaECola).toBe(payload);
    expect(f.state.tables.btgCobrancasEmitidas[0]).toMatchObject({
      pixCopiaECola: payload, status: "emitida", amount: 5000, dueDate: vencimento, codigoBarras: barras, linhaDigitavel: linha,
    });
    expect(mock.consulta).toHaveBeenCalledTimes(1);
    expect(mock.consulta).toHaveBeenCalledWith({ collectionId: "col-ficticia", correlationId: "btgv2-40" });
    expect(f.state.tables.auditLogs).toHaveLength(1);
    expect(f.state.tables.auditLogs[0].metadata).not.toContain(payload);
  });
  it("resposta parcial sem Pix conserva o payload anterior e o devolve sem normalização", async () => {
    const payload = pixFixture(), f = fixture(payload);
    mock.consulta.mockResolvedValue(resposta());
    const result = await consultarDadosBoletoBtg({ db: f.db as never, usuarioId: 5, parcelaId: 10 });
    expect(result.pixCopiaECola).toBe(payload);
    expect(f.state.tables.btgCobrancasEmitidas[0].pixCopiaECola).toBe(payload);
  });
  it("CRC inválido na consulta continua recusado e faz rollback sem gravar Pix ou auditoria", async () => {
    const f = fixture();
    const antes = structuredClone(f.state.tables.btgCobrancasEmitidas[0]);
    mock.consulta.mockResolvedValue(resposta(pixFixture().slice(0, -4) + "ZZZZ"));
    await expect(consultarDadosBoletoBtg({ db: f.db as never, usuarioId: 5, parcelaId: 10 })).rejects.toThrow(/CRC/i);
    expect(f.state.tables.btgCobrancasEmitidas[0]).toEqual(antes);
    expect(f.state.tables.auditLogs).toHaveLength(0);
  });
});

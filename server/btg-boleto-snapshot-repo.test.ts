import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarDbCanaisEmMemoria } from "./btg-canais-test-db";
import {
  obterSnapshotBoletoBtg,
  registrarSnapshotDoPedidoBtg,
} from "./btg-v2/boleto-snapshot";
import {
  cifrarSnapshotBoletoBtg,
  decifrarSnapshotBoletoBtg,
  hashBoletoBtg,
  snapshotDoPedidoBtg,
} from "./btg-v2/boleto-snapshot-dominio";
import {
  aadDiagnosticoBtg,
  cifrarDiagnosticoBtg,
  RETENCAO_DIAGNOSTICO_BTG_MS,
} from "./btg-v2/diagnosticos-crypto";
import { montarPayloadBolePixV2 } from "./btg-v2/bolepix";
import type { EmissaoTituloBtg } from "./btg-v2/titulo-contexto";

// Nenhum getDb, driver SQL ou cliente HTTP é utilizado: só a fixture Drizzle em memória.
const agora = new Date("2026-11-09T14:00:00Z");
const emissao = {
  id: 40,
  revisao: 1,
  origemTipo: "parcela_acordo",
  origemId: 10,
  btgIntegracaoId: 1,
  btgContaRecebedoraId: 2,
  condominioId: 3,
  externalId: "v2:sbx:parcela_acordo:10:r1",
  amount: 5000,
  dueDate: new Date("2025-02-22T00:30:00Z"),
  agenciaRecebedora: "0050",
  contaRecebedora: "0000432260",
  nomeBeneficiario: "Beneficiário Histórico",
  documentoBeneficiario: "00000000000000",
  status: "emitida",
} as EmissaoTituloBtg;

function pedido() {
  return montarPayloadBolePixV2({
    amountCentavos: emissao.amount,
    dueDate: emissao.dueDate,
    overDueDate: new Date("2025-03-22T00:00:00Z"),
    description: "Parcela sintética",
    externalId: emissao.externalId,
    documentNumber: "PA10R1",
    correlationId: "btgv2-40",
    account: {
      agencia: emissao.agenciaRecebedora,
      numero: emissao.contaRecebedora,
    },
    payer: {
      name: "Pagador Histórico",
      document: "00000000000",
      email: "nao-guardar@example.test",
      phone: "2130001234",
      address: {
        street: "Rua da Emissão",
        number: "807",
        complement: "Sala 2",
        neighborhood: "Centro",
        city: "Rio de Janeiro",
        state: "RJ",
        zipCode: "20000000",
      },
    },
  });
}

function fixture() {
  return criarDbCanaisEmMemoria({
    parcelasAcordo: [
      {
        id: 10,
        acordoId: 4,
        installmentNumber: 1,
        amount: 5000,
        dueDate: emissao.dueDate,
        status: "pendente",
      },
    ],
    acordos: [{ id: 4, condominioId: 3, devedorId: 6, agreedAmount: 5000 }],
    condominios: [{ id: 3, name: "Credor no registro" }],
    devedores: [
      {
        id: 6,
        name: "Cadastro atual NÃO é fonte",
        cpfCnpj: "99999999999",
        street: "Rua Atual",
      },
    ],
    btgCobrancasEmitidas: [emissao],
    btgBoletoSnapshots: [],
    btgHttpDiagnosticos: [],
    auditLogs: [],
  });
}
let f: ReturnType<typeof fixture>;
const body = () => JSON.stringify(pedido());
const obter = (derivar = true, e = emissao) =>
  obterSnapshotBoletoBtg(f.db, e, 5, derivar);
const registrar = (payload = body(), e = emissao) =>
  f.db.transaction((tx: any) =>
    registrarSnapshotDoPedidoBtg(tx, e, payload, 5, 70)
  );

function captura(patch: Record<string, unknown> = {}, payload = body()) {
  const bytes = Buffer.from(payload);
  const row = {
    id: 70,
    chaveCaptura: "cd35ec80-c530-4cae-85cf-a144148f9371",
    ambiente: "sandbox",
    btgIntegracaoId: 1,
    btgCobrancaEmitidaId: 40,
    parcelaAcordoId: 10,
    condominioId: 3,
    usuarioId: 5,
    operacao: "emissao",
    estadoCaptura: "resposta_recebida",
    httpStatus: 201,
    correlationId: "btgv2-40",
    respostaCompleta: 1,
    payloadBytes: bytes.length,
    payloadSha256: hashBoletoBtg(bytes),
    payloadCifrado: "",
    capturaCriadaEm: agora,
    conteudoExpurgadoEm: null,
    versaoCriptografia: "v1",
    respostaRecebidaEm: agora,
  };
  row.payloadCifrado = cifrarDiagnosticoBtg(bytes, aadDiagnosticoBtg(row));
  Object.assign(row, patch);
  f.state.tables.btgHttpDiagnosticos.push(row);
  return row;
}
function adulterarCifra(envelope: string) {
  const partes = envelope.split(":");
  const tag = Buffer.from(partes[2], "base64url");
  tag[0] ^= 1;
  partes[2] = tag.toString("base64url");
  return partes.join(":");
}

beforeEach(() => {
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
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("repositório documental: registro do pedido, sem backfill de cadastro", () => {
  it("registra snapshot completo cifrado, hashes/contexto e auditoria sem PII aberta", async () => {
    const payload = body();
    await registrar(payload);
    const row = f.state.tables.btgBoletoSnapshots[0];
    expect(row).toMatchObject({
      btgCobrancaEmitidaId: 40,
      btgIntegracaoId: 1,
      parcelaAcordoId: 10,
      condominioId: 3,
      revisao: 1,
      diagnosticoId: 70,
      usuarioId: 5,
      estado: "completo",
      payloadSha256: hashBoletoBtg(payload),
    });
    const s = decifrarSnapshotBoletoBtg(
      row.dadosCifrados,
      row.dadosSha256,
      emissao
    );
    expect(s.pagador).toMatchObject({
      nome: "Pagador Histórico",
      documento: "00000000000",
      endereco: { rua: "Rua da Emissão", numero: "807", complemento: "Sala 2" },
    });
    expect(s.contextoAcordo).toMatchObject({
      acordoId: 4,
      totalNegociado: 5000,
      credorTitulo: "Credor no registro",
      parcelas: [{ id: 10, amount: 5000 }],
    });
    expect(row.dadosSha256).toBe(hashBoletoBtg(JSON.stringify(s)));
    expect(JSON.stringify(s)).not.toMatch(/nao-guardar|phoneNumber|email/);
    expect(JSON.stringify(f.state.writes)).not.toMatch(
      /Pagador Histórico|Rua da Emissão|nao-guardar|2130001234/
    );
    expect(JSON.parse(f.state.tables.auditLogs[0].metadata)).toEqual({
      evento: "snapshot_registrado",
      emissaoId: 40,
      revisao: 1,
      completo: true,
    });
    expect(f.state.writes.map(w => w.table)).toEqual([
      "btgBoletoSnapshots",
      "auditLogs",
    ]);
  });

  it("leitura preserva pagador, credor e acordo congelados mesmo após cadastro/plano alterados", async () => {
    await registrar();
    const antes = await obter(false);
    f.state.tables.devedores[0].name = "Pagador atual alterado";
    f.state.tables.condominios[0].name = "Credor atual alterado";
    f.state.tables.acordos[0].agreedAmount = 999999;
    f.state.tables.parcelasAcordo[0].amount = 999999;
    f.state.writes.splice(0);
    f.db.select.mockClear();
    expect(await obter(false)).toEqual(antes);
    expect(f.db.select).toHaveBeenCalledTimes(1);
    expect(f.state.writes).toHaveLength(0);
  });

  it.each(["endereco", "nome", "documento", "beneficiario", "json"])(
    "pedido parcial/inválido %s permanece incompleto, sem complemento pelo cadastro",
    async caso => {
      const p: any = pedido();
      let payload: string;
      if (caso === "endereco") delete p.payer.address;
      if (caso === "nome") delete p.payer.name;
      if (caso === "documento") p.payer.taxId = "";
      const e =
        caso === "beneficiario"
          ? ({ ...emissao, nomeBeneficiario: null } as EmissaoTituloBtg)
          : emissao;
      payload = caso === "json" ? "{parcial" : JSON.stringify(p);
      await registrar(payload, e);
      expect(f.state.tables.btgBoletoSnapshots[0]).toMatchObject({
        estado: "incompleto",
        dadosCifrados: null,
        dadosSha256: null,
        payloadSha256: hashBoletoBtg(payload),
      });
      captura(); // Um registro incompleto existente não é automaticamente substituído.
      f.state.writes.splice(0);
      expect(await obter(true, e)).toBeNull();
      expect(f.state.writes).toHaveLength(0);
    }
  );

  it("registro idempotente com o mesmo payload não recifra nem duplica auditoria", async () => {
    await registrar();
    const antes = structuredClone(f.state.tables.btgBoletoSnapshots);
    await registrar();
    expect(f.state.tables.btgBoletoSnapshots).toEqual(antes);
    expect(f.state.tables.auditLogs).toHaveLength(1);
    expect(f.state.writes).toHaveLength(2);
  });

  it("payload diferente da mesma emissão não sobrescreve snapshot e seu hash", async () => {
    await registrar();
    const antes = structuredClone(f.state.tables);
    const p = pedido();
    p.payer.name = "Outro Pagador";
    await expect(registrar(JSON.stringify(p))).rejects.toThrow(
      "Snapshot existente incompatível"
    );
    expect(f.state.tables).toEqual(antes);
    expect(f.state.writes).toHaveLength(2);
  });

  it("falha de auditoria desfaz snapshot registrado dentro da transação", async () => {
    f.state.failAudit = true;
    await expect(registrar()).rejects.toThrow("audit unavailable");
    expect(f.state.tables.btgBoletoSnapshots).toHaveLength(0);
    expect(f.state.tables.auditLogs).toHaveLength(0);
    expect(f.state.writes).toHaveLength(0);
  });
});

describe("snapshot armazenado: autenticidade e vínculo da emissão", () => {
  it.each([
    ["btgIntegracaoId", 99],
    ["condominioId", 99],
    ["parcelaAcordoId", 99],
    ["revisao", 2],
    ["estado", "incompleto"],
    ["dadosCifrados", null],
    ["dadosSha256", null],
  ])(
    "metadata divergente %s não é aceita nem refeita por captura",
    async (campo, valor) => {
      await registrar();
      captura();
      f.state.tables.btgBoletoSnapshots[0][String(campo)] = valor;
      f.state.writes.splice(0);
      expect(await obter()).toBeNull();
      expect(f.state.writes).toHaveLength(0);
    }
  );

  it("snapshot de outra emissão não satisfaz filtro pelo ID canônico", async () => {
    await registrar();
    f.state.tables.btgBoletoSnapshots[0].btgCobrancaEmitidaId = 999;
    expect(await obter(false)).toBeNull();
  });

  it.each(["hash", "cifra"])(
    "adulteração de %s falha sem recorrer a cadastro/captura",
    async caso => {
      await registrar();
      captura();
      const row = f.state.tables.btgBoletoSnapshots[0];
      if (caso === "hash") row.dadosSha256 = "0".repeat(64);
      else row.dadosCifrados = adulterarCifra(row.dadosCifrados);
      f.state.writes.splice(0);
      await expect(obter()).rejects.toThrow();
      expect(f.state.writes).toHaveLength(0);
    }
  );

  it.each(["id", "revisao", "btgIntegracaoId", "condominioId"])(
    "AAD de snapshot pertence ao contexto original: %s",
    async campo => {
      await registrar();
      const row = f.state.tables.btgBoletoSnapshots[0];
      // Metadata externa pode ser copiada, mas não autentica a cifra sob outro contexto.
      const e = { ...emissao, [campo]: 99 } as EmissaoTituloBtg;
      row.btgCobrancaEmitidaId = e.id;
      row.revisao = e.revisao;
      row.btgIntegracaoId = e.btgIntegracaoId;
      row.condominioId = e.condominioId;
      await expect(obter(true, e)).rejects.toThrow();
      expect(f.state.tables.btgBoletoSnapshots).toHaveLength(1);
    }
  );

  it.each(["valor", "vencimento", "externalId", "conta", "documento"])(
    "conteúdo autenticado ainda precisa coincidir com a emissão: %s",
    async campo => {
      await registrar();
      const row = f.state.tables.btgBoletoSnapshots[0];
      const s = decifrarSnapshotBoletoBtg(
        row.dadosCifrados,
        row.dadosSha256,
        emissao
      );
      if (campo === "valor") s.valorCentavos++;
      if (campo === "vencimento") s.vencimento = "2025-02-23";
      if (campo === "externalId") s.externalId = "outra-emissao";
      if (campo === "conta") s.beneficiario.conta = "432260";
      if (campo === "documento") s.beneficiario.documento = "11111111111111";
      row.dadosCifrados = cifrarSnapshotBoletoBtg(s, emissao);
      row.dadosSha256 = hashBoletoBtg(JSON.stringify(s));
      await expect(obter()).rejects.toThrow();
    }
  );
});

describe("snapshot legado: derivação somente da captura íntegra e vigente", () => {
  it("modo somente leitura valida captura íntegra sem persistir snapshot ou auditoria", async () => {
    captura();
    f.db.select.mockClear();
    expect(await obter(false)).toEqual(snapshotDoPedidoBtg(body(), emissao));
    expect(f.db.select).toHaveBeenCalledTimes(2);
    expect(f.state.tables.btgBoletoSnapshots).toHaveLength(0);
    expect(f.state.tables.auditLogs).toHaveLength(0);
    expect(f.state.writes).toHaveLength(0);
  });

  it("sem captura nunca monta snapshot a partir do cadastro atual", async () => {
    expect(await obter()).toBeNull();
    expect(f.state.writes).toHaveLength(0);
  });

  it.each([200, 201, 204, 299])(
    "deriva captura completa HTTP %s, guarda uma vez e não inventa contexto antigo de acordo",
    async httpStatus => {
      const d = captura({ httpStatus });
      const esperado = snapshotDoPedidoBtg(body(), emissao);
      expect(
        await f.db.transaction((tx: any) =>
          obterSnapshotBoletoBtg(tx, emissao, 5, true)
        )
      ).toEqual(esperado);
      const row = f.state.tables.btgBoletoSnapshots[0];
      expect(row).toMatchObject({
        estado: "completo",
        diagnosticoId: 70,
        payloadSha256: d.payloadSha256,
        usuarioId: 5,
      });
      expect(
        decifrarSnapshotBoletoBtg(row.dadosCifrados, row.dadosSha256, emissao)
      ).toEqual(esperado);
      expect(esperado.contextoAcordo).toBeUndefined();
      expect(JSON.parse(f.state.tables.auditLogs[0].metadata)).toEqual({
        evento: "snapshot_derivado_captura",
        emissaoId: 40,
        diagnosticoId: 70,
      });
      const cifra = row.dadosCifrados;
      expect(await obter()).toEqual(esperado);
      expect(f.state.tables.btgBoletoSnapshots).toHaveLength(1);
      expect(f.state.tables.btgBoletoSnapshots[0].dadosCifrados).toBe(cifra);
      expect(f.state.tables.auditLogs).toHaveLength(1);
      expect(f.state.writes.map(w => w.table)).toEqual([
        "btgBoletoSnapshots",
        "auditLogs",
      ]);
    }
  );

  it("aceita exatamente 30 dias, recusa 30 dias mais 1 ms", async () => {
    const row = captura({
      capturaCriadaEm: new Date(
        agora.getTime() - RETENCAO_DIAGNOSTICO_BTG_MS - 1
      ),
    });
    expect(await obter()).toBeNull();
    row.capturaCriadaEm = new Date(
      agora.getTime() - RETENCAO_DIAGNOSTICO_BTG_MS
    );
    expect(await obter()).not.toBeNull();
  });

  it.each([
    { httpStatus: null },
    { httpStatus: 199 },
    { httpStatus: 300 },
    { httpStatus: 400 },
    { httpStatus: 500 },
    { respostaCompleta: 0 },
    { payloadCifrado: null },
    { conteudoExpurgadoEm: agora },
    { btgIntegracaoId: 99 },
    { condominioId: 99 },
    { btgCobrancaEmitidaId: 999 },
    { parcelaAcordoId: 999 },
    {
      capturaCriadaEm: new Date(
        agora.getTime() - RETENCAO_DIAGNOSTICO_BTG_MS - 1
      ),
    },
  ])(
    "recusa captura inelegível antes de decifrar ou gravar: %j",
    async patch => {
      captura(patch);
      // Uma leitura indevida tentaria usar esta chave inválida e lançaria erro, não null.
      vi.stubEnv("BTG_TOKEN_ENCRYPTION_KEY", "chave-invalida");
      expect(await obter()).toBeNull();
      expect(f.state.writes).toHaveLength(0);
    }
  );

  it.each([new Date(agora.getTime() + 1), new Date(NaN)])(
    "recusa captura futura ou data inválida %s antes de decifrar",
    async capturaCriadaEm => {
      captura({ capturaCriadaEm });
      vi.stubEnv("BTG_TOKEN_ENCRYPTION_KEY", "chave-invalida");
      expect(await obter()).toBeNull();
      expect(await obter(false)).toBeNull();
      expect(f.state.writes).toHaveLength(0);
    }
  );

  it.each(["hash", "tamanho", "cifra", "AAD"])(
    "captura adulterada %s não produz snapshot/auditoria",
    async caso => {
      const d = captura();
      if (caso === "hash") d.payloadSha256 = "0".repeat(64);
      if (caso === "tamanho") d.payloadBytes++;
      if (caso === "cifra") d.payloadCifrado = adulterarCifra(d.payloadCifrado);
      if (caso === "AAD")
        d.chaveCaptura = "cd35ec80-c530-4cae-85cf-a144148f9372";
      await expect(
        f.db.transaction((tx: any) =>
          obterSnapshotBoletoBtg(tx, emissao, 5, true)
        )
      ).rejects.toThrow();
      expect(f.state.tables.btgBoletoSnapshots).toHaveLength(0);
      expect(f.state.tables.auditLogs).toHaveLength(0);
      expect(f.state.writes).toHaveLength(0);
    }
  );

  it.each(["pedido_parcial", "valor", "correlationId"])(
    "2xx e hashes íntegros não dispensam payload histórico completo/correspondente: %s",
    async caso => {
      const p: any = pedido();
      if (caso === "pedido_parcial") delete p.payer.address.city;
      if (caso === "valor") p.amount = 999;
      if (caso === "correlationId") p.detail.correlationId = "btgv2-999";
      captura({}, JSON.stringify(p));
      await expect(obter()).rejects.toThrow();
      expect(f.state.writes).toHaveLength(0);
    }
  );

  it("falha na auditoria reverte também a derivação da captura", async () => {
    captura();
    const antes = structuredClone(f.state.tables.btgHttpDiagnosticos);
    f.state.failAudit = true;
    await expect(
      f.db.transaction((tx: any) =>
        obterSnapshotBoletoBtg(tx, emissao, 5, true)
      )
    ).rejects.toThrow("audit unavailable");
    expect(f.state.tables.btgBoletoSnapshots).toHaveLength(0);
    expect(f.state.tables.auditLogs).toHaveLength(0);
    expect(f.state.tables.btgHttpDiagnosticos).toEqual(antes);
    expect(f.state.writes).toHaveLength(0);
  });
});

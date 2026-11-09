import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
const mock = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn() }));
vi.mock("./btg-v2/reenvio-consulta", () => ({
  consultarSituacaoRecuperacaoBtg: mock.get,
}));
vi.mock("./btg-v2/client", () => ({ cancelarCobrancaBtgV2: mock.del }));
// Tabela SOMENTE no mock: o schema/DDL de produção depende da aprovação.
vi.mock("../drizzle/schema", async importOriginal => {
  const actual = await importOriginal<typeof import("../drizzle/schema")>();
  if ("btgCancelamentos" in actual) return actual;
  const { mysqlTable, int, varchar, mysqlEnum, timestamp, text } = await import(
    "drizzle-orm/mysql-core"
  );
  const btgCancelamentos = mysqlTable("btgCancelamentos", {
    id: int("id").primaryKey().autoincrement(),
    chaveOperacao: varchar("chaveOperacao", { length: 36 }).notNull(),
    btgCobrancaEmitidaId: int("btgCobrancaEmitidaId").notNull(),
    parcelaAcordoId: int("parcelaAcordoId").notNull(),
    btgIntegracaoId: int("btgIntegracaoId").notNull(),
    condominioId: int("condominioId").notNull(),
    usuarioId: int("usuarioId").notNull(),
    estado: mysqlEnum("estado", [
      "preparada",
      "solicitada",
      "em_confirmacao",
      "recusada",
      "cancelada",
      "conflito_pagamento",
    ]).notNull(),
    contextoHash: varchar("contextoHash", { length: 64 }).notNull(),
    consultaCifrada: text("consultaCifrada"),
    motivoCifrado: text("motivoCifrado"),
    criadaEm: timestamp("criadaEm").notNull(),
    expiraEm: timestamp("expiraEm").notNull(),
    solicitadaEm: timestamp("solicitadaEm"),
    confirmadaEm: timestamp("confirmadaEm"),
    httpStatus: int("httpStatus"),
    codigo: varchar("codigo", { length: 80 }),
    updatedAt: timestamp("updatedAt").notNull(),
  });
  return { ...actual, btgCancelamentos };
});
import {
  prepararCancelamentoBtg as preparar,
  confirmarCancelamentoBtg as confirmar,
  consultarResultadoCancelamentoBtg as consultarResultado,
} from "./btg-v2/cancelamento";
import { BtgV2HttpError } from "./btg-v2/errors";
import { criarDbWebhookBtgEmMemoria } from "./btg-v2-webhook-test-db";

const datas = {
  createdAt: new Date("2026-11-01T12:00:00Z"),
  updatedAt: new Date("2026-11-01T12:00:00Z"),
};
function fixture() {
  return criarDbWebhookBtgEmMemoria({
    users: [
      { id: 1, role: "admin", isActive: 1, isDeleted: 0 },
      { id: 2, role: "admin", isActive: 1, isDeleted: 0 },
    ],
    condominios: [{ id: 1, name: "Condomínio fictício", ...datas }],
    btgIntegracoes: [
      {
        id: 1,
        ambiente: "sandbox",
        companyId: "30306294000145",
        ativo: 1,
        emissaoHabilitada: 0,
        diasLimitePagamento: 60,
        ...datas,
      },
    ],
    btgContasRecebedoras: [
      {
        id: 1,
        btgIntegracaoId: 1,
        accountId: "conta-fixture",
        origemCadastro: "api",
        agencia: "50",
        numero: "1234",
        documentoBeneficiario: "11222333000181",
        nomeBeneficiario: "Beneficiário fictício",
        ativo: 1,
        ...datas,
      },
    ],
    btgContaRecebedoraCondominios: [
      {
        id: 1,
        btgIntegracaoId: 1,
        condominioId: 1,
        btgContaRecebedoraId: 1,
        ativo: 1,
        ...datas,
      },
    ],
    parcelasAcordo: [
      {
        id: 10,
        acordoId: 3,
        installmentNumber: 1,
        amount: 1234,
        dueDate: new Date("2026-12-09T12:00:00Z"),
        status: "pendente",
        canalBancario: "api_btg_v2",
        paymentDate: null,
        ...datas,
      },
    ],
    acordos: [
      {
        id: 3,
        devedorId: 4,
        condominioId: 1,
        status: "ativo",
        valorPago: 0,
        valorPagoAcordo: 0,
        ...datas,
      },
    ],
    devedores: [
      {
        id: 4,
        condominioId: 1,
        name: "Pessoa fictícia",
        document: "52998224725",
        ...datas,
      },
    ],
    btgCobrancasEmitidas: [
      {
        id: 20,
        btgIntegracaoId: 1,
        btgContaRecebedoraId: 1,
        btgRemessaId: 2,
        condominioId: 1,
        origemTipo: "parcela_acordo",
        origemId: 10,
        revisao: 1,
        instrumento: "bolepix",
        externalId: "v2:sbx:parcela_acordo:10:r1",
        idempotencyKey: "idempotencia-fixture",
        status: "emitida",
        amount: 1234,
        dueDate: new Date("2026-12-09T12:00:00Z"),
        agenciaRecebedora: "50",
        contaRecebedora: "1234",
        documentoBeneficiario: "11222333000181",
        nomeBeneficiario: "Beneficiário fictício",
        btgCollectionId: "collection-fixture",
        emitidaEm: new Date("2026-11-01T12:00:00Z"),
        erroCodigo: null,
        ...datas,
      },
    ],
    btgRemessas: [{ id: 2, status: "processada", totalEmitido: 1, ...datas }],
    btgRemessaItens: [
      {
        id: 30,
        btgRemessaId: 2,
        btgCobrancaEmitidaId: 20,
        resultado: "emitida",
        mensagem: "Sucesso original",
        ...datas,
      },
    ],
    btgRecuperacoes: [],
    btgCancelamentos: [],
    auditLogs: [],
  });
}
const titulo = (status = "CREATED", extra: Record<string, unknown> = {}) => ({
  collectionId: "collection-fixture",
  status,
  correlationId: "btgv2-20",
  documentNumber: "PA10R1",
  valorCentavos: 1234,
  dueDate: "2026-12-09",
  type: "BANKSLIP_QRCODE",
  agencia: "50",
  conta: "1234",
  documentoBeneficiario: "11222333000181",
  ...extra,
});
const resposta = (status = "CREATED", extra: Record<string, unknown> = {}) => ({
  completa: true,
  motivo: "CONSULTA_COMPLETA",
  cobrancas: [titulo(status, extra)],
});
const inputConfirmacao = (db: any, operacaoId: string) => ({
  db,
  usuarioId: 1,
  operacaoId,
  motivo: "Cancelamento solicitado por revisão administrativa",
  confirmacao: "CANCELAR COBRANÇA BTG" as const,
  ciente: true as const,
});
async function prepararFixture() {
  const value = fixture();
  const previa = await preparar({ db: value.db, usuarioId: 1, emissaoId: 20 });
  return { ...value, previa };
}
beforeEach(() => {
  vi.useRealTimers();
  vi.stubEnv("BTG_SANDBOX", "true");
  vi.stubEnv("BTG_COMPANY_ID", "11222333000181");
  vi.stubEnv(
    "BTG_TOKEN_ENCRYPTION_KEY",
    Buffer.alloc(32, 7).toString("base64")
  );
  mock.get.mockReset().mockResolvedValue(resposta());
  mock.del.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("rede real proibida");
    })
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("prévia segura e operação durável", () => {
  it("prepara UUID/TTL5min/cifra/auditoria sem DELETE nem meios de pagamento", async () => {
    const { state, previa } = await prepararFixture();
    const op = state.tables.btgCancelamentos[0];
    expect(previa.estado).toBe("preparada");
    expect(previa.operacaoId).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      op.expiraEm.getTime() - op.criadaEm.getTime()
    ).toBeGreaterThanOrEqual(299990);
    expect(op.expiraEm.getTime() - op.criadaEm.getTime()).toBeLessThanOrEqual(
      300010
    );
    expect(op.contextoHash).toMatch(/^[0-9a-f]{64}$/);
    expect(op.consultaCifrada).toMatch(/^v1:/);
    expect(state.tables.auditLogs).toHaveLength(1);
    expect(mock.del).not.toHaveBeenCalled();
    expect(JSON.stringify(previa)).not.toMatch(
      /collection-fixture|52998224725|11222333000181|v2:sbx/
    );
    expect(JSON.stringify(state.tables.auditLogs)).not.toMatch(
      /52998224725|11222333000181|Cancelamento solicitado/
    );
  });
  it("duas preparações concorrentes usam uma operação ativa", async () => {
    const { db, state } = fixture();
    const values = await Promise.all([
      preparar({ db, usuarioId: 1, emissaoId: 20 }),
      preparar({ db, usuarioId: 1, emissaoId: 20 }),
    ]);
    expect(values[0].operacaoId).toBe(values[1].operacaoId);
    expect(state.tables.btgCancelamentos).toHaveLength(1);
  });
  it.each(["role", "isActive", "isDeleted"])(
    "admin revogado %s impede GET/DELETE",
    async field => {
      const { db, state } = fixture();
      state.tables.users[0][field] =
        field === "role" ? "colaborador" : field === "isActive" ? 0 : 1;
      await expect(
        preparar({ db, usuarioId: 1, emissaoId: 20 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mock.get).not.toHaveBeenCalled();
      expect(mock.del).not.toHaveBeenCalled();
    }
  );
  it.each([
    "correlationId",
    "type",
    "valorCentavos",
    "dueDate",
    "agencia",
    "conta",
    "documentoBeneficiario",
    "collectionId",
    "documentNumber",
  ])("identidade remota %s ausente/divergente bloqueia", async field => {
    mock.get.mockResolvedValue(resposta("CREATED", { [field]: undefined }));
    const { previa } = await prepararFixture();
    expect(previa.estado).toBe("recusada");
    expect(mock.del).not.toHaveBeenCalled();
  });
  it.each(["PAID", "PARTIALLY_PAID", "FAILED"])(
    "estado remoto %s não autoriza DELETE",
    async status => {
      mock.get.mockResolvedValue(resposta(status));
      const { previa } = await prepararFixture();
      expect(previa.estado).not.toBe("preparada");
      expect(mock.del).not.toHaveBeenCalled();
    }
  );
  it.each(["paidAt", "paidAmount", "amountPaid", "pagamentoDetectado"])(
    "indício remoto %s bloqueia",
    async field => {
      mock.get.mockResolvedValue(
        resposta("CREATED", { [field]: field === "paidAt" ? "2026-11-08" : 1 })
      );
      expect((await prepararFixture()).previa.estado).toBe(
        "conflito_pagamento"
      );
    }
  );
  it.each(["pago", "cancelado"])("parcela %s bloqueia", async status => {
    const { db, state } = fixture();
    state.tables.parcelasAcordo[0].status = status;
    expect(
      (await preparar({ db, usuarioId: 1, emissaoId: 20 })).estado
    ).not.toBe("preparada");
  });
  it("indício local parcial da própria emissão bloqueia", async () => {
    const { db, state } = fixture();
    state.tables.btgCobrancasEmitidas[0].erroCodigo = "PAGAMENTO_PARCIAL";
    expect((await preparar({ db, usuarioId: 1, emissaoId: 20 })).estado).toBe(
      "conflito_pagamento"
    );
  });
  it("pagamento em outra parcela não bloqueia parcela ainda pendente", async () => {
    const { db, state } = fixture();
    state.tables.acordos[0].valorPago = 10;
    state.tables.acordos[0].valorPagoAcordo = 10;
    expect((await preparar({ db, usuarioId: 1, emissaoId: 20 })).estado).toBe(
      "preparada"
    );
  });
  it.each(["incerta", "paga", "falha", "reservada"])(
    "emissão %s bloqueia",
    async status => {
      const { db, state } = fixture();
      state.tables.btgCobrancasEmitidas[0].status = status;
      expect(
        (await preparar({ db, usuarioId: 1, emissaoId: 20 })).estado
      ).not.toBe("preparada");
    }
  );
  it.each(["incompleta", "vazia", "ambigua"])(
    "consulta %s não autoriza",
    async type => {
      mock.get.mockResolvedValue(
        type === "incompleta"
          ? { completa: false, motivo: "PRAZO_EXCEDIDO", cobrancas: [] }
          : type === "vazia"
            ? {
                completa: true,
                motivo: "NAO_LOCALIZADA_SEM_PROVA_DE_AUSENCIA",
                cobrancas: [],
              }
            : {
                completa: true,
                motivo: "CONSULTA_COMPLETA",
                cobrancas: [titulo(), titulo()],
              }
      );
      expect((await prepararFixture()).previa.estado).toBe("recusada");
    }
  );
  it("mudança durante consulta invalida prévia", async () => {
    const { db, state } = fixture();
    mock.get.mockImplementation(async () => {
      state.tables.parcelasAcordo[0].amount = 999;
      return resposta();
    });
    await expect(
      preparar({ db, usuarioId: 1, emissaoId: 20 })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(state.tables.btgCancelamentos).toHaveLength(0);
  });
});

describe("consumo atômico, efeito externo e confirmação", () => {
  it("GET→DELETE204→GETCANCELED; preserva parcela, acordo, canal e remessa", async () => {
    const { db, state, previa } = await prepararFixture();
    const financeiras = structuredClone({
      parcela: state.tables.parcelasAcordo,
      acordo: state.tables.acordos,
      remessa: state.tables.btgRemessas,
      itens: state.tables.btgRemessaItens,
    });
    const foraTx = () => {
      const last = state.operations
        .filter(op => op.kind.startsWith("transaction-"))
        .at(-1);
      expect(last?.kind).toBe("transaction-commit");
    };
    mock.get
      .mockImplementationOnce(async () => {
        foraTx();
        return resposta();
      })
      .mockImplementationOnce(async () => {
        foraTx();
        return resposta("CANCELED");
      });
    mock.del.mockImplementation(async () => {
      foraTx();
      expect(state.tables.btgCancelamentos[0].estado).toBe("em_confirmacao");
      expect(state.tables.btgCancelamentos[0].solicitadaEm).toBeInstanceOf(
        Date
      );
      expect(state.tables.btgCancelamentos[0].motivoCifrado).toMatch(/^v1:/);
      expect(
        state.tables.auditLogs.some(r =>
          r.metadata.includes("cancelamento_solicitado")
        )
      ).toBe(true);
    });
    const result = await confirmar(inputConfirmacao(db, previa.operacaoId));
    expect(result.estado).toBe("cancelada");
    expect(state.tables.btgCobrancasEmitidas[0].status).toBe("cancelada");
    expect(mock.del).toHaveBeenCalledTimes(1);
    expect({
      parcela: state.tables.parcelasAcordo,
      acordo: state.tables.acordos,
      remessa: state.tables.btgRemessas,
      itens: state.tables.btgRemessaItens,
    }).toEqual(financeiras);
    const first = state.locks.indexOf("btgIntegracoes:update");
    expect(state.locks.indexOf("parcelasAcordo:update")).toBeGreaterThan(first);
    expect(state.locks.indexOf("btgCobrancasEmitidas:update")).toBeGreaterThan(
      state.locks.indexOf("parcelasAcordo:update")
    );
    expect(state.locks.indexOf("btgCancelamentos:update")).toBeGreaterThan(
      state.locks.indexOf("btgCobrancasEmitidas:update")
    );
  });
  it.each(["CREATED", "CANCELING", "CANCEL_FAILED"])(
    "204 com GET %s não marca cancelada",
    async status => {
      const { db, state, previa } = await prepararFixture();
      mock.get
        .mockResolvedValueOnce(resposta())
        .mockResolvedValueOnce(resposta(status));
      const r = await confirmar(inputConfirmacao(db, previa.operacaoId));
      expect(r.estado).toBe(
        status === "CANCEL_FAILED" ? "recusada" : "em_confirmacao"
      );
      expect(state.tables.btgCobrancasEmitidas[0].status).toBe("emitida");
    }
  );
  it.each([400, 403, 404, 422, 500])(
    "HTTP %i preserva emissão e nunca repete DELETE",
    async status => {
      const { db, state, previa } = await prepararFixture();
      mock.del.mockRejectedValue(
        new BtgV2HttpError(
          { httpStatus: status, camposInvalidos: [], motivos: [] },
          "cancelamento"
        )
      );
      const input = inputConfirmacao(db, previa.operacaoId);
      const r = await confirmar(input);
      expect(r.estado).toBe(
        [400, 403, 422].includes(status) ? "recusada" : "em_confirmacao"
      );
      expect(state.tables.btgCobrancasEmitidas[0].status).toBe("emitida");
      await confirmar(input);
      await preparar({ db, usuarioId: 1, emissaoId: 20 });
      await consultarResultado({
        db,
        usuarioId: 1,
        operacaoId: previa.operacaoId,
      });
      expect(mock.del).toHaveBeenCalledTimes(1);
      expect(state.tables.btgCancelamentos).toHaveLength(1);
    }
  );
  it("timeout deixa resultado incerto durável", async () => {
    const { db, state, previa } = await prepararFixture();
    mock.del.mockRejectedValue(new Error("timeout com raw secreto"));
    const r = await confirmar(inputConfirmacao(db, previa.operacaoId));
    expect(r.estado).toBe("em_confirmacao");
    expect(state.tables.btgCancelamentos[0].codigo).toBe("RESULTADO_INCERTO");
    expect(JSON.stringify(r)).not.toMatch(/raw secreto/);
  });
  it("DELETE sem resolver respeita prazo e não reenvia", async () => {
    const { db, previa } = await prepararFixture();
    vi.useFakeTimers();
    mock.del.mockReturnValue(new Promise(() => {}));
    const pending = confirmar(inputConfirmacao(db, previa.operacaoId));
    await vi.advanceTimersByTimeAsync(10001);
    expect((await pending).estado).toBe("em_confirmacao");
    expect(mock.del).toHaveBeenCalledTimes(1);
  });
  it("404 na consulta final não prova cancelamento", async () => {
    const { db, state, previa } = await prepararFixture();
    mock.get
      .mockResolvedValueOnce(resposta())
      .mockResolvedValueOnce({
        completa: false,
        motivo: "HTTP_NAO_CONFIRMADO",
        cobrancas: [],
      });
    expect(
      (await confirmar(inputConfirmacao(db, previa.operacaoId))).estado
    ).toBe("em_confirmacao");
    expect(state.tables.btgCobrancasEmitidas[0].status).toBe("emitida");
  });
  it("duplo clique concorrente tem um DELETE e reutiliza operação consumida", async () => {
    const { db, state, previa } = await prepararFixture();
    const input = inputConfirmacao(db, previa.operacaoId);
    await Promise.all([confirmar(input), confirmar(input)]);
    expect(mock.del).toHaveBeenCalledTimes(1);
    expect(state.tables.btgCancelamentos).toHaveLength(1);
    await confirmar(input);
    expect(mock.del).toHaveBeenCalledTimes(1);
  });
  it.each([
    "motivo",
    "literal",
    "ciencia",
    "expirada",
    "ator",
    "revogada",
    "contexto",
    "cifra",
  ])("confirmação inválida %s tem zero DELETE", async type => {
    const { db, state, previa } = await prepararFixture();
    const input: any = inputConfirmacao(db, previa.operacaoId);
    if (type === "motivo") input.motivo = "abc";
    if (type === "literal") input.confirmacao = "CANCELAR";
    if (type === "ciencia") input.ciente = false;
    if (type === "expirada")
      state.tables.btgCancelamentos[0].expiraEm = new Date(0);
    if (type === "ator") input.usuarioId = 2;
    if (type === "revogada") state.tables.users[0].isActive = 0;
    if (type === "contexto")
      state.tables.btgCobrancasEmitidas[0].updatedAt = new Date();
    if (type === "cifra")
      state.tables.btgCancelamentos[0].consultaCifrada = "adulterada";
    await expect(confirmar(input)).rejects.toThrow();
    expect(mock.del).not.toHaveBeenCalled();
  });
  it("auditoria inicial falha impede efeito e preserva prévia", async () => {
    const { db, state, previa } = await prepararFixture();
    const original = db.insert;
    db.insert = vi.fn(table => {
      if (getTableName(table) === "auditLogs")
        return {
          values: () => {
            throw new Error("audit unavailable");
          },
        };
      return original(table);
    });
    await expect(
      confirmar(inputConfirmacao(db, previa.operacaoId))
    ).rejects.toThrow();
    expect(mock.del).not.toHaveBeenCalled();
    expect(state.tables.btgCancelamentos[0].estado).toBe("preparada");
    expect(state.tables.btgCancelamentos[0].solicitadaEm).toBeNull();
  });
  it.each(["revogacao", "pagamento"])(
    "%s depois da reserva impede DELETE sem resetar operação consumida",
    async tipo => {
      const { db, state, previa } = await prepararFixture();
      const original = db.insert;
      db.insert = vi.fn(table => {
        const insert = original(table);
        if (getTableName(table) !== "auditLogs") return insert;
        return {
          values: async values => {
            const result = await insert.values(values);
            if (values.metadata.includes("cancelamento_solicitado")) {
              if (tipo === "revogacao") state.tables.users[0].isActive = 0;
              else {
                state.tables.btgCobrancasEmitidas[0].status = "paga";
                state.tables.parcelasAcordo[0].status = "pago";
              }
            }
            return result;
          },
        };
      });
      const result = await confirmar(inputConfirmacao(db, previa.operacaoId));
      expect(mock.del).not.toHaveBeenCalled();
      expect(result.estado).toBe(
        tipo === "pagamento" ? "conflito_pagamento" : "em_confirmacao"
      );
      expect(state.tables.btgCancelamentos[0].solicitadaEm).toBeInstanceOf(
        Date
      );
    }
  );
  it("falha após DELETE mantém operação incerta e recupera por consulta sem reenviar", async () => {
    const { db, state, previa } = await prepararFixture();
    mock.get
      .mockResolvedValueOnce(resposta())
      .mockResolvedValueOnce(resposta("CANCELED"));
    mock.del.mockImplementation(async () => {
      state.failInjected = { table: "btgCobrancasEmitidas", times: 1 };
    });
    expect(
      (await confirmar(inputConfirmacao(db, previa.operacaoId))).estado
    ).toBe("em_confirmacao");
    expect(state.tables.btgCancelamentos[0].solicitadaEm).toBeInstanceOf(Date);
    expect(state.tables.btgCobrancasEmitidas[0].status).toBe("emitida");
    mock.get.mockResolvedValue(resposta("CANCELED"));
    expect(
      (
        await consultarResultado({
          db,
          usuarioId: 1,
          operacaoId: previa.operacaoId,
        })
      ).estado
    ).toBe("cancelada");
    expect(mock.del).toHaveBeenCalledTimes(1);
  });
  it("WHERE sem linha alterada nunca retorna cancelada", async () => {
    const { db, state, previa } = await prepararFixture();
    const original = db.update;
    mock.get
      .mockResolvedValueOnce(resposta())
      .mockResolvedValueOnce(resposta("CANCELED"));
    db.update = vi.fn(table =>
      getTableName(table) === "btgCobrancasEmitidas"
        ? { set: () => ({ where: async () => [{ affectedRows: 0 }] }) }
        : original(table)
    );
    expect(
      (await confirmar(inputConfirmacao(db, previa.operacaoId))).estado
    ).toBe("em_confirmacao");
    expect(state.tables.btgCobrancasEmitidas[0].status).toBe("emitida");
  });
  it("pagamento local ocorrido entre prévia e confirmação bloqueia DELETE", async () => {
    const { db, state, previa } = await prepararFixture();
    state.tables.btgCobrancasEmitidas[0].status = "paga";
    state.tables.parcelasAcordo[0].status = "pago";
    state.tables.parcelasAcordo[0].paymentDate = new Date();
    expect(
      (await confirmar(inputConfirmacao(db, previa.operacaoId))).estado
    ).toBe("conflito_pagamento");
    expect(mock.del).not.toHaveBeenCalled();
    expect(state.tables.btgCobrancasEmitidas[0].status).toBe("paga");
  });
  it("pagamento/webhook atrasado durante DELETE prevalece sobre CANCELED", async () => {
    const { db, state, previa } = await prepararFixture();
    const date = new Date();
    mock.get
      .mockResolvedValueOnce(resposta())
      .mockResolvedValueOnce(resposta("CANCELED"));
    mock.del.mockImplementation(async () => {
      state.tables.btgCobrancasEmitidas[0].status = "paga";
      state.tables.parcelasAcordo[0].status = "pago";
      state.tables.parcelasAcordo[0].paymentDate = date;
    });
    expect(
      (await confirmar(inputConfirmacao(db, previa.operacaoId))).estado
    ).toBe("conflito_pagamento");
    expect(state.tables.btgCobrancasEmitidas[0].status).toBe("paga");
    expect(state.tables.parcelasAcordo[0].paymentDate).toEqual(date);
  });
  it("PAID remoto final gera conflito, sem aplicar baixa financeira pelo cancelamento", async () => {
    const { db, state, previa } = await prepararFixture();
    mock.get
      .mockResolvedValueOnce(resposta())
      .mockResolvedValueOnce(resposta("PAID"));
    expect(
      (await confirmar(inputConfirmacao(db, previa.operacaoId))).estado
    ).toBe("conflito_pagamento");
    expect(state.tables.parcelasAcordo[0].status).toBe("pendente");
    expect(state.tables.btgCobrancasEmitidas[0].status).toBe("emitida");
  });
  it("pagamento constatado depois de cancelada muda operação para conflito e nunca desfaz baixa", async () => {
    const { db, state, previa } = await prepararFixture();
    mock.get
      .mockResolvedValueOnce(resposta())
      .mockResolvedValueOnce(resposta("CANCELED"));
    expect(
      (await confirmar(inputConfirmacao(db, previa.operacaoId))).estado
    ).toBe("cancelada");
    state.tables.btgCobrancasEmitidas[0].status = "paga";
    state.tables.parcelasAcordo[0].status = "pago";
    mock.get.mockResolvedValue(resposta("PAID"));
    expect(
      (
        await consultarResultado({
          db,
          usuarioId: 1,
          operacaoId: previa.operacaoId,
        })
      ).estado
    ).toBe("conflito_pagamento");
    expect(state.tables.btgCobrancasEmitidas[0].status).toBe("paga");
    expect(mock.del).toHaveBeenCalledTimes(1);
  });
});

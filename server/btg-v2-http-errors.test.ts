import { afterEach, describe, expect, it, vi } from "vitest";
import { inspect } from "node:util";
import { BtgV2ConfigurationError } from "./btg-v2/config";
import {
  BtgV2HttpError,
  criarErroHttpBtgV2,
  obterDiagnosticoHttpBtg,
  type BtgV2DiagnosticoHttp,
} from "./btg-v2/errors";

const documento = "O número do documento excede o limite permitido";
const juros = "A data de início dos juros deve ser posterior à data de vencimento";
const fallback = "O BTG não informou um motivo seguro para este erro.";
const requestId = "7d538cac-8bb8-4d3d-ae46-7f80b9039a31";
const segredos = [
  "123.456.789-09", "12.345.678/0001-90", "fulano@example.invalid",
  "+5511998765432", "conta-987654", "Bearer SEGREDO-OAUTH", "SEGREDO-PIX-000201",
  "Maria Teste da Silva", "Rua Secreta das Pessoas", "<script>segredo()</script>",
  "token_sem_numeros_ultrassecreto", "brn:bank:person:segredo", "12345678909",
];

function erroJson(data: unknown, status = 400, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), { status, headers });
}

function verificarAusenciaDeSegredos(error: BtgV2HttpError) {
  // Inspect inclui stack e propriedades não enumeráveis; não basta testar message.
  const output = [error.message, error.stack, inspect(error, { showHidden: true }),
    JSON.stringify(error), JSON.stringify(obterDiagnosticoHttpBtg(error))].join("\n");
  for (const segredo of segredos) expect(output.includes(segredo)).toBe(false);
  expect(Object.hasOwn(error, "cause")).toBe(false);
  expect(Object.hasOwn(error, "raw")).toBe(false);
  expect(Object.hasOwn(error, "response")).toBe(false);
  expect(error.message.length).toBeLessThanOrEqual(500);
}

function respostaComReader(reader: object, status = 400): Response {
  return { status, headers: new Headers(), body: { getReader: () => reader } } as Response;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("BTG v2 — diagnóstico HTTP protegido", () => {
  it("preserva apenas os campos/motivos conhecidos do BancoResponse 400", async () => {
    const error = await criarErroHttpBtgV2(erroJson({
      name: "VALIDATION_ERROR",
      brn: segredos.join(" "),
      reason: "Invalid parameters",
      invalidParams: [
        { name: "detail.documentNumber", reason: documento, value: segredos.join(" ") },
        { name: "payer.taxId", reason: "O documento do pagador é inválido", value: segredos[0] },
      ],
      payer: { name: segredos[7] },
      headers: { authorization: segredos[5] },
      requestId: segredos[10],
    }, 400, { "x-request-id": requestId, authorization: segredos[5] }));

    expect(error).toBeInstanceOf(BtgV2ConfigurationError);
    expect(error).toBeInstanceOf(BtgV2HttpError);
    expect(error.name).toBe("BtgV2HttpError");
    expect(obterDiagnosticoHttpBtg(error)).toEqual({
      httpStatus: 400,
      camposInvalidos: ["detail.documentNumber", "payer.taxId"],
      motivos: ["Há campos inválidos na solicitação.", documento, "O documento do pagador é inválido"],
      codigo: "VALIDATION_ERROR",
      requestId,
    });
    expect(error.message).toContain("HTTP 400");
    expect(error.message).toContain("detail.documentNumber");
    expect(error.message).toContain(documento);
    verificarAusenciaDeSegredos(error);
  });

  it("reconhece motivo seguro para a data de juros sem retornar datas/valores", async () => {
    const error = await criarErroHttpBtgV2(erroJson({
      name: "BadRequest",
      invalidParams: [{ name: "interest.startDate", reason: juros, value: segredos.join(" ") }],
    }));
    expect(obterDiagnosticoHttpBtg(error)).toEqual({
      httpStatus: 400, camposInvalidos: ["interest.startDate"], motivos: [juros], codigo: "BadRequest",
    });
    verificarAusenciaDeSegredos(error);
  });

  it.each([422, 500, 503])("preserva HTTP %i com fallback seguro", async (status) => {
    const error = await criarErroHttpBtgV2(erroJson({ reason: segredos.join(" ") }, status));
    expect(obterDiagnosticoHttpBtg(error)).toEqual({ httpStatus: status, camposInvalidos: [], motivos: [fallback] });
    expect(error.message).toContain(`HTTP ${status}`);
    verificarAusenciaDeSegredos(error);
  });

  it.each(segredos)("não propaga texto arbitrário em nenhuma posição (%#)", async (segredo) => {
    const error = await criarErroHttpBtgV2(erroJson({
      name: segredo, brn: segredo, reason: segredo, codigo: "VALIDATION_ERROR",
      requestId, camposInvalidos: ["detail.documentNumber"], motivos: [documento],
      invalidParams: [
        { name: `payer.address.street ${segredo}`, reason: `${documento} ${segredo}`, value: segredo },
        { name: segredo, reason: `Campo obrigatório: ${segredo}`, value: segredo },
      ],
    }, 400, { "x-request-id": segredo, "x-response": segredo }));
    expect(obterDiagnosticoHttpBtg(error)).toEqual({ httpStatus: 400, camposInvalidos: [], motivos: [fallback] });
    verificarAusenciaDeSegredos(error);
  });

  it("não copia números soltos, HTML, nomes, campos por prefixo ou textos quase conhecidos", async () => {
    const params = segredos.flatMap((segredo) => [
      { name: `detail.documentNumber.${segredo}`, reason: documento + segredo, value: segredo },
      { name: "__proto__", reason: `O número do documento ${segredo} excede o limite permitido`, value: segredo },
      { name: `payer.address[${segredo}]`, reason: segredo, value: segredo },
    ]);
    const error = await criarErroHttpBtgV2(erroJson({ name: "__proto__", reason: "constructor", invalidParams: params }));
    expect(error.diagnostico).toEqual({ httpStatus: 400, camposInvalidos: [], motivos: [fallback] });
    verificarAusenciaDeSegredos(error);
  });

  it("limita e deduplica campos/motivos e mantém a mensagem abaixo de 500 caracteres", async () => {
    const campos = ["detail.documentNumber", "payer.address.street", "payer.address.neighborhood",
      "payer.address.city", "payer.address.number", "payer.address.zipCode", "payer.address.state"];
    const motivos = [documento, juros, "Campo obrigatório", "Formato inválido",
      "O documento do pagador é inválido", "Campo inválido", "O valor excede o limite permitido"];
    const error = await criarErroHttpBtgV2(erroJson({
      invalidParams: campos.flatMap((name, index) => [
        { name, reason: motivos[index] }, { name, reason: motivos[index] },
      ]),
    }));
    expect(error.diagnostico.camposInvalidos).toEqual(campos.slice(0, 5));
    expect(error.diagnostico.motivos).toEqual(motivos.slice(0, 5));
    verificarAusenciaDeSegredos(error);
  });

  it.each([null, [], 123, "erro", { invalidParams: null }, { invalidParams: {} },
    { invalidParams: [null, [], 123, "campo", { name: {}, reason: [] }] }])(
    "ignora JSON de estrutura inesperada (%#)", async (data) => {
      const error = await criarErroHttpBtgV2(erroJson(data));
      expect(error.diagnostico).toEqual({ httpStatus: 400, camposInvalidos: [], motivos: [fallback] });
    },
  );

  it("o construtor sanitiza entradas e o helper só reconhece instâncias genuínas", () => {
    const error = new BtgV2HttpError({
      httpStatus: 422, camposInvalidos: ["payer.taxId", segredos[7]],
      motivos: [documento, segredos[10]], codigo: segredos[10], requestId: segredos[10],
      value: segredos[0], cause: new Error(segredos[5]), raw: segredos[8],
    } as BtgV2DiagnosticoHttp);
    expect(error.diagnostico).toEqual({ httpStatus: 422, camposInvalidos: ["payer.taxId"], motivos: [documento] });
    verificarAusenciaDeSegredos(error);
    expect(obterDiagnosticoHttpBtg(new Error("HTTP 400"))).toBeUndefined();
    expect(obterDiagnosticoHttpBtg(new BtgV2ConfigurationError("HTTP 400"))).toBeUndefined();
    expect(obterDiagnosticoHttpBtg({ name: "BtgV2HttpError", diagnostico: error.diagnostico })).toBeUndefined();
    expect(obterDiagnosticoHttpBtg(Object.create(BtgV2HttpError.prototype))).toBeUndefined();
    expect(obterDiagnosticoHttpBtg(undefined)).toBeUndefined();
    expect(obterDiagnosticoHttpBtg(null)).toBeUndefined();
  });

  it("não permite adulteração do diagnóstico do erro e devolve cópia sem campos arbitrários", () => {
    const error = new BtgV2HttpError({ httpStatus: 400, camposInvalidos: ["payer.taxId"], motivos: [documento] });
    const result = obterDiagnosticoHttpBtg(error)!;
    result.camposInvalidos.push(segredos[7]);
    result.motivos[0] = segredos[10];
    (result as unknown as Record<string, unknown>).raw = segredos[5];
    expect(Reflect.set(error, "diagnostico", result)).toBe(false);
    expect(Object.isFrozen(error.diagnostico.camposInvalidos)).toBe(true);
    expect(Object.isFrozen(error.diagnostico.motivos)).toBe(true);
    expect(obterDiagnosticoHttpBtg(error)).toEqual({ httpStatus: 400, camposInvalidos: ["payer.taxId"], motivos: [documento] });
    verificarAusenciaDeSegredos(error);
  });

  it.each(["", "not-a-uuid", "12345678909", `prefix-${requestId}`, `${requestId}-extra`])(
    "omite requestId que não seja UUID opaco completo (%#)", async (id) => {
      const error = await criarErroHttpBtgV2(erroJson({ name: "INVALID_PARAMETER", brn: requestId }, 400, {
        "x-request-id": id, "not-a-known-request-header": requestId,
      }));
      expect(error.diagnostico.requestId).toBeUndefined();
      expect(error.diagnostico.codigo).toBe("INVALID_PARAMETER");
    },
  );
});

describe("BTG v2 — corpo de erro com limite de bytes e prazo", () => {
  it.each(["", " ", "<html>Maria Teste da Silva</html>", "{malformed", "{\"reason\":"])(
    "usa fallback para corpo vazio, não JSON ou malformado (%#)", async (body) => {
      const error = await criarErroHttpBtgV2(new Response(body, { status: 400 }));
      expect(error.diagnostico).toEqual({ httpStatus: 400, camposInvalidos: [], motivos: [fallback] });
      verificarAusenciaDeSegredos(error);
    },
  );

  it("não chama text/json sem streaming nem guarda o erro de leitura", async () => {
    const text = vi.fn().mockRejectedValue(new Error(segredos[5]));
    const json = vi.fn().mockRejectedValue(new Error(segredos[10]));
    const error = await criarErroHttpBtgV2({ status: 500, headers: new Headers(), body: null, text, json } as unknown as Response);
    expect(error.diagnostico.motivos).toEqual([fallback]);
    expect(text).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
    verificarAusenciaDeSegredos(error);
  });

  it("cancela leitura que falha e ignora falha de cancelamento sem raw/cause", async () => {
    const reader = {
      read: vi.fn().mockRejectedValue(new Error(segredos[5])),
      cancel: vi.fn().mockRejectedValue(new Error(segredos[10])),
      releaseLock: vi.fn(),
    };
    const error = await criarErroHttpBtgV2(respostaComReader(reader));
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
    expect(error.diagnostico.motivos).toEqual([fallback]);
    verificarAusenciaDeSegredos(error);
  });

  it("getReader/headers que falham mantêm fallback sem propagar erro original", async () => {
    const response = {
      status: 400, headers: { get: () => { throw new Error(segredos[5]); } },
      body: { getReader: () => { throw new Error(segredos[10]); } },
    } as unknown as Response;
    const error = await criarErroHttpBtgV2(response);
    expect(error.diagnostico.motivos).toEqual([fallback]);
    verificarAusenciaDeSegredos(error);
  });

  it("cancela ao ultrapassar 32 KiB sem fazer outra leitura", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ reason: documento, raw: "a".repeat(32768) }));
    const reader = {
      read: vi.fn().mockResolvedValue({ done: false, value: bytes }),
      cancel: vi.fn().mockResolvedValue(undefined), releaseLock: vi.fn(),
    };
    const error = await criarErroHttpBtgV2(respostaComReader(reader));
    expect(reader.read).toHaveBeenCalledOnce();
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(error.diagnostico.motivos).toEqual([fallback]);
  });

  it("aceita exatamente 32 KiB e decodifica caracteres multibyte divididos entre chunks", async () => {
    const base = new TextEncoder().encode(JSON.stringify({ reason: documento, ignored: "á".repeat(100) }));
    const bytes = new Uint8Array(32768).fill(32);
    bytes.set(base);
    const acento = base.findIndex((byte) => byte === 0xc3);
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: bytes.slice(0, acento + 1) })
        .mockResolvedValueOnce({ done: false, value: bytes.slice(acento + 1, base.length) })
        .mockResolvedValueOnce({ done: false, value: bytes.slice(base.length) })
        .mockResolvedValueOnce({ done: true }),
      cancel: vi.fn().mockResolvedValue(undefined), releaseLock: vi.fn(),
    };
    const error = await criarErroHttpBtgV2(respostaComReader(reader));
    expect(error.diagnostico.motivos).toEqual([documento]);
    expect(reader.cancel).not.toHaveBeenCalled();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });

  it("conta bytes, não caracteres, e descarta o diagnóstico inteiro quando o limite é excedido", async () => {
    const body = JSON.stringify({ reason: documento, ignored: "á".repeat(17000) });
    expect(body.length).toBeLessThan(32768);
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(32768);
    const chunks = new TextEncoder().encode(body);
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: chunks.slice(0, 32000) })
        .mockResolvedValueOnce({ done: false, value: chunks.slice(32000) }),
      cancel: vi.fn().mockResolvedValue(undefined), releaseLock: vi.fn(),
    };
    const error = await criarErroHttpBtgV2(respostaComReader(reader));
    expect(reader.read).toHaveBeenCalledTimes(2);
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(error.diagnostico.motivos).toEqual([fallback]);
  });

  it("descarta UTF-8 malformado sem lançar detalhes de erro", async () => {
    const reader = {
      read: vi.fn().mockResolvedValueOnce({ done: false, value: new Uint8Array([0xff, 0xfe]) })
        .mockResolvedValueOnce({ done: true }),
      cancel: vi.fn().mockResolvedValue(undefined), releaseLock: vi.fn(),
    };
    const error = await criarErroHttpBtgV2(respostaComReader(reader));
    expect(error.diagnostico.motivos).toEqual([fallback]);
    expect(reader.cancel).toHaveBeenCalledOnce();
  });

  it("expira em até 5s mesmo se o stream e seu cancelamento nunca fecharem", async () => {
    vi.useFakeTimers();
    const bytes = new TextEncoder().encode(JSON.stringify({ reason: documento }));
    const reader = {
      read: vi.fn().mockResolvedValueOnce({ done: false, value: bytes })
        .mockImplementation(() => new Promise(() => {})),
      cancel: vi.fn().mockImplementation(() => new Promise(() => {})),
      releaseLock: vi.fn(),
    };
    let concluded = false;
    const pending = criarErroHttpBtgV2(respostaComReader(reader)).then((error) => { concluded = true; return error; });
    await vi.advanceTimersByTimeAsync(4999);
    expect(concluded).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = await pending;
    expect(concluded).toBe(true);
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
    expect(error.diagnostico.motivos).toEqual([fallback]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("o prazo é do corpo inteiro, não renovado a cada chunk", async () => {
    vi.useFakeTimers();
    let reads = 0;
    const reader = {
      read: vi.fn().mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => { reads += 1; resolve({ done: false, value: new Uint8Array([32]) }); }, 4000);
      })),
      cancel: vi.fn().mockResolvedValue(undefined), releaseLock: vi.fn(),
    };
    const pending = criarErroHttpBtgV2(respostaComReader(reader));
    await vi.advanceTimersByTimeAsync(5000);
    const error = await pending;
    expect(reads).toBe(1);
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(error.diagnostico.motivos).toEqual([fallback]);
    vi.clearAllTimers();
  });

  it("não registra o corpo nem falhas em logs", async () => {
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error"), vi.spyOn(console, "info")];
    const error = await criarErroHttpBtgV2(erroJson({ reason: segredos.join(" "), invalidParams: [{ value: segredos.join(" ") }] }));
    for (const log of logs) expect(log).not.toHaveBeenCalled();
    verificarAusenciaDeSegredos(error);
  });
});

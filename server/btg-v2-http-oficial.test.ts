import { describe, expect, it } from "vitest";
import { criarErroHttpBtgV2, obterDiagnosticoHttpBtg } from "./btg-v2/errors";

describe("BTG — erro oficial e identificadores protegidos", () => {
  it("interpreta o exemplo oficial BancoResponse sem retornar invalidParams.value", async () => {
    const error = await criarErroHttpBtgV2(new Response(JSON.stringify({
      reason: "Dados inválidos na requisição",
      invalidParams: [{ name: "startDate", reason: "A data de inicio do juros deve ser maior ao vencimento da cobrança", value: "DADO-PESSOAL-NAO-EXIBIR" }],
    }), { status: 400 }));
    expect(obterDiagnosticoHttpBtg(error)).toEqual({
      httpStatus: 400, camposInvalidos: ["startDate"], motivos: [
        "Há campos inválidos na solicitação.",
        "A data de início dos juros deve ser posterior à data de vencimento",
      ],
    });
    expect(JSON.stringify(error)).not.toContain("DADO-PESSOAL-NAO-EXIBIR");
  });

  it("não aceita identificador UUID fabricado com documento de 11 dígitos", async () => {
    const error = await criarErroHttpBtgV2(new Response("{}", { status: 400, headers: { "x-request-id": "7d538cac-8bb8-4d3d-ae46-12345678909a" } }));
    expect(obterDiagnosticoHttpBtg(error)?.requestId).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain("12345678909");
  });

  it("não deixa proxy de erro hostil substituir o tratamento original", () => {
    const erroHostil = new Proxy({}, { getPrototypeOf() { throw new Error("SEGREDO-NAO-EXIBIR"); } });
    expect(obterDiagnosticoHttpBtg(erroHostil)).toBeUndefined();
  });
});

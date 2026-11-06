import { describe, expect, it } from "vitest";
import { BtgV2BolePixError, gerarDocumentoParcelaBtgV2, montarPayloadBolePixV2 } from "./btg-v2/bolepix";

const base = {
  amountCentavos: 1123,
  dueDate: new Date("2026-11-06T12:00:00.000Z"),
  overDueDate: new Date("2026-11-13T12:00:00.000Z"),
  description: "Parcela de acordo — dados fictícios",
  externalId: "v2:prd:parcela_acordo:19:r1",
  documentNumber: "PA19R1",
  correlationId: "btgv2-1",
  account: { agencia: "50", numero: "00000001" },
  payer: {
    name: "Pagador fictício", document: "12345678909",
    email: "fixture@example.com", phone: "+5521999999999",
    address: { street: "Rua Exemplo", number: "100", neighborhood: "Centro", city: "Rio de Janeiro", state: "RJ", zipCode: "20000000" },
  },
};

describe("BTG v2 — documento compacto e limites oficiais", () => {
  it("gera referência determinística sem confundir documento, nosso número ou externalId", () => {
    expect(gerarDocumentoParcelaBtgV2(19)).toBe("PA19R1");
    expect(gerarDocumentoParcelaBtgV2(19, 2)).toBe("PA19R2");
    expect(gerarDocumentoParcelaBtgV2(20)).not.toBe(gerarDocumentoParcelaBtgV2(19));
    const payload = montarPayloadBolePixV2(base);
    expect(payload.detail).toEqual({ documentNumber: "PA19R1", externalId: base.externalId, correlationId: base.correlationId });
    expect(payload.amount).toBe(11.23);
    expect(payload.dueDate).toBe("2026-11-06");
    expect(payload.overDueDate).toBe("2026-11-13");
    expect(payload.account).toEqual({ branch: "50", number: "00000001" });
  });

  it("suporta IDs inteiros de banco sem truncar ou colidir e recusa referência extensa", () => {
    const limite = gerarDocumentoParcelaBtgV2(2147483647, 99);
    expect(limite).toBe("PA2147483647R99");
    expect(limite.length).toBeLessThanOrEqual(15);
    expect(() => gerarDocumentoParcelaBtgV2(2147483647, 100)).toThrow("15 caracteres");
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("recusa ID inválido %s", value => {
    expect(() => gerarDocumentoParcelaBtgV2(value)).toThrow(BtgV2BolePixError);
    expect(() => gerarDocumentoParcelaBtgV2(19, value)).toThrow(BtgV2BolePixError);
  });

  it("aceita documento15, recusa16 e o identificador longo da ocorrência", () => {
    expect(montarPayloadBolePixV2({ ...base, documentNumber: "D".repeat(15) }).detail.documentNumber).toBe("D".repeat(15));
    for (const documentNumber of ["D".repeat(16), "parcela_acordo-19-R1"]) {
      expect(() => montarPayloadBolePixV2({ ...base, documentNumber })).toThrow("15 caracteres");
    }
    expect(() => montarPayloadBolePixV2({ ...base, documentNumber: "   " })).toThrow("obrigatório");
  });

  it("aceita correlationId20 e recusa21 sem truncar", () => {
    expect(montarPayloadBolePixV2({ ...base, correlationId: "C".repeat(20) }).detail.correlationId).toBe("C".repeat(20));
    expect(() => montarPayloadBolePixV2({ ...base, correlationId: "C".repeat(21) })).toThrow("20 caracteres");
  });

  it.each([
    ["street", 40, "logradouro"],
    ["number", 10, "número do endereço"],
    ["neighborhood", 20, "bairro"],
    ["city", 50, "cidade"],
  ] as const)("valida %s no limite e preserva dado sem truncamento", (field, limit, label) => {
    const address = { ...base.payer.address, [field]: "A".repeat(limit) };
    expect(montarPayloadBolePixV2({ ...base, payer: { ...base.payer, address } }).payer.address[field]).toBe("A".repeat(limit));
    const valorProibido = "X".repeat(limit + 1);
    try {
      montarPayloadBolePixV2({ ...base, payer: { ...base.payer, address: { ...address, [field]: valorProibido } } });
      throw new Error("Esperava validação de limite");
    } catch (error) {
      expect((error as Error).message).toContain(label);
      expect((error as Error).message).not.toContain(valorProibido);
    }
  });

  it("mede limite textual em caracteres Unicode, preservando conteúdo", () => {
    const street = "😀".repeat(40);
    expect(montarPayloadBolePixV2({ ...base, payer: { ...base.payer, address: { ...base.payer.address, street } } }).payer.address.street).toBe(street);
    expect(() => montarPayloadBolePixV2({ ...base, payer: { ...base.payer, address: { ...base.payer.address, street: `${street}X` } } })).toThrow("40 caracteres");
  });
});

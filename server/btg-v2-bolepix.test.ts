import { describe, expect, it } from "vitest";
import {
  BtgV2BolePixError,
  montarPayloadBolePixV2,
  normalizarRespostaBolePixV2,
} from "./btg-v2/bolepix";

describe("BTG v2 — BolePix", () => {
  const base = {
    amountCentavos: 27087,
    dueDate: new Date("2026-11-15T12:00:00.000Z"),
    overDueDate: new Date("2027-01-14T12:00:00.000Z"),
    description: "Cota condominial novembro/2026",
    externalId: "v2:sbx:cobranca:42:r1",
    documentNumber: "COB-42-R1",
    correlationId: "emissao-42",
    account: { agencia: "50", numero: "003081850" },
    payer: {
      name: "Ana Silva",
      document: "123.456.789-09",
      email: "ana@example.com",
      phone: "+55 21 99999-9999",
      address: {
        street: "Rua Exemplo",
        number: "100",
        neighborhood: "Centro",
        city: "Rio de Janeiro",
        state: "RJ",
        zipCode: "20000-000",
      },
    },
  };

  it("monta BolePix no tipo oficial, com valor decimal, conta recebedora e identificação idempotente", () => {
    const payload = montarPayloadBolePixV2(base);

    expect(payload).toMatchObject({
      type: "BANKSLIP_QRCODE",
      amount: 270.87,
      dueDate: "2026-11-15",
      overDueDate: "2027-01-14",
      account: { branch: "50", number: "003081850" },
      detail: {
        documentNumber: "COB-42-R1",
        externalId: "v2:sbx:cobranca:42:r1",
        correlationId: "emissao-42",
      },
      payer: {
        name: "Ana Silva",
        taxId: "12345678909",
        personType: "F",
        phoneNumber: "+5521999999999",
        address: { zipCode: "20000000" },
      },
    });
    expect(payload.amount).not.toBe(27087);
  });

  it("rejeita BolePix quando pagador, endereço ou valor não estão completos", () => {
    expect(() => montarPayloadBolePixV2({
      ...base,
      amountCentavos: 0,
    })).toThrow(BtgV2BolePixError);

    expect(() => montarPayloadBolePixV2({
      ...base,
      payer: { ...base.payer, document: "" },
    })).toThrow("CPF/CNPJ");

    expect(() => montarPayloadBolePixV2({
      ...base,
      payer: { ...base.payer, address: { ...base.payer.address, city: "" } },
    })).toThrow("endereço completo");
  });

  it("normaliza dados de retorno sem perder identificadores, linha digitável e EMV", () => {
    const resultado = normalizarRespostaBolePixV2({
      collectionId: "colecao-123",
      status: "CREATED",
      dueDate: "2026-11-15",
      detail: {
        barCode: "00190500954014481606906809350314337370000000100",
        digitableLine: "00190.50095 40144.816069 06809.350314 3 37370000000100",
        ourNumber: "123456789",
        emv: "000201010212...",
      },
      bankSlipUrl: "https://btg.example/boleto.pdf",
    });

    expect(resultado).toEqual({
      collectionId: "colecao-123",
      status: "CREATED",
      bankSlipUrl: "https://btg.example/boleto.pdf",
      pixQrCode: null,
      pixCopiaECola: "000201010212...",
      codigoBarras: "00190500954014481606906809350314337370000000100",
      linhaDigitavel: "00190.50095 40144.816069 06809.350314 3 37370000000100",
      nossoNumero: "123456789",
    });
  });
});

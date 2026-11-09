import { describe, expect, it } from "vitest";
import {
  BtgV2BolePixError,
  montarPayloadBolePixV2,
  normalizarTelefonePagadorBtgV2,
  type BtgV2BolePixPayloadInput,
} from "./btg-v2/bolepix";

// Relação independente, conferida no cronograma Anatel/2026 indicado na spec.
const ddds = [
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28", "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49", "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69", "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89", "91", "92", "93", "94", "95", "96", "97", "98", "99",
];
const invalidDdds = Array.from({ length: 100 }, (_, index) => String(index).padStart(2, "0"))
  .filter(ddd => !ddds.includes(ddd));

const fixture: BtgV2BolePixPayloadInput = {
  amountCentavos: 5610,
  dueDate: new Date("2026-11-20T12:00:00Z"),
  overDueDate: new Date("2027-01-19T12:00:00Z"),
  description: "Parcela fictícia para teste",
  externalId: "v2:sbx:parcela_acordo:21:r1",
  documentNumber: "PA21R1",
  correlationId: "btgv2-3",
  account: { agencia: "50", numero: "000123450" },
  payer: {
    name: "Pagador Fictício",
    document: "52998224725",
    email: "fixture@example.invalid",
    address: { street: "Rua Teste", number: "8", neighborhood: "Centro", city: "Rio de Janeiro", state: "RJ", zipCode: "20011020" },
  },
};
function montar(phone: string | null | undefined) {
  return montarPayloadBolePixV2({ ...fixture, payer: { ...fixture.payer, phone } });
}

describe("BTG — telefone brasileiro normalizado no adaptador", () => {
  it.each([
    ["(21) 4000-0000", "+552140000000"],
    ["2140000000", "+552140000000"],
    ["(11) 98765-4321", "+5511987654321"],
    ["11987654321", "+5511987654321"],
    ["+55 (21) 4000-0000", "+552140000000"],
    ["+552140000000", "+552140000000"],
    ["552140000000", "+552140000000"],
    ["55 11 98765-4321", "+5511987654321"],
    ["+55(11)98765-4321", "+5511987654321"],
    ["  (21) 4000-0000  ", "+552140000000"],
    ["21.4000.0000", "+552140000000"],
    ["(55) 4000-0000", "+555540000000"],
    ["(55) 98765-4321", "+5555987654321"],
    ["555540000000", "+555540000000"],
    ["+55 (55) 98765-4321", "+5555987654321"],
  ])("normaliza sem truncar ou duplicar DDI: %s", (entrada, esperado) => {
    expect(normalizarTelefonePagadorBtgV2(entrada)).toBe(esperado);
    expect(normalizarTelefonePagadorBtgV2(esperado)).toBe(esperado);
    expect(montar(entrada).payer.phoneNumber).toBe(esperado);
  });

  it.each([undefined, null, "", "   ", "\t\n"])("omite telefone ausente %j sem substituição fictícia", entrada => {
    expect(normalizarTelefonePagadorBtgV2(entrada)).toBeUndefined();
    const payload = montar(entrada);
    expect(payload.payer).not.toHaveProperty("phoneNumber");
    expect(JSON.stringify(payload)).not.toContain("phoneNumber");
  });

  it.each(ddds)("aceita DDD nacional vigente %s para fixo e móvel", ddd => {
    expect(normalizarTelefonePagadorBtgV2(`${ddd}40000000`)).toBe(`+55${ddd}40000000`);
    expect(normalizarTelefonePagadorBtgV2(`${ddd}987654321`)).toBe(`+55${ddd}987654321`);
  });

  it.each(invalidDdds)("recusa DDD inexistente %s sem incluir o número no erro", ddd => {
    const phone = `${ddd}40000000`;
    expect(() => normalizarTelefonePagadorBtgV2(phone)).toThrow(BtgV2BolePixError);
    try { montar(phone); } catch (error) {
      expect(error).toBeInstanceOf(BtgV2BolePixError);
      expect((error as Error).message).toMatch(/telefone|DDD/);
      expect((error as Error).message).not.toContain(phone);
    }
  });

  it.each([
    "40000000", "987654321", "214000000", "214000000000", "2140000000000000",
    "2198765432", "2160000000", "2170000000", "2180000000", "2110000000", "2100000000",
    "21887654321", "21287654321", "0000000000", "+2140000000", "+1 (202) 555-0100",
    "+44 20 4000 0000", "00552140000000", "0212140000000", "02140000000",
    "55552140000000", "++552140000000", "21+40000000", "+55+2140000000",
    "tel:2140000000", "2140000000 ramal 1", "2140000000abc", "2140000000/",
    "(21) 4000-0000;", "21\n40000000", "21\t40000000", "２１４０００００００", "---", "()", "+", "55",
  ])("bloqueia entrada inválida antes de construir payload: %j", phone => {
    expect(() => normalizarTelefonePagadorBtgV2(phone)).toThrow(BtgV2BolePixError);
    expect(() => montar(phone)).toThrow(BtgV2BolePixError);
  });

  it("não transforma valores não textuais em telefone", () => {
    for (const value of [2140000000, {}, [], true]) {
      expect(() => normalizarTelefonePagadorBtgV2(value as unknown as string)).toThrow(BtgV2BolePixError);
    }
  });

  it("preserva todos os outros campos, dados de entrada, valores e referências", () => {
    const entrada = { ...fixture, payer: { ...fixture.payer, phone: "(21) 4000-0000" } };
    const antes = structuredClone(entrada);
    const payload = montarPayloadBolePixV2(entrada);
    const semTelefone = montarPayloadBolePixV2(fixture);
    const { phoneNumber, ...pagador } = payload.payer;
    expect(phoneNumber).toBe("+552140000000");
    expect({ ...payload, payer: pagador }).toEqual(semTelefone);
    expect(payload.amount).toBe(56.1);
    expect(payload.detail).toEqual({ documentNumber: fixture.documentNumber, externalId: fixture.externalId, correlationId: fixture.correlationId });
    expect(entrada).toEqual(antes);
  });
});

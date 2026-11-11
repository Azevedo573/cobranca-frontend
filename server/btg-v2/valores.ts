const MAX_CENTAVOS = 2_147_483_647;

/** Contrato BTG v2 em reais. Inteiro 5 também representa R$5,00, nunca 5 centavos.
 * Não arredonda precisão indevida e não infere unidade pelo valor da parcela. */
export function reaisBtgParaCentavos(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || Object.is(value, -0)) return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return null;
  const centavos = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
  return centavos <= BigInt(MAX_CENTAVOS) ? Number(centavos) : null;
}

/** Só o valor explicitamente pago comprova recebimento; amount é nominal. */
export function valorPagoBtgEmCentavos(data: { amountPaid?: unknown; paidAmount?: unknown; amount?: unknown }): number | null {
  const values = [data.amountPaid, data.paidAmount].filter(value => value !== undefined);
  if (!values.length) return null;
  const cents = values.map(reaisBtgParaCentavos);
  if (cents.some(value => value === null) || (cents.length === 2 && cents[0] !== cents[1])) return null;
  return cents[0];
}

/** Ausência usa momento do processamento; consumidor deve auditar essa fonte.
 * Datas de calendário e instantes ISO com timezone são aceitos sem normalizar dias inexistentes. */
export function dataPagamentoBtg(value: unknown = undefined, now = new Date()): Date | null {
  if (value === undefined) return new Date(now);
  if (typeof value !== "string" || value.length > 64 ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const calendar = value.slice(0, 10);
  const midnight = new Date(`${calendar}T00:00:00.000Z`);
  return Number.isFinite(midnight.getTime()) && midnight.toISOString().slice(0, 10) === calendar ? date : null;
}

/** Catálogo estático: método desconhecido não vira Pix por ser um BolePix. */
export function metodoPagamentoBtg(value: unknown): string | undefined {
  return typeof value === "string" && ["QRCODE", "BANKSLIP", "BARCODE", "BANK_SLIP", "PIX"].includes(value)
    ? value : undefined;
}

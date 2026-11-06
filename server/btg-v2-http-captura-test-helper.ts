import { vi } from "vitest";
import type { BtgHttpCaptura } from "./btg-v2/diagnosticos";

/** Apenas fixtures que já mockam todo o cliente financeiro usam esta captura. */
export function criarCapturaMock(): BtgHttpCaptura {
  let id: number | null = null;
  return {
    get id() { return id; },
    preparar: vi.fn(async (_body: string) => { id = 901; return id; }),
    iniciar: vi.fn(async () => {}),
    responder: vi.fn(async (_status: number, _bytes: Uint8Array, _completa: boolean) => {}),
    semResposta: vi.fn(async () => {}),
  };
}

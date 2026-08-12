import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");

describe("jobs exclusivos da VPS", () => {
  it("não inicia régua ou fila WhatsApp dentro do processo web", () => {
    const bootstrap = readFileSync(resolve(raiz, "server/_core/index.ts"), "utf8");
    expect(bootstrap).not.toContain("startReguaJob()");
    expect(bootstrap).not.toContain("iniciarJobFilaWhatsApp(");
  });

  it("mantém unidades systemd com trava contra execuções concorrentes", () => {
    const regua = readFileSync(resolve(raiz, "infra/systemd/luminus-regua.service"), "utf8");
    const whatsapp = readFileSync(resolve(raiz, "infra/systemd/luminus-whatsapp-fila.service"), "utf8");
    expect(regua).toContain("/usr/bin/flock -n /run/luminus-regua.lock");
    expect(whatsapp).toContain("/usr/bin/flock -n /run/luminus-whatsapp-fila.lock");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = resolve(process.cwd());

describe("configuração de jobs exclusivos da VPS", () => {
  it("não inicia a régua nem a fila WhatsApp no bootstrap do processo web", () => {
    const bootstrap = readFileSync(resolve(raiz, "server/_core/index.ts"), "utf8");
    expect(bootstrap).not.toContain("startReguaJob()");
    expect(bootstrap).not.toContain("iniciarJobFilaWhatsApp(60)");
  });

  it("mantém units restritas, com ambiente da VPS e trava contra concorrência", () => {
    const regua = readFileSync(resolve(raiz, "infra/systemd/luminus-regua.service"), "utf8");
    const whatsapp = readFileSync(resolve(raiz, "infra/systemd/luminus-whatsapp-fila.service"), "utf8");
    expect(regua).toContain("User=cobranca");
    expect(regua).toContain("EnvironmentFile=/var/www/cobranca/.env");
    expect(regua).toContain("/usr/bin/flock -n /run/luminus-regua.lock");
    expect(whatsapp).toContain("/usr/bin/flock -n /run/luminus-whatsapp-fila.lock");
  });

  it("fornece instalador sem segredos embutidos", () => {
    const instalador = readFileSync(resolve(raiz, "infra/systemd/instalar-jobs-vps.sh"), "utf8");
    expect(instalador).toContain("systemctl enable --now luminus-regua.timer luminus-whatsapp-fila.timer");
    expect(instalador).not.toMatch(/BTG_CLIENT_SECRET|ZAPI|REGUA_JOB_TOKEN/);
  });
});

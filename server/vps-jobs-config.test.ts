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

  it("mantém unidades systemd restritas ao usuário de aplicação e ao arquivo de ambiente da VPS", () => {
    const unidade = readFileSync(resolve(raiz, "infra/systemd/luminus-regua.service"), "utf8");
    expect(unidade).toContain("User=cobranca");
    expect(unidade).toContain("EnvironmentFile=/var/www/cobranca/.env");
    expect(unidade).toContain("/usr/bin/env pnpm exec tsx scripts/executar-regua.mjs");
  });

  it("fornece instalador da VPS que habilita os timers sem segredos embutidos", () => {
    const instalador = readFileSync(resolve(raiz, "infra/systemd/instalar-jobs-vps.sh"), "utf8");
    expect(instalador).toContain("systemctl enable --now luminus-regua.timer luminus-whatsapp-fila.timer");
    expect(instalador).not.toMatch(/BTG_CLIENT_SECRET|ZAPI|REGUA_JOB_TOKEN/);
  });
});

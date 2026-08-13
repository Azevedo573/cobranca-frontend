import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getRequestIp, LOGIN_BLOCK_MS, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS } from "./login-rate-limit";

describe("rate limit de login", () => {
  it("usa limites explícitos e extrai o primeiro IP encaminhado", () => {
    expect(LOGIN_MAX_ATTEMPTS).toBe(5);
    expect(LOGIN_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(LOGIN_BLOCK_MS).toBe(30 * 60 * 1000);
    expect(getRequestIp({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }, "127.0.0.1")).toBe("203.0.113.9");
  });

  it("protege os três endpoints de login antes da autenticação", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(source.match(/canAttemptLogin\(/g)?.length).toBe(3);
    expect(source.match(/recordLoginAttempt\(/g)?.length).toBe(3);
    expect(source.match(/TOO_MANY_REQUESTS/g)?.length).toBe(3);
  });
});

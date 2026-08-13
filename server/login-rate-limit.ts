import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { loginRateLimits } from "../drizzle/schema";
import { getDb } from "./db";

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_BLOCK_MS = 30 * 60 * 1000;

function hashKey(channel: string, ip: string, identifier: string) {
  return crypto.createHash("sha256").update(`${channel}|${ip}|${identifier.trim().toLowerCase()}`).digest("hex");
}

export async function canAttemptLogin(channel: string, ip: string, identifier: string) {
  const db = await getDb();
  if (!db) return { allowed: true, retryAfterSeconds: 0 };
  const keyHash = hashKey(channel, ip, identifier);
  const row = (await db.select().from(loginRateLimits).where(eq(loginRateLimits.keyHash, keyHash)).limit(1))[0];
  const now = new Date();
  if (!row) return { allowed: true, retryAfterSeconds: 0 };
  if (row.blockedUntil && row.blockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000) };
  }
  if (now.getTime() - row.windowStartedAt.getTime() < LOGIN_WINDOW_MS && row.attempts >= LOGIN_MAX_ATTEMPTS) {
    const blockedUntil = new Date(now.getTime() + LOGIN_BLOCK_MS);
    await db.update(loginRateLimits).set({ blockedUntil }).where(eq(loginRateLimits.id, row.id));
    return { allowed: false, retryAfterSeconds: Math.ceil(LOGIN_BLOCK_MS / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function recordLoginAttempt(channel: string, ip: string, identifier: string, success: boolean) {
  const db = await getDb();
  if (!db) return;
  const keyHash = hashKey(channel, ip, identifier);
  const row = (await db.select().from(loginRateLimits).where(eq(loginRateLimits.keyHash, keyHash)).limit(1))[0];
  const now = new Date();
  if (!row) {
    await db.insert(loginRateLimits).values({ keyHash, attempts: success ? 0 : 1, windowStartedAt: now, blockedUntil: null });
    return;
  }
  if (success) {
    await db.update(loginRateLimits).set({ attempts: 0, windowStartedAt: now, blockedUntil: null }).where(eq(loginRateLimits.id, row.id));
    return;
  }
  const withinWindow = now.getTime() - row.windowStartedAt.getTime() < LOGIN_WINDOW_MS;
  await db.update(loginRateLimits).set({ attempts: withinWindow ? row.attempts + 1 : 1, windowStartedAt: withinWindow ? row.windowStartedAt : now }).where(eq(loginRateLimits.id, row.id));
}

export function getRequestIp(headers: Record<string, string | string[] | undefined>, remoteAddress?: string) {
  const forwarded = headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(",")[0]?.trim() || remoteAddress || "unknown";
}

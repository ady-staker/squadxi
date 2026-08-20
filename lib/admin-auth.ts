import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { constantTimeEqual } from "@/lib/crypto";

const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function requiredAdminPassword(): string {
  const value = process.env.ADMIN_PASSWORD;
  if (!value) {
    throw new Error(
      "ADMIN_PASSWORD is not set -- the /admin dashboard can't be protected " +
        "without it. Set it in .env (see .env.example)."
    );
  }
  return value;
}

/** Deliberately a *different* secret from ADMIN_PASSWORD -- see
 *  coinflip-site/lib/admin-auth.ts for the full rationale (a leaked cookie
 *  must not become an offline password-cracking oracle). */
function requiredSessionSecret(): string {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value) {
    throw new Error(
      "ADMIN_SESSION_SECRET is not set -- required to sign admin session " +
        "cookies. Set it in .env (see .env.example; generate one with " +
        "`openssl rand -hex 32`)."
    );
  }
  return value;
}

function sign(expiresAt: number): string {
  const mac = createHmac("sha256", requiredSessionSecret())
    .update(String(expiresAt))
    .digest("base64url");
  return `${expiresAt}.${mac}`;
}

function verify(token: string): boolean {
  const [expiresAtStr, mac] = token.split(".");
  if (!expiresAtStr || !mac) return false;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expectedMac = createHmac("sha256", requiredSessionSecret())
    .update(expiresAtStr)
    .digest("base64url");
  return constantTimeEqual(mac, expectedMac);
}

export function checkAdminPassword(candidate: string): boolean {
  return constantTimeEqual(candidate, requiredAdminPassword());
}

export function createAdminSession(): void {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  cookies().set(COOKIE_NAME, sign(expiresAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearAdminSession(): void {
  cookies().delete(COOKIE_NAME);
}

export function isAdminAuthenticated(): boolean {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    return verify(token);
  } catch {
    return false;
  }
}

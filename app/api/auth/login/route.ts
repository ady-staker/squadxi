import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createUserSession } from "@/lib/auth";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// Same trusted-header precedence as lib/admin-auth.ts's login route --
// x-vercel-forwarded-for is set by Vercel's edge and can't be spoofed by the
// client, unlike x-forwarded-for/x-real-ip (fallbacks for local dev only).
function getClientIp(request: Request): string {
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) return vercelForwarded.split(",")[0].trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Checks and, on failure, increments a lockout bucket keyed by `key` (an
 *  email or a synthetic "ip:<addr>" string) in the shared UserLoginAttempt
 *  table. Returns the number of minutes remaining if currently locked,
 *  otherwise null. Deliberately a distinct table from the admin's IP-keyed
 *  LoginAttempt -- sharing one would let a user-login attacker's IP lock out
 *  the operator's own /admin access if they happen to share a NAT'd IP. */
async function checkLockout(key: string): Promise<number | null> {
  const attempt = await prisma.userLoginAttempt.upsert({
    where: { email: key },
    update: {},
    create: { email: key },
  });

  if (attempt.lockedUntil && attempt.lockedUntil > new Date()) {
    return Math.ceil((attempt.lockedUntil.getTime() - Date.now()) / 60000);
  }
  if (attempt.lockedUntil && attempt.lockedUntil <= new Date()) {
    await prisma.userLoginAttempt.update({
      where: { email: key },
      data: { failCount: 0, lockedUntil: null },
    });
  }
  return null;
}

async function recordFailure(key: string): Promise<void> {
  const updated = await prisma.userLoginAttempt.update({
    where: { email: key },
    data: { failCount: { increment: 1 } },
  });
  if (updated.failCount >= MAX_ATTEMPTS) {
    await prisma.userLoginAttempt.update({
      where: { email: key },
      data: { lockedUntil: new Date(Date.now() + LOCKOUT_MS) },
    });
  }
}

async function recordSuccess(key: string): Promise<void> {
  await prisma.userLoginAttempt.update({
    where: { email: key },
    data: { failCount: 0, lockedUntil: null },
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const ipKey = `ip:${getClientIp(request)}`;

  const emailLockedMinutes = await checkLockout(normalizedEmail);
  const ipLockedMinutes = await checkLockout(ipKey);
  const lockedMinutes = emailLockedMinutes ?? ipLockedMinutes;
  if (lockedMinutes !== null) {
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${lockedMinutes} minute(s).` },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  const isValid = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!isValid) {
    await recordFailure(normalizedEmail);
    await recordFailure(ipKey);
    // Generic message regardless of whether the email exists -- avoids
    // leaking account existence via a different error string.
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await recordSuccess(normalizedEmail);
  await recordSuccess(ipKey);
  await createUserSession(user!.id);

  return NextResponse.json({ success: true, userId: user!.id });
}

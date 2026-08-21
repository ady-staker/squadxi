import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminPassword, createAdminSession } from "@/lib/admin-auth";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function getClientIp(request: Request): string {
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) return vercelForwarded.split(",")[0].trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const password = (body as { password?: unknown } | null)?.password;
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json(
      { error: "Password is required." },
      { status: 400 },
    );
  }

  const ip = getClientIp(request);
  let attempt = await prisma.loginAttempt.upsert({
    where: { ip },
    update: {},
    create: { ip },
  });

  const lockoutExpired =
    attempt.lockedUntil && attempt.lockedUntil <= new Date();
  if (lockoutExpired) {
    attempt = await prisma.loginAttempt.update({
      where: { ip },
      data: { failCount: 0, lockedUntil: null },
    });
  } else if (attempt.lockedUntil && attempt.lockedUntil > new Date()) {
    const minutes = Math.ceil(
      (attempt.lockedUntil.getTime() - Date.now()) / 60000,
    );
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${minutes} minute(s).` },
      { status: 429 },
    );
  }

  let isValid: boolean;
  try {
    isValid = checkAdminPassword(password);
  } catch (err) {
    console.error("Admin login attempted but ADMIN_PASSWORD is not set", err);
    return NextResponse.json(
      {
        error:
          "Admin login isn't configured yet -- set ADMIN_PASSWORD in .env.",
      },
      { status: 500 },
    );
  }

  if (!isValid) {
    const updated = await prisma.loginAttempt.update({
      where: { ip },
      data: { failCount: { increment: 1 } },
    });
    if (updated.failCount >= MAX_ATTEMPTS) {
      await prisma.loginAttempt.update({
        where: { ip },
        data: { lockedUntil: new Date(Date.now() + LOCKOUT_MS) },
      });
    }
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  await prisma.loginAttempt.update({
    where: { ip },
    data: { failCount: 0, lockedUntil: null },
  });
  try {
    createAdminSession();
  } catch (err) {
    console.error(
      "Admin login succeeded but ADMIN_SESSION_SECRET is not set",
      err,
    );
    return NextResponse.json(
      {
        error:
          "Admin login isn't fully configured yet -- set ADMIN_SESSION_SECRET in .env.",
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true });
}

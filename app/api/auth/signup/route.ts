import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createUserSession } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { email, password, displayName } = (body ?? {}) as {
    email?: unknown;
    password?: unknown;
    displayName?: unknown;
  };

  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }
  if (typeof displayName !== "string" || displayName.trim().length === 0) {
    return NextResponse.json({ error: "A display name is required." }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await prisma.user.create({
      data: { email: normalizedEmail, passwordHash, displayName: displayName.trim() },
    });
  } catch (err) {
    // P2002 = unique constraint violation -- a concurrent signup with the
    // same email won the race between the findUnique check above and this
    // create call.
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }
    throw err;
  }

  await createUserSession(user.id);

  return NextResponse.json({ success: true, userId: user.id });
}

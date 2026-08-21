import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

const COOKIE_NAME = "session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days -- casual end users, not an operator needing frequent re-auth like /admin
const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Issues a new session: a random raw token goes in the httpOnly cookie,
 *  only its sha256 hash is stored server-side -- mirrors lib/admin-auth.ts's
 *  principle of never storing a value that alone grants access. Unlike the
 *  admin session (a stateless signed cookie), user sessions are stateful
 *  (a real Session row) so an individual session can be revoked (logout,
 *  future "log out other devices") without invalidating every session at
 *  once, which a shared-secret HMAC scheme can't do. */
export async function createUserSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { userId, tokenHash, expiresAt },
  });

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyUserSession(): Promise<void> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: sha256(token) } })
      .catch(() => {});
  }
  cookies().delete(COOKIE_NAME);
}

/** Readable anywhere (Server Components, Route Handlers). Returns null for
 *  any failure mode (no cookie, expired session, dangling session row with
 *  no matching user) rather than throwing -- callers treat "not logged in"
 *  as the normal case, not an error. */
export async function getCurrentUser(): Promise<User | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
  });
  if (!session || session.expiresAt <= new Date()) return null;

  return prisma.user.findUnique({ where: { id: session.userId } });
}

/** Server-component gate for authenticated-only pages -- same per-page
 *  check convention as isAdminAuthenticated()'s callers elsewhere in this
 *  workspace (no Next.js middleware layer, which would need Prisma to run
 *  on the edge runtime). Redirects to /login, preserving the original path
 *  so login can send the user back where they meant to go. */
export async function requireUser(currentPath: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  }
  return user;
}

import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison -- shared by admin session verification,
 *  user session verification, and webhook signature verification so a
 *  future hardening fix only needs to be made in one place. */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

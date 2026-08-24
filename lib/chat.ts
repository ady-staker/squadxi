import "server-only";
import type { ChatThread } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const MAX_CHAT_MESSAGE_LENGTH = 2000;
export const CHAT_MESSAGE_COOLDOWN_MS = 1000;

// A thread belongs to exactly one identity -- a logged-in userId, or an
// anonymous guestKey the client generated and persisted itself (see
// ChatWidget.tsx). Never trust the URL's thread id alone: without this
// check, a guessed/observed thread id would let anyone read someone else's
// support conversation.
export async function findAccessibleThread(
  threadId: string,
  userId: string | null,
  guestKey: string | null,
): Promise<ChatThread | null> {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
  });
  if (!thread) return null;
  if (userId && thread.userId === userId) return thread;
  if (!userId && guestKey && thread.guestKey === guestKey) return thread;
  return null;
}

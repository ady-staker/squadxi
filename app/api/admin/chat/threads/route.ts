import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threads = await prisma.chatThread.findMany({
    where: { status: "OPEN" },
    orderBy: { lastMessageAt: "desc" },
  });

  const userIds = threads
    .map((t) => t.userId)
    .filter((id): id is string => Boolean(id));
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userById = new Map(users.map((u) => [u.id, u]));

  const threadIds = threads.map((t) => t.id);
  const unreadCounts = threadIds.length
    ? await prisma.chatMessage.groupBy({
        by: ["threadId"],
        where: {
          threadId: { in: threadIds },
          sender: "USER",
          readByAdmin: false,
        },
        _count: { _all: true },
      })
    : [];
  const unreadByThread = new Map(
    unreadCounts.map((u) => [u.threadId, u._count._all]),
  );

  return NextResponse.json({
    threads: threads.map((t) => ({
      id: t.id,
      displayName: t.userId
        ? (userById.get(t.userId)?.displayName ?? "Unknown user")
        : "Guest visitor",
      lastMessageAt: t.lastMessageAt,
      unreadCount: unreadByThread.get(t.id) ?? 0,
      createdAt: t.createdAt,
    })),
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  CHAT_MESSAGE_COOLDOWN_MS,
  MAX_CHAT_MESSAGE_LENGTH,
  findAccessibleThread,
} from "@/lib/chat";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  const { searchParams } = new URL(request.url);
  const guestKey = searchParams.get("guestKey");
  const after = searchParams.get("after");

  const thread = await findAccessibleThread(
    params.id,
    user?.id ?? null,
    guestKey,
  );
  if (!thread) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  const messages = await prisma.chatMessage.findMany({
    where: {
      threadId: thread.id,
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  await prisma.chatMessage.updateMany({
    where: { threadId: thread.id, sender: "ADMIN", readByUser: false },
    data: { readByUser: true },
  });

  return NextResponse.json({
    status: thread.status,
    messages: messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      createdAt: m.createdAt,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  const body = await request.json().catch(() => ({}));
  const guestKey = typeof body.guestKey === "string" ? body.guestKey : null;
  const text = typeof body.body === "string" ? body.body.trim() : "";

  if (!text) {
    return NextResponse.json(
      { error: "Message can't be empty." },
      { status: 400 },
    );
  }
  if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: `Message is too long (max ${MAX_CHAT_MESSAGE_LENGTH} characters).`,
      },
      { status: 400 },
    );
  }

  const thread = await findAccessibleThread(
    params.id,
    user?.id ?? null,
    guestKey,
  );
  if (!thread) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }
  if (thread.status !== "OPEN") {
    return NextResponse.json(
      { error: "This conversation is closed." },
      { status: 409 },
    );
  }

  const lastMessage = await prisma.chatMessage.findFirst({
    where: { threadId: thread.id, sender: "USER" },
    orderBy: { createdAt: "desc" },
  });
  if (
    lastMessage &&
    Date.now() - lastMessage.createdAt.getTime() < CHAT_MESSAGE_COOLDOWN_MS
  ) {
    return NextResponse.json(
      { error: "You're sending messages too fast." },
      { status: 429 },
    );
  }

  const message = await prisma.chatMessage.create({
    data: { threadId: thread.id, sender: "USER", body: text },
  });
  await prisma.chatThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: message.createdAt },
  });

  return NextResponse.json({
    message: {
      id: message.id,
      sender: message.sender,
      body: message.body,
      createdAt: message.createdAt,
    },
  });
}

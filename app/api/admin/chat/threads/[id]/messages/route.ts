import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/chat";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thread = await prisma.chatThread.findUnique({
    where: { id: params.id },
  });
  if (!thread) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const after = searchParams.get("after");

  const messages = await prisma.chatMessage.findMany({
    where: {
      threadId: thread.id,
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  await prisma.chatMessage.updateMany({
    where: { threadId: thread.id, sender: "USER", readByAdmin: false },
    data: { readByAdmin: true },
  });

  return NextResponse.json({
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
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
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

  const thread = await prisma.chatThread.findUnique({
    where: { id: params.id },
  });
  if (!thread) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  const message = await prisma.chatMessage.create({
    data: { threadId: thread.id, sender: "ADMIN", body: text },
  });
  await prisma.chatThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: message.createdAt, status: "OPEN" },
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

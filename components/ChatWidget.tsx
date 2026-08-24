"use client";

import { useEffect, useRef, useState } from "react";
import { ChatIcon, CloseIcon, SendIcon } from "@/components/icons";

const GUEST_KEY_STORAGE = "squadxi-chat-guest-key";
const POLL_MS = 3500;

type Message = {
  id: string;
  sender: "USER" | "ADMIN";
  body: string;
  createdAt: string;
};

// A poll in flight when send() completes can return with a stale `after`
// (captured before send()'s own state update set lastTimestampRef), so its
// response can include the very message send() just appended -- dedup by
// id on every merge rather than relying on request timing to avoid it.
function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  const seen = new Set(prev.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  return fresh.length ? [...prev, ...fresh] : prev;
}

function getGuestKey(): string {
  try {
    const existing = localStorage.getItem(GUEST_KEY_STORAGE);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(GUEST_KEY_STORAGE, created);
    return created;
  } catch {
    // storage unavailable -- fall back to a session-only id
    return crypto.randomUUID();
  }
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const guestKeyRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTimestampRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!open || threadId) return;
    guestKeyRef.current = getGuestKey();
    fetch("/api/chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestKey: guestKeyRef.current }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.threadId) setThreadId(data.threadId);
      })
      .catch(() => {});
  }, [open, threadId]);

  useEffect(() => {
    if (!open || !threadId) return;
    let cancelled = false;

    async function poll() {
      const params = new URLSearchParams();
      if (guestKeyRef.current) params.set("guestKey", guestKeyRef.current);
      if (lastTimestampRef.current)
        params.set("after", lastTimestampRef.current);
      try {
        const res = await fetch(
          `/api/chat/threads/${threadId}/messages?${params.toString()}`,
        );
        const data = await res.json();
        if (
          !cancelled &&
          Array.isArray(data.messages) &&
          data.messages.length
        ) {
          lastTimestampRef.current = data.messages.at(-1).createdAt;
          setMessages((prev) => mergeMessages(prev, data.messages));
        }
      } catch {
        // swallow -- next poll retries
      }
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, threadId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body || !threadId || sending) return;
    setSending(true);
    setDraft("");
    try {
      const res = await fetch(`/api/chat/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, guestKey: guestKeyRef.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Cooldown (429), validation (400), or closed thread (409) -- restore
        // the draft instead of silently losing what the user typed.
        setDraft(body);
        return;
      }
      if (data.message) {
        lastTimestampRef.current = data.message.createdAt;
        setMessages((prev) => mergeMessages(prev, [data.message]));
      }
    } catch {
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[28rem] w-80 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl animate-rise-in">
          <div className="flex items-center justify-between border-b border-border bg-paper px-4 py-3">
            <p className="text-sm font-semibold text-ink">SquadXI Support</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="text-muted transition hover:text-ink"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 space-y-2 overflow-y-auto px-3 py-3"
          >
            {messages.length === 0 ? (
              <p className="mt-6 text-center text-xs text-muted">
                Ask us anything about contests, entries, or payouts -- a
                representative will reply here.
              </p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    m.sender === "USER"
                      ? "ml-auto bg-primary text-white"
                      : "bg-border text-ink"
                  }`}
                >
                  {m.body}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border p-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type a message..."
              className="flex-1 rounded-full border border-border bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-primary/50"
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim() || sending}
              aria-label="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-dark disabled:opacity-40"
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support chat" : "Open support chat"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-xl transition hover:bg-primary-dark hover:scale-105"
      >
        {open ? (
          <CloseIcon className="h-5 w-5" />
        ) : (
          <ChatIcon className="h-6 w-6" />
        )}
      </button>
    </div>
  );
}

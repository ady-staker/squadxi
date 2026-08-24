"use client";

import { useEffect, useRef, useState } from "react";

const THREAD_LIST_POLL_MS = 5000;
const MESSAGE_POLL_MS = 3500;

type ThreadRow = {
  id: string;
  displayName: string;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
};
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

export function AdminChatPanel() {
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const lastTimestampRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/admin/chat/threads", {
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled && Array.isArray(data.threads)) setThreads(data.threads);
      } catch {
        // next poll retries
      }
    }
    poll();
    const interval = setInterval(poll, THREAD_LIST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setMessages([]);
    lastTimestampRef.current = undefined;
    if (!selectedId) return;
    let cancelled = false;

    async function poll() {
      const params = new URLSearchParams();
      if (lastTimestampRef.current)
        params.set("after", lastTimestampRef.current);
      try {
        const res = await fetch(
          `/api/admin/chat/threads/${selectedId}/messages?${params.toString()}`,
          { cache: "no-store" },
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
        // next poll retries
      }
    }

    poll();
    const interval = setInterval(poll, MESSAGE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body || !selectedId) return;
    setDraft("");
    try {
      const res = await fetch(
        `/api/admin/chat/threads/${selectedId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setDraft(body);
        return;
      }
      if (data.message) {
        lastTimestampRef.current = data.message.createdAt;
        setMessages((prev) => mergeMessages(prev, [data.message]));
      }
    } catch {
      setDraft(body);
    }
  }

  if (!threads) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-border sm:grid-cols-[16rem_1fr]">
      <div className="max-h-96 divide-y divide-border overflow-y-auto border-b border-border sm:border-b-0 sm:border-r">
        {threads.length === 0 ? (
          <p className="p-4 text-sm text-muted">No open conversations.</p>
        ) : (
          threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-paper ${
                selectedId === t.id ? "bg-paper" : ""
              }`}
            >
              <span className="text-ink">{t.displayName}</span>
              {t.unreadCount > 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                  {t.unreadCount}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      <div className="flex h-96 flex-col">
        {!selectedId ? (
          <p className="m-auto text-sm text-muted">
            Select a conversation to view it.
          </p>
        ) : (
          <>
            <div
              ref={scrollRef}
              className="flex-1 space-y-2 overflow-y-auto p-4"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                    m.sender === "ADMIN"
                      ? "ml-auto bg-primary text-white"
                      : "bg-border text-ink"
                  }`}
                >
                  {m.body}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-border p-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Reply..."
                className="flex-1 rounded-full border border-border bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-primary/50"
              />
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim()}
                className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

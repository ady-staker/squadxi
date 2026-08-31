"use client";

import { useState } from "react";

export function ComingSoonTile({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      className="flex flex-col gap-2 rounded-lg border border-slate-200 p-5 text-left transition hover:border-slate-300"
    >
      <p className="font-[family-name:var(--font-finance-display)] text-lg font-semibold text-slate-500">
        {title}
      </p>
      {revealed ? (
        <p className="text-sm font-semibold text-blue-700">Coming soon.</p>
      ) : (
        <p className="text-sm text-slate-500">{body}</p>
      )}
    </button>
  );
}

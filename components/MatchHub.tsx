"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useConnect,
  useChainId,
  useSwitchChain,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhoodChainTestnet } from "@/lib/wagmi-config";

type MatchInfo = {
  id: string;
  status: string;
  venue: string;
  format: string;
  scheduledAt: string;
  team1: { id: string; name: string; shortName: string; logo: string } | null;
  team2: { id: string; name: string; shortName: string; logo: string } | null;
};
type Contest = {
  id: string;
  name: string;
  entryFeeCents: number;
  maxEntries: number;
  currentEntries: number;
  prizePoolCents: number;
  status: string;
};
type FantasyTeam = { id: string; name: string; totalCredits: string };

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const TERMINAL_PAYMENT_STATUSES = [
  "COMPLETED",
  "EXPIRED",
  "REFUNDED",
  "FAILED",
];
const STATUS_POLL_MS = 4000;

function TestnetPaymentFlow({
  contestEntryId,
  toAddress,
  amountWei,
  chainId,
  onConfirmed,
}: {
  contestEntryId: string;
  toAddress: `0x${string}`;
  amountWei: string;
  chainId: number;
  onConfirmed: () => void;
}) {
  const { address, isConnected } = useAccount();
  const { connect, error: connectError } = useConnect();
  const connectedChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const {
    sendTransaction,
    data: txHash,
    isPending,
    error: sendError,
  } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });
  const [confirmed, setConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfirmed || !txHash || confirmed) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/contest-entries/${contestEntryId}/confirm-testnet-payment`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ txHash }),
          },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to confirm.");
        setConfirmed(true);
        onConfirmed();
      } catch (err) {
        setConfirmError(
          err instanceof Error ? err.message : "Failed to confirm payment.",
        );
      }
    })();
  }, [isConfirmed, txHash, confirmed, contestEntryId, onConfirmed]);

  if (confirmed) {
    return (
      <p className="text-sm font-semibold text-accent">
        Payment confirmed — you're entered!
      </p>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-end gap-1 text-right">
        <button
          onClick={() => connect({ connector: injected() })}
          className="rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-paper transition hover:opacity-90"
        >
          Connect wallet to pay
        </button>
        {connectError && (
          <p className="text-xs text-loss">No wallet extension found.</p>
        )}
      </div>
    );
  }

  if (connectedChainId !== robinhoodChainTestnet.id) {
    return (
      <button
        onClick={() => switchChain({ chainId: robinhoodChainTestnet.id })}
        className="rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-paper transition hover:opacity-90"
      >
        Switch to Robinhood Chain testnet
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <button
        onClick={() =>
          sendTransaction({
            to: toAddress,
            value: BigInt(amountWei),
            chainId,
          })
        }
        disabled={isPending || isConfirming}
        className="rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-paper transition hover:opacity-90 disabled:opacity-50"
      >
        {isPending
          ? "Confirm in wallet…"
          : isConfirming
            ? "Waiting for confirmation…"
            : `Pay ${(Number(amountWei) / 1e18).toFixed(4)} testnet ETH`}
      </button>
      <p className="text-xs text-muted">
        Connected as <span className="font-mono">{address}</span>
      </p>
      {sendError && <p className="text-xs text-loss">{sendError.message}</p>}
      {confirmError && <p className="text-xs text-loss">{confirmError}</p>}
    </div>
  );
}

function EnterContestForm({
  contest,
  teams,
  onEntered,
}: {
  contest: Contest;
  teams: FantasyTeam[];
  onEntered: () => void;
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [testnetPayment, setTestnetPayment] = useState<{
    toAddress: `0x${string}`;
    amountWei: string;
    chainId: number;
  } | null>(null);

  async function submit(paymentMethod?: "coinvoyage" | "testnet_eth") {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/contests/${contest.id}/enter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fantasyTeamId: teamId,
          idempotencyKey: crypto.randomUUID(),
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to enter contest.");
      if (data.testnetPayment) {
        setEntryId(data.contestEntryId);
        setTestnetPayment(data.testnetPayment);
      } else if (data.paymentUrl) {
        setPaymentUrl(data.paymentUrl);
        setEntryId(data.contestEntryId);
        setPaymentStatus(data.paymentStatus ?? "PENDING");
      } else {
        onEntered();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enter contest.");
    } finally {
      setSubmitting(false);
    }
  }

  // Polls this entry's status after "Complete payment" is shown -- the
  // fallback that confirms payment without relying on this app's CoinVoyage
  // webhook (unregistered as of first deploy, see README). Stops once the
  // status reaches any terminal state; COMPLETED refreshes the parent list.
  useEffect(() => {
    if (
      !entryId ||
      !paymentStatus ||
      TERMINAL_PAYMENT_STATUSES.includes(paymentStatus)
    )
      return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/contest-entries/${entryId}/status`);
        const data = await res.json();
        if (data.paymentStatus) setPaymentStatus(data.paymentStatus);
        if (data.paymentStatus === "COMPLETED") onEntered();
      } catch {
        // Transient poll failure -- next interval tick tries again.
      }
    }, STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [entryId, paymentStatus, onEntered]);

  if (testnetPayment && entryId) {
    return (
      <TestnetPaymentFlow
        contestEntryId={entryId}
        toAddress={testnetPayment.toAddress}
        amountWei={testnetPayment.amountWei}
        chainId={testnetPayment.chainId}
        onConfirmed={onEntered}
      />
    );
  }

  if (paymentUrl) {
    if (paymentStatus === "COMPLETED") {
      return (
        <p className="text-sm font-semibold text-accent">
          Payment confirmed — you're entered!
        </p>
      );
    }
    if (paymentStatus && TERMINAL_PAYMENT_STATUSES.includes(paymentStatus)) {
      return (
        <p className="text-sm text-loss">
          Payment {paymentStatus.toLowerCase()}. Please try entering again.
        </p>
      );
    }
    return (
      <div className="flex flex-col items-end gap-1 text-right">
        <a
          href={paymentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-paper transition hover:opacity-90"
        >
          Complete payment ↗
        </a>
        <p className="text-xs text-muted">
          Opens CoinVoyage's payment page in a new tab. This updates
          automatically once paid.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {teams.length > 1 && (
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="rounded-lg border border-border bg-paper px-2 py-1.5 text-xs text-ink"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {contest.entryFeeCents === 0 ? (
        <button
          onClick={() => submit()}
          disabled={submitting || !teamId}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-paper transition hover:bg-accent-dark disabled:opacity-50"
        >
          {submitting ? "…" : "Join free"}
        </button>
      ) : (
        <>
          <button
            onClick={() => submit("coinvoyage")}
            disabled={submitting || !teamId}
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-paper transition hover:bg-accent-dark disabled:opacity-50"
          >
            {submitting ? "…" : `Enter (${formatUsd(contest.entryFeeCents)})`}
          </button>
          <button
            onClick={() => submit("testnet_eth")}
            disabled={submitting || !teamId}
            title="Pay via Robinhood Chain testnet ETH instead of CoinVoyage -- no real money"
            className="rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-semibold text-gold transition hover:border-gold disabled:opacity-50"
          >
            {submitting ? "…" : "Pay with testnet ETH"}
          </button>
        </>
      )}
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  );
}

function CreateLeagueForm({ matchId }: { matchId: string }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create league.");
      setInviteCode(data.league.inviteCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create league.");
    } finally {
      setSubmitting(false);
    }
  }

  if (inviteCode) {
    return (
      <p className="text-sm text-ink">
        League created! Invite code:{" "}
        <span className="font-mono font-bold text-accent">{inviteCode}</span>
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        placeholder="League name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 rounded-lg border border-border bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <button
        onClick={submit}
        disabled={submitting || !name.trim()}
        className="whitespace-nowrap rounded-full bg-accent px-4 py-2 text-xs font-semibold text-paper transition hover:bg-accent-dark disabled:opacity-50"
      >
        {submitting ? "…" : "Create"}
      </button>
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  );
}

function JoinLeagueForm({ teams }: { teams: FantasyTeam[] }) {
  const [code, setCode] = useState("");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/leagues/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: code, fantasyTeamId: teamId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to join league.");
      setJoined(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join league.");
    } finally {
      setSubmitting(false);
    }
  }

  if (joined) return <p className="text-sm text-accent">Joined!</p>;

  return (
    <div className="flex items-center gap-2">
      <input
        placeholder="Invite code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        className="w-32 rounded-lg border border-border bg-paper px-3 py-2 text-sm uppercase text-ink placeholder:text-muted placeholder:normal-case focus:border-accent focus:outline-none"
      />
      {teams.length > 1 && (
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="rounded-lg border border-border bg-paper px-2 py-1.5 text-xs text-ink"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={submit}
        disabled={submitting || !code.trim() || !teamId}
        className="whitespace-nowrap rounded-full border border-border px-4 py-2 text-xs font-semibold text-ink transition hover:border-accent disabled:opacity-50"
      >
        {submitting ? "…" : "Join"}
      </button>
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  );
}

export function MatchHub({ matchId }: { matchId: string }) {
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [contests, setContests] = useState<Contest[]>([]);
  const [teams, setTeams] = useState<FantasyTeam[] | null>(null); // null = signed out or loading
  const [error, setError] = useState<string | null>(null);

  async function loadTeams() {
    const res = await fetch(`/api/fantasy-teams?matchId=${matchId}`);
    if (res.ok) {
      const data = await res.json();
      setTeams(data.fantasyTeams);
    }
  }

  useEffect(() => {
    fetch(`/api/matches/${matchId}/players`)
      .then((res) => res.json())
      .then((data) =>
        data.error ? setError(data.error) : setMatch(data.match),
      )
      .catch(() => setError("Failed to load match."));

    fetch(`/api/contests?matchId=${matchId}&status=OPEN`)
      .then((res) => res.json())
      .then((data) => setContests(data.contests ?? []));

    loadTeams();
  }, [matchId]);

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!match) return <p className="text-sm text-muted">Loading…</p>;

  const hasTeams = teams !== null && teams.length > 0;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold text-ink">
          {match.team1?.shortName ?? "?"} vs {match.team2?.shortName ?? "?"}
        </h1>
        <p className="text-sm text-muted">{match.venue}</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        {hasTeams ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink">
              You've built {teams!.length} team{teams!.length > 1 ? "s" : ""}{" "}
              for this match.
            </p>
            <Link
              href={`/matches/${matchId}/team-builder`}
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-ink transition hover:border-accent"
            >
              Build another team
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink">
              Build your XI before joining a league or contest.
            </p>
            <Link
              href={`/matches/${matchId}/team-builder`}
              className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-paper transition hover:bg-accent-dark"
            >
              Build your team
            </Link>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Public contests
        </h2>
        {contests.length === 0 ? (
          <p className="text-sm text-muted">
            No public contests open for this match yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {contests.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <div>
                  <p className="font-medium text-ink">{c.name}</p>
                  <p className="text-xs text-muted">
                    Prize pool{" "}
                    <span className="text-gold">
                      {formatUsd(c.prizePoolCents)}
                    </span>{" "}
                    · {c.currentEntries}/{c.maxEntries} entered
                  </p>
                </div>
                {hasTeams ? (
                  <EnterContestForm
                    contest={c}
                    teams={teams!}
                    onEntered={loadTeams}
                  />
                ) : (
                  <span className="text-xs text-muted">
                    Build a team to enter
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Private leagues
        </h2>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
          <div>
            <p className="mb-2 text-xs text-muted">
              Create a league and share the invite code with friends.
            </p>
            <CreateLeagueForm matchId={matchId} />
          </div>
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs text-muted">Have an invite code?</p>
            {hasTeams ? (
              <JoinLeagueForm teams={teams!} />
            ) : (
              <span className="text-xs text-muted">Build a team to join</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

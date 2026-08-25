"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useConnect,
  useConnectors,
  useDisconnect,
  useChainId,
  useSwitchChain,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { robinhoodChainTestnet } from "@/lib/wagmi-config";
import { MIN_STAKE_CENTS, MAX_STAKE_CENTS } from "@/lib/live-bet-constants";
import { isTerminalStatus } from "@/lib/order-status";
import { describeChainSwitchError } from "@/lib/wallet-errors";
import { forceWalletAccountPicker } from "@/lib/wallet-connect";

type Team = { id: string; shortName: string; name: string };
type Odds = { team1Multiplier: number; team2Multiplier: number };

const STATUS_POLL_MS = 4000;

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function TestnetBetPaymentFlow({
  liveBetId,
  toAddress,
  amountWei,
  chainId,
  onConfirmed,
  onCancel,
}: {
  liveBetId: string;
  toAddress: `0x${string}`;
  amountWei: string;
  chainId: number;
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const { address, isConnected } = useAccount();
  const { connect, error: connectError } = useConnect();
  const connectors = useConnectors();
  const { disconnectAsync } = useDisconnect();
  const connectedChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const {
    sendTransaction,
    data: txHash,
    isPending,
    error: sendError,
  } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [switchingChain, setSwitchingChain] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  // useChainId() can report a stale chain persistently (not just mid-switch)
  // for an unrecognized custom chain, so switch unconditionally and let the
  // wallet decide rather than trusting that read.
  async function payNow() {
    setSwitchingChain(true);
    setSwitchError(null);
    try {
      await switchChainAsync({ chainId: robinhoodChainTestnet.id });
      sendTransaction({ to: toAddress, value: BigInt(amountWei), chainId });
    } catch (err) {
      setSwitchError(describeChainSwitchError(err));
    } finally {
      setSwitchingChain(false);
    }
  }

  // Awaited so the parent doesn't reset until disconnect actually clears.
  async function cancel() {
    try {
      await disconnectAsync();
    } catch {
      // Best-effort -- reset below regardless.
    }
    onCancel();
  }

  // Forces the wallet's picker -- see lib/wallet-connect.ts.
  async function connectWallet() {
    const connector = connectors[0];
    if (!connector) return;
    await forceWalletAccountPicker(connector);
    connect({ connector });
  }

  async function confirmOnServer(hash: `0x${string}`) {
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch(
        `/api/live-bets/${liveBetId}/confirm-testnet-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash: hash }),
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
    } finally {
      setConfirming(false);
    }
  }

  useEffect(() => {
    if (!isConfirmed || !txHash || confirmed || confirming) return;
    confirmOnServer(txHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash, confirmed, confirming]);

  if (confirmed) {
    return (
      <p className="text-sm font-semibold text-accent">
        Payment confirmed — your bet is placed!
      </p>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-center gap-2">
          <button
            onClick={connectWallet}
            className="rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-paper transition hover:opacity-90"
          >
            Connect wallet to pay
          </button>
          <button
            onClick={cancel}
            className="text-xs text-muted underline hover:text-ink"
          >
            Cancel
          </button>
        </div>
        {connectError && (
          <p className="text-xs text-loss">No wallet extension found.</p>
        )}
      </div>
    );
  }

  // Render-time-only prompt; payNow() itself always re-confirms the chain.
  if (connectedChainId !== robinhoodChainTestnet.id && !switchingChain) {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-center gap-2">
          <button
            onClick={payNow}
            className="rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-paper transition hover:opacity-90"
          >
            Switch to Robinhood Chain testnet
          </button>
          <button
            onClick={cancel}
            className="text-xs text-muted underline hover:text-ink"
          >
            Cancel
          </button>
        </div>
        {switchError && <p className="text-xs text-loss">{switchError}</p>}
      </div>
    );
  }

  // Once mined, never offer to send another transfer -- retry re-verifies
  // the same txHash instead.
  if (isConfirmed && txHash) {
    return (
      <div className="flex flex-col items-start gap-1">
        {confirmError ? (
          <>
            <button
              onClick={() => confirmOnServer(txHash)}
              disabled={confirming}
              className="rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-paper transition hover:opacity-90 disabled:opacity-50"
            >
              {confirming ? "Retrying…" : "Retry confirming payment"}
            </button>
            <p className="text-xs text-loss">{confirmError}</p>
          </>
        ) : (
          <p className="text-xs text-muted">Confirming your payment…</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <button
          onClick={payNow}
          disabled={switchingChain || isPending || isConfirming}
          className="rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-paper transition hover:opacity-90 disabled:opacity-50"
        >
          {switchingChain
            ? "Switching network…"
            : isPending
              ? "Confirm in wallet…"
              : isConfirming
                ? "Waiting for confirmation…"
                : `Pay ${(Number(amountWei) / 1e18).toFixed(4)} testnet ETH`}
        </button>
        {/* Cancelling once a transaction has actually been sent wouldn't
            stop it on-chain, so the option disappears once txHash exists. */}
        {!txHash && (
          <button
            onClick={cancel}
            className="text-xs text-muted underline hover:text-ink"
          >
            Cancel
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        Connected as <span className="font-mono">{address}</span>
      </p>
      {switchError && <p className="text-xs text-loss">{switchError}</p>}
      {sendError && (
        <p className="text-xs text-loss">
          {sendError.message.includes("does not match the target chain")
            ? "Your wallet switched away from Robinhood Chain testnet -- click Pay again to reconnect."
            : sendError.message}
        </p>
      )}
    </div>
  );
}

export function LiveBetPanel({
  matchId,
  team1,
  team2,
  odds,
}: {
  matchId: string;
  team1: Team;
  team2: Team;
  odds: Odds;
}) {
  const [sideTeamId, setSideTeamId] = useState(team1.id);
  const [stakeBounds, setStakeBounds] = useState({
    min: MIN_STAKE_CENTS,
    max: MAX_STAKE_CENTS,
  });
  const [stakeDollars, setStakeDollars] = useState(
    (MIN_STAKE_CENTS / 100).toFixed(2),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  // Stable per mount (not per submit) so a retry dedupes; suffixed with
  // paymentMethod at use so switching methods starts a fresh bet instead
  // of replaying the first method's response.
  const [idempotencyKeyBase] = useState(() => crypto.randomUUID());

  const [liveBetId, setLiveBetId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [testnetPayment, setTestnetPayment] = useState<{
    toAddress: `0x${string}`;
    amountWei: string;
    chainId: number;
  } | null>(null);
  const [placed, setPlaced] = useState(false);
  const [lockedOdds, setLockedOdds] = useState<number | null>(null);

  // Admin-tunable via /admin -- refresh on mount so the displayed/enforced
  // bounds match what the server will actually accept.
  useEffect(() => {
    fetch("/api/live-bets/stake-bounds")
      .then((res) => res.json())
      .then(
        (data: {
          minLiveBetStakeCents: number;
          maxLiveBetStakeCents: number;
        }) => {
          setStakeBounds((prev) => {
            if (stakeDollars === (prev.min / 100).toFixed(2)) {
              setStakeDollars((data.minLiveBetStakeCents / 100).toFixed(2));
            }
            return {
              min: data.minLiveBetStakeCents,
              max: data.maxLiveBetStakeCents,
            };
          });
        },
      )
      .catch(() => {
        // Keep the hardcoded fallback bounds -- the server still enforces
        // its own current bounds regardless of what the client displays.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(paymentMethod: "coinvoyage" | "testnet_eth") {
    const stakeCents = Math.round(Number(stakeDollars) * 100);
    if (
      !Number.isInteger(stakeCents) ||
      stakeCents < stakeBounds.min ||
      stakeCents > stakeBounds.max
    ) {
      setError(
        `Stake must be between ${formatUsd(stakeBounds.min)} and ${formatUsd(stakeBounds.max)}.`,
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/live-bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          sideTeamId,
          stakeCents,
          idempotencyKey: `${idempotencyKeyBase}-${paymentMethod}`,
          paymentMethod,
        }),
      });
      if (res.status === 401) {
        setNeedsSignIn(true);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to place bet.");
      // Show the odds actually locked in for settlement -- Number() handles
      // both a fresh number and a replayed response's serialized Decimal string.
      if (data.oddsMultiplier !== undefined && data.oddsMultiplier !== null) {
        const n = Number(data.oddsMultiplier);
        if (!Number.isNaN(n)) setLockedOdds(n);
      }
      if (data.testnetPayment) {
        setLiveBetId(data.liveBetId);
        setTestnetPayment(data.testnetPayment);
      } else if (data.paymentUrl) {
        setLiveBetId(data.liveBetId);
        setPaymentUrl(data.paymentUrl);
        setStatus(data.status ?? "PENDING");
      } else {
        setPlaced(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place bet.");
    } finally {
      setSubmitting(false);
    }
  }

  // Drops back to the original stake/payment-method screen as if this
  // attempt never happened. The backend bet (if any) is left as-is --
  // resumed or replaced the next time the user submits, same as any retry.
  function cancelPayment() {
    setLiveBetId(null);
    setStatus(null);
    setPaymentUrl(null);
    setTestnetPayment(null);
    setLockedOdds(null);
    setError(null);
  }

  // Same webhook-fallback poll as MatchHub's EnterContestForm.
  useEffect(() => {
    if (!liveBetId || !status || isTerminalStatus(status)) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/live-bets/${liveBetId}/status`);
        const data = await res.json();
        if (data.status) setStatus(data.status);
      } catch {
        // Transient poll failure -- next interval tick tries again.
      }
    }, STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [liveBetId, status]);

  if (needsSignIn) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="mb-3 text-sm text-muted">Sign in to bet on this match.</p>
        <Link
          href={`/login?next=${encodeURIComponent(`/matches/${matchId}/live`)}`}
          className="inline-block rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-paper transition hover:bg-accent-dark"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (testnetPayment && liveBetId) {
    return (
      <div className="rounded-2xl border border-gold/30 bg-gold/10 p-5">
        {lockedOdds !== null && (
          <p className="mb-2 text-xs text-muted">
            Locked in at {lockedOdds.toFixed(2)}x odds
          </p>
        )}
        <TestnetBetPaymentFlow
          liveBetId={liveBetId}
          toAddress={testnetPayment.toAddress}
          amountWei={testnetPayment.amountWei}
          chainId={testnetPayment.chainId}
          onConfirmed={() => setPlaced(true)}
          onCancel={cancelPayment}
        />
      </div>
    );
  }

  if (paymentUrl) {
    if (placed || status === "COMPLETED") {
      return (
        <div className="rounded-2xl border border-accent/30 bg-accent/10 p-5">
          <p className="text-sm font-semibold text-accent">
            Payment confirmed — your bet is placed!
          </p>
          {lockedOdds !== null && (
            <p className="mt-1 text-xs text-accent/80">
              Locked in at {lockedOdds.toFixed(2)}x odds
            </p>
          )}
        </div>
      );
    }
    if (status && isTerminalStatus(status)) {
      return (
        <p className="rounded-2xl border border-loss/30 bg-loss/10 p-5 text-sm text-loss">
          Payment {status.toLowerCase()}. Please try placing your bet again.
        </p>
      );
    }
    return (
      <div className="flex flex-col items-start gap-1 rounded-2xl border border-gold/30 bg-gold/10 p-5">
        {lockedOdds !== null && (
          <p className="mb-1 text-xs text-muted">
            Locked in at {lockedOdds.toFixed(2)}x odds
          </p>
        )}
        <div className="flex items-center gap-2">
          <a
            href={paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-paper transition hover:opacity-90"
          >
            Complete payment ↗
          </a>
          <button
            onClick={cancelPayment}
            className="text-xs text-muted underline hover:text-ink"
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-muted">
          Opens CoinVoyage's payment page in a new tab. This updates
          automatically once paid.
        </p>
      </div>
    );
  }

  if (placed) {
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent/10 p-5">
        <p className="text-sm font-semibold text-accent">Your bet is placed!</p>
        {lockedOdds !== null && (
          <p className="mt-1 text-xs text-accent/80">
            Locked in at {lockedOdds.toFixed(2)}x odds
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Bet on this match
      </h3>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => setSideTeamId(team1.id)}
          className={`rounded-xl border px-3 py-3 text-left transition ${
            sideTeamId === team1.id
              ? "border-accent bg-accent/10"
              : "border-border bg-paper hover:border-accent/40"
          }`}
        >
          <p className="text-sm font-semibold text-ink">{team1.shortName}</p>
          <p className="font-mono text-xs text-gold">
            {odds.team1Multiplier.toFixed(2)}x
          </p>
        </button>
        <button
          onClick={() => setSideTeamId(team2.id)}
          className={`rounded-xl border px-3 py-3 text-left transition ${
            sideTeamId === team2.id
              ? "border-accent bg-accent/10"
              : "border-border bg-paper hover:border-accent/40"
          }`}
        >
          <p className="text-sm font-semibold text-ink">{team2.shortName}</p>
          <p className="font-mono text-xs text-gold">
            {odds.team2Multiplier.toFixed(2)}x
          </p>
        </button>
      </div>

      <label className="mb-1 block text-xs uppercase tracking-wide text-muted">
        Stake ({formatUsd(stakeBounds.min)}–{formatUsd(stakeBounds.max)})
      </label>
      <input
        type="number"
        min={stakeBounds.min / 100}
        max={stakeBounds.max / 100}
        step="0.01"
        value={stakeDollars}
        onChange={(e) => setStakeDollars(e.target.value)}
        className="mb-4 w-full rounded-lg border border-border bg-paper px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={() => submit("coinvoyage")}
          disabled={submitting}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-paper transition hover:bg-accent-dark disabled:opacity-50"
        >
          {submitting ? "…" : "Place bet"}
        </button>
        <button
          onClick={() => submit("testnet_eth")}
          disabled={submitting}
          title="Pay via Robinhood Chain testnet ETH instead of CoinVoyage -- no real money"
          className="rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-semibold text-gold transition hover:border-gold disabled:opacity-50"
        >
          {submitting ? "…" : "Bet with testnet ETH"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-loss">{error}</p>}
    </div>
  );
}

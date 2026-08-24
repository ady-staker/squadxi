import { LiveBetClaimPanel } from "@/components/LiveBetClaimPanel";
import { BoltIcon } from "@/components/home/icons";

export default function LiveBetClaimPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold">
          <BoltIcon className="h-5 w-5" />
        </span>
        <h1 className="text-2xl font-semibold text-ink">
          Claim your live bet winnings
        </h1>
      </div>
      <LiveBetClaimPanel liveBetId={params.id} />
    </div>
  );
}

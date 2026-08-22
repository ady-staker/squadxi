import { LiveBetClaimPanel } from "@/components/LiveBetClaimPanel";

export default function LiveBetClaimPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-ink">
        Claim your live bet winnings
      </h1>
      <LiveBetClaimPanel liveBetId={params.id} />
    </div>
  );
}

import { RoleBonusClaimPanel } from "@/components/RoleBonusClaimPanel";

export default function ClaimPage({ params }: { params: { claimId: string } }) {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-ink">
        Claim your role bonus
      </h1>
      <RoleBonusClaimPanel claimId={params.claimId} />
    </div>
  );
}

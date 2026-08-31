import { StakePanel } from "@/components/finance/StakePanel";

export default function FinanceStakePage() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
        Testnet ETH
      </p>
      <h1 className="mb-6 font-[family-name:var(--font-finance-display)] text-3xl font-semibold tracking-tight text-slate-900">
        Stake &amp; Earn
      </h1>
      <StakePanel />
    </div>
  );
}

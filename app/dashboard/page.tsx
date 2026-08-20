import { requireUser } from "@/lib/auth";
import { MyEntries } from "@/components/MyEntries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">My Leagues</h1>
        <p className="text-sm text-muted">Welcome back, {user.displayName}.</p>
      </div>
      <MyEntries />
    </div>
  );
}

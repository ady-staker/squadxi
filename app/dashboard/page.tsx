import { requireUser } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Welcome, {user.displayName}</h1>
          <p className="text-sm text-muted">{user.email}</p>
        </div>
        <LogoutButton />
      </div>
      <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
        Your leagues, contests, and fantasy teams will show up here — coming
        in a later phase of this build.
      </p>
    </div>
  );
}

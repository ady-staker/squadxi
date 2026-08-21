import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

export async function Nav() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-border bg-paper">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-paper">
            XI
          </span>
          <span className="text-lg font-bold tracking-tight text-ink">
            Squad<span className="text-accent">XI</span>
          </span>
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/matches"
            className="text-muted transition hover:text-ink"
          >
            Matches
          </Link>
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-muted transition hover:text-ink"
              >
                My Leagues
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-muted transition hover:text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-paper transition hover:bg-accent-dark"
              >
                Create account
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

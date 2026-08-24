import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DownloadIcon } from "@/components/icons";

export async function Nav() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-border bg-paper">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/">
          <Logo />
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          <Link
            href="/matches"
            className="text-muted transition hover:text-ink"
          >
            Matches
          </Link>
          <Link
            href="/download"
            className="hidden items-center gap-1.5 text-muted transition hover:text-ink sm:flex"
          >
            <DownloadIcon className="h-4 w-4" />
            Get the app
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
                className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-dark"
              >
                Create account
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

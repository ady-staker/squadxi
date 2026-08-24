import Link from "next/link";
import { LogoMark } from "@/components/Logo";

export const metadata = {
  title: "Get the App — SquadXI",
};

export default function DownloadPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 py-16 text-center">
      <LogoMark className="h-16 w-16 animate-rise-in" />
      <h1 className="text-2xl font-bold text-ink">
        The SquadXI app is on its way
      </h1>
      <p className="text-sm leading-relaxed text-muted">
        We&apos;re currently building the mobile app and giving it a proper
        renovation before launch. In the meantime, everything -- team building,
        contests, live match betting, and payouts -- works right here on the
        website.
      </p>
      <Link
        href="/"
        className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark"
      >
        Back to SquadXI
      </Link>
    </div>
  );
}

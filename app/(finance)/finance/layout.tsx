import type { Metadata } from "next";
import Link from "next/link";
import { Lora, Manrope } from "next/font/google";
import "./finance.css";

// A genuinely separate root layout (Next.js supports multiple root layouts
// via route groups) -- SQXI Finance is deliberately NOT a re-skin of the
// SquadXI cricket app. No Nav/Footer/MarqueeBanner/ChatWidget/WagmiProviders
// from app/(site)/layout.tsx, no theme toggle, always light. Colors here are
// plain Tailwind slate/blue classes, not this app's paper/ink/accent design
// tokens -- keeps this page's palette fully independent of the main site's
// theme system by construction, not by convention.
const lora = Lora({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-finance-display",
});
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-finance-body",
});

export const metadata: Metadata = {
  title: "SQXI Finance",
  description:
    "Stake your winnings and earn, or borrow against the pool -- testnet ETH.",
};

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${lora.variable} ${manrope.variable}`}>
      <body className="min-h-screen bg-white font-[family-name:var(--font-finance-body)] text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/finance" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-blue-900 text-xs font-bold text-white">
                XI
              </span>
              <span className="font-[family-name:var(--font-finance-display)] text-lg font-semibold tracking-tight text-blue-900">
                SQXI Finance
              </span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
              <Link href="/finance" className="hover:text-blue-900">
                Overview
              </Link>
              <Link href="/finance/loans" className="hover:text-blue-900">
                Loans
              </Link>
              <Link href="/finance/stake" className="hover:text-blue-900">
                Stake &amp; Earn
              </Link>
              <a
                href="/"
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-900 hover:text-blue-900"
              >
                ← SquadXI
              </a>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-6 py-12">{children}</main>

        <footer className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-5xl px-6 py-8 text-xs leading-relaxed text-slate-500">
            <p className="font-semibold text-slate-600">
              SQXI Finance is a testnet-only feature of SquadXI.
            </p>
            <p className="mt-1">
              All amounts on this page are Robinhood Chain testnet ETH -- they
              carry no real monetary value. Staking is not risk-free: your
              principal is not guaranteed and a defaulted loan reduces the
              pool&apos;s value for every staker. Loan approval is manually
              reviewed by the operator, not automated underwriting.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

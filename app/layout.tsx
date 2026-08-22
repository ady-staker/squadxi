import type { Metadata } from "next";
import { Oswald, Manrope } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WagmiProviders } from "@/components/providers/WagmiProviders";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "SquadXI — Cricket Fantasy League",
  description:
    "Build your XI, join leagues with friends or the public, and compete for prize pools paid out in crypto via CoinVoyage.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${oswald.variable} ${manrope.variable}`}>
      <body className="flex min-h-screen flex-col bg-paper font-body text-ink antialiased">
        <WagmiProviders>
          <Nav />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-10">
            {children}
          </main>
          <Footer />
        </WagmiProviders>
      </body>
    </html>
  );
}

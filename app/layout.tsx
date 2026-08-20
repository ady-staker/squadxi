import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

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
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-paper text-ink antialiased">
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-10">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}

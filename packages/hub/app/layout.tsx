import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Remote Code",
  description: "Dashboard for managing remote development nodes",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b border-border bg-surface-light">
          <div className="max-w-7xl mx-auto px-4 h-12 flex items-center gap-6">
            <Link
              href="/"
              className="text-white font-semibold hover:text-accent transition-colors"
            >
              Remote Code
            </Link>
            <Link
              href="/terminals"
              className="text-gray-400 text-sm hover:text-white transition-colors"
            >
              Terminals
            </Link>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Remote Code",
  description: "Dashboard for managing remote development nodes",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex flex-col h-screen overflow-hidden">
        <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SettingsModal } from "@/components/settings-modal";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Claude Explorer",
  description: "Visual explorer for ~/.claude/ session context and metadata",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-50 dark:bg-zinc-950`}
      >
        <div className="min-h-screen">
          <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-14">
                <a href="/" className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Claude Explorer
                  </span>
                </a>
                <nav className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
                  <a href="/" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                    Projects
                  </a>
                  <SettingsModal />
                </nav>
              </div>
            </div>
          </header>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

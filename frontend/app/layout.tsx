import type { Metadata } from "next";

import {
  Geist,
  Geist_Mono,
} from "next/font/google";

import {
  Toaster,
} from "react-hot-toast";

import ThemeProvider from "./components/ThemeProvider";
import DesktopOsGate from "./components/DesktopOsGate";
import { themeInitScript } from "./components/themeInitScript";
import "./globals.css";

const geistSans = Geist({
  variable:
    "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono =
  Geist_Mono({
    variable:
      "--font-geist-mono",
    subsets: ["latin"],
  });

export const metadata: Metadata =
  {
    title: "BidAxis CRM",
    description:
      "BidAxis construction estimating CRM",
  };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`
        ${geistSans.variable}
        ${geistMono.variable}
        h-full
        antialiased
      `}
    >
      <body className="min-h-full flex flex-col bg-crm-bg text-crm-text">
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeInitScript() }}
        />
        <ThemeProvider>
          <DesktopOsGate>
          {children}
          </DesktopOsGate>

          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                borderRadius: "16px",
                background: "var(--crm-surface)",
                color: "var(--crm-text)",
                border: "1px solid var(--crm-border)",
                padding: "14px 18px",
                fontSize: "14px",
                fontWeight: "600",
                boxShadow: "var(--crm-card-shadow)",
              },
              success: {
                style: {
                  background: "#027A48",
                  color: "#fff",
                  border: "none",
                },
              },
              error: {
                style: {
                  background: "#1B6FE8",
                  color: "#fff",
                  border: "none",
                },
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}

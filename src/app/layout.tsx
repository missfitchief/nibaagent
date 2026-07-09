import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { env } from "@/lib/env";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
});

// Editorial display face for the marketing site (headlines only).
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap"
});

const APP_URL = process.env.APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "NibaChat Agent — AI agent for Instagram DM & Facebook Messenger",
    template: "%s — NibaChat Agent"
  },
  description:
    "NibaChat Agent replies instantly to Instagram and Facebook messages, captures orders, hands off to humans when needed, and learns your products, prices and FAQs. Built for social-commerce businesses.",
  keywords: [
    "AI chatbot za Instagram",
    "AI chatbot za Facebook",
    "chatbot za online prodavnice",
    "automatizacija poruka",
    "korisnička podrška za e-commerce",
    "chatbot za prodaju",
    "Instagram prodaja automatizacija",
    "Facebook Messenger chatbot",
    "AI agent za biznis",
    "AI agent",
    "Instagram DM automation",
    "order collection"
  ],
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  openGraph: {
    title: "NibaChat Agent — AI agent for Instagram DM & Facebook Messenger",
    description: "Reply instantly. Capture orders. Save time. Human handoff when needed.",
    url: APP_URL,
    siteName: "NibaChat Agent",
    type: "website",
    locale: "en_US"
  },
  twitter: {
    card: "summary_large_image",
    title: "NibaChat Agent",
    description: "AI agent for Instagram DM and Facebook Messenger. Reply instantly. Capture orders. Save time."
  }
};

// Ensure env validation runs at boot in server context.
void env;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tico Address LLM Benchmark",
  description:
    "Compare multiple LLMs as geocoders side-by-side. Visualize accuracy, track improvements, and benchmark performance.",
};

import Header from "./components/Header";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col h-screen bg-background text-foreground overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-3 sm:p-4 w-full flex flex-col">{children}</main>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "canon. — the content that made you",
  description:
    "a personal curated content network. the content that shaped you, with a line on why, and where to watch it where you are.",
  openGraph: {
    title: "canon.",
    description: "the content that made you",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#faf6ee",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

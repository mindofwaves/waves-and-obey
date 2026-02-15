import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  title: "OBEYTHESIXTH & WAVE$ ARTWORKS",
  description: "Portfolio of OBEYTHESIXTH & WAVE$ ARTWORKS",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WAVE$ & OBEY",
  },
  openGraph: {
    title: "OBEYTHESIXTH & WAVE$ ARTWORKS",
    description: "Portfolio of OBEYTHESIXTH & WAVE$ ARTWORKS",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body className="font-body antialiased overflow-hidden">{children}</body>
    </html>
  );
}

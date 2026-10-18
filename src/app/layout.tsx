import type { Metadata, Viewport } from "next";
import { BottomNav } from "@/components/BottomNav";
import { ContentProvider } from "@/components/ContentProvider";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Prata",
  description: "Läs och skriv svenska varje dag.",
  manifest: `${BASE}/manifest.webmanifest`,
  icons: { icon: `${BASE}/icon-192.png`, apple: `${BASE}/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: "Prata", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#111315" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className="min-h-dvh antialiased">
        <ContentProvider>
          {children}
          <BottomNav />
        </ContentProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}

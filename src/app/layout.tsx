import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { copy } from "@/lib/copy";
import "./globals.css";

// Self hosted fonts. The files ship with the app and are served from this
// origin only. Script companion fonts are declared in globals.css with
// unicode-range, so they load on demand and never from a third party.
const plexSans = localFont({
  src: [
    { path: "../fonts/plex-sans-400-latin.woff2", weight: "400", style: "normal" },
    { path: "../fonts/plex-sans-400-latin-ext.woff2", weight: "400", style: "normal" },
    { path: "../fonts/plex-sans-500-latin.woff2", weight: "500", style: "normal" },
    { path: "../fonts/plex-sans-500-latin-ext.woff2", weight: "500", style: "normal" },
    { path: "../fonts/plex-sans-600-latin.woff2", weight: "600", style: "normal" },
    { path: "../fonts/plex-sans-600-latin-ext.woff2", weight: "600", style: "normal" },
  ],
  variable: "--plex-sans",
  display: "swap",
  preload: true,
});

const newsreader = localFont({
  src: [
    { path: "../fonts/newsreader-500-latin.woff2", weight: "500", style: "normal" },
    { path: "../fonts/newsreader-600-latin.woff2", weight: "600", style: "normal" },
  ],
  variable: "--newsreader",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: copy.app.documentTitle,
  description: copy.app.metaDescription,
  applicationName: copy.app.wordmark,
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8F7F2" },
    { media: "(prefers-color-scheme: dark)", color: "#12171D" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Runs before first paint, like the theme script. If setup finished on an
// earlier visit, the root gets data-hero="compact" and CSS renders the compact
// hero at the first frame: no flash, no layout shift, no hydration mismatch,
// because the markup never changes. The js class only enables the section
// reveal when JavaScript is actually running, so content is never hidden
// without it.
const prePaintScript = `(function(){try{if(localStorage.getItem("pt.model.ready")==="1"){document.documentElement.dataset.hero="compact"}}catch(e){}try{document.documentElement.classList.add("js")}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className={`${plexSans.variable} ${newsreader.variable} font-sans antialiased bg-background text-foreground`}>
        <script dangerouslySetInnerHTML={{ __html: prePaintScript }} />
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

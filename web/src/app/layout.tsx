import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono, IBM_Plex_Sans_Arabic, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { BAR, getPrefs } from "@/lib/theme";

const sans = Plus_Jakarta_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const arabic = IBM_Plex_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"], weight: ["400", "500", "600"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });
// Sunroom's fonts. Not preloaded: the browser only fetches them when Sunroom is on.
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"], preload: false });

export const metadata: Metadata = {
  title: "Brain",
  description: "Everything you save, in one place.",
  icons: {
    icon: [
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
};

export async function generateViewport(): Promise<Viewport> {
  const { design, mode } = await getPrefs();
  const bar = BAR[design];
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    colorScheme: mode === "system" ? "light dark" : mode,
    themeColor:
      mode === "system"
        ? [
            { media: "(prefers-color-scheme: light)", color: bar.light },
            { media: "(prefers-color-scheme: dark)", color: bar.dark },
          ]
        : bar[mode],
  };
}

// The design and mode are set here on the server, so the page never flashes the wrong look.
// Mode "system" is left to the prefers-color-scheme rules in globals.css.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { design, mode } = await getPrefs();
  const fonts = [sans, arabic, mono, grotesk, plexMono].map((f) => f.variable).join(" ");
  return (
    <html lang="en" data-design={design} data-theme={mode} className={fonts}>
      <body>{children}</body>
    </html>
  );
}

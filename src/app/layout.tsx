import type { Metadata } from "next";
import { Inter, Source_Serif_4, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/lib/i18n/context";
import { cookies } from "next/headers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  weight: ["400", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ScreenPorter — Espelhar, controlar e monitorar Android com consentimento legítimo",
  description:
    "Plataforma aberta de espelhamento, controlo e monitoramento parental consentido. 4 vias de ligação (USB/Wi-Fi/Tailscale/Companion), ecrã Android ao vivo (H.264/WebCodecs), sincronização multi-dispositivo, GPS/chamadas/SMS/apps/alertas com consentimento auditável (LGPD/GDPR/COPPA).",
  keywords: [
    "screenporter",
    "baqurix",
    "espelhamento android",
    "controlo remoto android",
    "scrcpy",
    "controle parental",
    "parental control",
    "LGPD",
    "GDPR",
    "COPPA",
    "monitoramento legítimo",
    "consentimento auditável",
    "tailscale",
    "multi-device sync",
  ],
  authors: [{ name: "ScreenPorter" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "ScreenPorter",
    description: "Espelhar, controlar e monitorar Android — com consentimento legítimo (Baqurix console)",
    siteName: "ScreenPorter",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ScreenPorter",
    description: "Espelhar, controlar e monitorar Android — com consentimento legítimo (Baqurix console)",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("gl_locale")?.value;
  const theme = cookieStore.get("gl_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html
      lang={localeCookie === "en" ? "en" : "pt-BR"}
      className={theme}
      style={{ colorScheme: theme }}
      suppressHydrationWarning
    >
      <body
        className={`${inter.variable} ${sourceSerif.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider initialTheme={theme}>
          <I18nProvider initialLocale={localeCookie}>
            {children}
          </I18nProvider>
          <Toaster />
          <SonnerToaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}

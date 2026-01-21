import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Auth0Provider } from "@auth0/nextjs-auth0/client";
import "./globals.css";
import { AccessTokenProvider } from "@/components/AccessTokenProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cheap Minecraft Server Hosting | Easy Setup in Seconds | MinecraftHosting.gg",
  description: "Get your own Minecraft server for just $4.99/month. Instant setup, no technical knowledge required. DDoS protected, easy management, and 24/7 uptime. Start playing with friends today!",
  keywords: ["minecraft server hosting", "cheap minecraft hosting", "easy minecraft hosting", "minecraft server", "minecraft host", "game server hosting", "multiplayer minecraft", "minecraft server rental"],
  authors: [{ name: "MinecraftHosting.gg" }],
  creator: "MinecraftHosting.gg",
  publisher: "MinecraftHosting.gg",
  metadataBase: new URL("https://minecrafthosting.gg"),
  alternates: {
    canonical: "https://minecrafthosting.gg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://minecrafthosting.gg",
    siteName: "MinecraftHosting.gg",
    title: "Cheap Minecraft Server Hosting | Easy Setup in Seconds",
    description: "Get your own Minecraft server for just $4.99/month. Instant setup, no technical knowledge required. DDoS protected and 24/7 uptime.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "MinecraftHosting.gg - Cheap and Easy Minecraft Server Hosting",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cheap Minecraft Server Hosting | MinecraftHosting.gg",
    description: "Get your own Minecraft server for just $4.99/month. Instant setup, DDoS protected, 24/7 uptime.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.png",
    apple: "/logo.png",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "MinecraftHosting.gg",
  "url": "https://minecrafthosting.gg",
  "description": "Cheap and easy Minecraft server hosting starting at $4.99/month. Instant setup, DDoS protection, and 24/7 uptime.",
  "applicationCategory": "GameApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "4.99",
    "priceCurrency": "USD",
    "priceValidUntil": "2026-12-31",
    "availability": "https://schema.org/InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "ratingCount": "150"
  },
  "provider": {
    "@type": "Organization",
    "name": "MinecraftHosting.gg",
    "url": "https://minecrafthosting.gg"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Auth0Provider>
          <AccessTokenProvider>
            {children}
          </AccessTokenProvider>
        </Auth0Provider>
      </body>
    </html>
  );
}

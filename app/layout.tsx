import type { Metadata } from "next";
import type { ReactNode } from "react";

// Social crawlers need absolute image URLs. Prefer an explicit site URL, then
// the deployment URL Vercel injects, and fall back to localhost for dev.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "CHAIN VAULT API",
  description: "Blockchain Gateway Service",
  openGraph: {
    title: "CHAIN VAULT API",
    description: "Blockchain Gateway Service",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CHAIN VAULT API",
    description: "Blockchain Gateway Service",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

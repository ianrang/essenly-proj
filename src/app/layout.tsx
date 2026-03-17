import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Essenly — Your AI K-Beauty Guide",
  description:
    "AI-powered K-beauty recommendations personalized to your skin type, concerns, and travel plans.",
};

// Root layout — delegates to [locale]/layout.tsx for HTML structure.
// Metadata is defined here (global, locale-independent).
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}

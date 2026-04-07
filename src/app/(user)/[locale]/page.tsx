import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import LandingClient from "@/client/features/landing/LandingClient";

export const metadata: Metadata = {
  title: "Essenly — Your AI K-Beauty Guide",
  keywords: ["K-beauty", "Korean skincare", "AI beauty", "Seoul beauty guide"],
  alternates: {
    canonical: "/en",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Essenly",
  description:
    "AI-powered K-beauty recommendations for travelers visiting Korea",
  url: "https://essenly.com",
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web",
  availableLanguage: ["en"],
  publisher: {
    "@type": "Organization",
    name: "Essenly",
  },
};

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function LandingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingClient locale={locale} />
    </>
  );
}

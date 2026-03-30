import { setRequestLocale } from "next-intl/server";
import LandingClient from "@/client/features/landing/LandingClient";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function LandingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <LandingClient locale={locale} />;
}

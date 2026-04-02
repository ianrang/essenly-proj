"use client";

import "client-only";

import { useEffect, useState } from "react";
import LandingHeader from "@/client/features/landing/LandingHeader";
import HeroSection from "@/client/features/landing/HeroSection";
import HowItWorksSection from "@/client/features/landing/HowItWorksSection";
import BenefitsSection from "@/client/features/landing/BenefitsSection";
import TrustSection from "@/client/features/landing/TrustSection";
import ReturnVisitBanner from "@/client/features/landing/ReturnVisitBanner";

type LandingClientProps = {
  locale: string;
};

type LandingState = "loading" | "new" | "consented" | "returning";

export default function LandingClient({ locale }: LandingClientProps) {
  const [state, setState] = useState<LandingState>("loading");
  const [isConsenting, setIsConsenting] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch("/api/profile", { credentials: "include" });
        if (res.ok) {
          setState("returning");
        } else if (res.status === 404) {
          setState("consented");
        } else {
          setState("new");
        }
      } catch {
        setState("new");
      }
    }
    checkSession();
  }, []);

  async function handleConsent(): Promise<boolean> {
    setIsConsenting(true);
    try {
      const res = await fetch("/api/auth/anonymous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: { data_retention: true } }),
        credentials: "include",
      });
      if (res.ok) {
        setState("consented");
        return true;
      }
      return false;
    } catch (err) {
      console.error("Consent failed:", err);
      return false;
    } finally {
      setIsConsenting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <LandingHeader />
      <main className="flex-1">
        <HeroSection state={state} onConsent={handleConsent} isConsenting={isConsenting} locale={locale} />
        <HowItWorksSection />
        <BenefitsSection />
        <TrustSection />
      </main>
      {state === "returning" && !bannerDismissed && (
        <ReturnVisitBanner locale={locale} onClose={() => setBannerDismissed(true)} />
      )}
    </div>
  );
}

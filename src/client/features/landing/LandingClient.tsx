"use client";

import "client-only";

import { useEffect, useState } from "react";
import LandingHeader from "@/client/features/landing/LandingHeader";
import HeroSection from "@/client/features/landing/HeroSection";
import HowItWorksSection from "@/client/features/landing/HowItWorksSection";
import BenefitsSection from "@/client/features/landing/BenefitsSection";
import TrustSection from "@/client/features/landing/TrustSection";
import ConsentBanner from "@/client/features/landing/ConsentBanner";
import ReturnVisitBanner from "@/client/features/landing/ReturnVisitBanner";

type LandingClientProps = {
  locale: string;
};

type LandingState = "loading" | "new" | "consented" | "returning";

export default function LandingClient({ locale }: LandingClientProps) {
  const [state, setState] = useState<LandingState>("loading");
  const [isConsenting, setIsConsenting] = useState(false);

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch("/api/profile", { credentials: "include" });
        if (res.ok) {
          setState("returning");
        } else if (res.status === 401) {
          setState("new");
        } else {
          setState("consented");
        }
      } catch {
        setState("new");
      }
    }
    checkSession();
  }, []);

  async function handleConsent() {
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
      }
    } catch (err) {
      console.error("Consent failed:", err);
    } finally {
      setIsConsenting(false);
    }
  }

  const ctaEnabled = state === "consented" || state === "returning";

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <LandingHeader />
      <main className="flex-1">
        <HeroSection ctaEnabled={ctaEnabled} locale={locale} />
        <HowItWorksSection />
        <BenefitsSection />
        <TrustSection />
      </main>
      {state === "new" && (
        <ConsentBanner onConsent={handleConsent} isLoading={isConsenting} />
      )}
      {state === "returning" && <ReturnVisitBanner locale={locale} />}
    </div>
  );
}

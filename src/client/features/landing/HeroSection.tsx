"use client";

import "client-only";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { PageTitle, BodyText } from "@/client/ui/primitives/typography";
import { Button } from "@/client/ui/primitives/button";

type HeroSectionProps = {
  state: "loading" | "new" | "consented" | "returning";
  onConsent: () => Promise<boolean>;
  isConsenting: boolean;
  locale: string;
};

export default function HeroSection({ state, onConsent, isConsenting, locale }: HeroSectionProps) {
  const t = useTranslations("landing");
  const tc = useTranslations("consent");
  const router = useRouter();
  const [showConsent, setShowConsent] = useState(false);

  const ctaEnabled = state === "consented" || state === "returning";

  function handleCtaClick() {
    if (ctaEnabled) {
      router.push(`/${locale}/chat`);
      return;
    }
    setShowConsent(true);
  }

  async function handleConsentConfirm() {
    const success = await onConsent();
    if (success) {
      router.push(`/${locale}/chat`);
    }
  }

  return (
    <div className="relative overflow-hidden">
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary-light via-surface-warm to-background bg-[length:200%_200%] motion-safe:animate-[gradient-shift_10s_ease_infinite]"
        aria-hidden="true"
      />
      <div className="relative z-10 mx-auto max-w-[960px] px-5 py-14 text-center lg:py-20">
        <PageTitle className="mb-3">
          {t("title")}
        </PageTitle>
        <BodyText className="mx-auto mb-7 max-w-[420px] lg:max-w-[500px]">
          {t("subtitle")}
        </BodyText>

        {showConsent ? (
          <div className="mx-auto max-w-[360px] lg:max-w-[480px]">
            <p className="mb-3 text-sm leading-relaxed text-foreground/70">
              {tc("consentNotice")}{" "}
              <a
                href={`/${locale}/terms`}
                className="underline transition-colors hover:text-primary"
              >
                {tc("learnMore")}
              </a>
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="cta"
                onClick={() => setShowConsent(false)}
                className="flex-1"
              >
                {tc("cancel")}
              </Button>
              <Button
                size="cta"
                onClick={handleConsentConfirm}
                disabled={isConsenting}
                className="flex-1"
              >
                {tc("accept")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[360px] lg:max-w-[480px]">
            <Button
              size="cta"
              onClick={handleCtaClick}
              disabled={state === "loading"}
              className="w-full"
            >
              {t("pathA")}
            </Button>
            <p className="mt-2.5 text-center text-xs text-foreground/50">
              {t("ctaDescription")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

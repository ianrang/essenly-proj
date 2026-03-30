"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { Button } from "@/client/ui/primitives/button";
import Link from "next/link";

type HeroSectionProps = {
  ctaEnabled: boolean;
  locale: string;
};

export default function HeroSection({ ctaEnabled, locale }: HeroSectionProps) {
  const t = useTranslations("landing");

  return (
    <div className="relative overflow-hidden">
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary-light via-surface-warm to-background bg-[length:200%_200%] motion-safe:animate-[gradient-shift_10s_ease_infinite]"
        aria-hidden="true"
      />
      <div className="relative z-10 mx-auto max-w-[960px] px-5 py-16 text-center lg:py-20">
        <h1 className="mb-3 text-[28px] font-bold leading-tight tracking-tight lg:text-[40px]">
          {t("title")}
        </h1>
        <p className="mx-auto mb-7 max-w-[420px] text-[15px] leading-relaxed text-muted-foreground lg:max-w-[500px] lg:text-[17px]">
          {t("subtitle")}
        </p>
        <div className="mx-auto flex max-w-[340px] flex-col gap-2.5 lg:max-w-[480px] lg:flex-row">
          <Button
            size="lg"
            className="min-h-12 flex-1 flex-col"
            disabled={!ctaEnabled}
            asChild={ctaEnabled}
          >
            {ctaEnabled ? (
              <Link href={`/${locale}/onboarding`}>
                <span className="text-[15px] font-semibold">{t("pathA")}</span>
                <span className="text-xs opacity-70">{t("pathADescription")}</span>
              </Link>
            ) : (
              <span>
                <span className="text-[15px] font-semibold">{t("pathA")}</span>
                <span className="text-xs opacity-70">{t("pathADescription")}</span>
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="min-h-12 flex-1 flex-col"
            disabled={!ctaEnabled}
            asChild={ctaEnabled}
          >
            {ctaEnabled ? (
              <Link href={`/${locale}/chat`}>
                <span className="text-[15px] font-semibold">{t("pathB")}</span>
                <span className="text-xs opacity-70">{t("pathBDescription")}</span>
              </Link>
            ) : (
              <span>
                <span className="text-[15px] font-semibold">{t("pathB")}</span>
                <span className="text-xs opacity-70">{t("pathBDescription")}</span>
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

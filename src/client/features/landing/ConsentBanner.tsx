"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { Button } from "@/client/ui/primitives/button";

type ConsentBannerProps = {
  onConsent: () => void;
  isLoading: boolean;
};

export default function ConsentBanner({ onConsent, isLoading }: ConsentBannerProps) {
  const t = useTranslations("consent");

  return (
    <div className="sticky bottom-0 z-10 border-t border-border bg-card">
      <div className="mx-auto flex max-w-[960px] items-center gap-3 px-5 py-3">
        <p className="flex-1 text-xs leading-snug text-muted-foreground">
          {t("description")}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={onConsent} disabled={isLoading}>
            {t("accept")}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/terms">{t("learnMore")}</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

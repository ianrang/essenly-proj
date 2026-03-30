"use client";

import "client-only";

import { useTranslations } from "next-intl";

type ConsentBannerProps = {
  onConsent: () => void;
  isLoading: boolean;
  locale: string;
};

export default function ConsentBanner({ onConsent, isLoading, locale }: ConsentBannerProps) {
  const t = useTranslations("consent");

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-[960px] items-center gap-3 px-4 py-2">
        <p className="flex-1 text-xs leading-snug text-muted-foreground">
          {t("description")}{" "}
          <a
            href={`/${locale}/terms`}
            className="underline transition-colors hover:text-foreground"
          >
            {t("learnMore")}
          </a>
        </p>
        <button
          onClick={onConsent}
          disabled={isLoading}
          className="shrink-0 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {t("accept")}
        </button>
      </div>
    </div>
  );
}

"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { Button } from "@/client/ui/primitives/button";
import Link from "next/link";

type ReturnVisitBannerProps = {
  locale: string;
};

export default function ReturnVisitBanner({ locale }: ReturnVisitBannerProps) {
  const t = useTranslations("landing");

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-5 w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-lg">
        <h2 className="mb-2 text-lg font-bold">{t("returnTitle")}</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          {t("returnDescription")}
        </p>
        <div className="flex flex-col gap-2.5">
          <Button size="lg" className="min-h-11" asChild>
            <Link href={`/${locale}/profile`}>{t("returnProfile")}</Link>
          </Button>
          <Button variant="outline" size="lg" className="min-h-11" asChild>
            <Link href={`/${locale}/chat`}>{t("returnChat")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

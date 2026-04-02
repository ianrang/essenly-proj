"use client";

import "client-only";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { ModalTitle } from "@/client/ui/primitives/typography";
import { buttonVariants } from "@/client/ui/primitives/button";

type ReturnVisitBannerProps = {
  locale: string;
};

export default function ReturnVisitBanner({ locale }: ReturnVisitBannerProps) {
  const t = useTranslations("landing");

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-5 w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-lg">
        <ModalTitle className="mb-2">{t("returnTitle")}</ModalTitle>
        <p className="mb-6 text-sm text-muted-foreground">
          {t("returnDescription")}
        </p>
        <div className="flex flex-col gap-2.5">
          <Link
            href={`/${locale}/chat`}
            className={buttonVariants({ size: "cta", className: "w-full" })}
          >
            {t("returnChat")}
          </Link>
          <Link
            href={`/${locale}/profile`}
            className={buttonVariants({ variant: "outline", size: "cta", className: "w-full" })}
          >
            {t("returnProfile")}
          </Link>
        </div>
      </div>
    </div>
  );
}

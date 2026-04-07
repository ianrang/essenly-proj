"use client";

import "client-only";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { X } from "lucide-react";
import { ModalTitle } from "@/client/ui/primitives/typography";
import { Button, buttonVariants } from "@/client/ui/primitives/button";

type ReturnVisitBannerProps = {
  locale: string;
  onClose: () => void;
};

export default function ReturnVisitBanner({ locale, onClose }: ReturnVisitBannerProps) {
  const t = useTranslations("landing");

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="relative mx-5 w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-lg">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onClose}
          className="absolute right-3 top-3"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
        <ModalTitle className="mb-2">{t("returnTitle")}</ModalTitle>
        <p className="mb-6 text-sm text-muted-foreground">
          {t("returnDescription")}
        </p>
        <Link
          href={`/${locale}/chat`}
          className={buttonVariants({ size: "cta", className: "w-full" })}
        >
          {t("returnChat")}
        </Link>
      </div>
    </div>
  );
}

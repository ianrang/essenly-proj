"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { Button } from "@/client/ui/primitives/button";

type ExploreEmptyStateProps = {
  onResetFilters: () => void;
};

export default function ExploreEmptyState({ onResetFilters }: ExploreEmptyStateProps) {
  const t = useTranslations("explore");

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm text-muted-foreground">{t("empty.title")}</p>
      <p className="mt-1 text-xs text-muted-foreground/70">{t("empty.suggestion")}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onResetFilters}>
        {t("empty.resetFilters")}
      </Button>
    </div>
  );
}

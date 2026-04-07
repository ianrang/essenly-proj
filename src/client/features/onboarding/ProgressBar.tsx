"use client";

import "client-only";

import { useTranslations } from "next-intl";

type ProgressBarProps = {
  current: number;
  total: number;
};

export default function ProgressBar({ current, total }: ProgressBarProps) {
  const t = useTranslations("onboarding");
  const percent = (current / total) * 100;

  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {t("stepProgress", { current, total })}
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={1}
          aria-valuemax={total}
        />
      </div>
    </div>
  );
}

"use client";

import "client-only";

import { Button } from "@/client/ui/primitives/button";
import HighlightBadge from "@/client/features/cards/HighlightBadge";
import type { LocalizedText } from "@/shared/types/domain";
import { localized } from "@/shared/utils/localized";

type KitCtaCardProps = {
  productName: LocalizedText;
  highlightBadge: LocalizedText | null;
  locale: string;
  onClaim: () => void;
};

export default function KitCtaCard({
  productName,
  highlightBadge,
  locale,
  onClaim,
}: KitCtaCardProps) {
  return (
    <article className="overflow-hidden rounded-xl border border-primary bg-card transition-colors">
      {/* Header with highlight badge */}
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {localized(productName, locale)}
          </p>
          <p className="mt-1 text-xs font-medium text-primary">
            Free Starter Kit
          </p>
        </div>
        <HighlightBadge
          isHighlighted={true}
          badge={highlightBadge}
          locale={locale}
        />
      </div>

      {/* Kit benefits */}
      <div className="px-4 pb-3">
        <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span className="text-success" aria-hidden="true">&#10003;</span>
            Matched to your skin type
          </li>
          <li className="flex items-center gap-1.5">
            <span className="text-success" aria-hidden="true">&#10003;</span>
            Hair care included
          </li>
          <li className="flex items-center gap-1.5">
            <span className="text-success" aria-hidden="true">&#10003;</span>
            Free shipping to your hotel
          </li>
        </ul>
      </div>

      {/* CTA */}
      <div className="border-t px-4 py-3">
        <Button size="cta" className="w-full" onClick={onClaim}>
          Claim my free kit
        </Button>
      </div>
    </article>
  );
}

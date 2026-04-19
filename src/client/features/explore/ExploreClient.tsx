"use client";

import "client-only";

import { useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import Header from "@/client/features/layout/Header";
import DomainTabs from "./DomainTabs";
import ExploreGrid from "./ExploreGrid";
import ChatLinkButton from "./ChatLinkButton";
import { useExplore } from "./use-explore";
import { Button } from "@/client/ui/primitives/button";
import type { ExploreDomain } from "@/shared/types/explore";

type ExploreClientProps = {
  locale: string;
};

export default function ExploreClient({ locale }: ExploreClientProps) {
  const t = useTranslations("explore");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const domain = (searchParams.get("domain") ?? "products") as ExploreDomain;
  const sort = searchParams.get("sort") ?? "rating";

  const filters: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (key !== "domain" && key !== "sort") {
      filters[key] = value;
    }
  }

  const { items, total, hasMore, isLoading, isValidating, loadMore } = useExplore(
    domain,
    filters,
    sort,
  );

  const handleDomainChange = useCallback(
    (newDomain: ExploreDomain) => {
      const params = new URLSearchParams();
      params.set("domain", newDomain);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router],
  );

  const handleResetFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set("domain", domain);
    router.replace(`${pathname}?${params.toString()}`);
  }, [pathname, router, domain]);

  const remaining = total - items.length;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Header
        maxWidth="max-w-[960px]"
        rightContent={<ChatLinkButton locale={locale} />}
      />
      <main className="mx-auto w-full max-w-[960px] flex-1 px-4 py-4">
        <DomainTabs activeDomain={domain} onDomainChange={handleDomainChange} />
        <div className="mt-4">
          <ExploreGrid
            domain={domain}
            items={items}
            locale={locale}
            isLoading={isLoading}
            onResetFilters={handleResetFilters}
          />
        </div>
        {hasMore && !isLoading && (
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={isValidating}
            >
              {isValidating
                ? t("loadMore.loading")
                : t("loadMore.button", { remaining })}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

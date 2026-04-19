"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@/client/ui/primitives/tabs";
import { EXPLORE_REGISTRY } from "@/shared/constants/explore-registry";
import type { ExploreDomain } from "@/shared/types/explore";

type DomainTabsProps = {
  activeDomain: ExploreDomain;
  onDomainChange: (domain: ExploreDomain) => void;
};

export default function DomainTabs({ activeDomain, onDomainChange }: DomainTabsProps) {
  const t = useTranslations();

  return (
    <Tabs
      value={activeDomain}
      onValueChange={(value) => onDomainChange(value as ExploreDomain)}
    >
      <TabsList variant="line" className="w-full justify-start">
        {EXPLORE_REGISTRY.map((domain) => (
          <TabsTrigger key={domain.id} value={domain.id}>
            {t(domain.labelKey)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

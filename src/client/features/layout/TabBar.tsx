"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@/client/ui/primitives/tabs";

/** PRD §2.1: 5영역 도메인. MVP: shops+clinic 활성 (§5.2 M5-M6) */
const TABS = [
  { value: "shops", key: "shops", enabled: true },
  { value: "clinic", key: "clinic", enabled: true },
  { value: "salon", key: "salon", enabled: false },
  { value: "eats", key: "eats", enabled: false },
  { value: "exp", key: "exp", enabled: false },
] as const;

type TabBarProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
};

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const t = useTranslations("tabs");

  return (
    <Tabs value={activeTab} onValueChange={onTabChange}>
      <TabsList variant="line" className="w-full">
        {TABS.map(({ value, key, enabled }) => (
          <TabsTrigger key={value} value={value} disabled={!enabled}>
            {t(key)}
            {!enabled && (
              <span className="ml-1 text-[9px] font-normal opacity-50">Soon</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

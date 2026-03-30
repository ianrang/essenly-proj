"use client";

import "client-only";

import { useLanguage } from "@/client/features/contexts/LanguageContext";
import { SUPPORTED_LANGUAGES } from "@/shared/constants/beauty";
import type { SupportedLanguage } from "@/shared/types/domain";

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  ja: "日本語",
  zh: "中文",
  es: "Español",
  fr: "Français",
  ko: "한국어",
};

export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();

  return (
    <select
      value={language}
      onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
      aria-label="Conversation language"
      className="h-9 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {SUPPORTED_LANGUAGES.map((code) => (
        <option key={code} value={code}>
          {code.toUpperCase()} {LANGUAGE_LABELS[code]}
        </option>
      ))}
    </select>
  );
}

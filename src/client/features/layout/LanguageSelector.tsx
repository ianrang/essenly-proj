"use client";

import "client-only";

import { useLanguage } from "@/client/features/contexts/LanguageContext";
import { Dropdown, type DropdownOption } from "@/client/ui/primitives/dropdown";
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

const LANGUAGE_OPTIONS: DropdownOption[] = SUPPORTED_LANGUAGES.map((code) => ({
  value: code,
  label: `${code.toUpperCase()} ${LANGUAGE_LABELS[code]}`,
}));

export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();

  return (
    <Dropdown
      value={language}
      onChange={(val) => setLanguage(val as SupportedLanguage)}
      options={LANGUAGE_OPTIONS}
      ariaLabel="Conversation language"
    />
  );
}

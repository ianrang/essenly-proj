"use client";

import "client-only";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/ui/primitives/select";
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
    <Select
      value={language}
      onValueChange={(val) => setLanguage(val as SupportedLanguage)}
    >
      <SelectTrigger className="h-9 min-w-[120px] gap-1.5 text-xs">
        <SelectValue>
          <span className="font-semibold">{language.toUpperCase()}</span>{" "}
          <span className="text-muted-foreground">{LANGUAGE_LABELS[language]}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((code) => (
          <SelectItem key={code} value={code}>
            <span className="font-semibold">{code.toUpperCase()}</span>{" "}
            {LANGUAGE_LABELS[code]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

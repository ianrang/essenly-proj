"use client";

import "client-only";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/ui/primitives/select";
import {
  useLanguage,
  CONVERSATION_LANGUAGES,
  type ConversationLanguage,
} from "@/client/features/contexts/LanguageContext";

const LANGUAGE_LABELS: Record<ConversationLanguage, string> = {
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
      onValueChange={(val) => setLanguage(val as ConversationLanguage)}
    >
      <SelectTrigger className="h-9 min-w-[120px] gap-1.5 text-xs">
        <SelectValue>
          <span className="font-semibold">{language.toUpperCase()}</span>{" "}
          <span className="text-muted-foreground">{LANGUAGE_LABELS[language]}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {CONVERSATION_LANGUAGES.map((code) => (
          <SelectItem key={code} value={code}>
            <span className="font-semibold">{code.toUpperCase()}</span>{" "}
            {LANGUAGE_LABELS[code]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

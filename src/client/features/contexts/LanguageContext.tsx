"use client";

import "client-only";

import { createContext, useContext, useState, type ReactNode } from "react";

const CONVERSATION_LANGUAGES = ["en", "ja", "zh", "es", "fr", "ko"] as const;
type ConversationLanguage = (typeof CONVERSATION_LANGUAGES)[number];

type LanguageContextValue = {
  language: ConversationLanguage;
  setLanguage: (lang: ConversationLanguage) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<ConversationLanguage>("en");

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}

export { CONVERSATION_LANGUAGES, type ConversationLanguage };

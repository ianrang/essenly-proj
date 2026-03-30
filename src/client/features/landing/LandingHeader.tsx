"use client";

import "client-only";

import LanguageSelector from "@/client/features/layout/LanguageSelector";
import ThemeToggle from "@/client/features/layout/ThemeToggle";

export default function LandingHeader() {
  return (
    <header className="relative z-20 border-b border-border">
      <div className="mx-auto flex h-13 max-w-[960px] items-center justify-between px-5">
        <span className="text-xl font-bold tracking-tight text-primary">
          Essenly
        </span>
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

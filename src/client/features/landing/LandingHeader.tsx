"use client";

import "client-only";

import LanguageSelector from "@/client/features/layout/LanguageSelector";

export default function LandingHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-13 max-w-[960px] items-center justify-between px-5">
        <span className="text-xl font-bold tracking-tight text-primary">
          Essenly
        </span>
        <LanguageSelector />
      </div>
    </header>
  );
}

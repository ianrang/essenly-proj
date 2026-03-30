"use client";

import "client-only";

import type { ReactNode } from "react";
import LanguageSelector from "@/client/features/layout/LanguageSelector";

type HeaderProps = {
  leftContent?: ReactNode;
  showLanguageSelector?: boolean;
};

export default function Header({
  leftContent,
  showLanguageSelector = false,
}: HeaderProps) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-13 max-w-[640px] items-center justify-between px-5">
        <div className="flex min-w-[60px] items-center">
          {leftContent}
        </div>
        <span className="text-lg font-bold text-primary tracking-tight">
          Essenly
        </span>
        <div className="flex min-w-[60px] items-center justify-end">
          {showLanguageSelector && <LanguageSelector />}
        </div>
      </div>
    </header>
  );
}

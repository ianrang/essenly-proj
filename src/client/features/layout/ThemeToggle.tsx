"use client";

import "client-only";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-9 w-9" />;

  // 현재 테마 → 다음 테마 전환 매핑
  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";

  // 버튼에 표시할 아이콘/라벨 = 다음 테마 (클릭하면 이 테마로 전환됨)
  const nextIcon = next === "dark" ? "🌙" : next === "light" ? "☀️" : "💻";
  const nextLabel = next === "dark" ? "Dark" : next === "light" ? "Light" : "Auto";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${nextLabel} mode`}
      className="group relative flex h-9 w-9 items-center justify-center rounded-md border border-border text-sm transition-colors hover:bg-muted"
    >
      {nextIcon}
      <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-0.5 text-[10px] font-medium text-background opacity-0 transition-opacity group-hover:opacity-100">
        {nextLabel}
      </span>
    </button>
  );
}

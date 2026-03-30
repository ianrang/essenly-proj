"use client";

import "client-only";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-9 w-9" />;

  function cycleTheme() {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  }

  const icon = theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "💻";
  const label =
    theme === "dark" ? "Dark" : theme === "light" ? "Light" : "Auto";

  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={`Theme: ${label}`}
      className="group relative flex h-9 w-9 items-center justify-center rounded-md border border-border text-sm transition-colors hover:bg-muted"
    >
      {icon}
      <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-2 py-0.5 text-[10px] font-medium text-background opacity-0 transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </button>
  );
}

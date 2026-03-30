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
    theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";

  return (
    <button
      onClick={cycleTheme}
      aria-label={`Theme: ${label}. Click to change.`}
      title={`Theme: ${label}`}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-sm transition-colors hover:bg-muted"
    >
      {icon}
    </button>
  );
}

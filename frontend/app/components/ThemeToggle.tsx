"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/app/components/ThemeProvider";

type Props = {
  className?: string;
};

export default function ThemeToggle({ className = "" }: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`w-9 h-9 rounded-[13px] flex items-center justify-center shrink-0 bg-crm-muted text-crm-text-muted hover:text-crm-brand hover:bg-crm-brand-soft active:scale-95 ${className}`}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

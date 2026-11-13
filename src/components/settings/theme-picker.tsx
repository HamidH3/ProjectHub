"use client";

// Settings → Appearance: pick a colour theme. It changes straight away and is
// remembered on this device (a cookie), so each device can have its own.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { THEMES, THEME_COOKIE, isDarkTheme, type ThemeId } from "@/lib/theme";
import { cn } from "@/lib/utils";

function applyTheme(theme: ThemeId) {
  const html = document.documentElement;
  html.dataset.theme = theme;
  const dark = theme === "system" ? matchMedia("(prefers-color-scheme: dark)").matches : isDarkTheme(theme);
  html.classList.toggle("dark", dark);
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax${secure}`;
}

export function ThemePicker({ current }: { current: ThemeId }) {
  const router = useRouter();
  const [theme, setTheme] = useState(current);

  return (
    <div role="radiogroup" aria-label="Colour theme" className="grid gap-3 p-4 sm:grid-cols-2">
      {THEMES.map((t) => {
        const selected = t.id === theme;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              setTheme(t.id);
              applyTheme(t.id);
              router.refresh(); // so the phone status bar colour and pop-ups follow
            }}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left transition hover:bg-(--hover)",
              selected ? "border-primary ring-1 ring-primary" : "border-border",
            )}
          >
            <span aria-hidden className="flex h-10 w-14 shrink-0 overflow-hidden rounded-md border border-border">
              <span className="w-1/3" style={{ background: t.swatch[1] }} />
              <span className="relative flex-1" style={{ background: t.swatch[0] }}>
                <span className="absolute bottom-1.5 left-1.5 h-1.5 w-5 rounded-full" style={{ background: t.swatch[2] }} />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t.name}</span>
              <span className="block text-xs text-muted-foreground">{t.note}</span>
            </span>
            {selected && <Check className="size-4 shrink-0 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

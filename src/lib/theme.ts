// Colour themes (Settings → Appearance). The choice is kept in a cookie on
// this device, so pages are drawn in the right colours straight away (no flash
// of the wrong theme). The colours themselves live in src/app/theme.css.

export const THEME_COOKIE = "ph-theme";

export const THEMES = [
  { id: "dark", name: "Dark", note: "The default", swatch: ["#111111", "#202020", "#d97757"] },
  { id: "light", name: "Light", note: "Bright and clean", swatch: ["#f6f6f4", "#ffffff", "#c45c3b"] },
  { id: "black", name: "Black", note: "Pure black, easy on phone batteries", swatch: ["#000000", "#0e0e0e", "#d97757"] },
  { id: "purple", name: "Purple", note: "Light, like OneNote", swatch: ["#faf7fc", "#f2e9f8", "#7719aa"] },
  { id: "blue", name: "Blue", note: "Light, like Word", swatch: ["#f5f8fc", "#e8eff9", "#185abd"] },
  { id: "system", name: "Match my device", note: "Dark or Light, following your device", swatch: ["#111111", "#f6f6f4", "#d97757"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export function isTheme(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

export function themeOrDefault(value: unknown): ThemeId {
  return isTheme(value) ? value : "dark";
}

// Themes drawn with dark colours (shadcn's "dark" class goes on <html>).
// "system" is decided in the browser, by the small script in app/layout.tsx.
export function isDarkTheme(theme: ThemeId): boolean {
  return theme === "dark" || theme === "black";
}

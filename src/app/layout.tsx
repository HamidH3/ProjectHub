import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import "./globals.css";
import "./theme.css";
import { THEME_COOKIE, isDarkTheme, themeOrDefault } from "@/lib/theme";

async function currentTheme() {
  return themeOrDefault((await cookies()).get(THEME_COOKIE)?.value);
}

export const metadata: Metadata = {
  title: { default: "ProjectHub", template: "%s · ProjectHub" },
  description: "Your workspace. Your projects. Everything in one place.",
  // Private app: ask search engines not to list it.
  robots: { index: false, follow: false },
};

// The browser's own colours (phone status bar, scrollbars) match the theme.
export async function generateViewport(): Promise<Viewport> {
  const theme = await currentTheme();
  if (theme === "system") {
    return {
      themeColor: [
        { media: "(prefers-color-scheme: dark)", color: "#111111" },
        { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
      ],
      colorScheme: "dark light",
    };
  }
  const colours: Record<string, string> = { dark: "#111111", black: "#000000", light: "#f6f6f4", purple: "#faf7fc", blue: "#f5f8fc" };
  return { themeColor: colours[theme], colorScheme: isDarkTheme(theme) ? "dark" : "light" };
}

// "Match my device": add shadcn's "dark" class before anything is drawn.
const SYSTEM_THEME_SCRIPT = `try{if(matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.classList.add("dark")}catch(e){}`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = await currentTheme();
  return (
    <html
      lang="en-GB"
      data-theme={theme}
      className={`${isDarkTheme(theme) ? "dark " : ""}${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      // The "Match my device" script may add a class; that's expected.
      suppressHydrationWarning
    >
      <head>{theme === "system" && <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />}</head>
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster theme={theme === "system" ? "system" : isDarkTheme(theme) ? "dark" : "light"} position="bottom-right" richColors />
      </body>
    </html>
  );
}

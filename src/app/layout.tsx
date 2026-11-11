import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import "./globals.css";
import "./theme.css";

export const metadata: Metadata = {
  title: { default: "ProjectHub", template: "%s · ProjectHub" },
  description: "Your workspace. Your projects. Everything in one place.",
  // Private app: ask search engines not to list it.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#111111",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      className={`dark ${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster theme="dark" position="bottom-right" richColors />
      </body>
    </html>
  );
}

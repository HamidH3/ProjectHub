"use client";

// Two-factor authentication with an authenticator app (Microsoft
// Authenticator, Google Authenticator, 1Password, etc.).
//   * First time: shows a QR code to scan, then asks for a code to confirm.
//   * Afterwards: asks for the current 6-digit code after each sign-in.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/paths";
import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/auth/form-bits";

type Mode = "loading" | "enroll" | "verify" | "error";

export function MfaForm() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));

  const [mode, setMode] = useState<Mode>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React runs effects twice in development
    started.current = true;

    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        setError("Couldn't load your 2FA settings. Sign in again.");
        setMode("error");
        return;
      }

      const verified = data.totp[0];
      if (verified) {
        setFactorId(verified.id);
        setMode("verify");
        return;
      }

      // Remove any half-finished setup from an earlier visit.
      for (const factor of data.all) {
        if (factor.factor_type === "totp" && factor.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }

      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator app (${new Date().toISOString().slice(0, 10)})`,
      });
      if (enrollError || !enrolled) {
        setError("Couldn't start 2FA setup. Reload the page to try again.");
        setMode("error");
        return;
      }
      setFactorId(enrolled.id);
      setQrCode(enrolled.totp.qr_code);
      setSecret(enrolled.totp.secret);
      setMode("enroll");
    })();
  }, [supabase]);

  async function verify(formData: FormData) {
    if (!factorId) return;
    const code = String(formData.get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your app.");
      return;
    }
    setBusy(true);
    setError(undefined);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      setBusy(false);
      setError("That code didn't work. Codes change every 30 seconds, so try the current one.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <>
      <h1 className="text-xl font-semibold">
        {mode === "enroll" ? "Set up two-factor authentication" : "Enter your 2FA code"}
      </h1>

      {mode === "loading" && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}

      {mode === "enroll" && qrCode && (
        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
          <p>1. Open your authenticator app and scan this code.</p>
          <div className="flex justify-center rounded-lg bg-white p-3">
            {/* Supabase returns the QR code as an image (SVG data). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="QR code for your authenticator app" width={180} height={180} />
          </div>
          <details>
            <summary className="cursor-pointer hover:text-foreground">Can&apos;t scan it? Enter this key instead</summary>
            <code className="mt-2 block break-all rounded bg-muted px-2 py-1.5 text-foreground">{secret}</code>
          </details>
          <p>2. Type the 6-digit code the app shows.</p>
        </div>
      )}

      {mode === "verify" && (
        <p className="mt-1 text-sm text-muted-foreground">Open your authenticator app and enter the current code.</p>
      )}

      {(mode === "enroll" || mode === "verify") && (
        <form action={verify} className="mt-4 space-y-4">
          <FormMessage error={error} />
          <Field
            label="6-digit code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            required
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Checking…" : mode === "enroll" ? "Turn on 2FA" : "Continue"}
          </Button>
        </form>
      )}

      {mode === "error" && (
        <div className="mt-4">
          <FormMessage error={error} />
        </div>
      )}

      <form action={signOut} className="mt-6 text-center">
        <button type="submit" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          Sign out
        </button>
      </form>
    </>
  );
}

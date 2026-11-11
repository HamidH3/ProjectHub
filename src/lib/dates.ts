// Date helpers that respect the user's time zone (stored on their profile).

function safeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone });
    return timezone;
  } catch {
    return "Europe/London";
  }
}

// Today's date as YYYY-MM-DD in the given time zone.
export function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// "morning", "afternoon" or "evening" in the given time zone.
export function partOfDay(timezone: string): "morning" | "afternoon" | "evening" {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: safeZone(timezone) }).format(
      new Date(),
    ),
  );
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

// "WEDNESDAY · 11 NOVEMBER" for today in the given time zone.
export function todayHeading(timezone: string): string {
  const zone = safeZone(timezone);
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: zone }).format(now);
  const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: zone }).format(now);
  return `${weekday} · ${dayMonth}`.toUpperCase();
}

// "30 Nov 2026" from a YYYY-MM-DD date (dates have no time zone, so read as UTC).
export function formatDate(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

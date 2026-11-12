// The page you're sent to after signing in (?next=…) must stay on this site.
import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/paths";

describe("safeNextPath", () => {
  it("allows pages on this site", () => {
    expect(safeNextPath("/projects/123")).toBe("/projects/123");
    expect(safeNextPath("/calendar?month=2026-11")).toBe("/calendar?month=2026-11");
  });

  it.each([
    ["another website", "https://evil.com"],
    ["a protocol-relative link", "//evil.com"],
    ["a backslash trick", "/\\evil.com"],
    ["a hidden tab", "/\t/evil.com"],
    ["a hidden line break", "/\n/evil.com"],
    ["javascript", "javascript:alert(1)"],
    ["no leading slash", "projects"],
    ["an empty value", ""],
  ])("refuses %s", (_label, value) => {
    expect(safeNextPath(value)).toBe("/");
  });

  it("refuses things that aren't text, and uses the fallback", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(["/a"])).toBe("/");
    expect(safeNextPath(null, "/update-password")).toBe("/update-password");
  });
});

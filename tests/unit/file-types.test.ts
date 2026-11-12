// Which files can be uploaded, and how their names are stored.
import { describe, expect, it } from "vitest";
import { formatBytes, kindOf, storagePathFor, storageSafeName, tidyFileName, uniqueName, uploadTypeFor } from "@/lib/file-types";

describe("uploadTypeFor", () => {
  it("allows the supported types", () => {
    expect(uploadTypeFor("brief.pdf", "application/pdf")).toBe("application/pdf");
    expect(uploadTypeFor("Photo.JPG", "image/jpeg")).toBe("image/jpeg");
  });

  it("fills in the type when the browser doesn't say", () => {
    expect(uploadTypeFor("notes.txt", "")).toBe("text/plain");
    expect(uploadTypeFor("plan.docx", "")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });

  it("accepts the other names Windows uses for CSV and ZIP", () => {
    expect(uploadTypeFor("data.csv", "application/vnd.ms-excel")).toBe("application/vnd.ms-excel");
    expect(uploadTypeFor("pack.zip", "application/x-zip-compressed")).toBe("application/x-zip-compressed");
  });

  it("refuses everything else, whatever the browser claims", () => {
    expect(uploadTypeFor("virus.exe", "application/pdf")).toBeNull();
    expect(uploadTypeFor("page.html", "text/html")).toBeNull();
    expect(uploadTypeFor("logo.svg", "image/svg+xml")).toBeNull();
    expect(uploadTypeFor("noextension", "application/pdf")).toBeNull();
  });

  it("stores a file claiming to be another type as its real type", () => {
    expect(uploadTypeFor("report.pdf", "text/html")).toBe("application/pdf");
  });
});

describe("storage names", () => {
  it.each([
    ["NDA signed.pdf", "NDA signed.pdf"],
    ["Café menu (v2).pdf", "Cafe menu (v2).pdf"],
    ["Client’s brief #3.docx", "Clients brief _3.docx"],
    ["a/b\\c.txt", "a_b_c.txt"],
    ["../../secret.txt", "_.._secret.txt"],
    ["图片.png", "file.png"],
  ])("%s → %s", (name, stored) => {
    expect(storageSafeName(name)).toBe(stored);
  });

  it("never lets a name escape the file's own folder", () => {
    const path = storagePathFor("proj", "file", "../../../other-project/x.pdf");
    expect(path.startsWith("proj/file/")).toBe(true);
    expect(path.split("/")).toHaveLength(3);
  });

  it("keeps long names under the limit with their extension", () => {
    expect(storageSafeName(`${"x".repeat(300)}.pdf`)).toMatch(/^x+\.pdf$/);
    expect(storageSafeName(`${"x".repeat(300)}.pdf`).length).toBeLessThanOrEqual(150);
    expect(tidyFileName(`${"y".repeat(400)}.xlsx`)).toMatch(/\.xlsx$/);
    expect(tidyFileName(`${"y".repeat(400)}.xlsx`).length).toBeLessThanOrEqual(255);
  });
});

describe("other helpers", () => {
  it("adds (2), (3)… when a name is taken", () => {
    expect(uniqueName("report.pdf", new Set())).toBe("report.pdf");
    expect(uniqueName("report.pdf", new Set(["report.pdf"]))).toBe("report (2).pdf");
    expect(uniqueName("Report.PDF", new Set(["report.pdf", "report (2).pdf"]))).toBe("Report (3).PDF");
  });

  it("shows sizes readably", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
  });

  it("knows what kind of file it is", () => {
    expect(kindOf("a.xlsx", "")).toBe("sheet");
    expect(kindOf("a.png", "image/png")).toBe("image");
    expect(kindOf("a.pptx", "")).toBe("slides");
  });
});

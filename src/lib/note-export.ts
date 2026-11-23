// Downloading a note: turns the editor's saved document into Markdown (.md)
// or a Word document (.docx). Pure functions (no browser needed), so they're
// unit-tested. Drawings and pictures live on a separate layer and can't be put
// into these formats sensibly: the "PDF" option (printing the page) keeps them.

export type DocNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

const kids = (n: DocNode | undefined) => (Array.isArray(n?.content) ? n!.content! : []);

// A safe file name from the note's title: "Launch plan (14 Nov).md"
export function exportFileName(title: string, extension: "md" | "docx"): string {
  const base = (title || "Untitled")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${base || "Untitled"}.${extension}`;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------
const mdEscape = (s: string) => s.replace(/([\\`*_[\]#<>|~])/g, "\\$1");

function mdInline(nodes: DocNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === "hardBreak") return "  \n";
      if (n.type !== "text" || typeof n.text !== "string") return "";
      const marks = new Set((n.marks ?? []).map((m) => m.type));
      let t = marks.has("code") ? `\`${n.text.replace(/`/g, "​`")}\`` : mdEscape(n.text);
      if (marks.has("bold")) t = `**${t}**`;
      if (marks.has("italic")) t = `*${t}*`;
      if (marks.has("strike")) t = `~~${t}~~`;
      if (marks.has("underline")) t = `<u>${t}</u>`;
      const link = n.marks?.find((m) => m.type === "link")?.attrs?.href;
      if (typeof link === "string" && /^(https?:|mailto:)/i.test(link)) t = `[${t}](${link.replace(/[()\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)})`;
      return t;
    })
    .join("");
}

function mdBlocks(nodes: DocNode[], indent = ""): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case "paragraph":
        out.push(indent + mdInline(kids(n)), "");
        break;
      case "picture": // pictures are private, so the file only says where one was
        out.push(`${indent}_[Picture]_`, "");
        break;
      case "heading": {
        const level = Math.min(3, Math.max(1, Number(n.attrs?.level) || 1));
        out.push(`${"#".repeat(level + 1)} ${mdInline(kids(n))}`, ""); // the note title is the only # heading
        break;
      }
      case "bulletList":
      case "orderedList":
      case "taskList": {
        kids(n).forEach((item, i) => {
          const marker =
            n.type === "orderedList" ? `${i + 1}.` : n.type === "taskList" ? (item.attrs?.checked ? "- [x]" : "- [ ]") : "-";
          const [first, ...rest] = kids(item);
          const firstText = first?.type === "paragraph" ? mdInline(kids(first)) : "";
          out.push(`${indent}${marker} ${firstText}`);
          const inner = mdBlocks(first?.type === "paragraph" ? rest : kids(item), `${indent}   `).filter((l) => l !== "");
          out.push(...inner);
        });
        out.push("");
        break;
      }
      case "blockquote": {
        const inner = mdBlocks(kids(n));
        while (inner.at(-1) === "") inner.pop();
        out.push(...inner.map((l) => (l ? `${indent}> ${l}` : `${indent}>`)), "");
        break;
      }
      case "codeBlock": {
        const code = kids(n).map((t) => t.text ?? "").join("");
        out.push(`\`\`\`${typeof n.attrs?.language === "string" ? n.attrs.language : ""}`, code, "```", "");
        break;
      }
      case "horizontalRule":
        out.push("---", "");
        break;
      case "table": {
        const rows = kids(n).map((row) =>
          kids(row).map((cell) => kids(cell).map((p) => mdInline(kids(p))).join(" ").replace(/\n/g, " ") || " "),
        );
        if (rows.length) {
          const width = Math.max(...rows.map((r) => r.length));
          const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? " ").join(" | ")} |`;
          out.push(line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line), "");
        }
        break;
      }
      default:
        if (kids(n).length) out.push(...mdBlocks(kids(n), indent));
    }
  }
  return out;
}

export function noteToMarkdown(title: string, doc: DocNode, opts: { hasDrawing?: boolean } = {}): string {
  const lines = [`# ${mdEscape(title || "Untitled")}`, "", ...mdBlocks(kids(doc))];
  if (opts.hasDrawing) lines.push("_This note also has drawings or pictures. Download it as PDF to include them._", "");
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

// ---------------------------------------------------------------------------
// Word (.docx): a small set of XML files in a zip
// ---------------------------------------------------------------------------
const xml = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

type Ctx = { links: string[] };

function wRuns(nodes: DocNode[], ctx: Ctx): string {
  return nodes
    .map((n) => {
      if (n.type === "hardBreak") return "<w:r><w:br/></w:r>";
      if (n.type !== "text" || typeof n.text !== "string") return "";
      const marks = new Set((n.marks ?? []).map((m) => m.type));
      const props = [
        marks.has("bold") && "<w:b/>",
        marks.has("italic") && "<w:i/>",
        marks.has("underline") && '<w:u w:val="single"/>',
        marks.has("strike") && "<w:strike/>",
        marks.has("code") && '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:shd w:val="clear" w:fill="F2F2F2"/>',
      ].filter(Boolean);
      const href = n.marks?.find((m) => m.type === "link")?.attrs?.href;
      const linked = typeof href === "string" && /^(https?:|mailto:)/i.test(href);
      if (linked) props.push('<w:color w:val="1155CC"/>', '<w:u w:val="single"/>');
      const run = `<w:r>${props.length ? `<w:rPr>${props.join("")}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(n.text)}</w:t></w:r>`;
      if (!linked) return run;
      ctx.links.push(href as string);
      return `<w:hyperlink r:id="rIdLink${ctx.links.length}">${run}</w:hyperlink>`;
    })
    .join("");
}

const para = (runs: string, props = "") => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${runs}</w:p>`;
const indentTwips = (level: number, hanging = false) =>
  `<w:ind w:left="${360 + level * 360}"${hanging ? ' w:hanging="360"' : ""}/>`;

function wBlocks(nodes: DocNode[], ctx: Ctx, level = 0): string {
  let out = "";
  for (const n of nodes) {
    switch (n.type) {
      case "paragraph":
        out += para(wRuns(kids(n), ctx), level ? indentTwips(level - 1) : "");
        break;
      case "picture":
        out += para('<w:r><w:rPr><w:i/><w:color w:val="777777"/></w:rPr><w:t>[Picture]</w:t></w:r>');
        break;
      case "heading":
        out += para(wRuns(kids(n), ctx), `<w:pStyle w:val="Heading${Math.min(3, Math.max(1, Number(n.attrs?.level) || 1))}"/>`);
        break;
      case "bulletList":
      case "orderedList":
      case "taskList":
        kids(n).forEach((item, i) => {
          const marker =
            n.type === "orderedList" ? `${i + 1}.\t` : n.type === "taskList" ? (item.attrs?.checked ? "☑\t" : "☐\t") : "•\t";
          const [first, ...rest] = kids(item);
          const firstRuns = first?.type === "paragraph" ? wRuns(kids(first), ctx) : "";
          out += para(`<w:r><w:t xml:space="preserve">${marker}</w:t></w:r>${firstRuns}`, indentTwips(level, true));
          out += wBlocks(first?.type === "paragraph" ? rest : kids(item), ctx, level + 1);
        });
        break;
      case "blockquote":
        out += kids(n)
          .map((child) =>
            child.type === "paragraph"
              ? para(wRuns(kids(child), ctx), '<w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="BBBBBB"/></w:pBdr><w:ind w:left="360"/>')
              : wBlocks([child], ctx, level),
          )
          .join("");
        break;
      case "codeBlock": {
        const code = kids(n).map((t) => t.text ?? "").join("");
        for (const line of code.split("\n")) {
          out += para(
            `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/></w:rPr><w:t xml:space="preserve">${xml(line)}</w:t></w:r>`,
            '<w:shd w:val="clear" w:fill="F2F2F2"/><w:spacing w:after="0"/>',
          );
        }
        out += para("");
        break;
      }
      case "horizontalRule":
        out += para("", '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BBBBBB"/></w:pBdr>');
        break;
      case "table": {
        const rows = kids(n);
        if (!rows.length) break;
        const width = Math.max(...rows.map((r) => kids(r).length), 1);
        const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>`;
        out += `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2000"/>'.repeat(width)}</w:tblGrid>`;
        for (const row of rows) {
          out += "<w:tr>";
          for (const cell of kids(row)) {
            const header = cell.type === "tableHeader";
            const inner = wBlocks(kids(cell), ctx) || para("");
            out += `<w:tc><w:tcPr>${header ? '<w:shd w:val="clear" w:fill="F2F2F2"/>' : ""}</w:tcPr>${header ? inner.replace(/<w:r>(?!<w:rPr>)/g, "<w:r><w:rPr><w:b/></w:rPr>") : inner}</w:tc>`;
          }
          out += "</w:tr>";
        }
        out += "</w:tbl>" + para("");
        break;
      }
      default:
        if (kids(n).length) out += wBlocks(kids(n), ctx, level);
    }
  }
  return out;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="34"/><w:szCs w:val="34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
</w:styles>`;

export function noteToDocxFiles(title: string, doc: DocNode, opts: { hasDrawing?: boolean } = {}): Record<string, string> {
  const ctx: Ctx = { links: [] };
  let body = para(`<w:r><w:t xml:space="preserve">${xml(title || "Untitled")}</w:t></w:r>`, '<w:pStyle w:val="Title"/>');
  body += wBlocks(kids(doc), ctx);
  if (opts.hasDrawing) {
    body += para(
      '<w:r><w:rPr><w:i/><w:color w:val="777777"/></w:rPr><w:t xml:space="preserve">This note also has drawings or pictures. Download it as PDF to include them.</w:t></w:r>',
    );
  }
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  return {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${ctx.links
      .map(
        (href, i) =>
          `<Relationship Id="rIdLink${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(href)}" TargetMode="External"/>`,
      )
      .join("")}</Relationships>`,
    "word/styles.xml": STYLES,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  };
}

// --- A minimal zip writer ("stored", no compression): all a .docx needs.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files: Record<string, string>): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // names are UTF-8
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x21, true); // 1 Jan 1980
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const head = new Uint8Array(46 + nameBytes.length);
    const hv = new DataView(head.buffer);
    hv.setUint32(0, 0x02014b50, true);
    hv.setUint16(4, 20, true);
    hv.setUint16(6, 20, true);
    hv.setUint16(8, 0x0800, true);
    hv.setUint16(14, 0x21, true);
    hv.setUint32(16, crc, true);
    hv.setUint32(20, data.length, true);
    hv.setUint32(24, data.length, true);
    hv.setUint16(28, nameBytes.length, true);
    hv.setUint32(42, offset, true);
    head.set(nameBytes, 46);
    parts.push(local, data);
    central.push(head);
    offset += local.length + data.length;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function noteToDocx(title: string, doc: DocNode, opts: { hasDrawing?: boolean } = {}): Uint8Array {
  return zip(noteToDocxFiles(title, doc, opts));
}

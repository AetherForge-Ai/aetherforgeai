// b99 candidate: M-7-GREEN
/**
 * M-7: one green for text, site-wide.
 * Clause 1: no text-green in src except the token and TEXT_GREEN_ALLOWANCE.
 * Clause 2: #059669 is not used as a text colour.
 * Clause 3: the token clears WCAG AA 4.5:1 on the page backgrounds in both themes.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NON_TEXT_GREENS, TEXT_GREEN_ALLOWANCE } from "./text-green-allow";

const TOKEN_LIGHT = "#047857";
const TOKEN_DARK = "#34d399";

type Hit = { file: string; line: number; text: string };

const read = (p: string) => readFileSync(p, "utf8");

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

function hsl(hex: string): { h: number; s: number; l: number } {
  const h = hex.slice(1).toLowerCase();
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
    }
    hue *= 60;
  }
  return { h: hue, s, l };
}

/** Green, emerald, lime and teal. Cyan (hue > 175) and amber stay out. */
function isGreen(hex: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
  const { h, s, l } = hsl(hex);
  return s >= 0.15 && l >= 0.12 && l <= 0.97 && h >= 70 && h <= 175;
}

function isTokenHex(hex: string): boolean {
  const h = hex.toLowerCase();
  return h === TOKEN_LIGHT || h === TOKEN_DARK;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function rel(file: string): string {
  return file.split(path.sep).join("/");
}

/** Lines that paint a green as text, other than the --text-green / text-gain token. */
export function scanTextGreens(root = "src"): Hit[] {
  const hits: Hit[] = [];
  for (const file of walk(root)) {
    const relative = rel(file);
    if (relative === "src/lib/must-fix/text-green-allow.ts") continue;
    const original = read(file).split("\n");
    const lines = stripComments(original.join("\n")).split("\n");
    lines.forEach((line, index) => {
      if (isTextGreenLine(line)) hits.push({ file: relative, line: index + 1, text: original[index] });
    });
  }
  return hits;
}

function isTextGreenLine(line: string): boolean {
  if (/text-(?:green|emerald|lime|teal)-\d{2,3}/.test(line)) return true;
  for (const match of line.matchAll(/text-\[#([0-9a-fA-F]{6})\]/g)) {
    if (isGreen(`#${match[1]}`)) return true;
  }
  if (/--text-green:\s*#(?:047857|34d399)\b/i.test(line)) return false;
  for (const match of line.matchAll(/(?<![\w-])color\s*:\s*([^;}]*)/gi)) {
    for (const hex of match[1].match(/(?<![0-9a-fA-F])#[0-9a-fA-F]{6}(?![0-9a-fA-F])/g) ?? []) {
      if (isGreen(hex)) return true;
    }
  }
  for (const match of line.matchAll(/(?<![\w-])(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/gi)) {
    const name = match[1];
    const hex = match[2];
    if (name === "--text-green" || !isGreen(hex)) continue;
    if (name === "--primary" || name.endsWith("-foreground") || name.startsWith("--text-")) return true;
  }
  for (const match of line.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*["'](#[0-9A-Fa-f]{6})["']/g)) {
    if (match[1] === "TEXT_GREEN" && isTokenHex(match[2])) continue;
    if (isGreen(match[2])) return true;
  }
  // camelCase colour bindings (gainColor = "#…") that are not the token pair
  for (const match of line.matchAll(/(?:const|let|var)\s+(\w*[Cc]olor\w*)\s*=\s*([^;\n]+)/g)) {
    if (match[1] === "CHART_GREEN") continue;
    for (const hex of match[2].match(/(?<![0-9a-fA-F])#[0-9a-fA-F]{6}(?![0-9a-fA-F])/g) ?? []) {
      if (isGreen(hex) && !isTokenHex(hex)) return true;
    }
  }
  return false;
}

function allowed(hit: Hit): boolean {
  return TEXT_GREEN_ALLOWANCE.some((rule) => rule.file === hit.file && hit.text.includes(rule.lineIncludes));
}

/** #059669 used as type. Borders, shadows, rings and the chart stroke are not type. */
export function textUsesOf059669(root = "src"): Hit[] {
  const hits: Hit[] = [];
  for (const file of walk(root)) {
    const relative = rel(file);
    if (relative === "src/lib/must-fix/text-green-allow.ts") continue;
    const original = read(file).split("\n");
    const lines = stripComments(original.join("\n")).split("\n");
    lines.forEach((line, index) => {
      if (!/#059669/i.test(line)) return;
      if (/(?<![\w-])color\s*:[^;]*#059669/i.test(line)) {
        hits.push({ file: relative, line: index + 1, text: original[index] });
        return;
      }
      if (/const\s+CHART_GREEN\s*=\s*"#059669"/.test(line)) return;
      if (/(?:bg|border|shadow|ring|from|via|to)-\[#059669\]/i.test(line)) return;
      if (/borderColor\s*:\s*["']#059669["']/i.test(line)) return;
      hits.push({ file: relative, line: index + 1, text: original[index] });
    });
  }
  return hits;
}

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function lum(hex: string): number {
  const h = hex.replace("#", "");
  const r = channel(parseInt(h.slice(0, 2), 16));
  const g = channel(parseInt(h.slice(2, 4), 16));
  const b = channel(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [lo, hi] = [lum(a), lum(b)].sort((x, y) => x - y);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(fg: string, bg: string, alpha: number): string {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const f = parse(fg);
  const b = parse(bg);
  const c = f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

describe("b99 M-7 one text green", () => {
  it("scans src and finds no text-green outside the token and the allow-list", () => {
    const hits = scanTextGreens();
    const uncovered = hits.filter((hit) => !allowed(hit));
    expect(uncovered.map((hit) => `${hit.file}:${hit.line} ${hit.text.trim()}`)).toEqual([]);
    for (const rule of TEXT_GREEN_ALLOWANCE) {
      expect(rule.reason.trim().length, rule.file).toBeGreaterThan(40);
      const matched = hits.some((hit) => hit.file === rule.file && hit.text.includes(rule.lineIncludes));
      expect(matched, `${rule.file} ${rule.lineIncludes}`).toBe(true);
    }
  });

  it("leaves documented non-text greens off the text-green list", () => {
    const hits = scanTextGreens();
    for (const rule of NON_TEXT_GREENS) {
      expect(rule.reason.trim().length, rule.file).toBeGreaterThan(20);
      expect(read(rule.file), rule.lineIncludes).toContain(rule.lineIncludes);
      const offending = hits.filter((hit) => hit.file === rule.file && hit.text.includes(rule.lineIncludes));
      expect(offending.map((hit) => hit.text.trim()), rule.reason).toEqual([]);
    }
  });

  it("#059669 appears nowhere as a text colour", () => {
    expect(textUsesOf059669().map((hit) => `${hit.file}:${hit.line} ${hit.text.trim()}`)).toEqual([]);
    expect(read("src/lib/totalum-report-html.ts")).not.toContain("#059669");
    expect(read("src/lib/report-html.ts")).toContain('const TEXT_GREEN = "#047857"');
    expect(read("src/lib/report-html.ts")).not.toMatch(/(?<![\w-])color\s*:[^;\n]*#059669/i);
  });

  it("the token is at least 4.5:1 on page backgrounds in light and dark", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("--color-gain: var(--text-green)");
    expect(css).toMatch(/--background:\s*#f8fafc/i);
    expect(css).toMatch(/--card:\s*#ffffff/i);
    expect(css).toMatch(/--text-green:\s*#047857/i);
    expect(css).toMatch(/\.chrome-dark\s*\{[^}]*--background:\s*#0f172a/i);
    expect(css).toMatch(/\.chrome-dark\s*\{[^}]*--card:\s*#1e293b/i);
    expect(css).toMatch(/\.bg-zinc-950,\s*\.chrome-dark\s*\{\s*--text-green:\s*#34d399/);
    expect(css).toMatch(/\.pg-chat-in,\s*\.m7-on-dark\s*\{\s*--text-green:\s*#34d399;/);

    // Light token on the light page and on white cards.
    expect(ratio(TOKEN_LIGHT, "#f8fafc")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(TOKEN_LIGHT, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    // Dark pair on the chrome page and on chrome cards.
    expect(ratio(TOKEN_DARK, "#0f172a")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(TOKEN_DARK, "#1e293b")).toBeGreaterThanOrEqual(4.5);

    // Assistant panels are fixed dark emerald, outside chrome-dark. The light
    // token fails there; the dark pair passes, which is why .pg-chat-in sets it.
    const chat = [
      read("src/components/personal-guide/PersonalGuideChat.tsx"),
      read("src/components/portfolio-coach/PortfolioCoach.tsx"),
      read("src/components/portfolio-coach/PortfolioCoachChat.tsx"),
    ].join("\n");
    for (const bg of ["#06261a", "#0c3a28", "#041f16", "#0a2f22", "#0a3d2a", "#0f4f35"]) {
      expect(chat.toLowerCase(), bg).toContain(bg);
      expect(ratio(TOKEN_DARK, bg), `${TOKEN_DARK} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(TOKEN_LIGHT, bg), `${TOKEN_LIGHT} on ${bg}`).toBeLessThan(4.5);
    }

    // BUY chip: text-gain on a 15% teal-500 (#14b8a6) tint over the page.
    const teal = "#14b8a6";
    expect(ratio(TOKEN_LIGHT, mix(teal, "#ffffff", 0.15))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(TOKEN_DARK, mix(teal, "#0f172a", 0.15))).toBeGreaterThanOrEqual(4.5);

    // Crypto-search highlighted row uses the same token pair.
    expect(ratio(TOKEN_LIGHT, "#ecfdf5")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(TOKEN_DARK, "#134e4a")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(TOKEN_DARK, "#1e293b")).toBeGreaterThanOrEqual(4.5);
  });
});

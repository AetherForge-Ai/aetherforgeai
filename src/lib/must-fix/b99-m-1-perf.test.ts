// b99 candidate: M-1-PERF
/**
 * M-1-PERF guard. tesseract.js and pdfjs-dist must not be reachable from the
 * home page or the root layout. The unit job does not run `next build`, so the
 * check that always runs is the TypeScript import graph. When a webpack build
 * is already on disk, the same test also reads the `/` client-reference
 * manifest and refuses those libraries in any first-load chunk.
 *
 * Measured on develop 6fae463d (webpack, `npm run build`), not asserted here
 * because other b99 PRs may change home JS for unrelated reasons:
 *   / first-load JS 791,638 raw / 249,151 gzip (25 chunks)
 *   b97 0cdf10c8 was 791,407 raw / 249,838 gzip (25 chunks)
 *   pdf.js async chunk 456,431 bytes, tesseract.js async chunk 14,786 bytes,
 *   neither in the `/` first-load set.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const OCR = /^(tesseract\.js|pdfjs-dist)(\/|$)/;

type Edge = { spec: string; kind: "static" | "dynamic"; inFunction: boolean };

function resolveLocal(fromFile: string, spec: string): string | null {
  const abs = spec.startsWith("@/")
    ? path.join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(fromFile), spec)
      : null;
  if (!abs) return null;
  const candidates = [
    abs,
    ...[".ts", ".tsx", ".js", ".mjs", ".json"].map((ext) => abs + ext),
    ...[".ts", ".tsx", ".js"].map((ext) => path.join(abs, `index${ext}`)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function edgesOf(file: string): Edge[] {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const edges: Edge[] = [];
  const visit = (node: ts.Node, inType: boolean, inFunction: boolean) => {
    if (!inType && (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))) {
      const specNode = node.moduleSpecifier;
      const spec = specNode && ts.isStringLiteral(specNode) ? specNode.text : null;
      const typeOnly = (ts.isImportDeclaration(node) && !!node.importClause?.isTypeOnly) || !!node.isTypeOnly;
      if (spec && !typeOnly) edges.push({ spec, kind: "static", inFunction });
    } else if (!inType && ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) edges.push({ spec: arg.text, kind: "dynamic", inFunction });
    }
    const nextType = inType || ts.isTypeNode(node);
    const nextFunction = inFunction || ts.isFunctionLike(node);
    ts.forEachChild(node, (child) => visit(child, nextType, nextFunction));
  };
  visit(source, false, false);
  return edges;
}

function reachable(starts: string[], followDynamic: boolean) {
  const seen = new Set<string>();
  const hits: { file: string; spec: string; kind: Edge["kind"] }[] = [];
  const queue = starts.map((start) => path.join(ROOT, start));
  while (queue.length) {
    const file = queue.pop();
    if (!file || seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    for (const edge of edgesOf(file)) {
      if (OCR.test(edge.spec)) hits.push({ file: path.relative(ROOT, file), spec: edge.spec, kind: edge.kind });
      if (edge.kind === "dynamic" && !followDynamic) continue;
      const next = resolveLocal(file, edge.spec);
      if (next) queue.push(next);
    }
  }
  return hits;
}

/** Names of functions whose bodies contain a call to `calleeName`. */
function callersOf(file: string, calleeName: string): string[] {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names: string[] = [];
  const visit = (node: ts.Node, fn: string | null) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === calleeName && fn) {
      names.push(fn);
    }
    const named = ts.isFunctionDeclaration(node) && node.name ? node.name.text : fn;
    ts.forEachChild(node, (child) => visit(child, named));
  };
  visit(source, null);
  return names;
}

function effectCalls(file: string, names: readonly string[]): string[] {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node, inEffect: boolean) => {
    const effect = inEffect || (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useEffect");
    if (effect && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.includes(node.expression.text)) {
      found.push(node.expression.text);
    }
    ts.forEachChild(node, (child) => visit(child, effect));
  };
  visit(source, false);
  return found;
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/** Next's app-router first-load set: sync client-reference chunks plus rootMainFiles. */
function homeFirstLoadFiles(): string[] | null {
  const manifestPath = path.join(ROOT, ".next/server/app/page_client-reference-manifest.js");
  const buildPath = path.join(ROOT, ".next/build-manifest.json");
  if (!existsSync(manifestPath) || !existsSync(buildPath)) return null;
  const previous = (globalThis as { __RSC_MANIFEST?: unknown }).__RSC_MANIFEST;
  (globalThis as { __RSC_MANIFEST?: unknown }).__RSC_MANIFEST = undefined;
  // The manifest is a generated assignment, not JSON.
  new Function("globalThis", readFileSync(manifestPath, "utf8"))(globalThis);
  const manifest = (globalThis as { __RSC_MANIFEST?: Record<string, { clientModules?: Record<string, { async?: boolean; chunks?: unknown[] }> }> }).__RSC_MANIFEST;
  (globalThis as { __RSC_MANIFEST?: unknown }).__RSC_MANIFEST = previous;
  const entry = manifest ? Object.values(manifest)[0] : undefined;
  if (!entry?.clientModules) return null;
  const build = JSON.parse(readFileSync(buildPath, "utf8")) as { rootMainFiles?: string[] };
  const files = new Set<string>((build.rootMainFiles ?? []).filter((file) => file.endsWith(".js")));
  for (const mod of Object.values(entry.clientModules)) {
    if (mod.async) continue;
    for (const chunk of mod.chunks ?? []) {
      if (typeof chunk === "string" && chunk.split("?")[0].endsWith(".js")) files.add(chunk.split("?")[0]);
    }
  }
  return [...files];
}

describe("M-1-PERF home bundle guard", () => {
  it("does not reach tesseract.js or pdfjs-dist from / or the root layout", () => {
    const starts = ["src/app/page.tsx", "src/app/layout.tsx"];
    expect(reachable(starts, false)).toEqual([]);
    expect(reachable(starts, true)).toEqual([]);
  });

  it("loads the OCR libraries only from a dynamic import inside visual-reader, after a file is chosen", () => {
    const runtimeHits: { file: string; spec: string; kind: Edge["kind"]; inFunction: boolean }[] = [];
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      for (const edge of edgesOf(file)) {
        if (!OCR.test(edge.spec)) continue;
        runtimeHits.push({ file: path.relative(ROOT, file), spec: edge.spec, kind: edge.kind, inFunction: edge.inFunction });
      }
    }
    expect(runtimeHits).toEqual([
      { file: "src/lib/import/visual-reader.ts", spec: "tesseract.js", kind: "dynamic", inFunction: true },
      { file: "src/lib/import/visual-reader.ts", spec: "pdfjs-dist/legacy/build/pdf.mjs", kind: "dynamic", inFunction: true },
    ]);

    const paste = readFileSync("src/components/import/PasteTradesBox.tsx", "utf8");
    const panel = readFileSync("src/components/import/BrokerImportPanel.tsx", "utf8");
    expect(paste).toMatch(/onChange=\{\(e\) => \{\s*void readFile\(e\.target\.files\?\.\[0\]\)/);
    expect(panel).toMatch(/onChange=\{\(e\) => \{ void readVisual\(e\.target\.files\?\.\[0\]\)/);
    expect(callersOf("src/components/import/PasteTradesBox.tsx", "readVisualFile")).toEqual(["readFile"]);
    expect(callersOf("src/components/import/BrokerImportPanel.tsx", "readVisualFile")).toEqual(["readVisual"]);
    expect(effectCalls("src/components/import/PasteTradesBox.tsx", ["readFile", "readVisualFile"])).toEqual([]);
    expect(effectCalls("src/components/import/BrokerImportPanel.tsx", ["readVisual", "readVisualFile"])).toEqual([]);
    for (const file of ["src/app/page.tsx", "src/app/layout.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/visual-reader|tesseract|pdfjs-dist/);
    }
  });

  it("keeps OCR chunks out of the / first-load set when a webpack build is present", () => {
    const files = homeFirstLoadFiles();
    if (!files) return;
    const home = new Set(files);
    for (const file of files) {
      const text = readFileSync(path.join(ROOT, ".next", file), "utf8");
      expect(text.includes("tesseract"), file).toBe(false);
      expect(text.includes("pdfjs-dist"), file).toBe(false);
      expect(text.includes("pdf.mjs"), file).toBe(false);
    }
    const loadablePath = path.join(ROOT, ".next/react-loadable-manifest.json");
    expect(existsSync(loadablePath)).toBe(true);
    const loadable = JSON.parse(readFileSync(loadablePath, "utf8")) as Record<string, { files?: string[] }>;
    const ocrKeys = Object.keys(loadable).filter((key) => /tesseract\.js|pdfjs-dist/.test(key));
    expect(ocrKeys.length).toBeGreaterThan(0);
    for (const key of ocrKeys) {
      const chunks = (loadable[key].files ?? []).filter((file) => file.endsWith(".js"));
      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) expect(home.has(chunk), `${key} -> ${chunk}`).toBe(false);
    }
  });
});

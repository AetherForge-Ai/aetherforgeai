/**
 * M-1-PERF: required check for the next-build job, after `next build --webpack`.
 * Reads the App Router first-load set (sync client-reference chunks + rootMainFiles)
 * and fails if the build output is missing, if tesseract.js or pdfjs-dist is in that
 * set, or if gzip exceeds the develop 6fae463d measurement plus 2 KB.
 *
 *   node scripts/check-home-first-load.mjs [distDir]
 *   distDir defaults to .next
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";

/** develop 6fae463d webpack `/` first-load gzip, measured 11 Nov 2026. */
export const HOME_GZIP_BASELINE = 249_151;
/** Review tolerance: 2 KB. */
export const HOME_GZIP_TOLERANCE = 2 * 1024;

function fail(message) {
  const error = new Error(message);
  error.name = "HomeFirstLoadError";
  throw error;
}

function homeFirstLoadFiles(distDir) {
  const manifestPath = path.join(distDir, "server/app/page_client-reference-manifest.js");
  const buildPath = path.join(distDir, "build-manifest.json");
  const missing = [manifestPath, buildPath].filter((file) => !existsSync(file));
  if (missing.length) fail(`build output missing:\n${missing.map((file) => `  ${file}`).join("\n")}`);

  const previous = globalThis.__RSC_MANIFEST;
  globalThis.__RSC_MANIFEST = undefined;
  // Generated assignment, not JSON. A missing or empty manifest is a failed build, not a skip.
  new Function("globalThis", readFileSync(manifestPath, "utf8"))(globalThis);
  const manifest = globalThis.__RSC_MANIFEST;
  globalThis.__RSC_MANIFEST = previous;
  const entry = manifest ? Object.values(manifest)[0] : undefined;
  if (!entry?.clientModules) fail(`build output missing clientModules in ${manifestPath}`);

  const build = JSON.parse(readFileSync(buildPath, "utf8"));
  const files = new Set((build.rootMainFiles ?? []).filter((file) => file.endsWith(".js")));
  if (files.size === 0) fail(`build output missing rootMainFiles in ${buildPath}`);
  for (const mod of Object.values(entry.clientModules)) {
    if (mod.async) continue;
    for (const chunk of mod.chunks ?? []) {
      if (typeof chunk === "string" && chunk.split("?")[0].endsWith(".js")) files.add(chunk.split("?")[0]);
    }
  }
  return [...files];
}

export function checkHomeFirstLoad(distDir) {
  const files = homeFirstLoadFiles(distDir);
  const home = new Set(files);
  let raw = 0;
  let gzip = 0;
  for (const file of files) {
    const full = path.join(distDir, file);
    if (!existsSync(full)) fail(`build output missing chunk ${full}`);
    const buf = readFileSync(full);
    const text = buf.toString("utf8");
    if (text.includes("tesseract") || text.includes("pdfjs-dist") || text.includes("pdf.mjs")) {
      fail(`${file} is in the / first-load set and contains tesseract.js or pdfjs-dist`);
    }
    raw += buf.length;
    gzip += zlib.gzipSync(buf).length;
  }

  const loadablePath = path.join(distDir, "react-loadable-manifest.json");
  if (!existsSync(loadablePath)) fail(`build output missing ${loadablePath}`);
  const loadable = JSON.parse(readFileSync(loadablePath, "utf8"));
  const ocrKeys = Object.keys(loadable).filter((key) => /tesseract\.js|pdfjs-dist/.test(key));
  if (ocrKeys.length === 0) fail("react-loadable-manifest.json has no tesseract.js or pdfjs-dist chunk");
  for (const key of ocrKeys) {
    const chunks = (loadable[key].files ?? []).filter((file) => file.endsWith(".js"));
    if (chunks.length === 0) fail(`${key} lists no javascript chunk`);
    for (const chunk of chunks) {
      if (home.has(chunk)) fail(`${key} chunk ${chunk} is in the / first-load set`);
    }
  }

  const ceiling = HOME_GZIP_BASELINE + HOME_GZIP_TOLERANCE;
  if (gzip > ceiling) fail(`/ first-load gzip ${gzip} exceeds ${HOME_GZIP_BASELINE} + ${HOME_GZIP_TOLERANCE} (${ceiling})`);
  return { raw, gzip, count: files.length, ceiling };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    const distDir = path.resolve(process.argv[2] ?? ".next");
    const result = checkHomeFirstLoad(distDir);
    console.log(
      `/ first-load ${result.count} chunks, ${result.raw} raw, ${result.gzip} gzip (ceiling ${result.ceiling}). tesseract.js and pdfjs-dist are not in the set.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * b97 G-24: read a PDF or a screenshot into plain text in the member's browser, then hand it to the
 * same fixed-rule paste reader (parsePastedTrades) and the same review table. Free and local only:
 * pdf.js reads a PDF's text layer; tesseract.js reads an image. Both libraries and the English model
 * are served from this site (public/import-reader), so the file is never uploaded and no paid or AI
 * service is used. Nothing is saved here: the text goes to the review step like pasted text.
 */
export const READER_BASE = "/import-reader";
export const VISUAL_MAX_BYTES = 10 * 1024 * 1024;
export const VISUAL_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

export type VisualKind = "pdf" | "image";

export function visualKindOf(file: { name: string; type: string }): VisualKind | null {
  const t = (file.type || "").toLowerCase();
  const n = file.name.toLowerCase();
  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (/^image\/(png|jpeg|webp)$/.test(t) || /\.(png|jpe?g|webp)$/.test(n)) return "image";
  return null;
}

export interface PdfTextItem {
  str: string;
  transform: number[];
}

/** Group a pdf.js page's text items into lines by their baseline (top to bottom, left to right). */
export function pdfItemsToLines(items: readonly PdfTextItem[]): string[] {
  const rows: { y: number; parts: [number, string][] }[] = [];
  for (const it of items) {
    if (!it.str) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) <= 2);
    if (!row) rows.push((row = { y, parts: [] }));
    row.parts.push([x, it.str]);
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => r.parts.sort((a, b) => a[0] - b[0]).map((p) => p[1]).join("").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Tidy OCR text: unify dashes and quotes, collapse spaces, drop blank lines. */
export function tidyOcrText(text: string): string {
  return text
    .replace(/[\u2012-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

export async function pdfBytesToText(bytes: Uint8Array, pdfjs?: PdfJs): Promise<string> {
  const lib = pdfjs ?? (await import("pdfjs-dist/legacy/build/pdf.mjs"));
  if (typeof window !== "undefined" && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = `${READER_BASE}/pdf.worker.min.mjs`;
  const doc = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const lines: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    lines.push(...pdfItemsToLines(content.items.filter((x) => "str" in x) as unknown as PdfTextItem[]));
  }
  await doc.destroy();
  return lines.join("\n");
}

/** OCR an image in the browser with the self-hosted tesseract.js worker, core and English model. */
export async function imageToText(image: Blob | string, paths?: { workerPath?: string; corePath?: string; langPath?: string }): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: paths?.workerPath ?? `${READER_BASE}/worker.min.js`,
    corePath: paths?.corePath ?? `${READER_BASE}/core`,
    langPath: paths?.langPath ?? `${READER_BASE}/lang`,
  });
  try {
    const { data } = await worker.recognize(image);
    return tidyOcrText(data.text || "");
  } finally {
    await worker.terminate();
  }
}

export async function readVisualFile(file: File): Promise<{ ok: true; text: string; kind: VisualKind } | { ok: false; error: string }> {
  const kind = visualKindOf(file);
  if (!kind) return { ok: false, error: "Choose a PDF, PNG, JPEG or WebP file." };
  if (file.size > VISUAL_MAX_BYTES) return { ok: false, error: "That file is over 10 MB. Choose a smaller PDF or screenshot." };
  try {
    const text = kind === "pdf" ? await pdfBytesToText(new Uint8Array(await file.arrayBuffer())) : await imageToText(file);
    if (!text.trim()) return { ok: false, error: kind === "pdf" ? "No text was found in that PDF. If it is a scan, take a screenshot and choose that instead." : "No text could be read from that image." };
    return { ok: true, text, kind };
  } catch {
    return { ok: false, error: "That file could not be read on this device. Nothing was saved." };
  }
}

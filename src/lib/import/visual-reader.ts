/**
 * b97 G-24: read a PDF or a screenshot into plain text in the member's browser, then hand it to the
 * same fixed-rule paste reader (parsePastedTrades) and the same review table. Free and local only:
 * pdf.js reads a PDF's text layer; tesseract.js reads an image. Both libraries and the English model
 * are served from this site (public/import-reader), so the file is never uploaded and no paid or AI
 * service is used. Nothing is saved here: the text goes to the review step like pasted text.
 */
export const READER_BASE = "/import-reader";
export const VISUAL_MAX_BYTES = 10 * 1024 * 1024;
/** Contract notes are short. More pages than this are refused before OCR starts. */
export const VISUAL_MAX_PAGES = 15;
/** One rasterised page stays under this many pixels. */
export const VISUAL_MAX_RASTER_PIXELS = 2_000_000;
/** Budget for one read. A recognize call is stopped when this elapses; pdf.js itself is not interrupted. */
export const VISUAL_MAX_MS = 30_000;
/**
 * A file, not a directory. tesseract.js otherwise picks relaxedsimd-lstm on Chromium,
 * and that file is not hosted. This LSTM build embeds its wasm.
 */
export const TESSERACT_CORE_PATH = `${READER_BASE}/core/tesseract-core-lstm.wasm.js`;
export const VISUAL_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

export class VisualReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisualReadError";
  }
}

/** Files the worker will request for this corePath. A .js path is used as-is. */
export function tesseractCoreRequests(corePath = TESSERACT_CORE_PATH): string[] {
  const trimmed = corePath.replace(/\/$/, "");
  if (trimmed.endsWith(".js")) return [trimmed.slice(trimmed.lastIndexOf("/") + 1)];
  return [
    "tesseract-core-relaxedsimd-lstm.wasm.js",
    "tesseract-core-relaxedsimd-lstm.wasm",
    "tesseract-core-simd-lstm.wasm.js",
    "tesseract-core-simd-lstm.wasm",
    "tesseract-core-lstm.wasm.js",
    "tesseract-core-lstm.wasm",
  ];
}

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

type RasterPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (p: { canvas: HTMLCanvasElement; viewport: { width: number; height: number } }) => { promise: Promise<void> };
};

export type PdfReadOptions = {
  signal?: AbortSignal;
  rasterize?: (page: RasterPage) => Promise<Blob | null>;
  recognize?: (image: Blob) => Promise<string>;
  maxPages?: number;
  deadlineMs?: number;
  now?: () => number;
};

/** pdf.js names a form XObject `paintFormXObjectBegin`. `paintFormXObject` is counted when that name is present. */
const PAINT_OPS = ["paintImageXObject", "paintInlineImageXObject", "paintImageXObjectRepeat", "paintImageMaskXObject", "paintFormXObject", "paintFormXObjectBegin", "constructPath", "stroke", "fill", "eoFill", "fillStroke"];

function paintIds(ops: Record<string, number> | undefined): Set<number> | null {
  if (!ops) return null;
  const ids = new Set<number>();
  for (const name of PAINT_OPS) if (typeof ops[name] === "number") ids.add(ops[name]);
  return ids;
}

const TOO_LONG = "That file took too long to read on this device. Nothing was saved.";
const MODEL_SLOW = "The English reader did not load in time. Nothing was saved.";
const CANCELLED = "Reading was cancelled. Nothing was saved.";

function checkBudget(signal: AbortSignal | undefined, now: () => number, started: number, deadlineMs: number) {
  if (signal?.aborted) throw new VisualReadError(CANCELLED);
  if (now() - started > deadlineMs) throw new VisualReadError(TOO_LONG);
}

/** Stop waiting when the read budget runs out. `onTimeout` terminates the worker. */
function withDeadline<T>(work: Promise<T>, ms: number, onTimeout: () => void, message = TOO_LONG): Promise<T> {
  let timedOut = false;
  const guarded = work.then(
    (value) => value,
    (err) => {
      if (timedOut) return new Promise<T>(() => undefined);
      throw err;
    },
  );
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      timedOut = true;
      onTimeout();
      reject(new VisualReadError(message));
    }, Math.max(0, ms));
    guarded.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Draw one page. Scale starts at 2 and drops so the canvas stays within VISUAL_MAX_RASTER_PIXELS. */
export async function rasterizePage(page: RasterPage, doc: Document | undefined = typeof document === "undefined" ? undefined : document): Promise<Blob | null> {
  if (!doc) return null;
  const base = page.getViewport({ scale: 1 });
  const area = Math.max(1, base.width * base.height);
  let scale = 2;
  if (area * scale * scale > VISUAL_MAX_RASTER_PIXELS) scale = Math.sqrt(VISUAL_MAX_RASTER_PIXELS / area);
  let viewport = page.getViewport({ scale });
  while (Math.ceil(viewport.width) * Math.ceil(viewport.height) > VISUAL_MAX_RASTER_PIXELS && scale >= 0.25) {
    scale *= 0.98;
    viewport = page.getViewport({ scale });
  }
  if (scale < 0.25) throw new VisualReadError("That page is too large to draw on this device. Nothing was saved.");
  const canvas = doc.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  await page.render({ canvas, viewport }).promise;
  try {
    return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function ocrBlobs(blobs: Blob[], options: PdfReadOptions, started: number): Promise<string> {
  const now = options.now ?? Date.now;
  const deadlineMs = options.deadlineMs ?? VISUAL_MAX_MS;
  if (options.recognize) {
    const parts: string[] = [];
    for (const blob of blobs) {
      checkBudget(options.signal, now, started, deadlineMs);
      const text = await withDeadline(options.recognize(blob), deadlineMs - (now() - started), () => undefined);
      parts.push(tidyOcrText(text));
    }
    return parts.filter(Boolean).join("\n");
  }
  return imageToTextBlobs(blobs, { signal: options.signal, now, started, deadlineMs });
}

async function imageToTextBlobs(blobs: Blob[], budget: { signal?: AbortSignal; now: () => number; started: number; deadlineMs: number }): Promise<string> {
  const { signal, now, started, deadlineMs } = budget;
  const { engine, stop } = await openHostedWorker(signal, now, started, deadlineMs);
  const onAbort = () => stop();
  signal?.addEventListener("abort", onAbort);
  try {
    const parts: string[] = [];
    for (const blob of blobs) {
      checkBudget(signal, now, started, deadlineMs);
      const { data } = await withDeadline(engine.recognize(blob), deadlineMs - (now() - started), stop);
      if (signal?.aborted) throw new VisualReadError(CANCELLED);
      parts.push(tidyOcrText(data.text || ""));
    }
    return parts.filter(Boolean).join("\n");
  } finally {
    signal?.removeEventListener("abort", onAbort);
    stop();
    await engine.terminate().catch(() => undefined);
  }
}

type OcrEngine = {
  recognize: (image: Blob | string) => Promise<{ data: { text?: string } }>;
  terminate: () => Promise<unknown>;
};

const OCR_WORKER_OPTIONS = {
  workerPath: `${READER_BASE}/worker.min.js`,
  corePath: TESSERACT_CORE_PATH,
  langPath: `${READER_BASE}/lang`,
  gzip: true,
  cacheMethod: "none" as const,
  workerBlobURL: true,
};

/** createWorker builds its Worker synchronously. Keep that instance so cancel can terminate it before the promise settles. */
function startHostedWorker(create: () => Promise<OcrEngine>): { pending: Promise<OcrEngine>; stop: () => void } {
  let spawned: { terminate: () => void } | null = null;
  const stop = () => {
    try {
      spawned?.terminate();
    } catch {
      /* The worker may already be gone. */
    }
  };
  const view = globalThis as { Worker?: typeof Worker };
  const Real = view.Worker;
  if (typeof Real === "function") {
    const Wrapped = class extends Real {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        spawned = this;
      }
    };
    view.Worker = Wrapped as typeof Worker;
  }
  try {
    return { pending: create(), stop };
  } finally {
    if (typeof Real === "function") view.Worker = Real;
  }
}

async function openHostedWorker(signal: AbortSignal | undefined, now: () => number, started: number, deadlineMs: number): Promise<{ engine: OcrEngine; stop: () => void }> {
  checkBudget(signal, now, started, deadlineMs);
  const { createWorker } = await import("tesseract.js");
  const { pending, stop } = startHostedWorker(() => createWorker("eng", 1, OCR_WORKER_OPTIONS) as Promise<OcrEngine>);
  const onAbort = () => stop();
  signal?.addEventListener("abort", onAbort);
  try {
    const engine = await withDeadline(pending, deadlineMs - (now() - started), stop, MODEL_SLOW);
    signal?.removeEventListener("abort", onAbort);
    if (signal?.aborted) {
      stop();
      throw new VisualReadError(CANCELLED);
    }
    return { engine, stop };
  } catch (err) {
    stop();
    signal?.removeEventListener("abort", onAbort);
    if (signal?.aborted) throw new VisualReadError(CANCELLED);
    if (err instanceof VisualReadError) throw err;
    throw new VisualReadError(MODEL_SLOW);
  }
}

export async function pdfBytesToText(bytes: Uint8Array, pdfjs?: PdfJs, options: PdfReadOptions = {}): Promise<string> {
  const now = options.now ?? Date.now;
  const started = now();
  const deadlineMs = options.deadlineMs ?? VISUAL_MAX_MS;
  checkBudget(options.signal, now, started, deadlineMs);
  const lib = pdfjs ?? (await import("pdfjs-dist/legacy/build/pdf.mjs"));
  if (typeof window !== "undefined" && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = `${READER_BASE}/pdf.worker.min.mjs`;
  const doc = await lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const maxPages = options.maxPages ?? VISUAL_MAX_PAGES;
  const paints = paintIds((lib as { OPS?: Record<string, number> }).OPS);
  const lines: string[] = [];
  const scans: Blob[] = [];
  try {
    if (doc.numPages > maxPages) throw new VisualReadError("That PDF has too many pages to read on this device. Nothing was saved.");
    for (let i = 1; i <= doc.numPages; i++) {
      checkBudget(options.signal, now, started, deadlineMs);
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageLines = pdfItemsToLines(content.items.filter((item) => "str" in item) as unknown as PdfTextItem[]);
      if (pageLines.length) {
        lines.push(...pageLines);
        continue;
      }
      let painted = paints == null;
      if (paints) {
        const list = await page.getOperatorList();
        painted = list.fnArray.some((fn) => paints.has(fn));
      }
      if (!painted) continue;
      const rasterize = options.rasterize ?? rasterizePage;
      const blob = await rasterize(page);
      if (blob) scans.push(blob);
    }
    if (scans.length) lines.push(await ocrBlobs(scans, options, started));
    return lines.filter(Boolean).join("\n");
  } finally {
    await doc.destroy();
  }
}

/** OCR an image in the browser with the self-hosted tesseract.js worker, core and English model. */
export async function imageToText(image: Blob | string, _paths?: { workerPath?: string; corePath?: string; langPath?: string }, signal?: AbortSignal): Promise<string> {
  const started = Date.now();
  const { engine, stop } = await openHostedWorker(signal, Date.now, started, VISUAL_MAX_MS);
  const onAbort = () => stop();
  signal?.addEventListener("abort", onAbort);
  try {
    const { data } = await withDeadline(engine.recognize(image), VISUAL_MAX_MS - (Date.now() - started), stop);
    if (signal?.aborted) throw new VisualReadError(CANCELLED);
    return tidyOcrText(data.text || "");
  } finally {
    signal?.removeEventListener("abort", onAbort);
    stop();
    await engine.terminate().catch(() => undefined);
  }
}

export async function readVisualFile(file: File, signal?: AbortSignal): Promise<{ ok: true; text: string; kind: VisualKind } | { ok: false; error: string }> {
  const kind = visualKindOf(file);
  if (!kind) return { ok: false, error: "Choose a PDF, PNG, JPEG or WebP file." };
  if (file.size > VISUAL_MAX_BYTES) return { ok: false, error: "That file is over 10 MB. Choose a smaller PDF or screenshot." };
  try {
    const text = kind === "pdf" ? await pdfBytesToText(new Uint8Array(await file.arrayBuffer()), undefined, { signal }) : await imageToText(file, undefined, signal);
    if (!text.trim()) return { ok: false, error: kind === "pdf" ? "No text could be read from that PDF on this device. Nothing was saved." : "No text could be read from that image." };
    return { ok: true, text, kind };
  } catch (err) {
    if (err instanceof VisualReadError) return { ok: false, error: err.message };
    return { ok: false, error: "That file could not be read on this device. Nothing was saved." };
  }
}

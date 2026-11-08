/**
 * b97 G-24: read a PDF or a screenshot into plain text in the member's browser, then hand it to the
 * same fixed-rule paste reader (parsePastedTrades) and the same review table. Free and local only:
 * pdf.js reads a PDF's text layer. A PDF whose pages have no text layer is read from those
 * embedded images, in page order and then top-to-bottom, with one tesseract.js worker. A rotated
 * image, a mix of typed pages and scanned pages, or images whose order cannot be placed, is refused.
 * A blank page is not a scan. A canvas redraw is only for a page that is drawn as vectors,
 * with no text layer and no embedded image, and only when the file has no typed pages.
 * The time limit is checked between pages and before each recognize call. It does not interrupt
 * pdf.js while a document is opening, and tesseract.js has no abort argument for one recognize call.
 * Both libraries and the
 * English model are served from this site (public/import-reader), so the file is never uploaded and
 * no paid or AI service is used. Nothing is saved here: the text goes to the review step like pasted text.
 */
export const READER_BASE = "/import-reader";
export const VISUAL_MAX_BYTES = 10 * 1024 * 1024;
/** Contract notes are short. More pages than this are refused before OCR starts. */
export const VISUAL_MAX_PAGES = 15;
/** One embedded image above this is refused. The g24-scan-02 fixture is about 1.8 megapixels. */
export const VISUAL_MAX_PIXELS = 4_000_000;
/** Sum of decoded image pixels in one file. */
export const VISUAL_MAX_TOTAL_PIXELS = 8_000_000;
/** Embedded images in one file. Counted before the bitmap is decoded. */
export const VISUAL_MAX_IMAGES = 8;
/** Canvas fallback pixels. Scale starts at 2 and is reduced to stay under this. */
export const VISUAL_MAX_RASTER_PIXELS = 2_000_000;
/**
 * Checkpoint interval, not a hard stop. Checked before each page and before each recognize call.
 * An in-flight pdf.js open and an in-flight tesseract recognize are not cut off by this timer.
 * Cancel calls worker.terminate(), which is the installed stop API; recognize itself has no abort argument.
 */
export const VISUAL_MAX_MS = 30_000;
export const VISUAL_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

export class VisualReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisualReadError";
  }
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
type PdfImage = { width: number; height: number; data: Uint8Array | Uint8ClampedArray };
type Mat = [number, number, number, number, number, number];
type OcrWorker = { recognize: (image: Blob) => Promise<{ data: { text?: string } }>; terminate: () => Promise<unknown> };

export type PdfTextOptions = {
  signal?: AbortSignal;
  now?: () => number;
  deadlineMs?: number;
  maxPages?: number;
  maxPixels?: number;
  maxTotalPixels?: number;
  maxImages?: number;
  createWorker?: () => Promise<OcrWorker>;
  rasterize?: (page: { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (p: { canvas: HTMLCanvasElement; viewport: { width: number; height: number } }) => { promise: Promise<void> } }) => Promise<Blob | null>;
};

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

function concat(current: Mat, next: Mat): Mat {
  const [a1, b1, c1, d1, e1, f1] = current;
  const [a2, b2, c2, d2, e2, f2] = next;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/** Upright, unmirrored image placement in PDF user space. */
export function imagePlacement(transform: readonly number[]): { top: number; left: number; upright: boolean } {
  const [a, b, c, d, e, f] = transform;
  return {
    left: Math.min(e, e + a),
    top: Math.max(f, f + d),
    upright: a > 0 && d > 0 && Math.abs(b) < 1e-6 && Math.abs(c) < 1e-6,
  };
}

export function orderByPlacement<T extends { top: number; left: number; upright: boolean }>(items: readonly T[]): T[] {
  if (items.some((item) => !item.upright)) {
    throw new VisualReadError("This scanned PDF is rotated or mirrored. Nothing was saved.");
  }
  if (items.length > 1) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (Math.abs(items[i].top - items[j].top) < 1 && Math.abs(items[i].left - items[j].left) < 1) {
          throw new VisualReadError("This scanned PDF has images whose reading order cannot be determined. Nothing was saved.");
        }
      }
    }
  }
  return [...items].sort((p, q) => q.top - p.top || p.left - q.left);
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  const covered = out.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(covered));
  return out;
}

/** PNG of a pdf.js bitmap. Uses CompressionStream so the same bytes work in the browser and in Node. */
export async function bitmapToPng(width: number, height: number, data: Uint8Array | Uint8ClampedArray): Promise<Blob> {
  const pixels = width * height;
  const channels = data.length === pixels * 4 ? 4 : data.length === pixels * 3 ? 3 : data.length === pixels ? 1 : 0;
  if (!channels) throw new Error("unsupported bitmap");
  const color = channels === 4 ? 6 : 2;
  const src = channels === 1 ? new Uint8Array(pixels * 3) : data;
  if (channels === 1) {
    for (let i = 0; i < pixels; i++) src[i * 3] = src[i * 3 + 1] = src[i * 3 + 2] = data[i];
  }
  const stride = (channels === 1 ? 3 : channels) * width;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(src.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const deflated = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = color;
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const bytes = new Uint8Array(signature.length + 12 + ihdr.length + 12 + deflated.length + 12);
  let offset = 0;
  for (const part of [signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", deflated), pngChunk("IEND", new Uint8Array())]) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return new Blob([bytes], { type: "image/png" });
}

function asMatrix(value: unknown): Mat | null {
  if (!Array.isArray(value) || value.length < 6) return null;
  const nums = value.slice(0, 6).map((part) => Number(part));
  if (nums.some((part) => !Number.isFinite(part))) return null;
  return nums as Mat;
}

function drawOperatorIds(ops: Record<string, number>): Set<number> {
  const names = ["fill", "eoFill", "stroke", "fillStroke", "eoFillStroke", "closeStroke", "closeFillStroke", "closeEOFillStroke", "shadingFill", "paintFormXObject"];
  return new Set(names.map((name) => ops[name]).filter((id) => typeof id === "number"));
}

async function placedImages(
  page: { getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>; objs: { get: (name: string) => PdfImage | Promise<PdfImage> } },
  ops: { save: number; restore: number; transform: number; paintImageXObject: number; paintInlineImageXObject: number },
  limits: { maxPixels: number; maxTotalPixels: number; maxImages: number },
  budget: { images: number; pixels: number },
): Promise<{ image: PdfImage; top: number; left: number; upright: boolean }[]> {
  const list = await page.getOperatorList();
  const stack: Mat[] = [];
  let current: Mat = IDENTITY;
  const found: { image: PdfImage; top: number; left: number; upright: boolean }[] = [];
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] || [];
    if (fn === ops.save) stack.push(current);
    else if (fn === ops.restore) current = stack.pop() || IDENTITY;
    else if (fn === ops.transform) {
      const next = asMatrix(args);
      if (next) current = concat(current, next);
    } else if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject) {
      if (budget.images + 1 > limits.maxImages) {
        throw new VisualReadError("That PDF has too many images to read on this device. Nothing was saved.");
      }
      const hintedW = Number(args[1]);
      const hintedH = Number(args[2]);
      if (hintedW > 0 && hintedH > 0 && (hintedW * hintedH > limits.maxPixels || budget.pixels + hintedW * hintedH > limits.maxTotalPixels)) {
        throw new VisualReadError("That image is too large to read on this device. Nothing was saved.");
      }
      const arg = args[0];
      let img: PdfImage | undefined;
      if (arg && typeof arg === "object" && "data" in (arg as PdfImage)) img = arg as PdfImage;
      else if (typeof arg === "string") {
        const got = page.objs.get(arg);
        img = typeof (got as Promise<PdfImage>).then === "function" ? await got : (got as PdfImage);
      }
      if (!img?.width || !img.height || !img.data) {
        throw new VisualReadError("This scanned PDF has an image that could not be placed. Nothing was saved.");
      }
      const pixels = img.width * img.height;
      if (pixels > limits.maxPixels || budget.pixels + pixels > limits.maxTotalPixels) {
        throw new VisualReadError("That image is too large to read on this device. Nothing was saved.");
      }
      budget.images += 1;
      budget.pixels += pixels;
      const place = imagePlacement(current);
      found.push({ image: img, ...place });
    }
  }
  return found;
}

type RasterPage = { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (p: { canvas: HTMLCanvasElement; viewport: { width: number; height: number } }) => { promise: Promise<void> } };

/** Draw one vector page. Scale starts at 2 and drops so the canvas stays within VISUAL_MAX_RASTER_PIXELS. */
export async function rasterizePage(page: RasterPage, doc: Document | undefined = typeof document === "undefined" ? undefined : document): Promise<Blob | null> {
  if (!doc) return null;
  const base = page.getViewport({ scale: 1 });
  const area = Math.max(1, base.width * base.height);
  let scale = 2;
  if (area * scale * scale > VISUAL_MAX_RASTER_PIXELS) scale = Math.sqrt(VISUAL_MAX_RASTER_PIXELS / area);
  if (scale < 0.25) throw new VisualReadError("That page is too large to draw on this device. Nothing was saved.");
  const viewport = page.getViewport({ scale });
  const canvas = doc.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  await page.render({ canvas, viewport }).promise;
  return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

function checkBudget(signal: AbortSignal | undefined, now: () => number, started: number, deadlineMs: number) {
  if (signal?.aborted) throw new VisualReadError("Reading was cancelled. Nothing was saved.");
  if (now() - started > deadlineMs) throw new VisualReadError("That file took too long to read on this device. Nothing was saved.");
}

async function defaultOcrWorker(): Promise<OcrWorker> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: `${READER_BASE}/worker.min.js`,
    corePath: `${READER_BASE}/core`,
    langPath: `${READER_BASE}/lang`,
  });
  return { recognize: (image) => worker.recognize(image), terminate: () => worker.terminate() };
}

async function ocrInOrder(blobs: Blob[], recognize: ((image: Blob) => Promise<string>) | undefined, options: PdfTextOptions, started: number): Promise<string> {
  const now = options.now ?? Date.now;
  const deadlineMs = options.deadlineMs ?? VISUAL_MAX_MS;
  if (recognize) {
    const parts: string[] = [];
    for (const blob of blobs) {
      checkBudget(options.signal, now, started, deadlineMs);
      parts.push(tidyOcrText(await recognize(blob)));
      checkBudget(options.signal, now, started, deadlineMs);
    }
    return parts.filter(Boolean).join("\n");
  }
  checkBudget(options.signal, now, started, deadlineMs);
  const worker = await (options.createWorker ?? defaultOcrWorker)();
  const stop = () => {
    void worker.terminate();
  };
  options.signal?.addEventListener("abort", stop, { once: true });
  try {
    const parts: string[] = [];
    for (const blob of blobs) {
      checkBudget(options.signal, now, started, deadlineMs);
      const { data } = await worker.recognize(blob);
      if (options.signal?.aborted) throw new VisualReadError("Reading was cancelled. Nothing was saved.");
      parts.push(tidyOcrText(data.text || ""));
      checkBudget(options.signal, now, started, deadlineMs);
    }
    return parts.filter(Boolean).join("\n");
  } finally {
    options.signal?.removeEventListener("abort", stop);
    await worker.terminate();
  }
}

export async function pdfBytesToText(bytes: Uint8Array, pdfjs?: PdfJs, recognize?: (image: Blob) => Promise<string>, options: PdfTextOptions = {}): Promise<string> {
  const now = options.now ?? Date.now;
  const started = now();
  const deadlineMs = options.deadlineMs ?? VISUAL_MAX_MS;
  checkBudget(options.signal, now, started, deadlineMs);
  const lib = pdfjs ?? (await import("pdfjs-dist/legacy/build/pdf.mjs"));
  if (typeof window !== "undefined" && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = `${READER_BASE}/pdf.worker.min.mjs`;
  const doc = await lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const maxPages = options.maxPages ?? VISUAL_MAX_PAGES;
  const limits = {
    maxPixels: options.maxPixels ?? VISUAL_MAX_PIXELS,
    maxTotalPixels: options.maxTotalPixels ?? VISUAL_MAX_TOTAL_PIXELS,
    maxImages: options.maxImages ?? VISUAL_MAX_IMAGES,
  };
  const budget = { images: 0, pixels: 0 };
  const drawIds = drawOperatorIds(lib.OPS as unknown as Record<string, number>);
  try {
    checkBudget(options.signal, now, started, deadlineMs);
    if (doc.numPages > maxPages) throw new VisualReadError("That PDF has too many pages to read on this device. Nothing was saved.");
    const pages: { number: number; lines: string[]; placed: { image: PdfImage; top: number; left: number; upright: boolean }[]; vector: boolean }[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      checkBudget(options.signal, now, started, deadlineMs);
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const lines = pdfItemsToLines(content.items.filter((item) => "str" in item) as unknown as PdfTextItem[]);
      const list = await page.getOperatorList();
      const draws = list.fnArray.some((fn) => drawIds.has(fn));
      if (lines.length) {
        // A typed page keeps its text layer. An image on that page is not treated as trades.
        pages.push({ number: i, lines, placed: [], vector: false });
        continue;
      }
      const placed = await placedImages(page, lib.OPS, limits, budget);
      pages.push({ number: i, lines: [], placed, vector: placed.length === 0 && draws });
    }
    const typed = pages.some((page) => page.lines.length);
    const scanned = pages.some((page) => page.placed.length > 0);
    const vector = pages.some((page) => page.vector);
    if (typed && scanned) {
      throw new VisualReadError("This PDF mixes typed pages and scanned pages. Nothing was saved.");
    }
    if (scanned && vector) {
      throw new VisualReadError("This PDF mixes embedded scans and vector drawings. Nothing was saved.");
    }
    if (typed) return pages.map((page) => page.lines.join("\n")).filter(Boolean).join("\n");
    if (vector) {
      const rasterize = options.rasterize ?? rasterizePage;
      const blobs: Blob[] = [];
      for (const page of pages) {
        if (!page.vector) continue;
        checkBudget(options.signal, now, started, deadlineMs);
        const blob = await rasterize(await doc.getPage(page.number));
        if (blob) blobs.push(blob);
      }
      if (!blobs.length) return "";
      return ocrInOrder(blobs, recognize, options, started);
    }
    const blobs: Blob[] = [];
    for (const page of pages) {
      checkBudget(options.signal, now, started, deadlineMs);
      for (const placed of orderByPlacement(page.placed)) blobs.push(await bitmapToPng(placed.image.width, placed.image.height, placed.image.data));
    }
    if (!blobs.length) return "";
    return ocrInOrder(blobs, recognize, options, started);
  } finally {
    await doc.destroy();
  }
}

/** OCR an image in the browser with the self-hosted tesseract.js worker, core and English model. */
export async function imageToText(image: Blob | string, paths?: { workerPath?: string; corePath?: string; langPath?: string }, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new VisualReadError("Reading was cancelled. Nothing was saved.");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: paths?.workerPath ?? `${READER_BASE}/worker.min.js`,
    corePath: paths?.corePath ?? `${READER_BASE}/core`,
    langPath: paths?.langPath ?? `${READER_BASE}/lang`,
  });
  try {
    if (signal?.aborted) throw new VisualReadError("Reading was cancelled. Nothing was saved.");
    const { data } = await worker.recognize(image);
    if (signal?.aborted) throw new VisualReadError("Reading was cancelled. Nothing was saved.");
    return tidyOcrText(data.text || "");
  } finally {
    await worker.terminate();
  }
}

export async function readVisualFile(file: File, signal?: AbortSignal): Promise<{ ok: true; text: string; kind: VisualKind } | { ok: false; error: string }> {
  const kind = visualKindOf(file);
  if (!kind) return { ok: false, error: "Choose a PDF, PNG, JPEG or WebP file." };
  if (file.size > VISUAL_MAX_BYTES) return { ok: false, error: "That file is over 10 MB. Choose a smaller PDF or screenshot." };
  try {
    const text = kind === "pdf" ? await pdfBytesToText(new Uint8Array(await file.arrayBuffer()), undefined, undefined, { signal }) : await imageToText(file, undefined, signal);
    if (!text.trim()) return { ok: false, error: kind === "pdf" ? "No text could be read from that PDF on this device. Nothing was saved." : "No text could be read from that image." };
    return { ok: true, text, kind };
  } catch (err) {
    if (err instanceof VisualReadError) return { ok: false, error: err.message };
    return { ok: false, error: "That file could not be read on this device. Nothing was saved." };
  }
}

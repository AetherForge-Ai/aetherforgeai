/**
 * b97 G-24: read a PDF or a screenshot into plain text in the member's browser, then hand it to the
 * same fixed-rule paste reader (parsePastedTrades) and the same review table. Free and local only:
 * pdf.js reads a PDF's text layer; a page with no text layer is rasterized from its embedded image,
 * or drawn to a canvas, and read with the same tesseract.js path as a PNG. Both libraries and the
 * English model are served from this site (public/import-reader), so the file is never uploaded and
 * no paid or AI service is used. Nothing is saved here: the text goes to the review step like pasted text.
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
type PdfImage = { width: number; height: number; data: Uint8Array | Uint8ClampedArray };

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

async function imagesOnPage(page: { getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>; objs: { get: (name: string) => Promise<PdfImage> } }, paintImage: number, paintInline: number): Promise<PdfImage[]> {
  const ops = await page.getOperatorList();
  const found: PdfImage[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (fn !== paintImage && fn !== paintInline) continue;
    const arg = ops.argsArray[i]?.[0];
    let img: PdfImage | undefined;
    if (arg && typeof arg === "object" && "data" in arg) img = arg as PdfImage;
    else if (typeof arg === "string") {
      try {
        const got = page.objs.get(arg) as PdfImage | Promise<PdfImage>;
        if (typeof (got as Promise<PdfImage>).then === "function") img = await got;
        else img = got as PdfImage;
      } catch {
        img = undefined;
      }
    }
    if (!img?.width || !img.height || !img.data) continue;
    const area = img.width * img.height;
    if (area < 200 * 50 && found.length) continue;
    found.push(img);
  }
  return found.sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 4);
}

async function rasterizePage(page: { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (p: { canvas: HTMLCanvasElement; viewport: { width: number; height: number } }) => { promise: Promise<void> } }): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

export async function pdfBytesToText(bytes: Uint8Array, pdfjs?: PdfJs, recognize: (image: Blob) => Promise<string> = imageToText): Promise<string> {
  const lib = pdfjs ?? (await import("pdfjs-dist/legacy/build/pdf.mjs"));
  if (typeof window !== "undefined" && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = `${READER_BASE}/pdf.worker.min.mjs`;
  const doc = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const parts: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const lines = pdfItemsToLines(content.items.filter((x) => "str" in x) as unknown as PdfTextItem[]);
      if (lines.length) {
        parts.push(lines.join("\n"));
        continue;
      }
      const images = await imagesOnPage(page, lib.OPS.paintImageXObject, lib.OPS.paintInlineImageXObject);
      let recognized = "";
      for (const img of images) {
        try {
          const text = tidyOcrText(await recognize(await bitmapToPng(img.width, img.height, img.data)));
          if (text) recognized = recognized ? `${recognized}\n${text}` : text;
        } catch {
          // This bitmap could not be read. Other pages still contribute their text.
        }
      }
      if (!recognized) {
        const raster = await rasterizePage(page).catch(() => null);
        if (raster) {
          try {
            recognized = tidyOcrText(await recognize(raster));
          } catch {
            recognized = "";
          }
        }
      }
      if (recognized) parts.push(recognized);
    }
  } finally {
    await doc.destroy();
  }
  return parts.join("\n");
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
    if (!text.trim()) return { ok: false, error: kind === "pdf" ? "No text could be read from that PDF on this device. Nothing was saved." : "No text could be read from that image." };
    return { ok: true, text, kind };
  } catch {
    return { ok: false, error: "That file could not be read on this device. Nothing was saved." };
  }
}

import { db, type Doc, type DocKind, type Settings } from "../db";
import { activeConfig, complete } from "../llm";
import type { ImagePart } from "../llm/types";
import { LOW_TEXT_CHARS, chunkPages, cleanText, textToPages, type PageText } from "./chunk";
import { resetSearchCache } from "./search";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

async function pdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= (async () => {
    const lib = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  })();
  return pdfjsPromise;
}

export type Progress = (done: number, total: number) => void;

export async function extractPdf(data: ArrayBuffer, onProgress?: Progress): Promise<PageText[]> {
  const lib = await pdfjs();
  const pdf = await lib.getDocument({ data: new Uint8Array(data) }).promise;
  const pages: PageText[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str + (item.hasEOL ? "\n" : " ");
    }
    pages.push({ page: i, text: cleanText(text) });
    page.cleanup();
    onProgress?.(i, pdf.numPages);
  }
  await pdf.destroy();
  return pages;
}

/** Render one PDF page to a JPEG (for AI transcription of scanned pages). */
export async function renderPdfPage(data: ArrayBuffer, pageNo: number, scale = 1.7): Promise<ImagePart> {
  const lib = await pdfjs();
  const pdf = await lib.getDocument({ data: new Uint8Array(data) }).promise;
  try {
    const page = await pdf.getPage(pageNo);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
    return { type: "image", mimeType: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.82).split(",")[1] };
  } finally {
    await pdf.destroy();
  }
}

export async function fileToImagePart(file: Blob, maxSide = 2000): Promise<ImagePart> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { type: "image", mimeType: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1] };
}

export async function transcribeImage(settings: Settings, image: ImagePart, signal?: AbortSignal): Promise<string> {
  const { provider } = activeConfig(settings);
  if (!provider.vision) throw new Error("vision-unsupported");
  const system =
    "You transcribe study material. Output only the text visible in the image, in its original language, " +
    "keeping headings, lists and paragraph breaks. Write formulas in LaTeX between $...$. Describe diagrams in one short line in [brackets]. " +
    "No commentary.";
  return complete(settings, {
    system,
    messages: [{ role: "user", content: [image, { type: "text", text: "Transcribe this page." }] }],
    maxTokens: 4096,
    signal,
  });
}

export function kindForFile(file: File): DocKind | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|heic)$/.test(name)) return "image";
  if (file.type.startsWith("text/") || /\.(txt|md|markdown)$/.test(name)) return "text";
  return null;
}

export async function saveDocument(doc: Omit<Doc, "id" | "createdAt" | "lowTextPages" | "pageCount">, pages: PageText[], file?: File): Promise<number> {
  const lowTextPages = pages.filter((p) => p.text.length < LOW_TEXT_CHARS).map((p) => p.page);
  const docId = (await db.transaction("rw", [db.docs, db.files, db.chunks], async () => {
    const id = await db.docs.add({ ...doc, pageCount: pages.length, lowTextPages, createdAt: Date.now() } as Doc);
    if (file) await db.files.put({ docId: id as number, blob: file, name: file.name });
    await db.chunks.bulkAdd(chunkPages(pages).map((c) => ({ ...c, docId: id as number, subjectId: doc.subjectId })));
    return id;
  })) as number;
  resetSearchCache();
  return docId;
}

/** Replace the text of one page (after AI transcription). */
export async function replacePageText(docId: number, page: number, text: string): Promise<void> {
  const doc = await db.docs.get(docId);
  if (!doc) return;
  await db.transaction("rw", [db.docs, db.chunks], async () => {
    await db.chunks.where("docId").equals(docId).filter((c) => c.page === page).delete();
    await db.chunks.bulkAdd(chunkPages([{ page, text }]).map((c) => ({ ...c, docId, subjectId: doc.subjectId })));
    if (text.length >= LOW_TEXT_CHARS) await db.docs.update(docId, { lowTextPages: doc.lowTextPages.filter((p) => p !== page) });
  });
  resetSearchCache();
}

export interface IngestOptions {
  subjectId: number;
  settings: Settings;
  onProgress?: Progress;
  signal?: AbortSignal;
}

export async function ingestFile(file: File, opts: IngestOptions): Promise<number> {
  const kind = kindForFile(file);
  const title = file.name.replace(/\.[^.]+$/, "");
  if (kind === "pdf") {
    const pages = await extractPdf(await file.arrayBuffer(), opts.onProgress);
    return saveDocument({ subjectId: opts.subjectId, title, kind }, pages, file);
  }
  if (kind === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return saveDocument({ subjectId: opts.subjectId, title, kind }, textToPages(value));
  }
  if (kind === "text") {
    return saveDocument({ subjectId: opts.subjectId, title, kind }, textToPages(await file.text()));
  }
  if (kind === "image") {
    opts.onProgress?.(0, 1);
    const text = await transcribeImage(opts.settings, await fileToImagePart(file), opts.signal);
    opts.onProgress?.(1, 1);
    return saveDocument({ subjectId: opts.subjectId, title, kind }, [{ page: 1, text }], file);
  }
  throw new Error("unsupported-file");
}

export async function documentText(docId: number, fromPage = 1, toPage = Number.MAX_SAFE_INTEGER): Promise<{ page: number; text: string }[]> {
  const chunks = await db.chunks.where("docId").equals(docId).toArray();
  const byPage = new Map<number, string[]>();
  for (const c of chunks) {
    if (c.page < fromPage || c.page > toPage) continue;
    byPage.set(c.page, [...(byPage.get(c.page) ?? []), c.text]);
  }
  return [...byPage.entries()].sort((a, b) => a[0] - b[0]).map(([page, parts]) => ({ page, text: parts.join("\n") }));
}

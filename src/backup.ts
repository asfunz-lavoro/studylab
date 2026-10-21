import JSZip from "jszip";
import { db, type Flashcard, type Note, type Subject } from "./db";
import { resetSearchCache } from "./rag/search";

const BACKUP_VERSION = 1;

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "Untitled";
}

function yaml(fields: Record<string, string | number | string[] | undefined>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => (Array.isArray(v) ? `${k}:\n${v.map((x) => `  - ${JSON.stringify(x)}`).join("\n")}` : `${k}: ${JSON.stringify(v)}`));
  return `---\n${lines.join("\n")}\n---\n\n`;
}

/**
 * Export an Obsidian-ready vault: one folder per subject with notes, saved papers as
 * literature notes, and flashcards in the Spaced Repetition plugin's `Q :: A` format.
 */
export async function exportObsidianZip(): Promise<Blob> {
  const zip = new JSZip();
  const subjects = await db.subjects.toArray();
  const byId = new Map(subjects.map((s) => [s.id!, s]));
  // zip.file() overwrites same-named entries, and Windows/macOS folders are case-insensitive,
  // so every path gets a " (2)", " (3)"… suffix when its name is already taken.
  const taken = new Set<string>();
  const unique = (dir: string, name: string, ext = "") => {
    let candidate = `${dir}${name}`;
    for (let i = 2; taken.has(`${candidate}${ext}`.toLowerCase()); i++) candidate = `${dir}${name} (${i})`;
    taken.add(`${candidate}${ext}`.toLowerCase());
    return `${candidate}${ext}`;
  };
  const folders = new Map(subjects.map((s) => [s.id!, unique("", safeName(s.name))]));
  const folder = (subjectId: number) => folders.get(subjectId) ?? (folders.set(subjectId, unique("", "General")), folders.get(subjectId)!);

  for (const n of await db.notes.toArray()) {
    zip.file(unique(`${folder(n.subjectId)}/`, safeName(n.title), ".md"), yaml({ type: "note", subject: byId.get(n.subjectId)?.name, created: new Date(n.createdAt).toISOString().slice(0, 10) }) + n.content);
  }
  for (const d of await db.docs.toArray()) {
    if (d.kind !== "paper" || !d.paper) continue;
    const p = d.paper;
    const body = [
      `# ${d.title}`,
      "",
      p.tldr ? `> [!abstract] TL;DR\n> ${p.tldr}\n` : "",
      p.url ? `- Semantic Scholar: ${p.url}` : "",
      p.openAccessPdf ? `- PDF: ${p.openAccessPdf}` : "",
      p.doi ? `- DOI: https://doi.org/${p.doi}` : "",
    ].filter(Boolean);
    const chunks = await db.chunks.where("docId").equals(d.id!).toArray();
    zip.file(
      unique(`${folder(d.subjectId)}/Papers/`, safeName(d.title), ".md"),
      yaml({ type: "literature-note", authors: p.authors, year: p.year, venue: p.venue, citation_count: p.citationCount }) + body.join("\n") + "\n\n" + chunks.map((c) => c.text).join("\n"),
    );
  }
  const decks = new Map<number, Flashcard[]>();
  for (const c of await db.cards.toArray()) decks.set(c.subjectId, [...(decks.get(c.subjectId) ?? []), c]);
  for (const [subjectId, cards] of decks) {
    const lines = cards.map((c) => `${c.front.replace(/\n/g, " ")} :: ${c.back.replace(/\n/g, " ")}`);
    zip.file(unique(`${folder(subjectId)}/`, "Flashcards", ".md"), `#flashcard\n\n${lines.join("\n\n")}\n`);
  }
  return zip.generateAsync({ type: "blob" });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Full backup as a zip: data.json plus original files. API keys are left out on purpose. */
export async function exportBackup(includeFiles: boolean): Promise<Blob> {
  const zip = new JSZip();
  const settings = await db.settings.get("app");
  const data = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: settings ? { lang: settings.lang, level: settings.level, name: settings.name } : null,
    subjects: await db.subjects.toArray(),
    docs: await db.docs.toArray(),
    chunks: await db.chunks.toArray(),
    notes: await db.notes.toArray(),
    cards: await db.cards.toArray(),
    chats: await db.chats.toArray(),
  };
  zip.file("data.json", JSON.stringify(data));
  if (includeFiles) {
    for (const f of await db.files.toArray()) zip.file(`files/${f.docId}`, await blobToBase64(f.blob), { base64: true });
    zip.file("files/index.json", JSON.stringify((await db.files.toArray()).map((f) => ({ docId: f.docId, name: f.name, type: f.blob.type }))));
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

/** Restore a backup, replacing current study data (settings and API keys are kept). */
export async function importBackup(file: Blob): Promise<void> {
  const zip = await JSZip.loadAsync(file);
  const raw = await zip.file("data.json")?.async("string");
  if (!raw) throw new Error("not-a-backup");
  const data = JSON.parse(raw) as {
    version: number;
    subjects: Subject[];
    docs: unknown[];
    chunks: unknown[];
    notes: Note[];
    cards: Flashcard[];
    chats: unknown[];
  };
  if (data.version !== BACKUP_VERSION) throw new Error("unknown-backup-version");
  const index = JSON.parse((await zip.file("files/index.json")?.async("string")) ?? "[]") as { docId: number; name: string; type: string }[];
  const files = await Promise.all(
    index.map(async (f) => ({ docId: f.docId, name: f.name, blob: base64ToBlob((await zip.file(`files/${f.docId}`)?.async("base64")) ?? "", f.type) })),
  );
  const revive = (c: Flashcard): Flashcard => ({
    ...c,
    srs: { ...c.srs, due: new Date(c.srs.due), last_review: c.srs.last_review ? new Date(c.srs.last_review) : undefined },
  });
  await db.transaction("rw", [db.subjects, db.docs, db.chunks, db.notes, db.cards, db.chats, db.files], async () => {
    await Promise.all([db.subjects.clear(), db.docs.clear(), db.chunks.clear(), db.notes.clear(), db.cards.clear(), db.chats.clear(), db.files.clear()]);
    await db.subjects.bulkAdd(data.subjects);
    await db.docs.bulkAdd(data.docs as never[]);
    await db.chunks.bulkAdd(data.chunks as never[]);
    await db.notes.bulkAdd(data.notes);
    await db.cards.bulkAdd(data.cards.map(revive));
    await db.chats.bulkAdd(data.chats as never[]);
    await db.files.bulkAdd(files);
  });
  resetSearchCache();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

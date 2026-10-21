import Dexie, { type EntityTable } from "dexie";
import type { Card as FsrsCard } from "ts-fsrs";

export type Lang = "it" | "en";
export type Level = "school" | "university";

export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface Settings {
  id: "app";
  onboarded: boolean;
  lang: Lang;
  level: Level;
  name: string;
  provider: string;
  providers: Record<string, ProviderConfig>;
  s2Key: string;
}

export interface Subject {
  id?: number;
  name: string;
  color: string;
  createdAt: number;
}

export type DocKind = "pdf" | "text" | "docx" | "image" | "paper";

export interface PaperMeta {
  paperId: string;
  authors: string[];
  year?: number;
  venue?: string;
  url?: string;
  doi?: string;
  openAccessPdf?: string;
  citationCount?: number;
  tldr?: string;
}

export interface Doc {
  id?: number;
  subjectId: number;
  title: string;
  kind: DocKind;
  pageCount: number;
  /** Pages with almost no extractable text (scans or photos), 1-based. */
  lowTextPages: number[];
  createdAt: number;
  paper?: PaperMeta;
}

/** Original upload, kept so the PDF can be opened at a cited page. */
export interface DocFile {
  docId: number;
  blob: Blob;
  name: string;
}

export interface Chunk {
  id?: number;
  docId: number;
  subjectId: number;
  page: number;
  text: string;
}

export interface Note {
  id?: number;
  subjectId: number;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface Flashcard {
  id?: number;
  subjectId: number;
  docId?: number;
  page?: number;
  front: string;
  back: string;
  createdAt: number;
  srs: FsrsCard;
}

export interface Source {
  n: number;
  docId: number;
  page: number;
  title: string;
  text: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  error?: boolean;
}

export interface Chat {
  id?: number;
  subjectId: number | null;
  title: string;
  mode: TutorMode;
  turns: ChatTurn[];
  updatedAt: number;
}

export type TutorMode = "explain" | "quiz" | "simplify";

export class StudyDB extends Dexie {
  settings!: EntityTable<Settings, "id">;
  subjects!: EntityTable<Subject, "id">;
  docs!: EntityTable<Doc, "id">;
  files!: EntityTable<DocFile, "docId">;
  chunks!: EntityTable<Chunk, "id">;
  notes!: EntityTable<Note, "id">;
  cards!: EntityTable<Flashcard, "id">;
  chats!: EntityTable<Chat, "id">;

  constructor(name = "studylab") {
    super(name);
    this.version(1).stores({
      settings: "id",
      subjects: "++id, name",
      docs: "++id, subjectId, createdAt",
      files: "docId",
      chunks: "++id, docId, subjectId",
      notes: "++id, subjectId, updatedAt",
      cards: "++id, subjectId, docId, srs.due",
      chats: "++id, subjectId, updatedAt",
    });
  }
}

export const db = new StudyDB();

export const SUBJECT_COLORS = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#db2777", "#7c3aed", "#475569"];

export function defaultSettings(lang: Lang): Settings {
  return { id: "app", onboarded: false, lang, level: "school", name: "", provider: "gemini", providers: {}, s2Key: "" };
}

export async function deleteDoc(docId: number): Promise<void> {
  await db.transaction("rw", [db.docs, db.files, db.chunks, db.cards], async () => {
    await db.chunks.where("docId").equals(docId).delete();
    await db.cards.where("docId").equals(docId).modify((c) => {
      delete c.docId;
      delete c.page;
    });
    await db.files.delete(docId);
    await db.docs.delete(docId);
  });
}

export async function deleteSubject(subjectId: number): Promise<void> {
  const docs = await db.docs.where("subjectId").equals(subjectId).primaryKeys();
  await db.transaction("rw", [db.subjects, db.docs, db.files, db.chunks, db.notes, db.cards, db.chats], async () => {
    await db.files.bulkDelete(docs as number[]);
    await db.chunks.where("subjectId").equals(subjectId).delete();
    await db.docs.where("subjectId").equals(subjectId).delete();
    await db.notes.where("subjectId").equals(subjectId).delete();
    await db.cards.where("subjectId").equals(subjectId).delete();
    await db.chats.where("subjectId").equals(subjectId).delete();
    await db.subjects.delete(subjectId);
  });
}

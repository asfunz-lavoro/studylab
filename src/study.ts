import { Rating, createEmptyCard, fsrs, type Grade } from "ts-fsrs";
import { db, type Flashcard, type Settings } from "./db";
import { complete } from "./llm";
import { parseJSONLoose } from "./llm/json";
import { flashcardSystem, pagesForPrompt, quizSystem, summarySystem } from "./prompts";
import { documentText } from "./rag/ingest";

/** ~15k tokens of material per request keeps free tiers and small local models happy. */
export const MAX_MATERIAL_CHARS = 60_000;

export interface MaterialSelection {
  docId?: number;
  fromPage?: number;
  toPage?: number;
  /** Free text (e.g. a note) instead of a document. */
  text?: string;
}

export interface Material {
  text: string;
  truncated: boolean;
  usedThrough: number;
}

export async function loadMaterial(sel: MaterialSelection): Promise<Material> {
  if (sel.text != null) {
    const truncated = sel.text.length > MAX_MATERIAL_CHARS;
    return { text: sel.text.slice(0, MAX_MATERIAL_CHARS), truncated, usedThrough: 0 };
  }
  const pages = await documentText(sel.docId!, sel.fromPage ?? 1, sel.toPage ?? Number.MAX_SAFE_INTEGER);
  return pagesForPrompt(pages, MAX_MATERIAL_CHARS);
}

export interface DraftCard {
  front: string;
  back: string;
  page?: number;
}

export async function generateFlashcards(settings: Settings, material: Material, count: number, signal?: AbortSignal, onWait?: (s: number) => void): Promise<DraftCard[]> {
  const raw = await complete(
    settings,
    { system: flashcardSystem(settings.lang, settings.level, count), messages: [{ role: "user", content: material.text }], json: true, maxTokens: 8192, signal },
    onWait,
  );
  const { cards = [] } = parseJSONLoose<{ cards?: DraftCard[] }>(raw);
  return cards
    .filter((c) => typeof c.front === "string" && typeof c.back === "string" && c.front.trim() && c.back.trim())
    .map((c) => ({ front: c.front.trim(), back: c.back.trim(), page: Number.isFinite(Number(c.page)) ? Number(c.page) : undefined }));
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  page?: number;
}

export async function generateQuiz(settings: Settings, material: Material, count: number, signal?: AbortSignal, onWait?: (s: number) => void): Promise<QuizQuestion[]> {
  const raw = await complete(
    settings,
    { system: quizSystem(settings.lang, settings.level, count), messages: [{ role: "user", content: material.text }], json: true, maxTokens: 8192, signal },
    onWait,
  );
  const { questions = [] } = parseJSONLoose<{ questions?: QuizQuestion[] }>(raw);
  return questions.filter(
    (q) => typeof q.question === "string" && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length,
  );
}

export async function generateSummary(
  settings: Settings,
  material: Material,
  style: "summary" | "outline" | "keyconcepts",
  onText: (t: string) => void,
  signal?: AbortSignal,
  onWait?: (s: number) => void,
): Promise<string> {
  return complete(settings, { system: summarySystem(settings.lang, settings.level, style), messages: [{ role: "user", content: material.text }], maxTokens: 8192, signal, onText }, onWait);
}

// ------------------------------------------------------------ spaced repetition

const scheduler = fsrs({ enable_fuzz: true, request_retention: 0.9 });

export function newCard(subjectId: number, front: string, back: string, docId?: number, page?: number): Flashcard {
  return { subjectId, front, back, docId, page, createdAt: Date.now(), srs: createEmptyCard(new Date()) };
}

export async function dueCards(subjectId: number | null, now = new Date()): Promise<Flashcard[]> {
  const due = await db.cards.where("srs.due").belowOrEqual(now).toArray();
  return due.filter((c) => subjectId == null || c.subjectId === subjectId).sort((a, b) => +new Date(a.srs.due) - +new Date(b.srs.due));
}

export async function gradeCard(card: Flashcard, grade: Grade, now = new Date()): Promise<Flashcard> {
  const { card: next } = scheduler.next(card.srs, now, grade);
  const updated = { ...card, srs: next };
  await db.cards.put(updated);
  return updated;
}

/** Human-friendly next interval for each button, e.g. { Again: "1m", Good: "3d" }. */
export function previewIntervals(card: Flashcard, now = new Date()): Record<"again" | "hard" | "good" | "easy", number> {
  const pre = scheduler.repeat(card.srs, now);
  const ms = (g: Grade) => +new Date(pre[g].card.due) - +now;
  return { again: ms(Rating.Again), hard: ms(Rating.Hard), good: ms(Rating.Good), easy: ms(Rating.Easy) };
}

export { Rating };

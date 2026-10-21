import { db, type ChatTurn, type Settings, type Source, type TutorMode } from "./db";
import { complete } from "./llm";
import { parseJSONLoose } from "./llm/json";
import type { LLMMessage } from "./llm/types";
import { queryRewriteSystem, sourcesBlock, tutorSystem } from "./prompts";
import { searchChunks, type Hit } from "./rag/search";

const MAX_SOURCES = 6;
const HISTORY_TURNS = 8;

async function hitsToSources(hits: Hit[]): Promise<Source[]> {
  const titles = new Map<number, string>();
  for (const id of new Set(hits.map((h) => h.docId))) titles.set(id, (await db.docs.get(id))?.title ?? "?");
  return hits.map((h, i) => ({ n: i + 1, docId: h.docId, page: h.page, title: titles.get(h.docId) ?? "?", text: h.text }));
}

/**
 * Find course-material passages for a question. When the literal question finds little
 * (other language, synonyms), ask the model for keyword queries and search again.
 */
export async function retrieve(settings: Settings, question: string, subjectId: number | null, signal?: AbortSignal): Promise<Source[]> {
  const scope = subjectId == null ? db.chunks.toCollection() : db.chunks.where("subjectId").equals(subjectId);
  if ((await scope.count()) === 0) return [];
  let hits = await searchChunks(question, subjectId, MAX_SOURCES);
  if (hits.length < 3) {
    try {
      const raw = await complete(settings, { system: queryRewriteSystem(), messages: [{ role: "user", content: question }], maxTokens: 300, json: true, signal });
      const { queries = [] } = parseJSONLoose<{ queries?: string[] }>(raw);
      const seen = new Set(hits.map((h) => h.chunkId));
      for (const q of queries.slice(0, 3)) {
        for (const h of await searchChunks(q, subjectId, MAX_SOURCES)) {
          if (!seen.has(h.chunkId)) {
            seen.add(h.chunkId);
            hits.push(h);
          }
        }
      }
      hits = hits.sort((a, b) => b.score - a.score).slice(0, MAX_SOURCES);
    } catch (err) {
      if ((err as { kind?: string }).kind === "aborted") throw err;
      // Rewrite is a best-effort boost; answer with what the literal search found.
    }
  }
  return hitsToSources(hits);
}

export interface AskOptions {
  settings: Settings;
  subjectId: number | null;
  mode: TutorMode;
  history: ChatTurn[];
  question: string;
  signal?: AbortSignal;
  onText: (text: string) => void;
  onSources: (sources: Source[]) => void;
  onWait?: (seconds: number) => void;
}

export async function askTutor(o: AskOptions): Promise<{ text: string; sources: Source[] }> {
  // In quiz mode the student's reply is an answer, not a search query: retrieve on the conversation topic.
  const lastQuestion = o.mode === "quiz" ? [...o.history].reverse().find((t) => t.role === "user")?.content ?? o.question : o.question;
  const sources = await retrieve(o.settings, o.mode === "quiz" ? `${lastQuestion} ${o.question}` : o.question, o.subjectId, o.signal);
  o.onSources(sources);
  const messages: LLMMessage[] = o.history
    .filter((t) => !t.error)
    .slice(-HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: t.content }));
  messages.push({ role: "user", content: o.question + sourcesBlock(sources) });
  const text = await complete(
    o.settings,
    {
      system: tutorSystem(o.settings.lang, o.settings.level, o.mode, o.settings.name, sources.length > 0),
      messages,
      signal: o.signal,
      onText: o.onText,
    },
    o.onWait,
  );
  return { text, sources };
}

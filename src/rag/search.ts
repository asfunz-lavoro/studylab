import MiniSearch from "minisearch";
import { db, type Chunk } from "../db";

const STOPWORDS = new Set(
  (
    "a ad al alla alle allo ai agli all anche che chi ci come con cosa cui da dal dalla dalle dei degli del della delle dello di e ed è era " +
    "fra gli ha hanno i il in io la le lei lo loro lui ma mi ne nei negli nel nella nelle nello noi non o per perché più può quale quali " +
    "quando questa queste questi questo se si sia sono su sua sue sui sul sulla suo suoi tra tu un una uno vi voi " +
    "the of and or to in on for with by from at as is are was were be been it its this that these those an how what why when which " +
    "who do does did can could would should will about into than then there their they them not no"
  )
    .split(" ")
    .map((w) => fold(w)),
);

function fold(term: string): string {
  return term.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/** Lowercase, strip accents, and crudely trim Italian/English inflections so "cellule" finds "cellula". */
export function normalizeTerm(term: string): string | null {
  const t = fold(term);
  if (t.length < 2 || STOPWORDS.has(t)) return null;
  if (t.length > 5) return t.replace(/(azioni|azione|mente|ing|ies|es|s|i|e|a|o)$/, "");
  return t;
}

interface Indexed {
  key: string;
  index: MiniSearch<Chunk>;
}
let cache: Indexed | null = null;

async function getIndex(subjectId: number | null): Promise<MiniSearch<Chunk>> {
  const collection = subjectId == null ? db.chunks.toCollection() : db.chunks.where("subjectId").equals(subjectId);
  const count = await collection.count();
  const lastId = (await db.chunks.orderBy(":id").last())?.id ?? 0;
  const key = `${subjectId ?? "all"}:${count}:${lastId}`;
  if (cache?.key === key) return cache.index;
  const index = new MiniSearch<Chunk>({
    fields: ["text"],
    storeFields: ["docId", "subjectId", "page", "text"],
    processTerm: normalizeTerm,
    searchOptions: { prefix: true, fuzzy: 0.15, combineWith: "OR" },
  });
  index.addAll(await collection.toArray());
  cache = { key, index };
  return index;
}

export interface Hit {
  chunkId: number;
  docId: number;
  page: number;
  text: string;
  score: number;
}

/** Best chunks for a query, at most `perDoc` from the same page range of one document. */
export async function searchChunks(query: string, subjectId: number | null, limit = 6): Promise<Hit[]> {
  const index = await getIndex(subjectId);
  const results = index.search(query);
  const hits: Hit[] = [];
  const seenPages = new Set<string>();
  for (const r of results) {
    const key = `${r.docId}:${r.page}`;
    if (seenPages.has(key)) continue;
    seenPages.add(key);
    hits.push({ chunkId: r.id as number, docId: r.docId as number, page: r.page as number, text: r.text as string, score: r.score });
    if (hits.length >= limit) break;
  }
  return hits;
}

export function resetSearchCache(): void {
  cache = null;
}

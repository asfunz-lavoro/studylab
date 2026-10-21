import type { PaperMeta } from "./db";

const BASE = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "title,abstract,year,venue,authors,citationCount,externalIds,url,openAccessPdf,tldr";

export type PaperSource = "s2" | "openalex";

export interface S2Paper {
  paperId: string;
  title: string;
  abstract?: string | null;
  year?: number | null;
  venue?: string | null;
  authors?: { name: string }[];
  citationCount?: number | null;
  externalIds?: Record<string, string> | null;
  url?: string | null;
  openAccessPdf?: { url?: string | null } | null;
  tldr?: { text?: string | null } | null;
  source?: PaperSource;
}

export class S2Error extends Error {
  constructor(
    public kind: "rateLimit" | "network" | "other",
    message: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SearchOptions {
  apiKey?: string;
  year?: string;
  limit?: number;
  onRetry?: (attempt: number) => void;
}

/**
 * Semantic Scholar search. Its shared keyless pool is often saturated, and those HTTP 429
 * replies carry no CORS header, so the browser reports them as a network error (Firefox:
 * "NetworkError when attempting to fetch resource"). Both cases are retried with backoff.
 */
async function searchS2(query: string, opts: SearchOptions, attempts: number): Promise<S2Paper[]> {
  const params = new URLSearchParams({ query, limit: String(opts.limit ?? 10), fields: FIELDS });
  if (opts.year) params.set("year", opts.year);
  const headers: Record<string, string> = opts.apiKey ? { "x-api-key": opts.apiKey } : {};
  let lastKind: S2Error["kind"] = "rateLimit";
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      opts.onRetry?.(attempt);
      await sleep(1500 * 2 ** (attempt - 1) + Math.random() * 500);
    }
    let res: Response;
    try {
      res = await fetch(`${BASE}/paper/search?${params}`, { headers });
    } catch {
      lastKind = "network";
      continue;
    }
    if (res.ok) return (((await res.json()) as { data?: S2Paper[] }).data ?? []).map((p) => ({ ...p, source: "s2" as const }));
    if (res.status === 429 || res.status >= 500) {
      lastKind = "rateLimit";
      continue;
    }
    throw new S2Error("other", `Semantic Scholar HTTP ${res.status}`);
  }
  throw new S2Error(lastKind, "Semantic Scholar unavailable");
}

const OPENALEX = "https://api.openalex.org/works";
const OPENALEX_FIELDS = "id,display_name,publication_year,authorships,cited_by_count,doi,primary_location,open_access,best_oa_location,abstract_inverted_index";

interface OpenAlexWork {
  id: string;
  display_name?: string | null;
  publication_year?: number | null;
  authorships?: { author?: { display_name?: string | null } }[];
  cited_by_count?: number | null;
  doi?: string | null;
  primary_location?: { source?: { display_name?: string | null } | null; landing_page_url?: string | null } | null;
  open_access?: { oa_url?: string | null } | null;
  best_oa_location?: { pdf_url?: string | null } | null;
  abstract_inverted_index?: Record<string, number[]> | null;
}

/** OpenAlex stores abstracts as {word: [positions]}; rebuild the text. */
export function abstractFromInvertedIndex(index: Record<string, number[]> | null | undefined): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const pos of positions) words[pos] = word;
  return words.filter((w) => w !== undefined).join(" ") || null;
}

/** "2020-" / "2018-2021" / "2020" (Semantic Scholar syntax) → OpenAlex filter. */
export function openAlexYearFilter(year?: string): string | null {
  const m = /^\s*(\d{4})?\s*(-)?\s*(\d{4})?\s*$/.exec(year ?? "");
  if (!m || (!m[1] && !m[3])) return null;
  if (m[1] && m[3]) return `publication_year:${m[1]}-${m[3]}`;
  if (m[1] && m[2]) return `publication_year:>${Number(m[1]) - 1}`;
  if (!m[1] && m[3]) return `publication_year:<${Number(m[3]) + 1}`;
  return `publication_year:${m[1]}`;
}

export function fromOpenAlex(w: OpenAlexWork): S2Paper {
  const doi = w.doi?.replace(/^https?:\/\/doi\.org\//i, "") || undefined;
  return {
    paperId: `openalex:${w.id.split("/").pop()}`,
    title: w.display_name ?? "",
    abstract: abstractFromInvertedIndex(w.abstract_inverted_index),
    year: w.publication_year ?? null,
    venue: w.primary_location?.source?.display_name ?? null,
    authors: (w.authorships ?? []).map((a) => ({ name: a.author?.display_name ?? "" })).filter((a) => a.name),
    citationCount: w.cited_by_count ?? null,
    externalIds: doi ? { DOI: doi } : null,
    url: w.doi ?? w.primary_location?.landing_page_url ?? w.id,
    openAccessPdf: { url: w.best_oa_location?.pdf_url ?? w.open_access?.oa_url ?? null },
    tldr: null,
    source: "openalex",
  };
}

async function searchOpenAlex(query: string, opts: SearchOptions): Promise<S2Paper[]> {
  const params = new URLSearchParams({ search: query, "per-page": String(opts.limit ?? 10), select: OPENALEX_FIELDS });
  const filter = openAlexYearFilter(opts.year);
  if (filter) params.set("filter", filter);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** attempt);
    let res: Response;
    try {
      res = await fetch(`${OPENALEX}?${params}`);
    } catch {
      continue;
    }
    if (res.ok) return (((await res.json()) as { results?: OpenAlexWork[] }).results ?? []).map(fromOpenAlex).filter((p) => p.title);
    if (res.status !== 429 && res.status < 500) throw new S2Error("other", `OpenAlex HTTP ${res.status}`);
  }
  throw new S2Error("network", "OpenAlex unavailable");
}

/**
 * Search papers in two catalogues. With a Semantic Scholar key, S2 comes first (it has TL;DRs);
 * without one its shared pool is usually saturated, so OpenAlex (free, no key) leads instead.
 * Either way the other catalogue is the fallback.
 */
export async function searchPapers(query: string, opts: SearchOptions = {}): Promise<S2Paper[]> {
  const order: (() => Promise<S2Paper[]>)[] = opts.apiKey
    ? [() => searchS2(query, opts, 4), () => searchOpenAlex(query, opts)]
    : [() => searchOpenAlex(query, opts), () => searchS2(query, opts, 2)];
  let lastError: unknown;
  for (const run of order) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof S2Error ? lastError : new S2Error("network", String(lastError));
}

export function paperMeta(p: S2Paper): PaperMeta {
  return {
    paperId: p.paperId,
    authors: (p.authors ?? []).map((a) => a.name),
    year: p.year ?? undefined,
    venue: p.venue ?? undefined,
    url: p.url ?? (p.source === "openalex" ? undefined : `https://www.semanticscholar.org/paper/${p.paperId}`),
    source: p.source ?? "s2",
    doi: p.externalIds?.DOI,
    openAccessPdf: p.openAccessPdf?.url ?? undefined,
    citationCount: p.citationCount ?? undefined,
    tldr: p.tldr?.text ?? undefined,
  };
}

/** Text stored and indexed for a saved paper (abstract + TL;DR), as a single "page". */
export function paperText(p: S2Paper): string {
  const meta = paperMeta(p);
  return [
    p.title,
    meta.authors.length ? `Authors: ${meta.authors.join(", ")}` : "",
    [meta.year, meta.venue].filter(Boolean).join(" · "),
    meta.tldr ? `TL;DR: ${meta.tldr}` : "",
    p.abstract ? `Abstract: ${p.abstract}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

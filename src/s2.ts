import type { PaperMeta } from "./db";

const BASE = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "title,abstract,year,venue,authors,citationCount,externalIds,url,openAccessPdf,tldr";

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

/**
 * Search papers. Without a key, requests share Semantic Scholar's public pool, which is
 * often busy (HTTP 429), so retry a few times with growing pauses.
 */
export async function searchPapers(query: string, opts: { apiKey?: string; year?: string; limit?: number; onRetry?: (attempt: number) => void } = {}): Promise<S2Paper[]> {
  const params = new URLSearchParams({ query, limit: String(opts.limit ?? 10), fields: FIELDS });
  if (opts.year) params.set("year", opts.year);
  const headers: Record<string, string> = opts.apiKey ? { "x-api-key": opts.apiKey } : {};
  for (let attempt = 0; attempt < 5; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE}/paper/search?${params}`, { headers });
    } catch (err) {
      throw new S2Error("network", String(err));
    }
    if (res.ok) return ((await res.json()) as { data?: S2Paper[] }).data ?? [];
    if (res.status === 429 || res.status >= 500) {
      opts.onRetry?.(attempt + 1);
      await sleep(1500 * 2 ** attempt + Math.random() * 500);
      continue;
    }
    throw new S2Error("other", `HTTP ${res.status}`);
  }
  throw new S2Error("rateLimit", "Semantic Scholar is busy");
}

export function paperMeta(p: S2Paper): PaperMeta {
  return {
    paperId: p.paperId,
    authors: (p.authors ?? []).map((a) => a.name),
    year: p.year ?? undefined,
    venue: p.venue ?? undefined,
    url: p.url ?? `https://www.semanticscholar.org/paper/${p.paperId}`,
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

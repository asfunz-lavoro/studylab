import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, defaultSettings, type Settings } from "./db";
import { complete } from "./llm";
import { gemini, rankGeminiModel } from "./llm/gemini";
import { parseJSONLoose } from "./llm/json";
import { ollama, openai, pickPreferred } from "./llm/openaiCompat";
import { sseData } from "./llm/sse";
import { LLMError, errorFromStatus } from "./llm/types";
import JSZip from "jszip";
import { exportObsidianZip } from "./backup";
import { translator } from "./i18n";
import { pagesForPrompt } from "./prompts";
import { abstractFromInvertedIndex, fromOpenAlex, openAlexYearFilter, searchPapers } from "./s2";
import { chunkPage, cleanText, textToPages } from "./rag/chunk";
import { saveDocument } from "./rag/ingest";
import { normalizeTerm, resetSearchCache, searchChunks } from "./rag/search";
import { Rating, dueCards, generateFlashcards, gradeCard, loadMaterial, newCard } from "./study";
import { retrieve } from "./tutor";

function sseResponse(events: string[], status = 200): Response {
  const body = new TextEncoder().encode(events.map((e) => `data: ${e}\n\n`).join(""));
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(body);
      c.close();
    },
  });
  return new Response(stream, { status, headers: { "content-type": "text/event-stream" } });
}

function settingsWith(provider: string, model = "m", apiKey = "k"): Settings {
  return { ...defaultSettings("it"), onboarded: true, provider, providers: { [provider]: { apiKey, model } } };
}

beforeEach(async () => {
  vi.useRealTimers();
  await db.delete();
  await db.open();
  resetSearchCache();
  vi.restoreAllMocks();
});

describe("chunking", () => {
  it("re-joins hyphenated line breaks and collapses whitespace", () => {
    expect(cleanText("foto-\nsintesi   clorofilliana\n\n\n\nfine")).toBe("fotosintesi clorofilliana\n\nfine");
  });

  it("joins visual line wraps inside sentences but keeps headings on their own line", () => {
    expect(cleanText("Capitolo 2 – La fotosintesi\nLa luce, l'energia\ndella pianta.\nNuova frase.")).toBe(
      "Capitolo 2 – La fotosintesi\nLa luce, l'energia della pianta.\nNuova frase.",
    );
  });

  it("keeps short pages whole and splits long ones near the target size", () => {
    expect(chunkPage("Breve pagina.")).toEqual(["Breve pagina."]);
    const long = Array.from({ length: 60 }, (_, i) => `Frase numero ${i} sulla mitosi e la meiosi.`).join(" ");
    const chunks = chunkPage(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 1600)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(long);
  });

  it("splits pasted text into pseudo-pages", () => {
    const pages = textToPages("a\n".repeat(4000));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0].page).toBe(1);
  });

  it("marks pages for the prompt and reports truncation", () => {
    const pages = [1, 2, 3].map((page) => ({ page, text: "x".repeat(100) }));
    const out = pagesForPrompt(pages, 250);
    expect(out.text).toContain("=== Page 1 ===");
    expect(out.truncated).toBe(true);
    expect(out.usedThrough).toBe(2);
  });
});

describe("i18n", () => {
  it("picks singular or plural forms", () => {
    const t = translator("it");
    expect(t("home.stats", { docs: 1, notes: 2, cards: 0 })).toBe("1 documento · 2 appunti · 0 flashcard");
    expect(translator("en")("common.nPages", { n: 1 })).toBe("1 page");
  });
});

describe("search", () => {
  it("normalizes Italian inflections and drops stopwords", () => {
    expect(normalizeTerm("cellule")).toBe(normalizeTerm("cellula"));
    expect(normalizeTerm("della")).toBeNull();
    expect(normalizeTerm("Perché")).toBeNull();
  });

  it("finds the right page and scopes by subject", async () => {
    const bio = (await db.subjects.add({ name: "Bio", color: "#000", createdAt: 0 })) as number;
    const hist = (await db.subjects.add({ name: "Storia", color: "#000", createdAt: 0 })) as number;
    await saveDocument(
      { subjectId: bio, title: "Libro", kind: "text" },
      [
        { page: 1, text: "La cellula è l'unità fondamentale della vita." },
        { page: 2, text: "La fotosintesi avviene nei cloroplasti delle cellule vegetali." },
      ],
    );
    await saveDocument({ subjectId: hist, title: "Storia", kind: "text" }, [{ page: 1, text: "La Rivoluzione francese iniziò nel 1789." }]);
    const hits = await searchChunks("dove avviene la fotosintesi", bio);
    expect(hits[0]).toMatchObject({ page: 2 });
    expect(await searchChunks("rivoluzione", bio)).toHaveLength(0);
    expect((await searchChunks("rivoluzione", null))[0]).toMatchObject({ page: 1 });
  });
});

describe("model output parsing", () => {
  it("extracts JSON from fences, prose and trailing commas", () => {
    expect(parseJSONLoose('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseJSONLoose('Ecco: {"cards": [{"front": "x", "back": "y",}]} spero aiuti')).toEqual({ cards: [{ front: "x", back: "y" }] });
    expect(() => parseJSONLoose("niente json")).toThrow(SyntaxError);
  });

  it("parses SSE events split across network chunks", async () => {
    const enc = new TextEncoder();
    const parts = ["data: {\"a\"", ":1}\n\ndata: [DO", "NE]\n\n"];
    const stream = new ReadableStream({
      start(c) {
        parts.forEach((p) => c.enqueue(enc.encode(p)));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const d of sseData(new Response(stream))) out.push(d);
    expect(out).toEqual(['{"a":1}', "[DONE]"]);
  });
});

describe("providers", () => {
  it("Gemini streams text, skips thought parts and sends the key in a header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "hidden", thought: true }, { text: "Ciao " }] } }] }),
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "mondo" }] }, finishReason: "STOP" }] }),
      ]),
    );
    const seen: string[] = [];
    const text = await gemini.complete({ apiKey: "KEY", model: "gemini-x-flash" }, { system: "s", messages: [{ role: "user", content: "hi" }], onText: (t) => seen.push(t) });
    expect(text).toBe("Ciao mondo");
    expect(seen).toEqual(["Ciao ", "Ciao mondo"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("models/gemini-x-flash:streamGenerateContent?alt=sse");
    expect(url).not.toContain("KEY");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("KEY");
  });

  it("Gemini model ranking prefers the newest stable flash", () => {
    const models = ["gemini-2.0-flash", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.0-flash-preview"];
    expect(gemini.pickDefaultModel(models)).toBe("gemini-3.0-flash-preview");
    expect(rankGeminiModel("gemini-2.5-flash")).toBeGreaterThan(rankGeminiModel("gemini-2.5-pro"));
  });

  it("OpenAI-compatible providers stream deltas and map HTTP errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      sseResponse([JSON.stringify({ choices: [{ delta: { content: "A" } }] }), JSON.stringify({ choices: [{ delta: { content: "B" } }] }), "[DONE]"]),
    );
    expect(await openai.complete({ apiKey: "k", model: "gpt-x", baseUrl: "https://api.openai.com/v1" }, { system: "s", messages: [{ role: "user", content: "q" }] })).toBe("AB");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("bad key", { status: 401 }));
    await expect(openai.complete({ apiKey: "k", model: "gpt-x", baseUrl: "https://api.openai.com/v1" }, { system: "s", messages: [] })).rejects.toMatchObject({ kind: "auth" });
  });

  it("Ollama lists local models from /api/tags", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ models: [{ name: "gemma3:4b" }, { name: "nomic-embed-text" }] })));
    const models = await ollama.listModels({ apiKey: "", model: "", baseUrl: "http://localhost:11434/v1" });
    expect(models).toEqual(["gemma3:4b"]);
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:11434/api/tags");
  });

  it("prefers configured model patterns", () => {
    expect(pickPreferred(["a", "llama-3.3-70b-versatile", "b"], [/llama-3\.3-70b/])).toBe("llama-3.3-70b-versatile");
    expect(pickPreferred(["z"], [/nope/])).toBe("z");
  });

  it("retries rate limits with the server's retry-after, then gives up on auth errors", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("slow down per minute", { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(sseResponse([JSON.stringify({ choices: [{ delta: { content: "ok" } }] }), "[DONE]"]));
    const waits: number[] = [];
    const p = complete(settingsWith("groq"), { system: "s", messages: [{ role: "user", content: "q" }] }, (s) => waits.push(s));
    await vi.advanceTimersByTimeAsync(2500);
    expect(await p).toBe("ok");
    expect(waits).toEqual([2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("no", { status: 403 }));
    await expect(complete(settingsWith("groq"), { system: "s", messages: [] })).rejects.toBeInstanceOf(LLMError);
  });
});

describe("review fixes", () => {
  it("classifies Gemini errors: per-minute vs daily quota, retryDelay, invalid key", () => {
    const perMinute = '{"error":{"message":"You exceeded your current quota, please check your plan and billing details. https://ai.google.dev/gemini-api/docs/rate-limits","details":[{"violations":[{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"37s"}]}}';
    const perDay = perMinute.replace("PerMinute", "PerDay");
    expect(errorFromStatus(429, perMinute)).toMatchObject({ kind: "rateLimit", retryAfterS: 37 });
    expect(errorFromStatus(429, perDay)).toMatchObject({ kind: "quota" });
    expect(errorFromStatus(400, '{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}')).toMatchObject({ kind: "auth" });
    expect(errorFromStatus(429, '{"error":{"code":"insufficient_quota"}}')).toMatchObject({ kind: "quota" });
  });

  it("pressing Stop mid-stream reports 'aborted' without a retry wait", async () => {
    const controller = new AbortController();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const signal = (init as RequestInit).signal!;
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "par" } }] })}\n\n`));
          signal.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
        },
      });
      return new Response(stream);
    });
    const waits: number[] = [];
    const p = complete(settingsWith("groq"), { system: "s", messages: [{ role: "user", content: "q" }], signal: controller.signal, onText: () => controller.abort() }, (w) => waits.push(w));
    await expect(p).rejects.toMatchObject({ kind: "aborted" });
    expect(waits).toEqual([]);
  });

  it("sends max_completion_tokens to OpenAI and max_tokens elsewhere", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => sseResponse(["[DONE]"]));
    await openai.complete({ apiKey: "k", model: "gpt-5", baseUrl: "https://api.openai.com/v1" }, { system: "s", messages: [] });
    await ollama.complete({ apiKey: "", model: "gemma3", baseUrl: "http://localhost:11434/v1" }, { system: "s", messages: [] });
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies[0]).toHaveProperty("max_completion_tokens");
    expect(bodies[0]).not.toHaveProperty("max_tokens");
    expect(bodies[1]).toHaveProperty("max_tokens");
  });

  it("Obsidian export keeps notes that share a title", async () => {
    const sid = (await db.subjects.add({ name: "Bio", color: "#000", createdAt: 0 })) as number;
    for (const content of ["uno", "due"]) await db.notes.add({ subjectId: sid, title: "", content, createdAt: 0, updatedAt: 0 });
    await db.notes.add({ subjectId: sid, title: "Flashcards", content: "nota", createdAt: 0, updatedAt: 0 });
    await db.cards.add(newCard(sid, "Q", "A"));
    const zip = await JSZip.loadAsync(await exportObsidianZip());
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
    expect(names).toEqual(["Bio/Flashcards (2).md", "Bio/Flashcards.md", "Bio/Untitled (2).md", "Bio/Untitled.md"]);
  });
});

describe("paper search", () => {
  it("maps OpenAlex works and rebuilds abstracts", () => {
    expect(abstractFromInvertedIndex({ La: [0], cellula: [1, 3], una: [2] })).toBe("La cellula una cellula");
    const p = fromOpenAlex({
      id: "https://openalex.org/W1",
      display_name: "PINNs",
      publication_year: 2019,
      authorships: [{ author: { display_name: "M. Raissi" } }],
      cited_by_count: 9000,
      doi: "https://doi.org/10.1016/j.jcp.2018.10.045",
      primary_location: { source: { display_name: "J. Comput. Phys." } },
      best_oa_location: { pdf_url: "https://x/pdf" },
    });
    expect(p).toMatchObject({ paperId: "openalex:W1", year: 2019, venue: "J. Comput. Phys.", citationCount: 9000, source: "openalex" });
    expect(p.externalIds?.DOI).toBe("10.1016/j.jcp.2018.10.045");
    expect(p.openAccessPdf?.url).toBe("https://x/pdf");
  });

  it("converts year filters", () => {
    expect(openAlexYearFilter("2020-")).toBe("publication_year:>2019");
    expect(openAlexYearFilter("2018-2021")).toBe("publication_year:2018-2021");
    expect(openAlexYearFilter("-2010")).toBe("publication_year:<2011");
    expect(openAlexYearFilter("2022")).toBe("publication_year:2022");
    expect(openAlexYearFilter("abc")).toBeNull();
  });

  it("without a key uses OpenAlex; with a key falls back to OpenAlex when the browser blocks Semantic Scholar", async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      urls.push(url);
      // A 429 without CORS headers reaches the page as a TypeError, exactly like this.
      if (url.includes("semanticscholar")) throw new TypeError("NetworkError when attempting to fetch resource.");
      return new Response(JSON.stringify({ results: [{ id: "https://openalex.org/W9", display_name: "Fotosintesi" }] }));
    });
    expect((await searchPapers("fotosintesi"))[0].title).toBe("Fotosintesi");
    expect(urls[0]).toContain("api.openalex.org");

    vi.useFakeTimers();
    urls.length = 0;
    const p = searchPapers("fotosintesi", { apiKey: "k" });
    await vi.runAllTimersAsync();
    expect((await p)[0].source).toBe("openalex");
    expect(urls.filter((u) => u.includes("semanticscholar"))).toHaveLength(4);
    vi.useRealTimers();
  });
});

describe("tutor retrieval", () => {
  it("falls back to model-written keyword queries when the literal question finds little", async () => {
    const sid = (await db.subjects.add({ name: "Bio", color: "#000", createdAt: 0 })) as number;
    await saveDocument({ subjectId: sid, title: "Biology", kind: "text" }, [{ page: 7, text: "Photosynthesis takes place in the chloroplasts of plant cells." }]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse([JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"queries": ["photosynthesis chloroplasts"]}' }] } }] })]));
    const sources = await retrieve(settingsWith("gemini"), "Dove si svolge la fotosintesi?", sid);
    expect(sources[0]).toMatchObject({ n: 1, title: "Biology", page: 7 });
  });
});

describe("study tools", () => {
  it("generates flashcards from a page range and drops malformed cards", async () => {
    const sid = (await db.subjects.add({ name: "Bio", color: "#000", createdAt: 0 })) as number;
    const docId = await saveDocument({ subjectId: sid, title: "B", kind: "text" }, [1, 2, 3].map((page) => ({ page, text: `Contenuto della pagina ${page}.` })));
    const material = await loadMaterial({ docId, fromPage: 2, toPage: 3 });
    expect(material.text).toContain("=== Page 2 ===");
    expect(material.text).not.toContain("=== Page 1 ===");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"cards":[{"front":"Q1","back":"A1","page":2},{"front":"","back":"x"},{"front":"Q2","back":"A2"}]}' }] } }] })]),
    );
    const cards = await generateFlashcards(settingsWith("gemini"), material, 3);
    expect(cards).toEqual([
      { front: "Q1", back: "A1", page: 2 },
      { front: "Q2", back: "A2", page: undefined },
    ]);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("schedules reviews: new cards are due now, 'Good' pushes them into the future", async () => {
    const id = (await db.cards.add(newCard(1, "Q", "A"))) as number;
    expect(await dueCards(null)).toHaveLength(1);
    const card = (await db.cards.get(id))!;
    const graded = await gradeCard(card, Rating.Good);
    expect(+new Date(graded.srs.due)).toBeGreaterThan(Date.now());
    expect(await dueCards(null, new Date())).toHaveLength(0);
  });
});

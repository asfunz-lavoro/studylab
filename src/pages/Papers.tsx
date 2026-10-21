import { useState } from "react";
import { useApp } from "../app";
import { db } from "../db";
import { complete, isConfigured } from "../llm";
import { paperExplainSystem } from "../prompts";
import { saveDocument } from "../rag/ingest";
import { S2Error, paperMeta, paperText, searchPapers, type S2Paper } from "../s2";
import { Empty, Notice, Spinner, SubjectSelect, useCurrentSubject } from "../ui/components";

export function Papers() {
  const { t, settings, toast, errorText } = useApp();
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [results, setResults] = useState<S2Paper[] | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [subjectId, setSubjectId] = useCurrentSubject();
  const [working, setWorking] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setStatus("");
    try {
      setResults(await searchPapers(query.trim(), { apiKey: settings.s2Key, year: year.trim() || undefined, limit: 15, onRetry: (n) => setStatus(t("papers.busy", { n })) }));
    } catch (err) {
      setResults(null);
      setStatus(err instanceof S2Error && err.kind === "rateLimit" ? t("papers.busyFail") : errorText(err));
    }
    setBusy(false);
  };

  const save = async (p: S2Paper) => {
    if (subjectId == null) return toast(t("lib.needSubject"), true);
    await saveDocument({ subjectId, title: p.title, kind: "paper", paper: paperMeta(p) }, [{ page: 1, text: paperText(p) }]);
    toast(t("papers.saved"));
  };

  const explain = async (p: S2Paper) => {
    if (!isConfigured(settings)) return toast(t("err.needAI"), true);
    if (subjectId == null) return toast(t("lib.needSubject"), true);
    setWorking(p.paperId);
    try {
      const text = await complete(settings, { system: paperExplainSystem(settings.lang, settings.level), messages: [{ role: "user", content: paperText(p) }] });
      const meta = paperMeta(p);
      await db.notes.add({
        subjectId,
        title: p.title,
        content: `${text}\n\n---\n${meta.authors.slice(0, 5).join(", ")} (${meta.year ?? "n.d."}). ${meta.url ?? ""}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      toast(t("papers.explained"));
    } catch (err) {
      toast(errorText(err), true);
    }
    setWorking(null);
  };

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>{t("papers.title")}</h1>
          <p className="muted">{t("papers.intro")}</p>
        </div>
        <SubjectSelect value={subjectId} onChange={setSubjectId} />
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input className="grow" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("papers.search")} style={{ minWidth: 220 }} />
        <input value={year} onChange={(e) => setYear(e.target.value)} placeholder={t("papers.year")} style={{ width: 150 }} />
        <button className="btn primary" disabled={busy || !query.trim()}>
          🔎 {t("papers.searchBtn")}
        </button>
      </form>
      {busy && <Spinner label={status || t("common.loading")} />}
      {!busy && status && <Notice kind="warn">{status}</Notice>}
      {results && results.length === 0 && <Empty icon="🔍" title={t("papers.none")} />}
      {results?.map((p) => {
        const meta = paperMeta(p);
        return (
          <div key={p.paperId} className="card paper">
            <h3>{p.title}</h3>
            <div className="muted small">
              {meta.authors.slice(0, 4).join(", ")}
              {meta.authors.length > 4 ? " et al." : ""} · {meta.year ?? "n.d."}
              {meta.venue ? ` · ${meta.venue}` : ""} · {t("papers.citations", { n: meta.citationCount ?? 0 })}
            </div>
            {meta.tldr ? (
              <p>
                <strong>TL;DR:</strong> {meta.tldr}
              </p>
            ) : (
              <p className="small">{p.abstract ? `${p.abstract.slice(0, 400)}${p.abstract.length > 400 ? "…" : ""}` : t("papers.noAbstract")}</p>
            )}
            <div className="row">
              <button className="btn sm" onClick={() => save(p)}>
                💾 {t("papers.save")}
              </button>
              <button className="btn sm" onClick={() => explain(p)} disabled={working != null}>
                {working === p.paperId ? <div className="spinner" /> : "✨"} {t("papers.explain")}
              </button>
              {meta.openAccessPdf && (
                <a className="btn sm ghost" href={meta.openAccessPdf} target="_blank" rel="noreferrer">
                  📄 {t("papers.pdf")} ↗
                </a>
              )}
              {meta.url && (
                <a className="btn sm ghost" href={meta.url} target="_blank" rel="noreferrer">
                  Semantic Scholar ↗
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

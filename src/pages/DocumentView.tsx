import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { go, useApp } from "../app";
import { db } from "../db";
import { isConfigured } from "../llm";
import { documentText, fileToImagePart, renderPdfPage, replacePageText, transcribeImage } from "../rag/ingest";
import { Empty, Notice, Spinner, useAbort } from "../ui/components";

export function DocumentView({ docId, initialPage }: { docId: number; initialPage: number }) {
  const { t, settings, toast, errorText } = useApp();
  const doc = useLiveQuery(() => db.docs.get(docId), [docId]);
  const file = useLiveQuery(() => db.files.get(docId), [docId]);
  const [page, setPage] = useState(initialPage || 1);
  const [busy, setBusy] = useState(false);
  const [startAbort] = useAbort();
  const pageText = useLiveQuery(async () => (await documentText(docId, page, page))[0]?.text ?? "", [docId, page, busy], undefined);
  useEffect(() => setPage(initialPage || 1), [initialPage]);

  if (doc === undefined) return <Spinner />;
  if (!doc) return <Empty icon="🤷" title="404" />;

  const openOriginal = () => {
    if (!file) return;
    const url = URL.createObjectURL(file.blob);
    window.open(doc.kind === "pdf" ? `${url}#page=${page}` : url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const transcribe = async () => {
    if (!isConfigured(settings) || !file) return toast(t("err.needAI"), true);
    setBusy(true);
    try {
      const image = doc.kind === "pdf" ? await renderPdfPage(await file.blob.arrayBuffer(), page) : await fileToImagePart(file.blob);
      await replacePageText(docId, page, await transcribeImage(settings, image, startAbort()));
      toast(t("lib.transcribeDone"));
    } catch (err) {
      toast(errorText(err), true);
    }
    setBusy(false);
  };

  const clamp = (n: number) => Math.min(Math.max(1, n), doc.pageCount || 1);

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <button className="btn ghost sm" onClick={() => go("library")}>
            ← {t("common.back")}
          </button>
          <h1 className="mt" style={{ marginTop: 8 }}>
            {doc.title}
          </h1>
          {doc.paper && (
            <p className="muted small">
              {doc.paper.authors.slice(0, 4).join(", ")}
              {doc.paper.authors.length > 4 ? " et al." : ""} · {doc.paper.year}
              {doc.paper.url && (
                <>
                  {" · "}
                  <a href={doc.paper.url} target="_blank" rel="noreferrer">
                    Semantic Scholar ↗
                  </a>
                </>
              )}
            </p>
          )}
        </div>
        <div className="row">
          {file && doc.kind === "pdf" && (
            <button className="btn sm" onClick={openOriginal}>
              📕 {t("doc.openOriginal")}
            </button>
          )}
          <button className="btn sm" onClick={() => go(`tutor?subject=${doc.subjectId}`)}>
            💬 {t("lib.actions.ask")}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row between mb">
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage(clamp(page - 1))}>
            ←
          </button>
          <div className="row">
            <span className="muted">{t("doc.pageOf", { page, total: doc.pageCount })}</span>
            <input
              type="number"
              min={1}
              max={doc.pageCount}
              value={page}
              onChange={(e) => setPage(clamp(Number(e.target.value) || 1))}
              style={{ width: 90 }}
              aria-label={t("doc.goto")}
            />
          </div>
          <button className="btn sm" disabled={page >= doc.pageCount} onClick={() => setPage(clamp(page + 1))}>
            →
          </button>
        </div>
        {pageText === undefined ? (
          <Spinner />
        ) : pageText.trim().length < 40 ? (
          <Notice kind="warn">
            <p>{t("doc.noText")}</p>
            {file && (
              <button className="btn sm" onClick={transcribe} disabled={busy}>
                {busy ? <div className="spinner" /> : "✨"} {t("doc.transcribe")}
              </button>
            )}
            {pageText && <div className="pagetext mt">{pageText}</div>}
          </Notice>
        ) : (
          <div className="pagetext">{pageText}</div>
        )}
      </div>
    </div>
  );
}

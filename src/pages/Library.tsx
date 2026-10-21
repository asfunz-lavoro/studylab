import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { go, useApp } from "../app";
import { db, deleteDoc, deleteSubject, type Doc } from "../db";
import { formatBytes } from "../i18n";
import { isConfigured } from "../llm";
import { textToPages } from "../rag/chunk";
import { ingestFile, kindForFile, renderPdfPage, replacePageText, saveDocument, transcribeImage } from "../rag/ingest";
import { Empty, Modal, Notice, Progress, SubjectDialog, SubjectSelect, useAbort, useCurrentSubject } from "../ui/components";

const KIND_ICON: Record<Doc["kind"], string> = { pdf: "📕", text: "📝", docx: "📘", image: "🖼️", paper: "🔬" };

interface Job {
  label: string;
  done: number;
  total: number;
}

export function Library() {
  const { t, settings, toast, errorText } = useApp();
  const [subjectId, setSubjectId] = useCurrentSubject();
  const docs = useLiveQuery(() => (subjectId == null ? [] : db.docs.where("subjectId").equals(subjectId).reverse().sortBy("createdAt")), [subjectId], [] as Doc[]);
  const subject = useLiveQuery(() => (subjectId == null ? undefined : db.subjects.get(subjectId)), [subjectId]);
  const storage = useLiveQuery(async () => (navigator.storage?.estimate ? navigator.storage.estimate() : null), [docs.length], null);
  const [job, setJob] = useState<Job | null>(null);
  const [over, setOver] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [editing, setEditing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [startAbort] = useAbort();

  const upload = async (files: FileList | File[]) => {
    // One job at a time: uploads and transcriptions share progress UI and an abort controller.
    if (job) return;
    if (subjectId == null) {
      toast(t("lib.needSubject"), true);
      return;
    }
    for (const file of Array.from(files)) {
      const kind = kindForFile(file);
      if (!kind) {
        toast(t("lib.unsupported", { name: file.name }), true);
        continue;
      }
      if (kind === "image" && !isConfigured(settings)) {
        toast(t("err.needAI"), true);
        continue;
      }
      const label = kind === "image" ? t("lib.processingImage", { name: file.name }) : file.name;
      setJob({ label, done: 0, total: 1 });
      try {
        const id = await ingestFile(file, { subjectId, settings, signal: startAbort(), onProgress: (done, total) => setJob({ label, done, total }) });
        const doc = await db.docs.get(id);
        toast(t("lib.added", { name: doc?.title ?? file.name, pages: doc?.pageCount ?? 0 }));
      } catch (err) {
        toast(errorText(err), true);
      }
    }
    setJob(null);
  };

  const transcribe = async (doc: Doc) => {
    if (job) return;
    if (!isConfigured(settings)) return toast(t("err.needAI"), true);
    const file = await db.files.get(doc.id!);
    if (!file) return;
    const signal = startAbort();
    const pages = [...doc.lowTextPages];
    try {
      const data = doc.kind === "pdf" ? await file.blob.arrayBuffer() : null;
      for (let i = 0; i < pages.length; i++) {
        setJob({ label: t("lib.transcribing", { page: pages[i], done: i, total: pages.length }), done: i, total: pages.length });
        const image = data ? await renderPdfPage(data, pages[i]) : await (await import("../rag/ingest")).fileToImagePart(file.blob);
        const text = await transcribeImage(settings, image, signal);
        await replacePageText(doc.id!, pages[i], text);
      }
      toast(t("lib.transcribeDone"));
    } catch (err) {
      toast(errorText(err), true);
    }
    setJob(null);
  };

  const remove = async (doc: Doc) => {
    if (confirm(t("common.confirmDelete", { name: doc.title }))) await deleteDoc(doc.id!);
  };

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>{t("lib.title")}</h1>
          <p className="muted">{t("lib.intro")}</p>
        </div>
        <div className="row">
          <SubjectSelect value={subjectId} onChange={setSubjectId} />
          {subject && (
            <>
              <button className="btn sm ghost" onClick={() => setEditing(true)} title={t("subject.rename")}>
                ✏️
              </button>
              <button
                className="btn sm ghost"
                title={t("common.delete")}
                onClick={async () => {
                  if (confirm(`${t("common.confirmDelete", { name: subject.name })}\n\n${t("subject.deleteWarn")}`)) await deleteSubject(subject.id!);
                }}
              >
                🗑️
              </button>
            </>
          )}
        </div>
      </div>

      {subjectId == null ? (
        <div className="card">
          <Empty icon="📒" title={t("lib.needSubject")}>
            <SubjectSelect value={null} onChange={setSubjectId} />
          </Empty>
        </div>
      ) : (
        <>
          <div
            className={`dropzone ${over ? "over" : ""}`}
            style={job ? { opacity: 0.5, pointerEvents: "none" } : undefined}
            aria-disabled={!!job}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void upload(e.dataTransfer.files);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
          >
            <div className="big">📥</div>
            <strong>{t("lib.drop")}</strong>
            <div className="muted small">{t("lib.dropTypes")}</div>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              accept=".pdf,.docx,.txt,.md,.markdown,image/*"
              data-testid="file-input"
              onChange={(e) => {
                if (e.target.files) void upload(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <div className="row mt">
            <button className="btn sm" onClick={() => setPasting(true)}>
              📋 {t("lib.paste")}
            </button>
            {storage?.quota ? <span className="muted small">{t("lib.storage", { used: formatBytes(storage.usage ?? 0), quota: formatBytes(storage.quota) })}</span> : null}
          </div>

          {job && (
            <div className="card mt stack">
              <div className="row">
                <div className="spinner" />
                <span>{job.total > 1 ? t("lib.processing", { name: job.label, done: job.done, total: job.total }) : job.label}</span>
              </div>
              {job.total > 1 && <Progress value={job.done} max={job.total} />}
            </div>
          )}

          <div className="doclist mt">
            {docs.length === 0 && !job && <Empty icon="📚" title={t("lib.empty")} />}
            {docs.map((d) => (
              <div key={d.id} className="docrow">
                <span className="ico">{KIND_ICON[d.kind]}</span>
                <div className="grow">
                  <div className="title">{d.title}</div>
                  <div className="muted small">
                    {t(`lib.kind.${d.kind}`)} · {t("common.nPages", { n: d.pageCount })}
                  </div>
                  {d.lowTextPages.length > 0 && (
                    <div className="mt" style={{ marginTop: 8 }}>
                      <Notice kind="warn">
                        <div className="row between">
                          <span>{d.lowTextPages.length >= d.pageCount ? t("lib.lowTextAll") : t("lib.lowText", { n: d.lowTextPages.length })}</span>
                          <button className="btn sm" onClick={() => transcribe(d)} disabled={!!job}>
                            ✨ {t("lib.lowTextAction")}
                          </button>
                        </div>
                      </Notice>
                    </div>
                  )}
                </div>
                <div className="row">
                  <button className="btn sm" onClick={() => go(`doc/${d.id}`)}>
                    {t("lib.actions.view")}
                  </button>
                  <button className="btn sm" onClick={() => go(`tutor?subject=${d.subjectId}`)}>
                    💬 {t("lib.actions.ask")}
                  </button>
                  <button className="btn sm" onClick={() => go(`study/create?doc=${d.id}`)}>
                    🧠 {t("lib.actions.cards")}
                  </button>
                  <button className="btn sm" onClick={() => go(`study/quiz?doc=${d.id}`)}>
                    ✅ {t("lib.actions.quiz")}
                  </button>
                  <button className="btn sm" onClick={() => go(`study/summary?doc=${d.id}`)}>
                    📄 {t("lib.actions.summary")}
                  </button>
                  <button className="btn sm ghost danger" onClick={() => remove(d)} aria-label={t("common.delete")}>
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {pasting && subjectId != null && <PasteDialog subjectId={subjectId} onClose={() => setPasting(false)} />}
      {editing && subject && <SubjectDialog subject={subject} onClose={() => setEditing(false)} />}
    </div>
  );
}

function PasteDialog({ subjectId, onClose }: { subjectId: number; onClose: () => void }) {
  const { t, toast } = useApp();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <Modal title={t("lib.paste")} onClose={onClose} wide>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const pages = textToPages(body);
          await saveDocument({ subjectId, title: title.trim() || t("notes.untitled"), kind: "text" }, pages);
          toast(t("lib.added", { name: title.trim() || t("notes.untitled"), pages: pages.length }));
          onClose();
        }}
      >
        <label className="field">
          {t("lib.pasteTitle")}
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          {t("lib.pasteBody")}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 280 }} />
        </label>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn primary" disabled={!body.trim()}>
            {t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

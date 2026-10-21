import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { go, useApp } from "../app";
import { db, type Note } from "../db";
import { textToPages } from "../rag/chunk";
import { saveDocument } from "../rag/ingest";
import { Empty, SubjectSelect, useCurrentSubject } from "../ui/components";
import { Markdown } from "../ui/Markdown";

export function Notes({ noteParam }: { noteParam: number | null }) {
  const { t } = useApp();
  const [subjectId, setSubjectId] = useCurrentSubject();
  const notes = useLiveQuery(() => (subjectId == null ? [] : db.notes.where("subjectId").equals(subjectId).reverse().sortBy("updatedAt")), [subjectId], [] as Note[]);
  const [selected, setSelected] = useState<number | null>(noteParam);

  useEffect(() => {
    if (noteParam == null) return;
    void db.notes.get(noteParam).then((n) => n && setSubjectId(n.subjectId));
  }, [noteParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (subjectId == null) return;
    const id = (await db.notes.add({ subjectId, title: "", content: "", createdAt: Date.now(), updatedAt: Date.now() })) as number;
    setSelected(id);
  };

  const current = notes.find((n) => n.id === selected) ?? null;

  return (
    <div>
      <div className="pagehead">
        <h1>{t("notes.title")}</h1>
        <div className="row">
          <SubjectSelect value={subjectId} onChange={setSubjectId} />
          <button className="btn primary" onClick={create} disabled={subjectId == null}>
            ＋ {t("notes.new")}
          </button>
        </div>
      </div>
      <div className="notes">
        <div className="stack" style={{ gap: 6 }}>
          {notes.length === 0 && <Empty icon="📝" title={t("notes.empty")} />}
          {notes.map((n) => (
            <button key={n.id} className={`chat-item ${n.id === selected ? "active" : ""}`} onClick={() => setSelected(n.id!)}>
              {n.title || t("notes.untitled")}
              <div className="muted small">{new Date(n.updatedAt).toLocaleDateString()}</div>
            </button>
          ))}
        </div>
        {current ? <NoteEditor key={current.id} note={current} onDeleted={() => setSelected(null)} /> : <div />}
      </div>
    </div>
  );
}

function NoteEditor({ note, onDeleted }: { note: Note; onDeleted: () => void }) {
  const { t, toast } = useApp();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [preview, setPreview] = useState(note.content.length > 0);
  const [saved, setSaved] = useState(true);
  const timer = useRef<number>();
  // Latest unsaved edit, flushed immediately if the editor closes before the debounce fires.
  const pending = useRef<{ title: string; content: string } | null>(null);

  useEffect(() => {
    if (title === note.title && content === note.content) return;
    setSaved(false);
    pending.current = { title, content };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      pending.current = null;
      await db.notes.update(note.id!, { title, content, updatedAt: Date.now() });
      setSaved(true);
    }, 600);
  }, [title, content]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pending.current) void db.notes.update(note.id!, { ...pending.current, updatedAt: Date.now() });
    },
    [note.id],
  );

  return (
    <div className="card stack note-editor">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("notes.titlePh")} style={{ fontSize: "1.2rem", fontWeight: 700 }} />
      <div className="row between">
        <div className="chips">
          <button className={`chip ${!preview ? "active" : ""}`} onClick={() => setPreview(false)}>
            ✏️ {t("notes.write")}
          </button>
          <button className={`chip ${preview ? "active" : ""}`} onClick={() => setPreview(true)}>
            👁️ {t("notes.preview")}
          </button>
        </div>
        <span className="muted small">{saved ? `✓ ${t("notes.saved")}` : "…"}</span>
      </div>
      {preview ? <Markdown text={content || "_…_"} /> : <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={t("notes.bodyPh")} />}
      <div className="row">
        <button className="btn sm" onClick={() => go(`study/create`)}>
          🧠 {t("lib.actions.cards")}
        </button>
        <button
          className="btn sm"
          onClick={async () => {
            await saveDocument({ subjectId: note.subjectId, title: title || t("notes.untitled"), kind: "text" }, textToPages(content));
            toast(t("notes.addedToLibrary"));
          }}
          disabled={!content.trim()}
        >
          📚 {t("notes.addToLibrary")}
        </button>
        <button
          className="btn sm ghost danger"
          style={{ marginLeft: "auto" }}
          onClick={async () => {
            if (!confirm(t("common.confirmDelete", { name: title || t("notes.untitled") }))) return;
            await db.notes.delete(note.id!);
            onDeleted();
          }}
        >
          🗑️ {t("common.delete")}
        </button>
      </div>
    </div>
  );
}

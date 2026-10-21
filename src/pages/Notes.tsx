import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { go, useApp } from "../app";
import { db, type Note, type Subject } from "../db";
import { Graph } from "../notes/Graph";
import { buildGraph, extractLinks, extractTags, normTitle, openLinkQuery, renameLinks, resolveLink } from "../notes/links";
import { textToPages } from "../rag/chunk";
import { saveDocument } from "../rag/ingest";
import { Empty, SubjectSelect, localStorageGet, localStorageSet } from "../ui/components";
import { Markdown } from "../ui/Markdown";

export function Notes({ noteParam }: { noteParam: number | null }) {
  const { t, toast } = useApp();
  const allNotes = useLiveQuery(() => db.notes.toArray(), [], [] as Note[]);
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], [] as Subject[]);
  const [subjectId, setSubjectIdState] = useState<number | null>(() => {
    const v = localStorageGet("studylab.notesSubject");
    return v ? Number(v) : null;
  });
  const setSubjectId = (id: number | null) => {
    setSubjectIdState(id);
    localStorageSet("studylab.notesSubject", id == null ? "" : String(id));
  };
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(false);
  const selected = noteParam;

  // Opening a note from another subject (via a link) widens the list so it stays visible.
  useEffect(() => {
    if (selected == null) return;
    const n = allNotes.find((x) => x.id === selected);
    if (n && subjectId != null && n.subjectId !== subjectId) setSubjectId(null);
    setShowGraph(false);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const scoped = useMemo(() => allNotes.filter((n) => subjectId == null || n.subjectId === subjectId), [allNotes, subjectId]);
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of scoped) for (const tag of extractTags(n.content)) m.set(tag, (m.get(tag) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [scoped]);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return scoped
      .filter((n) => !tagFilter || extractTags(n.content).includes(tagFilter))
      .filter((n) => !q || n.title.toLocaleLowerCase().includes(q) || n.content.toLocaleLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [scoped, query, tagFilter]);
  const graph = useMemo(() => buildGraph(allNotes), [allNotes]);
  const scopedGraph = useMemo(() => {
    if (subjectId == null) return graph;
    const ids = new Set(scoped.map((n) => n.id!));
    return { ...graph, nodes: graph.nodes.filter((n) => ids.has(n.id)), edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
  }, [graph, scoped, subjectId]);
  const knownTitles = useMemo(() => new Set(allNotes.filter((n) => n.title).map((n) => normTitle(n.title))), [allNotes]);
  const colors = useMemo(() => new Map(subjects.map((s) => [s.id!, s.color])), [subjects]);
  const subjectName = useMemo(() => new Map(subjects.map((s) => [s.id!, s.name])), [subjects]);

  const targetSubject = () => subjectId ?? allNotes.find((n) => n.id === selected)?.subjectId ?? subjects[0]?.id ?? null;

  const create = async (title = "") => {
    const sid = targetSubject();
    if (sid == null) return toast(t("lib.needSubject"), true);
    const id = (await db.notes.add({ subjectId: sid, title, content: "", createdAt: Date.now(), updatedAt: Date.now() })) as number;
    go(`notes/${id}`);
    return id;
  };

  const openByTitle = async (target: string, from?: Note) => {
    const hit = resolveLink(target, allNotes, from?.subjectId);
    if (hit) return go(`notes/${hit.id}`);
    const sid = from?.subjectId ?? targetSubject();
    if (sid == null) return;
    const id = (await db.notes.add({ subjectId: sid, title: target.trim(), content: "", createdAt: Date.now(), updatedAt: Date.now() })) as number;
    toast(t("notes.created", { title: target.trim() }));
    go(`notes/${id}`);
  };

  const current = allNotes.find((n) => n.id === selected) ?? null;

  return (
    <div>
      <div className="pagehead">
        <h1>{t("notes.title")}</h1>
        <div className="row">
          <SubjectSelect value={subjectId} onChange={setSubjectId} allowAll />
          <button className={`btn ${showGraph ? "primary" : ""}`} onClick={() => setShowGraph(!showGraph)} data-testid="toggle-graph">
            {showGraph ? `📝 ${t("notes.title")}` : `🕸️ ${t("notes.graph")}`}
          </button>
          <button className="btn primary" onClick={() => create()} disabled={!subjects.length}>
            ＋ {t("notes.new")}
          </button>
        </div>
      </div>

      {showGraph ? (
        <div className="card stack">
          <p className="muted small" style={{ margin: 0 }}>
            {t("notes.graphHelp")}
          </p>
          {scopedGraph.nodes.length ? (
            <Graph graph={scopedGraph} colors={colors} currentId={selected} untitled={t("notes.untitled")} onOpen={(id) => go(`notes/${id}`)} />
          ) : (
            <Empty icon="🕸️" title={t("notes.graphEmpty")} />
          )}
        </div>
      ) : (
        <div className="notes">
          <div className="stack" style={{ gap: 8 }}>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("notes.search")} />
            {tagCounts.length > 0 && (
              <div className="chips" aria-label={t("notes.tags")}>
                {tagCounts.slice(0, 20).map(([tag, count]) => (
                  <button key={tag} className={`chip small ${tagFilter === tag ? "active" : ""}`} onClick={() => setTagFilter(tagFilter === tag ? null : tag)}>
                    #{tag} <span className="muted">{count}</span>
                  </button>
                ))}
              </div>
            )}
            {(tagFilter || query) && (
              <button
                className="btn ghost sm"
                onClick={() => {
                  setTagFilter(null);
                  setQuery("");
                }}
              >
                ✕ {t("notes.clearFilter")}
              </button>
            )}
            {visible.length === 0 && <Empty icon="📝" title={t("notes.empty")} />}
            {visible.map((n) => (
              <button key={n.id} className={`chat-item ${n.id === selected ? "active" : ""}`} onClick={() => go(`notes/${n.id}`)} style={{ whiteSpace: "normal" }}>
                <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                  {subjectId == null && <span className="dot" style={{ background: colors.get(n.subjectId) }} title={subjectName.get(n.subjectId)} />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title || t("notes.untitled")}</span>
                </span>
                <span className="muted small">
                  {new Date(n.updatedAt).toLocaleDateString()}
                  {(graph.backlinks.get(n.id!)?.length ?? 0) > 0 && ` · ↩ ${graph.backlinks.get(n.id!)!.length}`}
                </span>
              </button>
            ))}
          </div>
          {current ? (
            <NoteEditor
              key={current.id}
              note={current}
              allNotes={allNotes}
              knownTitles={knownTitles}
              backlinks={(graph.backlinks.get(current.id!) ?? []).map((id) => allNotes.find((n) => n.id === id)!).filter(Boolean)}
              onOpenTitle={(title) => openByTitle(title, current)}
              onTag={(tag) => setTagFilter(tag)}
              onDeleted={() => go("notes")}
            />
          ) : (
            <div className="card">
              <Empty icon="🔗" title={t("notes.linkHelpTitle")}>
                <p className="small">{t("notes.linkHelp")}</p>
              </Empty>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface EditorProps {
  note: Note;
  allNotes: Note[];
  knownTitles: Set<string>;
  backlinks: Note[];
  onOpenTitle: (title: string) => void;
  onTag: (tag: string) => void;
  onDeleted: () => void;
}

function NoteEditor({ note, allNotes, knownTitles, backlinks, onOpenTitle, onTag, onDeleted }: EditorProps) {
  const { t, toast } = useApp();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [preview, setPreview] = useState(note.content.length > 0);
  const [saved, setSaved] = useState(true);
  const timer = useRef<number>();
  // Latest unsaved edit, flushed immediately if the editor closes before the debounce fires.
  const pending = useRef<{ title: string; content: string } | null>(null);
  const titleAtFocus = useRef(note.title);
  const area = useRef<HTMLTextAreaElement>(null);
  const [suggest, setSuggest] = useState<{ query: string; index: number } | null>(null);

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

  /** After a rename, point [[Old title]] links in other notes at the new title (like Obsidian). */
  const commitTitle = async () => {
    const oldTitle = titleAtFocus.current;
    titleAtFocus.current = title;
    if (!oldTitle.trim() || !title.trim() || normTitle(oldTitle) === normTitle(title)) return;
    let changed = 0;
    await db.transaction("rw", db.notes, async () => {
      for (const other of await db.notes.toArray()) {
        if (other.id === note.id) continue;
        const pointsHere = extractLinks(other.content).some((l) => normTitle(l) === normTitle(oldTitle) && resolveLink(l, [...allNotes.filter((n) => n.id !== note.id), { ...note, title: oldTitle }], other.subjectId)?.id === note.id);
        if (!pointsHere) continue;
        const updated = renameLinks(other.content, oldTitle, title);
        if (updated !== other.content) {
          await db.notes.update(other.id!, { content: updated, updatedAt: Date.now() });
          changed++;
        }
      }
    });
    if (changed) toast(t("notes.renamed", { n: changed }));
  };

  const suggestions = useMemo(() => {
    if (!suggest) return [];
    const q = normTitle(suggest.query);
    return allNotes
      .filter((n) => n.id !== note.id && n.title && normTitle(n.title).includes(q))
      .sort((a, b) => Number(!normTitle(a.title).startsWith(q)) - Number(!normTitle(b.title).startsWith(q)) || a.title.localeCompare(b.title))
      .slice(0, 8);
  }, [suggest, allNotes, note.id]);

  const updateSuggest = (el: HTMLTextAreaElement) => {
    const q = openLinkQuery(el.value.slice(0, el.selectionStart));
    setSuggest(q == null ? null : { query: q, index: 0 });
  };

  const insertLink = (linkTitle: string) => {
    const el = area.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const start = before.lastIndexOf("[[");
    let after = el.value.slice(el.selectionStart);
    if (after.startsWith("]]")) after = after.slice(2);
    const next = `${before.slice(0, start)}[[${linkTitle}]]${after}`;
    setContent(next);
    setSuggest(null);
    const caret = start + linkTitle.length + 4;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const backlinkContext = (other: Note) => {
    const line = other.content.split("\n").find((l) => extractLinks(l).some((x) => normTitle(x) === normTitle(note.title)));
    return line?.trim().slice(0, 160) ?? "";
  };

  return (
    <div className="stack">
      <div className="card stack note-editor">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => (titleAtFocus.current = title)}
          onBlur={commitTitle}
          placeholder={t("notes.titlePh")}
          style={{ fontSize: "1.2rem", fontWeight: 700 }}
          data-testid="note-title"
        />
        <div className="row between">
          <div className="chips">
            <button className={`chip ${!preview ? "active" : ""}`} onClick={() => setPreview(false)}>
              ✏️ {t("notes.write")}
            </button>
            <button className={`chip ${preview ? "active" : ""}`} onClick={() => setPreview(true)} data-testid="note-preview">
              👁️ {t("notes.preview")}
            </button>
          </div>
          <span className="muted small">{saved ? `✓ ${t("notes.saved")}` : "…"}</span>
        </div>
        {preview ? (
          <Markdown text={content || "_…_"} notes knownTitles={knownTitles} onWikilink={onOpenTitle} onTag={onTag} />
        ) : (
          <div style={{ position: "relative" }}>
            <textarea
              ref={area}
              value={content}
              data-testid="note-body"
              onChange={(e) => {
                setContent(e.target.value);
                updateSuggest(e.target);
              }}
              onClick={(e) => updateSuggest(e.currentTarget)}
              onBlur={() => setTimeout(() => setSuggest(null), 150)}
              onKeyDown={(e) => {
                if (!suggest || !suggestions.length) return;
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const d = e.key === "ArrowDown" ? 1 : -1;
                  setSuggest({ ...suggest, index: (suggest.index + d + suggestions.length) % suggestions.length });
                } else if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  insertLink(suggestions[suggest.index].title);
                } else if (e.key === "Escape") {
                  setSuggest(null);
                }
              }}
              placeholder={t("notes.bodyPh")}
            />
            {suggest && (
              <div className="suggest" role="listbox">
                {suggestions.map((s, i) => (
                  <button key={s.id} role="option" aria-selected={i === suggest.index} className={i === suggest.index ? "active" : ""} onMouseDown={(e) => (e.preventDefault(), insertLink(s.title))}>
                    🔗 {s.title}
                  </button>
                ))}
                {suggest.query.trim() && !suggestions.some((s) => normTitle(s.title) === normTitle(suggest.query)) && (
                  <button className="muted" onMouseDown={(e) => (e.preventDefault(), insertLink(suggest.query.trim()))}>
                    ＋ {t("notes.newLink", { title: suggest.query.trim() })}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <p className="muted small" style={{ margin: 0 }}>
          {t("notes.linkHelp")}
        </p>
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
              pending.current = null;
              await db.notes.delete(note.id!);
              onDeleted();
            }}
          >
            🗑️ {t("common.delete")}
          </button>
        </div>
      </div>

      <div className="card stack" data-testid="backlinks">
        <strong>
          ↩ {t("notes.backlinks")} ({backlinks.length})
        </strong>
        {backlinks.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            {title.trim() ? t("notes.noBacklinks", { title: title.trim() }) : t("notes.noBacklinksUntitled")}
          </p>
        ) : (
          backlinks.map((b) => (
            <button key={b.id} className="docrow" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => go(`notes/${b.id}`)}>
              <div className="grow">
                <div className="title">{b.title || t("notes.untitled")}</div>
                <div className="muted small">{backlinkContext(b)}</div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

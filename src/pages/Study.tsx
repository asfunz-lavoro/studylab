import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { go, useApp } from "../app";
import { db, type Flashcard } from "../db";
import { formatInterval } from "../i18n";
import { isConfigured } from "../llm";
import {
  Rating,
  dueCards,
  generateFlashcards,
  generateQuiz,
  generateSummary,
  gradeCard,
  loadMaterial,
  newCard,
  previewIntervals,
  type DraftCard,
  type Material,
  type MaterialSelection,
  type QuizQuestion,
} from "../study";
import { Empty, Notice, Spinner, SubjectSelect, useAbort, useCurrentSubject } from "../ui/components";
import { Markdown } from "../ui/Markdown";

type Tab = "review" | "create" | "quiz" | "summary" | "cards";
const TABS: Tab[] = ["review", "create", "quiz", "summary", "cards"];

export function Study({ tab, docParam }: { tab: string; docParam: number | null }) {
  const { t } = useApp();
  const active: Tab = TABS.includes(tab as Tab) ? (tab as Tab) : "review";
  return (
    <div>
      <div className="pagehead">
        <h1>{t("study.title")}</h1>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x} role="tab" aria-selected={active === x} className={`tab ${active === x ? "active" : ""}`} onClick={() => go(`study/${x}`)}>
            {t(`study.tab.${x}`)}
          </button>
        ))}
      </div>
      {active === "review" && <Review />}
      {active === "create" && <CreateCards docParam={docParam} />}
      {active === "quiz" && <Quiz docParam={docParam} />}
      {active === "summary" && <Summary docParam={docParam} />}
      {active === "cards" && <CardList />}
    </div>
  );
}

// ----------------------------------------------------------------- review

function Review() {
  const { t } = useApp();
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [queue, setQueue] = useState<Flashcard[] | null>(null);
  const [shown, setShown] = useState(false);
  const docTitle = useLiveQuery(async () => (queue?.[0]?.docId ? (await db.docs.get(queue[0].docId))?.title : undefined), [queue?.[0]?.id]);

  useEffect(() => {
    void dueCards(subjectId).then(setQueue);
  }, [subjectId]);

  if (!queue) return <Spinner />;
  const card = queue[0];
  const intervals = card ? previewIntervals(card) : null;

  const grade = async (g: typeof Rating.Again | typeof Rating.Hard | typeof Rating.Good | typeof Rating.Easy) => {
    const updated = await gradeCard(card, g);
    setShown(false);
    // Only cards due again within a couple of minutes ("Didn't know") come back in this session;
    // a 10-minute relearning step after "Knew it" waits for the next visit instead of reappearing at once.
    const rest = queue.slice(1);
    setQueue(+new Date(updated.srs.due) - Date.now() < 2 * 60_000 ? [...rest, updated] : rest);
  };

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="row between">
        <SubjectSelect value={subjectId} onChange={setSubjectId} allowAll />
        {card && <span className="badge accent">{t("study.review.left", { n: queue.length })}</span>}
      </div>
      {!card ? (
        <div className="card">
          <Empty icon="🎉" title={t("study.review.none")}>
            <p>{t("study.review.noneSub")}</p>
            <button className="btn primary" onClick={() => go("study/create")}>
              {t("study.tab.create")}
            </button>
          </Empty>
        </div>
      ) : (
        <>
          <div className="card flashcard">
            <Markdown text={card.front} />
            {shown && (
              <div className="answer">
                <Markdown text={card.back} />
                {docTitle && card.page && (
                  <button className="btn ghost sm mt" onClick={() => go(`doc/${card.docId}?page=${card.page}`)}>
                    📖 {t("study.review.source", { title: docTitle, page: card.page })}
                  </button>
                )}
              </div>
            )}
          </div>
          {!shown ? (
            <button className="btn primary lg block" onClick={() => setShown(true)} autoFocus>
              {t("study.review.show")}
            </button>
          ) : (
            intervals && (
              <div className="grades">
                <button className="btn again" onClick={() => grade(Rating.Again)}>
                  {t("study.review.again")}
                  <small>{formatInterval(intervals.again, t)}</small>
                </button>
                <button className="btn" onClick={() => grade(Rating.Hard)}>
                  {t("study.review.hard")}
                  <small>{formatInterval(intervals.hard, t)}</small>
                </button>
                <button className="btn good" onClick={() => grade(Rating.Good)}>
                  {t("study.review.good")}
                  <small>{formatInterval(intervals.good, t)}</small>
                </button>
                <button className="btn" onClick={() => grade(Rating.Easy)}>
                  {t("study.review.easy")}
                  <small>{formatInterval(intervals.easy, t)}</small>
                </button>
              </div>
            )
          )}
          <p className="muted small center">{t("study.review.help")}</p>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------ material picker

interface Picked {
  subjectId: number | null;
  selection: MaterialSelection | null;
}

function MaterialPicker({ docParam, onChange }: { docParam: number | null; onChange: (p: Picked) => void }) {
  const { t } = useApp();
  const [subjectId, setSubjectId] = useCurrentSubject();
  const [source, setSource] = useState<"doc" | "note">("doc");
  const [docId, setDocId] = useState<number | null>(docParam);
  const [noteId, setNoteId] = useState<number | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const docs = useLiveQuery(() => (subjectId == null ? [] : db.docs.where("subjectId").equals(subjectId).toArray()), [subjectId], []);
  const notes = useLiveQuery(() => (subjectId == null ? [] : db.notes.where("subjectId").equals(subjectId).toArray()), [subjectId], []);
  const doc = docs.find((d) => d.id === docId);

  useEffect(() => {
    if (docParam == null) return;
    void db.docs.get(docParam).then((d) => d && setSubjectId(d.subjectId));
  }, [docParam]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (source === "doc" && docs.length && !docs.some((d) => d.id === docId)) setDocId(docs[0].id!);
    if (source === "note" && notes.length && !notes.some((n) => n.id === noteId)) setNoteId(notes[0].id!);
  }, [docs, notes, source]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const note = notes.find((n) => n.id === noteId);
    const selection: MaterialSelection | null =
      source === "doc" && docId != null && docs.some((d) => d.id === docId)
        ? { docId, fromPage: from ? Number(from) : undefined, toPage: to ? Number(to) : undefined }
        : source === "note" && note
          ? { text: `# ${note.title}\n\n${note.content}` }
          : null;
    onChange({ subjectId, selection });
  }, [subjectId, source, docId, noteId, from, to, docs, notes]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stack">
      <div className="row">
        <span className="muted small">{t("common.subject")}</span>
        <SubjectSelect value={subjectId} onChange={setSubjectId} />
      </div>
      <strong>{t("study.from")}</strong>
      <div className="chips">
        <button className={`chip ${source === "doc" ? "active" : ""}`} onClick={() => setSource("doc")}>
          📚 {t("study.fromDoc")}
        </button>
        <button className={`chip ${source === "note" ? "active" : ""}`} onClick={() => setSource("note")}>
          📝 {t("study.fromNote")}
        </button>
      </div>
      {source === "doc" ? (
        docs.length === 0 ? (
          <Notice kind="info">
            <div className="row between">
              <span>{t("lib.empty")}</span>
              <button className="btn sm" onClick={() => go("library")}>
                📚 {t("nav.library")}
              </button>
            </div>
          </Notice>
        ) : (
          <>
            <label className="field">
              {t("study.pickDoc")}
              <select value={docId ?? ""} onChange={(e) => setDocId(Number(e.target.value))} data-testid="doc-select">
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({t("common.nPages", { n: d.pageCount })})
                  </option>
                ))}
              </select>
            </label>
            {doc && doc.pageCount > 1 && (
              <div className="row">
                <label className="field" style={{ width: 140 }}>
                  {t("study.from.label")}
                  <input type="number" min={1} max={doc.pageCount} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="1" />
                </label>
                <label className="field" style={{ width: 140 }}>
                  {t("study.to.label")}
                  <input type="number" min={1} max={doc.pageCount} value={to} onChange={(e) => setTo(e.target.value)} placeholder={String(doc.pageCount)} />
                </label>
              </div>
            )}
          </>
        )
      ) : notes.length === 0 ? (
        <Notice kind="info">{t("notes.empty")}</Notice>
      ) : (
        <label className="field">
          {t("study.pickNote")}
          <select value={noteId ?? ""} onChange={(e) => setNoteId(Number(e.target.value))}>
            {notes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title || t("notes.untitled")}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function TruncationNotice({ material }: { material: Material | null }) {
  const { t } = useApp();
  if (!material?.truncated) return null;
  return <Notice kind="warn">{material.usedThrough ? t("study.truncated", { page: material.usedThrough }) : t("study.truncatedText")}</Notice>;
}

function useGenerator() {
  const { t, settings, toast, errorText } = useApp();
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState<number | null>(null);
  const [material, setMaterial] = useState<Material | null>(null);
  const [startAbort, stop] = useAbort();
  const run = async <R,>(sel: MaterialSelection | null, fn: (m: Material, signal: AbortSignal, onWait: (s: number) => void) => Promise<R>): Promise<R | null> => {
    if (!isConfigured(settings)) {
      toast(t("err.needAI"), true);
      return null;
    }
    if (!sel) return null;
    setBusy(true);
    try {
      const m = await loadMaterial(sel);
      setMaterial(m);
      if (!m.text.trim()) {
        toast(t("study.err.empty"), true);
        return null;
      }
      return await fn(m, startAbort(), (s) => setWait(s));
    } catch (err) {
      toast(errorText(err), true);
      return null;
    } finally {
      setBusy(false);
      setWait(null);
    }
  };
  return { busy, wait, material, run, stop };
}

function BusyRow({ busy, wait, onStop }: { busy: boolean; wait: number | null; onStop: () => void }) {
  const { t } = useApp();
  if (!busy) return null;
  return (
    <div className="row">
      <Spinner label={wait ? t("common.waiting", { s: wait }) : t("study.generating")} />
      <button className="btn sm" onClick={onStop}>
        {t("common.stop")}
      </button>
    </div>
  );
}

// ----------------------------------------------------------- create cards

function CreateCards({ docParam }: { docParam: number | null }) {
  const { t, settings, toast } = useApp();
  const [picked, setPicked] = useState<Picked>({ subjectId: null, selection: null });
  const [count, setCount] = useState(10);
  const [drafts, setDrafts] = useState<DraftCard[] | null>(null);
  const gen = useGenerator();

  const save = async () => {
    if (!drafts || picked.subjectId == null) return;
    const docId = picked.selection?.docId;
    await db.cards.bulkAdd(drafts.filter((d) => d.front.trim() && d.back.trim()).map((d) => newCard(picked.subjectId!, d.front, d.back, docId, docId ? d.page : undefined)));
    toast(t("study.cards.saved", { n: drafts.length }));
    setDrafts(null);
  };

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className="card stack">
        <MaterialPicker docParam={docParam} onChange={setPicked} />
        <label className="field" style={{ width: 160 }}>
          {t("study.count")}
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[5, 10, 15, 20, 30].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <div>
          <button
            className="btn primary"
            disabled={gen.busy || !picked.selection}
            onClick={async () => setDrafts(await gen.run(picked.selection, (m, signal, onWait) => generateFlashcards(settings, m, count, signal, onWait)))}
            data-testid="gen-cards"
          >
            ✨ {t("common.generate")}
          </button>
        </div>
        <BusyRow busy={gen.busy} wait={gen.wait} onStop={gen.stop} />
        <TruncationNotice material={gen.material} />
      </div>

      {drafts && (
        <div className="card stack">
          <Notice kind="info">{t("study.cards.preview")}</Notice>
          {drafts.map((d, i) => (
            <div key={i} className="stack" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
              <div className="row between">
                <strong>
                  #{i + 1} {d.page ? <span className="muted small">· {t("common.page")} {d.page}</span> : null}
                </strong>
                <button className="btn ghost sm danger" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} aria-label={t("common.delete")}>
                  🗑️
                </button>
              </div>
              <label className="field">
                {t("study.cards.front")}
                <textarea style={{ minHeight: 60 }} value={d.front} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, front: e.target.value } : x)))} />
              </label>
              <label className="field">
                {t("study.cards.back")}
                <textarea style={{ minHeight: 60 }} value={d.back} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, back: e.target.value } : x)))} />
              </label>
            </div>
          ))}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setDrafts(null)}>
              {t("common.cancel")}
            </button>
            <button className="btn primary" onClick={save} disabled={!drafts.length} data-testid="save-cards">
              {t("study.cards.saveAll", { n: drafts.length })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------- quiz

function Quiz({ docParam }: { docParam: number | null }) {
  const { t, settings, toast } = useApp();
  const [picked, setPicked] = useState<Picked>({ subjectId: null, selection: null });
  const [count, setCount] = useState(5);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const gen = useGenerator();

  const start = async () => {
    const qs = await gen.run(picked.selection, (m, signal, onWait) => generateQuiz(settings, m, count, signal, onWait));
    if (qs?.length) {
      setQuestions(qs);
      setIndex(0);
      setChosen(null);
      setChecked(false);
      setAnswers([]);
    }
  };

  if (questions && index >= questions.length) {
    const score = answers.filter(Boolean).length;
    const missed = questions.filter((_, i) => !answers[i]);
    return (
      <div className="card stack center" style={{ maxWidth: 720 }}>
        <div style={{ fontSize: "3rem" }}>{score / questions.length >= 0.8 ? "🏆" : score / questions.length >= 0.5 ? "👍" : "💪"}</div>
        <h2>{t("study.quiz.result", { score, total: questions.length })}</h2>
        <div className="row" style={{ justifyContent: "center" }}>
          {missed.length > 0 && picked.subjectId != null && (
            <button
              className="btn"
              onClick={async () => {
                const docId = picked.selection?.docId;
                await db.cards.bulkAdd(missed.map((q) => newCard(picked.subjectId!, q.question, `${q.options[q.answer]}\n\n${q.explanation}`, docId, docId ? q.page : undefined)));
                toast(t("study.quiz.toCardsDone", { n: missed.length }));
              }}
            >
              🧠 {t("study.quiz.toCards")}
            </button>
          )}
          <button className="btn primary" onClick={() => setQuestions(null)}>
            {t("study.quiz.again")}
          </button>
        </div>
      </div>
    );
  }

  if (questions) {
    const q = questions[index];
    return (
      <div className="card stack" style={{ maxWidth: 720 }}>
        <span className="muted small">{t("study.quiz.question", { n: index + 1, total: questions.length })}</span>
        <Markdown text={q.question} />
        <div className="stack">
          {q.options.map((o, i) => (
            <button
              key={i}
              className={`option ${checked ? (i === q.answer ? "right" : i === chosen ? "wrong" : "") : chosen === i ? "sel" : ""}`}
              onClick={() => !checked && setChosen(i)}
              disabled={checked}
            >
              <strong>{String.fromCharCode(65 + i)}.</strong>
              <Markdown text={o} />
            </button>
          ))}
        </div>
        {checked && (
          <Notice kind={chosen === q.answer ? "ok" : "err"}>
            <p>
              <strong>{chosen === q.answer ? t("study.quiz.correct") : t("study.quiz.wrong", { answer: String.fromCharCode(65 + q.answer) })}</strong>
            </p>
            <Markdown text={q.explanation} />
            {q.page ? <p className="muted small">({t("common.page")} {q.page})</p> : null}
          </Notice>
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {!checked ? (
            <button
              className="btn primary"
              disabled={chosen == null}
              onClick={() => {
                setChecked(true);
                setAnswers([...answers, chosen === q.answer]);
              }}
            >
              {t("study.quiz.check")}
            </button>
          ) : (
            <button
              className="btn primary"
              onClick={() => {
                setIndex(index + 1);
                setChosen(null);
                setChecked(false);
              }}
            >
              {t("study.quiz.next")} →
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card stack" style={{ maxWidth: 820 }}>
      <MaterialPicker docParam={docParam} onChange={setPicked} />
      <label className="field" style={{ width: 160 }}>
        {t("study.count")}
        <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
          {[5, 10, 15, 20].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <div>
        <button className="btn primary" disabled={gen.busy || !picked.selection} onClick={start} data-testid="start-quiz">
          ✨ {t("study.quiz.start")}
        </button>
      </div>
      <BusyRow busy={gen.busy} wait={gen.wait} onStop={gen.stop} />
      <TruncationNotice material={gen.material} />
    </div>
  );
}

// ------------------------------------------------------------------ summary

function Summary({ docParam }: { docParam: number | null }) {
  const { t, settings, toast } = useApp();
  const [picked, setPicked] = useState<Picked>({ subjectId: null, selection: null });
  const [style, setStyle] = useState<"summary" | "outline" | "keyconcepts">("summary");
  const [text, setText] = useState("");
  const [savedTitle, setSavedTitle] = useState("");
  const gen = useGenerator();
  const docTitle = useLiveQuery(async () => (picked.selection?.docId ? (await db.docs.get(picked.selection.docId))?.title : ""), [picked.selection?.docId]);

  const run = async () => {
    setText("");
    setSavedTitle("");
    const out = await gen.run(picked.selection, (m, signal, onWait) => generateSummary(settings, m, style, setText, signal, onWait));
    if (out) {
      setText(out);
      const range = picked.selection?.fromPage || picked.selection?.toPage ? ` (${t("common.page")} ${picked.selection.fromPage ?? 1}-${picked.selection.toPage ?? ""})` : "";
      setSavedTitle(`${t(`study.summary.${style}`)}: ${docTitle || ""}${range}`);
    }
  };

  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <div className="card stack">
        <MaterialPicker docParam={docParam} onChange={setPicked} />
        <strong>{t("study.summary.style")}</strong>
        <div className="chips">
          {(["summary", "outline", "keyconcepts"] as const).map((s) => (
            <button key={s} className={`chip ${style === s ? "active" : ""}`} onClick={() => setStyle(s)}>
              {t(`study.summary.${s}`)}
            </button>
          ))}
        </div>
        <div>
          <button className="btn primary" disabled={gen.busy || !picked.selection} onClick={run}>
            ✨ {t("common.generate")}
          </button>
        </div>
        <BusyRow busy={gen.busy} wait={gen.wait} onStop={gen.stop} />
        <TruncationNotice material={gen.material} />
      </div>
      {text && (
        <div className="card stack">
          <Markdown text={text} />
          {!gen.busy && picked.subjectId != null && (
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button
                className="btn primary"
                onClick={async () => {
                  await db.notes.add({ subjectId: picked.subjectId!, title: savedTitle || t("notes.untitled"), content: text, createdAt: Date.now(), updatedAt: Date.now() });
                  toast(t("study.summary.saved"));
                }}
              >
                📝 {t("study.summary.saveNote")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------- card list

function CardList() {
  const { t } = useApp();
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const cards = useLiveQuery(() => (subjectId == null ? db.cards.toArray() : db.cards.where("subjectId").equals(subjectId).toArray()), [subjectId], [] as Flashcard[]);
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const sorted = useMemo(() => [...cards].sort((a, b) => b.createdAt - a.createdAt), [cards]);
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <div className="row between">
        <SubjectSelect value={subjectId} onChange={setSubjectId} allowAll />
        <button className="btn sm" onClick={() => setAdding(true)}>
          ＋ {t("study.cards.add")}
        </button>
      </div>
      {adding && <CardEditor onDone={() => setAdding(false)} defaultSubject={subjectId} />}
      {sorted.length === 0 && !adding && <Empty icon="🗂️" title={t("study.cards.empty")} />}
      {sorted.map((c) =>
        editing === c.id ? (
          <CardEditor key={c.id} card={c} onDone={() => setEditing(null)} defaultSubject={c.subjectId} />
        ) : (
          <div key={c.id} className="docrow">
            <div className="grow">
              <Markdown text={c.front} />
              <div className="muted small">
                <Markdown text={c.back} />
              </div>
              <span className="badge mt">{t("study.cards.due", { when: new Date(c.srs.due).toLocaleDateString() })}</span>
            </div>
            <button className="btn sm ghost" onClick={() => setEditing(c.id!)} aria-label={t("common.edit")}>
              ✏️
            </button>
            <button className="btn sm ghost danger" onClick={() => db.cards.delete(c.id!)} aria-label={t("common.delete")}>
              🗑️
            </button>
          </div>
        ),
      )}
    </div>
  );
}

function CardEditor({ card, onDone, defaultSubject }: { card?: Flashcard; onDone: () => void; defaultSubject: number | null }) {
  const { t } = useApp();
  const [front, setFront] = useState(card?.front ?? "");
  const [back, setBack] = useState(card?.back ?? "");
  const [subjectId, setSubjectId] = useState<number | null>(card?.subjectId ?? defaultSubject);
  return (
    <div className="card stack">
      {!card && <SubjectSelect value={subjectId} onChange={setSubjectId} />}
      <label className="field">
        {t("study.cards.front")}
        <textarea style={{ minHeight: 60 }} value={front} onChange={(e) => setFront(e.target.value)} />
      </label>
      <label className="field">
        {t("study.cards.back")}
        <textarea style={{ minHeight: 60 }} value={back} onChange={(e) => setBack(e.target.value)} />
      </label>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onDone}>
          {t("common.cancel")}
        </button>
        <button
          className="btn primary"
          disabled={!front.trim() || !back.trim() || subjectId == null}
          onClick={async () => {
            if (card) await db.cards.update(card.id!, { front, back });
            else await db.cards.add(newCard(subjectId!, front, back));
            onDone();
          }}
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}

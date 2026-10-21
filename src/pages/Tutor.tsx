import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { go, useApp } from "../app";
import { db, type Chat, type ChatTurn, type Source, type TutorMode } from "../db";
import { isConfigured } from "../llm";
import { askTutor } from "../tutor";
import { Notice, SubjectSelect, useAbort } from "../ui/components";
import { Markdown } from "../ui/Markdown";

const MODES: TutorMode[] = ["explain", "quiz", "simplify"];

export function Tutor({ initialSubject }: { initialSubject: number | null }) {
  const { t, settings, toast, errorText } = useApp();
  const chats = useLiveQuery(() => db.chats.orderBy("updatedAt").reverse().toArray(), [], [] as Chat[]);
  const [chatId, setChatId] = useState<number | null>(null);
  const chat = useLiveQuery(() => (chatId == null ? undefined : db.chats.get(chatId)), [chatId]);
  const [subjectId, setSubjectId] = useState<number | null>(initialSubject);
  const [mode, setMode] = useState<TutorMode>("explain");
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<{ phase: "search" | "write"; text: string; sources: Source[]; wait?: number } | null>(null);
  const [openSource, setOpenSource] = useState<string | null>(null);
  const [startAbort, stop] = useAbort();
  const msgs = useRef<HTMLDivElement>(null);
  const configured = isConfigured(settings);

  useEffect(() => {
    if (chat) {
      setSubjectId(chat.subjectId);
      setMode(chat.mode);
    }
  }, [chat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    msgs.current?.scrollTo({ top: msgs.current.scrollHeight });
  }, [chat?.turns.length, pending?.text]);

  const newChat = () => {
    stop();
    setChatId(null);
    setPending(null);
    setInput("");
  };

  const send = async (text = input) => {
    const question = text.trim();
    if (!question || pending) return;
    if (!configured) return toast(t("err.needAI"), true);
    setInput("");
    const userTurn: ChatTurn = { role: "user", content: question };
    let id = chatId;
    const history = chat?.turns ?? [];
    if (id == null) {
      id = (await db.chats.add({ subjectId, mode, title: question.slice(0, 60), turns: [userTurn], updatedAt: Date.now() })) as number;
      setChatId(id);
    } else {
      await db.chats.update(id, { turns: [...history, userTurn], updatedAt: Date.now(), subjectId, mode });
    }
    setPending({ phase: "search", text: "", sources: [] });
    const signal = startAbort();
    let turn: ChatTurn;
    try {
      const { text: answer, sources } = await askTutor({
        settings,
        subjectId,
        mode,
        history,
        question,
        signal,
        onSources: (s) => setPending({ phase: "write", text: "", sources: s }),
        onText: (partial) => setPending((p) => (p ? { ...p, phase: "write", text: partial, wait: undefined } : p)),
        onWait: (s) => setPending((p) => (p ? { ...p, wait: s } : p)),
      });
      turn = { role: "assistant", content: answer, sources };
    } catch (err) {
      turn = { role: "assistant", content: errorText(err), error: true };
    }
    const latest = await db.chats.get(id);
    await db.chats.update(id, { turns: [...(latest?.turns ?? []), turn], updatedAt: Date.now() });
    setPending(null);
  };

  const saveToNotes = async (turn: ChatTurn, question: string) => {
    if (subjectId == null) {
      const first = await db.subjects.toCollection().first();
      if (!first) return toast(t("lib.needSubject"), true);
    }
    const sid = subjectId ?? (await db.subjects.toCollection().first())!.id!;
    const sources = turn.sources?.length ? `\n\n---\n${turn.sources.map((s) => `[${s.n}] ${s.title}, ${t("common.page")} ${s.page}`).join("\n")}` : "";
    await db.notes.add({ subjectId: sid, title: question.slice(0, 80), content: turn.content + sources, createdAt: Date.now(), updatedAt: Date.now() });
    toast(t("tutor.savedNote"));
  };

  const turns = chat?.turns ?? [];

  return (
    <div className="chat">
      <aside className="chat-list">
        <button className="btn primary" onClick={newChat}>
          ＋ {t("tutor.newChat")}
        </button>
        <div className="muted small mt" style={{ padding: "0 4px" }}>
          {t("tutor.chats")}
        </div>
        {chats.length === 0 && <div className="muted small" style={{ padding: "0 4px" }}>{t("tutor.noChats")}</div>}
        {chats.map((c) => (
          <div key={c.id} className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
            <button className={`chat-item grow ${c.id === chatId ? "active" : ""}`} onClick={() => setChatId(c.id!)} title={c.title}>
              {c.title}
            </button>
            {c.id === chatId && (
              <button
                className="btn ghost sm"
                aria-label={t("tutor.deleteChat")}
                onClick={async () => {
                  if (!confirm(t("common.confirmDelete", { name: c.title }))) return;
                  await db.chats.delete(c.id!);
                  newChat();
                }}
              >
                🗑️
              </button>
            )}
          </div>
        ))}
      </aside>

      <section className="chat-main">
        <div className="chat-top">
          <span className="muted small">{t("tutor.scope")}</span>
          <SubjectSelect value={subjectId} onChange={setSubjectId} allowAll />
          <div className="chips" role="radiogroup">
            {MODES.map((m) => (
              <button key={m} className={`chip ${mode === m ? "active" : ""}`} onClick={() => setMode(m)} title={t(`tutor.mode.${m}Desc`)} role="radio" aria-checked={mode === m}>
                {t(`tutor.mode.${m}`)}
              </button>
            ))}
          </div>
          <button className="btn sm ghost" onClick={newChat} style={{ marginLeft: "auto" }}>
            ＋ {t("tutor.newChat")}
          </button>
        </div>

        <div className="chat-msgs" ref={msgs}>
          {!configured && (
            <Notice kind="warn">
              <div className="row between">
                <span>{t("err.needAI")}</span>
                <button className="btn sm primary" onClick={() => go("settings?ai=1")}>
                  {t("home.setupAIButton")}
                </button>
              </div>
            </Notice>
          )}
          {turns.length === 0 && !pending && (
            <div className="empty">
              <div className="big">💬</div>
              <h2>{t("tutor.empty.title")}</h2>
              <p>{t("tutor.empty.body")}</p>
              <p className="muted small">{t("tutor.examples")}</p>
              <div className="stack" style={{ alignItems: "center" }}>
                {(["tutor.ex1", "tutor.ex2", "tutor.ex3"] as const).map((k) => (
                  <button key={k} className="btn sm" onClick={() => (k === "tutor.ex3" ? (setMode("quiz"), setInput(t(k))) : setInput(t(k)))}>
                    {t(k)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <div key={i} className="msg user">
                {turn.content}
              </div>
            ) : (
              <AssistantMessage
                key={i}
                turn={turn}
                openSource={openSource}
                setOpenSource={setOpenSource}
                msgKey={String(i)}
                onSave={() => saveToNotes(turn, turns[i - 1]?.content ?? "")}
              />
            ),
          )}
          {pending && (
            <div className="msg assistant">
              {pending.wait ? (
                <div className="row muted">
                  <div className="spinner" />
                  {t("common.waiting", { s: pending.wait })}
                </div>
              ) : pending.text ? (
                <Markdown text={pending.text} citations={pending.sources.length} />
              ) : (
                <div className="row muted">
                  <div className="spinner" />
                  {pending.phase === "search" ? t("tutor.searching") : t("tutor.thinking")}
                </div>
              )}
            </div>
          )}
        </div>

        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("tutor.placeholder")}
            rows={1}
            data-testid="tutor-input"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          {pending ? (
            <button type="button" className="btn" onClick={stop}>
              ■ {t("common.stop")}
            </button>
          ) : (
            <button className="btn primary" disabled={!input.trim()} data-testid="tutor-send">
              {t("tutor.send")}
            </button>
          )}
        </form>
      </section>
    </div>
  );
}

function AssistantMessage({
  turn,
  msgKey,
  openSource,
  setOpenSource,
  onSave,
}: {
  turn: ChatTurn;
  msgKey: string;
  openSource: string | null;
  setOpenSource: (k: string | null) => void;
  onSave: () => void;
}) {
  const { t } = useApp();
  const sources = turn.sources ?? [];
  return (
    <div className={`msg assistant ${turn.error ? "error" : ""}`}>
      <Markdown
        text={turn.content}
        citations={sources.length}
        onCite={(n) => {
          setOpenSource(`${msgKey}:${n}`);
          document.getElementById(`src-${msgKey}-${n}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }}
      />
      {!turn.error && (
        <>
          {sources.length > 0 ? (
            <div className="sources">
              <div className="muted small">
                <strong>{t("tutor.sources")}</strong> · {t("tutor.verify")}
              </div>
              {sources.map((s) => {
                const key = `${msgKey}:${s.n}`;
                return (
                  <details key={s.n} id={`src-${msgKey}-${s.n}`} className="source" open={openSource === key} onToggle={(e) => (e.currentTarget.open ? setOpenSource(key) : openSource === key && setOpenSource(null))}>
                    <summary>
                      [{s.n}] {s.title} · {t("common.page")} {s.page}
                    </summary>
                    <div className="excerpt">{s.text}</div>
                    <button className="btn sm mt" style={{ marginTop: 8 }} onClick={() => go(`doc/${s.docId}?page=${s.page}`)}>
                      {t("common.open")} →
                    </button>
                  </details>
                );
              })}
            </div>
          ) : (
            <div className="muted small mt" style={{ marginTop: 8 }}>
              {t("tutor.noSources")}
            </div>
          )}
          <div className="row mt" style={{ marginTop: 8 }}>
            <button className="btn sm ghost" onClick={onSave}>
              📝 {t("tutor.saveNote")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

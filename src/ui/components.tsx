import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useApp } from "../app";
import { db, SUBJECT_COLORS, type Subject } from "../db";

export function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between mb">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="row muted">
      <div className="spinner" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <p>
        <strong>{title}</strong>
      </p>
      {children}
    </div>
  );
}

export function Notice({ kind = "info", icon, children }: { kind?: "info" | "warn" | "err" | "ok"; icon?: string; children: ReactNode }) {
  const icons = { info: "💡", warn: "⚠️", err: "⛔", ok: "✅" };
  return (
    <div className={`notice ${kind}`}>
      <span aria-hidden>{icon ?? icons[kind]}</span>
      <div className="grow">{children}</div>
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const { t } = useApp();
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? t("common.copied") : t("common.copy")}
    </button>
  );
}

/** Subject dropdown with an "all" option and an inline "new subject" action. */
export function SubjectSelect({
  value,
  onChange,
  allowAll,
  id,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  allowAll?: boolean;
  id?: string;
}) {
  const { t } = useApp();
  const subjects = useLiveQuery(() => db.subjects.orderBy("name").toArray(), [], [] as Subject[]);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => {
          if (e.target.value === "__new") setCreating(true);
          else onChange(e.target.value ? Number(e.target.value) : null);
        }}
        style={{ width: "auto", minWidth: 180 }}
      >
        {allowAll && <option value="">{t("common.allSubjects")}</option>}
        {!allowAll && value == null && <option value="">—</option>}
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value="__new">＋ {t("subject.new")}</option>
      </select>
      {creating && (
        <SubjectDialog
          onClose={() => setCreating(false)}
          onSaved={(newId) => {
            setCreating(false);
            onChange(newId);
          }}
        />
      )}
    </>
  );
}

export function SubjectDialog({ subject, onClose, onSaved }: { subject?: Subject; onClose: () => void; onSaved?: (id: number) => void }) {
  const { t } = useApp();
  const [name, setName] = useState(subject?.name ?? "");
  const [color, setColor] = useState(subject?.color ?? SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const save = async () => {
    if (!name.trim()) return;
    if (subject?.id) {
      await db.subjects.update(subject.id, { name: name.trim(), color });
      onSaved?.(subject.id);
    } else {
      const id = (await db.subjects.add({ name: name.trim(), color, createdAt: Date.now() })) as number;
      onSaved?.(id);
    }
    onClose();
  };
  return (
    <Modal title={subject ? t("subject.rename") : t("subject.new")} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field">
          {t("subject.name")}
          <input ref={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("onb.done.firstSubjectPh")} />
        </label>
        <div className="field">
          <span style={{ fontWeight: 600, fontSize: "0.92rem" }}>{t("subject.color")}</span>
          <div className="row">
            {SUBJECT_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                aria-label={c}
                onClick={() => setColor(c)}
                style={{ width: 32, height: 32, borderRadius: "50%", background: c, border: color === c ? "3px solid var(--text)" : "3px solid transparent", cursor: "pointer" }}
              />
            ))}
          </div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn primary" disabled={!name.trim()}>
            {t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Remember the last chosen subject across pages. */
export function useCurrentSubject(): [number | null, (id: number | null) => void] {
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], undefined);
  const [id, setId] = useState<number | null>(() => {
    const v = localStorageGet("studylab.subject");
    return v ? Number(v) : null;
  });
  useEffect(() => {
    if (!subjects) return;
    if (id == null || !subjects.some((s) => s.id === id)) {
      const first = subjects[0]?.id ?? null;
      if (first !== id) setId(first);
    }
  }, [subjects, id]);
  const set = (v: number | null) => {
    setId(v);
    localStorageSet("studylab.subject", v == null ? "" : String(v));
  };
  return [id, set];
}

export function localStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function localStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/** An AbortController per action: `start()` cancels the previous one; unmounting cancels too. */
export function useAbort(): [() => AbortSignal, () => void] {
  const ref = useRef<AbortController | null>(null);
  useEffect(() => () => ref.current?.abort(), []);
  const start = () => {
    ref.current?.abort();
    ref.current = new AbortController();
    return ref.current.signal;
  };
  const stop = () => ref.current?.abort();
  return [start, stop];
}

/**
 * Text input bound to a stored setting. Typing updates local state at once and saves after a
 * short pause (or on blur), so slow async writes never put an older value back mid-typing.
 */
export function DraftInput({
  value,
  onSave,
  ...rest
}: { value: string; onSave: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);
  const timer = useRef<number>();
  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);
  const flush = (v: string) => {
    window.clearTimeout(timer.current);
    if (v !== value) onSave(v);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <input
      {...rest}
      value={draft}
      onFocus={() => (editing.current = true)}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => onSave(v), 400);
      }}
      onBlur={() => {
        editing.current = false;
        flush(draft);
      }}
    />
  );
}

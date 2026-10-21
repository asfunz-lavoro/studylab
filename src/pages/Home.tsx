import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { go, useApp } from "../app";
import { db } from "../db";
import { isConfigured } from "../llm";
import { Notice, SubjectDialog, localStorageGet, localStorageSet } from "../ui/components";
import { InstallPrompt } from "../ui/InstallPrompt";

export function Home() {
  const { t, settings } = useApp();
  const [newSubject, setNewSubject] = useState(false);
  const subjects = useLiveQuery(() => db.subjects.orderBy("name").toArray(), [], []);
  const dueCount = useLiveQuery(() => db.cards.where("srs.due").belowOrEqual(new Date()).count(), [], 0);
  const counts = useLiveQuery(
    async () => {
      const out: Record<number, { docs: number; notes: number; cards: number }> = {};
      for (const s of await db.subjects.toArray()) {
        out[s.id!] = {
          docs: await db.docs.where("subjectId").equals(s.id!).count(),
          notes: await db.notes.where("subjectId").equals(s.id!).count(),
          cards: await db.cards.where("subjectId").equals(s.id!).count(),
        };
      }
      return out;
    },
    [],
    {} as Record<number, { docs: number; notes: number; cards: number }>,
  );
  const hasData = useLiveQuery(async () => (await db.docs.count()) + (await db.notes.count()) + (await db.cards.count()) > 0, [], false);
  const neverBackedUp = !localStorageGet("studylab.lastBackup");

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1>{t("home.hello", { name: settings.name ? ` ${settings.name}` : "" })}</h1>
        <p className="muted">{t("home.helloSub")}</p>
      </div>

      {!isConfigured(settings) && (
        <Notice kind="warn">
          <div className="row between">
            <span>{t("home.setupAI")}</span>
            <button className="btn primary sm" onClick={() => go("settings?ai=1")}>
              {t("home.setupAIButton")}
            </button>
          </div>
        </Notice>
      )}

      <div className="card row between">
        <div className="row">
          <span style={{ fontSize: "2rem" }}>🧠</span>
          <strong>{dueCount > 0 ? t("home.due", { n: dueCount }) : t("home.dueNone")}</strong>
        </div>
        {dueCount > 0 && (
          <button className="btn primary" onClick={() => go("study/review")}>
            {t("home.startReview")}
          </button>
        )}
      </div>

      <div className="row">
        <button className="btn" onClick={() => go("library")}>
          📚 {t("home.quick.upload")}
        </button>
        <button className="btn" onClick={() => go("tutor")}>
          💬 {t("home.quick.ask")}
        </button>
        <button className="btn" onClick={() => go("study/quiz")}>
          ✅ {t("home.quick.quiz")}
        </button>
      </div>

      <div>
        <div className="row between mb">
          <h2 style={{ margin: 0 }}>{t("home.subjects")}</h2>
          <button className="btn sm" onClick={() => setNewSubject(true)}>
            ＋ {t("home.newSubject")}
          </button>
        </div>
        {subjects.length === 0 ? (
          <div className="card empty">
            <div className="big">📒</div>
            <p>{t("home.noSubjects")}</p>
            <button className="btn primary" onClick={() => setNewSubject(true)}>
              ＋ {t("home.newSubject")}
            </button>
          </div>
        ) : (
          <div className="grid">
            {subjects.map((s) => {
              const c = counts[s.id!] ?? { docs: 0, notes: 0, cards: 0 };
              return (
                <button
                  key={s.id}
                  className="card subject-card"
                  style={{ ["--c" as string]: s.color }}
                  onClick={() => {
                    localStorageSet("studylab.subject", String(s.id));
                    go("library");
                  }}
                >
                  <h3>{s.name}</h3>
                  <p className="muted small" style={{ margin: 0 }}>
                    {t("home.stats", { docs: c.docs, notes: c.notes, cards: c.cards })}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {hasData && neverBackedUp && (
        <Notice kind="info" icon="💾">
          <div className="row between">
            <span>{t("home.backupReminder")}</span>
            <button className="btn sm" onClick={() => go("settings")}>
              {t("home.backupNow")}
            </button>
          </div>
        </Notice>
      )}

      <InstallPrompt />
      {newSubject && <SubjectDialog onClose={() => setNewSubject(false)} />}
    </div>
  );
}

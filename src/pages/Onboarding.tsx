import { useState } from "react";
import { go, useApp } from "../app";
import { db, SUBJECT_COLORS, type Lang, type Level } from "../db";
import { getProvider, isConfigured } from "../llm";
import { DraftInput } from "../ui/components";
import { Markdown } from "../ui/Markdown";
import { ProviderConnect, ProviderPicker } from "../ui/ProviderSetup";

const TOTAL = 5;

export function Onboarding() {
  const { t, settings, updateSettings } = useApp();
  const [step, setStep] = useState(1);
  const [providerId, setProviderId] = useState(settings.provider || "gemini");
  const [subject, setSubject] = useState("");

  const finish = async () => {
    if (subject.trim()) {
      await db.subjects.add({ name: subject.trim(), color: SUBJECT_COLORS[0], createdAt: Date.now() });
    }
    go(subject.trim() ? "library" : "home");
    await updateSettings({ onboarded: true });
    // Ask the browser not to evict our data. Chrome answers silently; Firefox shows a permission
    // prompt and the promise waits for the user, so never await it before navigating.
    void navigator.storage?.persist?.().catch(() => undefined);
  };

  return (
    <div className="onb">
      <div className="card onb-card">
        <div className="onb-progress" aria-label={t("onb.step", { n: step, total: TOTAL })}>
          {Array.from({ length: TOTAL }, (_, i) => (
            <div key={i} className={i < step ? "on" : ""} />
          ))}
        </div>
        <p className="muted small">{t("onb.step", { n: step, total: TOTAL })}</p>

        {step === 1 && (
          <div className="stack">
            <div className="row">
              <img src="./icon.svg" alt="" width={48} height={48} />
              <h1 style={{ margin: 0 }}>{t("onb.welcome.title")}</h1>
            </div>
            <p>{t("onb.welcome.body")}</p>
            <strong>{t("onb.welcome.lang")}</strong>
            <div className="row">
              {(["it", "en"] as Lang[]).map((l) => (
                <button key={l} type="button" className={`choice ${settings.lang === l ? "active" : ""}`} style={{ width: "auto", flex: 1 }} onClick={() => updateSettings({ lang: l })}>
                  <span className="emoji">{l === "it" ? "🇮🇹" : "🇬🇧"}</span>
                  <strong>{l === "it" ? "Italiano" : "English"}</strong>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <h1>{t("onb.about.title")}</h1>
            <label className="field">
              {t("onb.about.name")}
              <DraftInput value={settings.name} onSave={(name) => updateSettings({ name })} placeholder={t("onb.about.namePh")} />
            </label>
            <strong>{t("onb.about.level")}</strong>
            {(
              [
                ["school", "🎒", "onb.about.school", "onb.about.schoolDesc"],
                ["university", "🎓", "onb.about.uni", "onb.about.uniDesc"],
              ] as const
            ).map(([lvl, emoji, title, desc]) => (
              <button key={lvl} type="button" className={`choice ${settings.level === lvl ? "active" : ""}`} onClick={() => updateSettings({ level: lvl as Level })}>
                <span className="emoji">{emoji}</span>
                <span>
                  <strong>{t(title)}</strong>
                  <span className="muted small">{t(desc)}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <h1>{t("onb.ai.title")}</h1>
            <p>{t("onb.ai.body")}</p>
            <ProviderPicker value={providerId} onChange={setProviderId} />
          </div>
        )}

        {step === 4 && (
          <div className="stack">
            <h1>{t("onb.connect.title", { provider: getProvider(providerId).label })}</h1>
            <ProviderConnect providerId={providerId} />
          </div>
        )}

        {step === 5 && (
          <div className="stack">
            <h1>{t("onb.done.title")}</h1>
            <p>{t("onb.done.body")}</p>
            {(["onb.done.tip1", "onb.done.tip2", "onb.done.tip3", "onb.done.tip4"] as const).map((k) => (
              <Markdown key={k} text={t(k)} />
            ))}
            <label className="field mt">
              {t("onb.done.firstSubject")}
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("onb.done.firstSubjectPh")} />
            </label>
          </div>
        )}

        <div className="row between mt">
          {step > 1 ? (
            <button type="button" className="btn" onClick={() => setStep(step - 1)}>
              ← {t("common.back")}
            </button>
          ) : (
            <span />
          )}
          {step < TOTAL ? (
            <button
              type="button"
              className="btn primary lg"
              onClick={() => setStep(step + 1)}
              // The connect step can be skipped (the tutor will remind them), but nudge toward finishing it.
              data-testid="onb-next"
            >
              {step === 4 && !isConfigured(settings) ? t("common.next") + " (" + t("common.optional") + ")" : t("common.next")} →
            </button>
          ) : (
            <button type="button" className="btn primary lg" onClick={finish} data-testid="onb-finish">
              {t("onb.done.start")} 🚀
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

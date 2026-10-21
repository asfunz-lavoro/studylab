import { useEffect, useRef, useState } from "react";
import { useApp } from "../app";
import { downloadBlob, exportBackup, exportObsidianZip, importBackup } from "../backup";
import { db, type Lang, type Level } from "../db";
import { activeConfig, isConfigured } from "../llm";
import { DraftInput, Notice, localStorageSet } from "../ui/components";
import { ProviderConnect, ProviderPicker } from "../ui/ProviderSetup";

export function Settings({ openAI }: { openAI: boolean }) {
  const { t, settings, updateSettings, toast } = useApp();
  const [changingAI, setChangingAI] = useState(openAI || !isConfigured(settings));
  const [providerId, setProviderId] = useState(settings.provider);
  const [withFiles, setWithFiles] = useState(true);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const { provider, cfg } = activeConfig(settings);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const stamp = () => localStorageSet("studylab.lastBackup", new Date().toISOString());
  const day = new Date().toISOString().slice(0, 10);

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <h1>{t("set.title")}</h1>

      <section className="card stack">
        <h2>{t("set.profile")}</h2>
        <div className="row">
          <label className="field grow">
            {t("onb.about.name")}
            <DraftInput value={settings.name} onSave={(name) => updateSettings({ name })} />
          </label>
          <label className="field">
            {t("set.language")}
            <select value={settings.lang} onChange={(e) => updateSettings({ lang: e.target.value as Lang })}>
              <option value="it">Italiano</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="field">
            {t("onb.about.level")}
            <select value={settings.level} onChange={(e) => updateSettings({ level: e.target.value as Level })}>
              <option value="school">{t("onb.about.school")}</option>
              <option value="university">{t("onb.about.uni")}</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card stack" id="ai">
        <h2>{t("set.ai")}</h2>
        {isConfigured(settings) && !changingAI ? (
          <div className="row between">
            <span>{t("set.aiActive", { provider: provider.label, model: cfg.model })}</span>
            <button className="btn" onClick={() => setChangingAI(true)}>
              {t("set.change")}
            </button>
          </div>
        ) : (
          <>
            <ProviderPicker value={providerId} onChange={setProviderId} />
            <hr style={{ border: 0, borderTop: "1px solid var(--border)", width: "100%" }} />
            <ProviderConnect key={providerId} providerId={providerId} />
            {isConfigured(settings) && (
              <div>
                <button className="btn" onClick={() => setChangingAI(false)}>
                  {t("common.done")}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card stack">
        <h2>{t("set.s2")}</h2>
        <p className="muted small">{t("set.s2Help")}</p>
        <DraftInput type="password" value={settings.s2Key} onSave={(v) => updateSettings({ s2Key: v.trim() })} placeholder={t("common.optional")} autoComplete="off" />
      </section>

      <section className="card stack">
        <h2>{t("set.data")}</h2>
        <p>{t("set.dataBody")}</p>
        <div className="row">
          <button
            className="btn primary"
            onClick={async () => {
              downloadBlob(await exportBackup(withFiles), `studylab-backup-${day}.zip`);
              stamp();
              toast(t("set.backupDone"));
            }}
          >
            💾 {t("set.backup")}
          </button>
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} />
            {t("set.backupFiles")}
          </label>
        </div>
        <div className="row">
          <button className="btn" onClick={() => restoreInput.current?.click()}>
            📂 {t("set.restore")}
          </button>
          <input
            ref={restoreInput}
            type="file"
            accept=".zip"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file || !confirm(t("set.restoreWarn"))) return;
              try {
                await importBackup(file);
                toast(t("set.restoreDone"));
              } catch {
                toast(t("set.restoreErr"), true);
              }
            }}
          />
          <button className="btn" onClick={async () => downloadBlob(await exportObsidianZip(), `studylab-obsidian-${day}.zip`)}>
            🟣 {t("set.obsidian")}
          </button>
        </div>
        <p className="muted small">{t("set.obsidianHelp")}</p>
        <div className="row">
          {persisted ? (
            <Notice kind="ok">{t("set.persistOn")}</Notice>
          ) : (
            <button
              className="btn"
              onClick={async () => {
                const ok = (await navigator.storage?.persist?.()) ?? false;
                setPersisted(ok);
                toast(ok ? t("set.persistOn") : t("set.persistOff"), !ok);
              }}
            >
              🛡️ {t("set.persist")}
            </button>
          )}
        </div>
        <div>
          <button
            className="btn danger"
            onClick={async () => {
              if (prompt(t("set.wipeWarn")) !== t("set.wipeWord")) return;
              await db.delete();
              try {
                localStorage.clear();
              } catch {
                /* ignore */
              }
              window.location.hash = "";
              window.location.reload();
            }}
          >
            ⚠️ {t("set.wipe")}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>{t("set.about")}</h2>
        <p className="muted">{t("set.aboutBody")}</p>
        <p className="muted small">StudyLab v{__APP_VERSION__}</p>
      </section>
    </div>
  );
}

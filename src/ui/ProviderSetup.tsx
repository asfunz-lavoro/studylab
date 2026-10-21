import { useState } from "react";
import { useApp } from "../app";
import { setupGuide } from "../guides";
import { PROVIDERS, getProvider } from "../llm";
import { LLMError } from "../llm/types";
import { CopyButton, Notice, Spinner } from "./components";
import { Markdown } from "./Markdown";

const PRIMARY = ["gemini", "groq", "openrouter", "ollama"];

export function ProviderPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t, settings } = useApp();
  const [showAll, setShowAll] = useState(!PRIMARY.includes(value));
  const list = showAll ? PROVIDERS : PROVIDERS.filter((p) => PRIMARY.includes(p.id));
  const priceLabel = { free: t("onb.ai.free"), freeTier: t("onb.ai.freeTier"), paid: t("onb.ai.paid"), local: t("onb.ai.local") };
  return (
    <div className="stack">
      {list.map((p) => (
        <button key={p.id} type="button" className={`choice ${value === p.id ? "active" : ""}`} onClick={() => onChange(p.id)}>
          <div className="grow">
            <div className="row">
              <strong>{p.id === "ollama" && settings.lang === "en" ? "Ollama (on your computer)" : p.id === "custom" && settings.lang === "en" ? "Other (OpenAI-compatible)" : p.label}</strong>
              {p.id === "gemini" && <span className="badge accent">{t("onb.ai.recommended")}</span>}
              <span className={`badge ${p.free === "paid" ? "" : "ok"}`}>{priceLabel[p.free]}</span>
            </div>
            <div className="muted small">{p.blurb[settings.lang]}</div>
          </div>
        </button>
      ))}
      <button type="button" className="btn ghost" onClick={() => setShowAll(!showAll)}>
        {showAll ? t("onb.ai.showLess") : t("onb.ai.showMore")}
      </button>
    </div>
  );
}

/** Guided key entry + connection test + model choice. Saves to settings once connected. */
export function ProviderConnect({ providerId, onConnected }: { providerId: string; onConnected?: () => void }) {
  const { t, settings, updateSettings } = useApp();
  const provider = getProvider(providerId);
  const saved = settings.providers[providerId];
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? provider.defaultBaseUrl ?? "");
  const [models, setModels] = useState<string[]>(saved?.model ? [saved.model] : []);
  const [model, setModel] = useState(saved?.model ?? "");
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "error">(saved?.model ? "ok" : "idle");
  const [error, setError] = useState("");
  const [reveal, setReveal] = useState(false);
  const guide = setupGuide(providerId, settings.lang);
  const showBaseUrl = providerId === "custom" || providerId === "ollama";

  const persist = async (m: string) => {
    await updateSettings({
      provider: providerId,
      providers: { ...settings.providers, [providerId]: { apiKey: apiKey.trim(), model: m, baseUrl: showBaseUrl ? baseUrl.trim() : undefined } },
    });
  };

  const test = async () => {
    setStatus("testing");
    setError("");
    try {
      const list = await provider.listModels({ apiKey: apiKey.trim(), model: "", baseUrl: baseUrl.trim() || provider.defaultBaseUrl });
      if (!list.length) {
        setStatus("error");
        setError(t("setup.err.noModels"));
        return;
      }
      const chosen = list.includes(model) ? model : provider.pickDefaultModel(list);
      setModels(list);
      setModel(chosen);
      setStatus("ok");
      await persist(chosen);
      onConnected?.();
    } catch (err) {
      setStatus("error");
      if (providerId === "ollama" && err instanceof LLMError && err.kind === "network") setError(t("setup.err.ollama"));
      else if (err instanceof LLMError && err.kind === "auth") setError(t("setup.err.auth"));
      else if (err instanceof LLMError && err.kind === "network") setError(t("setup.err.network"));
      else setError(t("setup.err.generic", { msg: err instanceof Error ? err.message.slice(0, 200) : String(err) }));
    }
  };

  return (
    <div className="stack">
      <ol className="steps">
        {guide.steps.map((s, i) => (
          <li key={i}>
            <div className="grow">
              <Markdown text={s.text} />
              {s.link && (
                <a className="btn sm mt" style={{ marginTop: 8 }} href={s.link} target="_blank" rel="noreferrer">
                  {t("setup.openSite")} ↗
                </a>
              )}
              {s.command && (
                <div className="cmd">
                  <code>{s.command}</code>
                  <CopyButton text={s.command} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {guide.note && <Notice kind="info">{guide.note}</Notice>}

      {showBaseUrl && (
        <label className="field">
          {t("setup.baseUrl")}
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" />
        </label>
      )}
      {provider.needsKey && (
        <label className="field">
          {t("setup.keyLabel")}
          <div className="row">
            <input
              className="grow"
              type={reveal ? "text" : "password"}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setStatus("idle");
              }}
              placeholder={t("setup.keyPh")}
              autoComplete="off"
              spellCheck={false}
              data-testid="api-key"
            />
            <button type="button" className="btn sm" onClick={() => setReveal(!reveal)}>
              {reveal ? t("setup.hide") : t("setup.show")}
            </button>
          </div>
          <span className="hint">{t("setup.keyPrivacy", { provider: provider.label })}</span>
        </label>
      )}
      <div>
        <button type="button" className="btn primary" disabled={(provider.needsKey && !apiKey.trim()) || status === "testing"} onClick={test}>
          {t("setup.test")}
        </button>
      </div>
      {status === "testing" && <Spinner label={t("setup.testing")} />}
      {status === "error" && <Notice kind="err">{error}</Notice>}
      {status === "ok" && models.length > 0 && (
        <>
          <Notice kind="ok">{t("setup.ok", { n: models.length })}</Notice>
          <label className="field">
            {t("setup.model")}
            <select
              value={model}
              onChange={async (e) => {
                setModel(e.target.value);
                await persist(e.target.value);
              }}
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <span className="hint">{t("setup.modelHint")}</span>
          </label>
        </>
      )}
    </div>
  );
}

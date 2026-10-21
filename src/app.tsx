import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { db, defaultSettings, type Settings } from "./db";
import { browserLang, translator, type Key, type T } from "./i18n";
import { LLMError } from "./llm/types";

// ------------------------------------------------------------------- routing

export interface Route {
  page: string;
  params: string[];
  query: URLSearchParams;
}

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path, qs = ""] = raw.split("?");
  const [page = "home", ...params] = path.split("/").filter(Boolean);
  return { page, params, query: new URLSearchParams(qs) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function go(path: string): void {
  window.location.hash = `#/${path.replace(/^\/+/, "")}`;
}

// ------------------------------------------------------------------- context

interface Toast {
  id: number;
  text: string;
  error?: boolean;
}

interface AppCtx {
  settings: Settings;
  t: T;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  toast: (text: string, error?: boolean) => void;
  errorText: (err: unknown) => string;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: (ready: boolean) => ReactNode }) {
  const stored = useLiveQuery(() => db.settings.get("app"), [], null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const settings = useMemo(() => stored ?? defaultSettings(browserLang()), [stored]);
  const t = useMemo(() => translator(settings.lang), [settings.lang]);

  useEffect(() => {
    document.documentElement.lang = settings.lang;
  }, [settings.lang]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      // One transaction per read-modify-write, so two quick updates (e.g. name on blur + level click)
      // are applied in order instead of the second overwriting the first.
      await db.transaction("rw", db.settings, async () => {
        const current = (await db.settings.get("app")) ?? defaultSettings(browserLang());
        await db.settings.put({ ...current, ...patch, id: "app" });
      });
    },
    [],
  );

  const toast = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, text, error }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), error ? 8000 : 4000);
  }, []);

  const errorText = useCallback(
    (err: unknown) => {
      if (err instanceof LLMError) return t(`err.${err.kind}` as Key, { msg: err.message.slice(0, 200) });
      if (err instanceof Error && err.message === "vision-unsupported") return t("lib.needVision");
      if (err instanceof SyntaxError) return t("study.err.parse");
      return t("err.generic", { msg: err instanceof Error ? err.message : String(err) });
    },
    [t],
  );

  const value = useMemo(() => ({ settings, t, updateSettings, toast, errorText }), [settings, t, updateSettings, toast, errorText]);
  return (
    <Ctx.Provider value={value}>
      {children(stored !== null)}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`toast ${x.error ? "err" : ""}`}>
            {x.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

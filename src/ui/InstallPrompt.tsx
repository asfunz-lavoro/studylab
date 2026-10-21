import { useEffect, useState } from "react";
import { go, useApp } from "../app";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
  listeners.forEach((l) => l());
});

const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches;

/** Offer "Install as app" where the browser supports it; otherwise link to the manual guide. */
export function InstallPrompt() {
  const { t } = useApp();
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  if (isStandalone()) return null;
  return (
    <div className="card row between">
      <div className="row grow">
        <span style={{ fontSize: "1.8rem" }}>💻</span>
        <div className="grow">
          <strong>{t("install.title")}</strong>
          <div className="muted small">{t("install.body")}</div>
        </div>
      </div>
      {deferred ? (
        <button
          className="btn primary"
          onClick={async () => {
            await deferred?.prompt();
            deferred = null;
            force((n) => n + 1);
          }}
        >
          {t("install.button")}
        </button>
      ) : (
        <button className="btn" onClick={() => go("guide/install")}>
          {t("install.manual")}
        </button>
      )}
    </div>
  );
}

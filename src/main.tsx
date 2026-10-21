import { useLiveQuery } from "dexie-react-hooks";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { AppProvider, go, useApp, useRoute } from "./app";
import { db } from "./db";
import type { Key } from "./i18n";
import { DocumentView } from "./pages/DocumentView";
import { Guide } from "./pages/Guide";
import { Home } from "./pages/Home";
import { Library } from "./pages/Library";
import { Notes } from "./pages/Notes";
import { Onboarding } from "./pages/Onboarding";
import { Papers } from "./pages/Papers";
import { Settings } from "./pages/Settings";
import { Study } from "./pages/Study";
import { Tutor } from "./pages/Tutor";
import "./styles.css";

const NAV: { page: string; icon: string; key: Key; mobile: boolean }[] = [
  { page: "home", icon: "🏠", key: "nav.home", mobile: true },
  { page: "library", icon: "📚", key: "nav.library", mobile: true },
  { page: "tutor", icon: "💬", key: "nav.tutor", mobile: true },
  { page: "study", icon: "🧠", key: "nav.study", mobile: true },
  { page: "notes", icon: "📝", key: "nav.notes", mobile: false },
  { page: "papers", icon: "🔬", key: "nav.papers", mobile: false },
  { page: "settings", icon: "⚙️", key: "nav.settings", mobile: true },
  { page: "guide", icon: "❓", key: "nav.guide", mobile: false },
];

function num(v: string | null | undefined): number | null {
  const n = Number(v);
  return v && Number.isFinite(n) ? n : null;
}

function Page() {
  const route = useRoute();
  const { page, params, query } = route;
  switch (page) {
    case "library":
      return <Library />;
    case "doc":
      return <DocumentView docId={Number(params[0])} initialPage={num(query.get("page")) ?? 1} />;
    case "tutor":
      return <Tutor key={query.get("subject") ?? "all"} initialSubject={num(query.get("subject"))} />;
    case "study":
      return <Study tab={params[0] ?? "review"} docParam={num(query.get("doc"))} />;
    case "notes":
      return <Notes noteParam={num(params[0])} />;
    case "papers":
      return <Papers />;
    case "settings":
      return <Settings openAI={query.get("ai") === "1"} />;
    case "guide":
      return <Guide section={params[0]} />;
    default:
      return <Home />;
  }
}

function Shell() {
  const { t, settings } = useApp();
  const { page } = useRoute();
  const due = useLiveQuery(() => db.cards.where("srs.due").belowOrEqual(new Date()).count(), [page], 0);
  if (!settings.onboarded) return <Onboarding />;
  const active = page === "doc" ? "library" : page;
  const link = (n: (typeof NAV)[number]) => (
    <button key={n.page} className={`navlink ${active === n.page ? "active" : ""}`} onClick={() => go(n.page)} aria-current={active === n.page ? "page" : undefined}>
      <span className="ico" aria-hidden>
        {n.icon}
      </span>
      <span>{t(n.key)}</span>
      {n.page === "study" && due > 0 && <span className="badge accent">{due}</span>}
    </button>
  );
  return (
    <div className="shell">
      <nav className="sidenav" aria-label="main">
        <div className="brand">
          <img src="./icon.svg" alt="" />
          {t("app.name")}
        </div>
        {NAV.slice(0, 6).map(link)}
        <div className="nav-spacer" />
        {NAV.slice(6).map(link)}
      </nav>
      <main className="main">
        <Page />
      </main>
      <nav className="bottomnav" aria-label="main">
        {NAV.filter((n) => n.mobile).map(link)}
      </nav>
    </div>
  );
}

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>{(ready) => (ready ? <Shell /> : null)}</AppProvider>
  </StrictMode>,
);

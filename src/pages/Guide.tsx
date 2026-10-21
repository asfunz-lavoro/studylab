import { useApp } from "../app";
import { helpSections } from "../helpContent";
import { Markdown } from "../ui/Markdown";

export function Guide({ section }: { section?: string }) {
  const { t, settings } = useApp();
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <h1>{t("nav.guide")}</h1>
      {helpSections(settings.lang).map((s, i) => (
        <details key={s.id} id={s.id} className="card help-section" open={section ? section === s.id : i === 0}>
          <summary>{s.title}</summary>
          <Markdown text={s.body} />
        </details>
      ))}
    </div>
  );
}

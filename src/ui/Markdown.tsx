import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import { Marked } from "marked";
import markedKatex from "marked-katex-extension";
import { memo, useMemo } from "react";

const marked = new Marked({ gfm: true, breaks: true });
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

/** Turn [1], [2, 3] citation markers into buttons the parent can react to. */
function linkCitations(html: string, maxN: number): string {
  if (!maxN) return html;
  return html.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?![^<]*<\/(?:code|a)>)/g, (whole, nums: string) => {
    const list = nums.split(",").map((n) => Number(n.trim()));
    if (list.some((n) => n < 1 || n > maxN)) return whole;
    return list.map((n) => `<button type="button" class="cite" data-cite="${n}">${n}</button>`).join("");
  });
}

export function renderMarkdown(text: string, citations = 0): string {
  // Model text uses \( \) and \[ \] for math too; normalise to $ so KaTeX picks it up.
  const normalized = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`).replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`);
  const html = marked.parse(normalized, { async: false }) as string;
  const clean = DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
  return linkCitations(clean, citations);
}

interface Props {
  text: string;
  citations?: number;
  onCite?: (n: number) => void;
  className?: string;
}

export const Markdown = memo(function Markdown({ text, citations = 0, onCite, className = "" }: Props) {
  const html = useMemo(() => renderMarkdown(text, citations), [text, citations]);
  return (
    <div
      className={`md ${className}`}
      onClick={(e) => {
        const n = (e.target as HTMLElement).closest<HTMLElement>("[data-cite]")?.dataset.cite;
        if (n && onCite) onCite(Number(n));
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

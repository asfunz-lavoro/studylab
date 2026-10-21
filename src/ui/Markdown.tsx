import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import { Marked, type TokenizerAndRendererExtension } from "marked";
import markedKatex from "marked-katex-extension";
import { memo, useMemo } from "react";
import { normTitle } from "../notes/links";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const wikilink: TokenizerAndRendererExtension = {
  name: "wikilink",
  level: "inline",
  start: (src) => src.indexOf("[["),
  tokenizer(src) {
    const m = /^\[\[([^[\]|#\n]+)(?:#([^[\]|\n]*))?(?:\|([^[\]\n]+))?\]\]/.exec(src);
    if (!m) return undefined;
    return { type: "wikilink", raw: m[0], target: m[1].trim(), heading: m[2]?.trim(), alias: m[3]?.trim() };
  },
  renderer(token) {
    const label = token.alias || (token.heading ? `${token.target} › ${token.heading}` : token.target);
    // No href: a plain "#" would trigger the hash router. Clicks are handled by the Markdown component.
    return `<a class="wikilink" role="link" tabindex="0" data-note="${esc(token.target)}">${esc(label)}</a>`;
  },
};

const tag: TokenizerAndRendererExtension = {
  name: "tag",
  level: "inline",
  start(src) {
    const m = /(^|[\s(,;])#[\p{L}\p{N}_/-]*\p{L}/u.exec(src);
    return m ? m.index + m[1].length : undefined;
  },
  tokenizer(src) {
    const m = /^#([\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)/u.exec(src);
    return m ? { type: "tag", raw: m[0], tag: m[1] } : undefined;
  },
  renderer(token) {
    return `<a class="tag" role="link" tabindex="0" data-tag="${esc(token.tag.toLocaleLowerCase())}">#${esc(token.tag)}</a>`;
  },
};

const plain = new Marked({ gfm: true, breaks: true });
plain.use(markedKatex({ throwOnError: false, nonStandard: true }));
const notes = new Marked({ gfm: true, breaks: true });
notes.use(markedKatex({ throwOnError: false, nonStandard: true }));
notes.use({ extensions: [wikilink, tag] });

/** Turn [1], [2, 3] citation markers into buttons the parent can react to. */
function linkCitations(html: string, maxN: number): string {
  if (!maxN) return html;
  return html.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?![^<]*<\/(?:code|a)>)/g, (whole, nums: string) => {
    const list = nums.split(",").map((n) => Number(n.trim()));
    if (list.some((n) => n < 1 || n > maxN)) return whole;
    return list.map((n) => `<button type="button" class="cite" data-cite="${n}">${n}</button>`).join("");
  });
}

const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function renderMarkdown(text: string, citations = 0, opts: { notes?: boolean; knownTitles?: Set<string> } = {}): string {
  // Model text uses \( \) and \[ \] for math too; normalise to $ so KaTeX picks it up.
  const normalized = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`).replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`);
  const html = (opts.notes ? notes : plain).parse(normalized, { async: false }) as string;
  let clean = DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
  if (opts.notes && opts.knownTitles) {
    const known = opts.knownTitles;
    // Links to notes that don't exist yet are dimmed, like in Obsidian; clicking one creates the note.
    clean = clean.replace(/<a class="wikilink" role="link" tabindex="0" data-note="([^"]*)">/g, (whole, target: string) =>
      known.has(normTitle(unescape(target))) ? whole : whole.replace('class="wikilink"', 'class="wikilink unresolved"'),
    );
  }
  return linkCitations(clean, citations);
}

interface Props {
  text: string;
  citations?: number;
  onCite?: (n: number) => void;
  className?: string;
  /** Enable [[wikilinks]] and #tags (notes only). */
  notes?: boolean;
  knownTitles?: Set<string>;
  onWikilink?: (target: string) => void;
  onTag?: (tag: string) => void;
}

export const Markdown = memo(function Markdown({ text, citations = 0, onCite, className = "", notes: notesMode, knownTitles, onWikilink, onTag }: Props) {
  const html = useMemo(() => renderMarkdown(text, citations, { notes: notesMode, knownTitles }), [text, citations, notesMode, knownTitles]);
  const activate = (target: HTMLElement) => {
    const cite = target.closest<HTMLElement>("[data-cite]")?.dataset.cite;
    if (cite && onCite) return onCite(Number(cite));
    const note = target.closest<HTMLElement>("[data-note]")?.dataset.note;
    if (note != null && onWikilink) return onWikilink(note);
    const tagName = target.closest<HTMLElement>("[data-tag]")?.dataset.tag;
    if (tagName && onTag) onTag(tagName);
  };
  return (
    <div
      className={`md ${className}`}
      onClick={(e) => activate(e.target as HTMLElement)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).matches("[data-note],[data-tag]")) activate(e.target as HTMLElement);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

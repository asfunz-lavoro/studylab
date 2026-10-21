export interface PageText {
  page: number;
  text: string;
}

export const LOW_TEXT_CHARS = 40;
const TARGET = 1100;
const MAX = 1600;

/** Tidy text pulled out of a PDF: re-join hyphenated line breaks, collapse runs of spaces. */
export function cleanText(text: string): string {
  return text
    .replace(/\u00ad/g, "")
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
    // A line ending mid-sentence (lowercase/comma) followed by a lowercase word is a visual wrap, not a break.
    .replace(/([\p{Ll},;'’])[ \t]*\n[ \t]*(\p{Ll})/gu, "$1 $2")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Split one page into retrieval chunks of roughly TARGET characters, breaking at paragraph
 * or sentence boundaries. Chunks never cross pages, so every citation points to one page.
 */
export function chunkPage(text: string): string[] {
  const clean = cleanText(text);
  if (clean.length <= MAX) return clean ? [clean] : [];
  const pieces = clean.split(/\n\n+/).flatMap((para) => (para.length > MAX ? para.split(/(?<=[.!?;:])\s+/) : [para]));
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (piece.length > MAX) {
      if (current) chunks.push(current);
      current = "";
      for (let i = 0; i < piece.length; i += TARGET) chunks.push(piece.slice(i, i + TARGET));
      continue;
    }
    if (current && current.length + piece.length + 1 > TARGET) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function chunkPages(pages: PageText[]): { page: number; text: string }[] {
  return pages.flatMap((p) => chunkPage(p.text).map((text) => ({ page: p.page, text })));
}

/** Split pasted or .txt/.md text into pseudo-pages of ~3000 characters so citations stay useful. */
export function textToPages(text: string, pageChars = 3000): PageText[] {
  const clean = cleanText(text);
  const pages: PageText[] = [];
  let rest = clean;
  while (rest.length > 0) {
    let cut = rest.length <= pageChars ? rest.length : rest.lastIndexOf("\n", pageChars);
    if (cut < pageChars / 2) cut = Math.min(rest.length, pageChars);
    pages.push({ page: pages.length + 1, text: rest.slice(0, cut).trim() });
    rest = rest.slice(cut).trim();
  }
  return pages;
}

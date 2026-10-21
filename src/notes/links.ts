import type { Note } from "../db";

/** Remove fenced and inline code so links/tags inside code are ignored (like Obsidian). */
function stripCode(text: string): string {
  return text.replace(/```[\s\S]*?(```|$)|~~~[\s\S]*?(~~~|$)/g, " ").replace(/`[^`\n]*`/g, " ");
}

// [[Target]], [[Target|alias]], [[Target#Heading]], [[Target#Heading|alias]]
export const WIKILINK_RE = /\[\[([^[\]|#\n]+)(?:#([^[\]|\n]*))?(?:\|([^[\]\n]+))?\]\]/g;
// #tag after start/whitespace/punctuation; must contain a letter so "#1" or "#123" are not tags.
export const TAG_RE = /(^|[\s(,;])#([\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)/gu;

export function normTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function extractLinks(content: string): string[] {
  const out = new Set<string>();
  for (const m of stripCode(content).matchAll(WIKILINK_RE)) {
    const target = m[1].trim();
    if (target) out.add(target);
  }
  return [...out];
}

export function extractTags(content: string): string[] {
  const out = new Set<string>();
  for (const m of stripCode(content).matchAll(TAG_RE)) out.add(m[2].toLocaleLowerCase());
  return [...out];
}

/** Find the note a [[link]] points to: same title (case-insensitive), preferring the same subject. */
export function resolveLink(target: string, notes: Note[], fromSubjectId?: number): Note | undefined {
  const key = normTitle(target);
  const matches = notes.filter((n) => n.title && normTitle(n.title) === key);
  return matches.find((n) => n.subjectId === fromSubjectId) ?? matches[0];
}

export interface GraphNode {
  id: number;
  title: string;
  subjectId: number;
  degree: number;
}

export interface GraphEdge {
  source: number;
  target: number;
}

export interface NoteGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** note id → ids of notes linking to it */
  backlinks: Map<number, number[]>;
  /** note id → link targets that match no note yet */
  unresolved: Map<number, string[]>;
}

export function buildGraph(notes: Note[]): NoteGraph {
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const backlinks = new Map<number, number[]>();
  const unresolved = new Map<number, string[]>();
  const degree = new Map<number, number>();
  for (const n of notes) {
    for (const target of extractLinks(n.content)) {
      const hit = resolveLink(target, notes, n.subjectId);
      if (!hit) {
        unresolved.set(n.id!, [...(unresolved.get(n.id!) ?? []), target]);
        continue;
      }
      if (hit.id === n.id) continue;
      const key = `${n.id}>${hit.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: n.id!, target: hit.id! });
      backlinks.set(hit.id!, [...(backlinks.get(hit.id!) ?? []), n.id!]);
      degree.set(n.id!, (degree.get(n.id!) ?? 0) + 1);
      degree.set(hit.id!, (degree.get(hit.id!) ?? 0) + 1);
    }
  }
  const nodes = notes.map((n) => ({ id: n.id!, title: n.title, subjectId: n.subjectId, degree: degree.get(n.id!) ?? 0 }));
  return { nodes, edges, backlinks, unresolved };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Rewrite [[Old]], [[Old|alias]] and [[Old#heading]] to point at a renamed note. */
export function renameLinks(content: string, oldTitle: string, newTitle: string): string {
  if (!oldTitle.trim() || !newTitle.trim()) return content;
  const re = new RegExp(`\\[\\[\\s*${escapeRegExp(oldTitle.trim()).replace(/\\s+/g, "\\s+")}\\s*(?=[\\]|#])`, "gi");
  return content.replace(re, `[[${newTitle.trim()}`);
}

/** Text before the cursor ends with an open "[[query" → the query, else null. */
export function openLinkQuery(textBeforeCursor: string): string | null {
  const m = /\[\[([^[\]|#\n]*)$/.exec(textBeforeCursor);
  return m ? m[1] : null;
}

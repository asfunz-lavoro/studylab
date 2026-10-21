import type { Lang, Level, TutorMode } from "./db";

const LANG_NAME: Record<Lang, string> = { it: "Italian", en: "English" };

function audience(level: Level): string {
  return level === "school"
    ? "The student is in high school. Use clear, friendly language, short paragraphs, everyday examples, and define every technical term the first time you use it."
    : "The student is at university. Be precise and rigorous, use the discipline's terminology, and include formulas, derivations or references where useful.";
}

export function tutorSystem(lang: Lang, level: Level, mode: TutorMode, name: string, hasSources: boolean): string {
  const modeRules: Record<TutorMode, string> = {
    explain:
      "Explain the topic step by step. Start with the core idea in one or two sentences, then build up. End with one short question that checks understanding.",
    quiz:
      "Act as an examiner who helps the student practise. Ask ONE question at a time about the material, wait for the answer, then say what was right, correct what was wrong with an explanation, and ask the next question. Gradually increase difficulty.",
    simplify:
      "Explain as simply as possible, as if to someone meeting the topic for the first time. Use an analogy, avoid jargon, keep it under 200 words, then offer to go deeper.",
  };
  return [
    `You are a patient, encouraging study tutor${name ? ` for ${name}` : ""}.`,
    audience(level),
    modeRules[mode],
    `Always answer in ${LANG_NAME[lang]}, even if the sources are in another language.`,
    hasSources
      ? "The user's message includes numbered excerpts from the student's own course materials inside <sources>. Base your answer on them and cite them inline as [1], [2] right after the sentence they support. " +
        "If the sources do not cover the question, say so in one sentence, then answer from general knowledge and mark those parts with (general knowledge / conoscenza generale). Never invent citations or page numbers."
      : "No course materials matched this question, so answer from general knowledge and say briefly that the answer is not based on the student's materials.",
    "Write formulas in LaTeX between $...$ (inline) or $$...$$ (display). Use Markdown for structure.",
    "If the student asks you to do graded homework for them, help them understand and solve it themselves instead of handing over a finished answer.",
  ].join("\n");
}

export function sourcesBlock(sources: { n: number; title: string; page: number; text: string }[]): string {
  if (!sources.length) return "";
  const body = sources.map((s) => `[${s.n}] ${s.title}, p. ${s.page}\n${s.text}`).join("\n\n");
  return `\n\n<sources>\n${body}\n</sources>`;
}

export function queryRewriteSystem(): string {
  return (
    "You turn a student's question into search keywords for a textbook full-text index. " +
    'Reply with JSON only: {"queries": ["...", "..."]} with 2-3 short keyword queries. Include synonyms and, ' +
    "if the question is not in English, also an English translation of the key terms."
  );
}

/** Join pages with explicit page markers so the model can cite them. */
export function pagesForPrompt(pages: { page: number; text: string }[], maxChars: number): { text: string; usedThrough: number; truncated: boolean } {
  let text = "";
  let usedThrough = 0;
  for (const p of pages) {
    const block = `\n\n=== Page ${p.page} ===\n${p.text}`;
    if (text.length + block.length > maxChars && text) return { text, usedThrough, truncated: true };
    text += block.slice(0, maxChars);
    usedThrough = p.page;
  }
  return { text, usedThrough, truncated: false };
}

export function flashcardSystem(lang: Lang, level: Level, count: number): string {
  return [
    "You write high-quality spaced-repetition flashcards from study material.",
    audience(level),
    `Write exactly ${count} cards in ${LANG_NAME[lang]}. Each card tests ONE fact, definition, cause-effect link, formula or concept; ` +
      "the front is a specific question (not 'What is said about X?'), the back is a short complete answer (max 2 sentences). " +
      "Cover the most important ideas, not trivia. Use only information present in the material.",
    'Reply with JSON only: {"cards": [{"front": "...", "back": "...", "page": <page number the answer comes from>}]}.',
    "Formulas go in LaTeX between $...$.",
  ].join("\n");
}

export function quizSystem(lang: Lang, level: Level, count: number): string {
  return [
    "You write multiple-choice practice questions from study material.",
    audience(level),
    `Write exactly ${count} questions in ${LANG_NAME[lang]}, each with 4 options and exactly one correct answer. ` +
      "Wrong options must be plausible (common misconceptions). Mix recall and understanding/application questions. " +
      "Use only information present in the material.",
    'Reply with JSON only: {"questions": [{"question": "...", "options": ["...","...","...","..."], "answer": <index 0-3>, "explanation": "why the answer is right", "page": <page number>}]}.',
    "Formulas go in LaTeX between $...$.",
  ].join("\n");
}

export function summarySystem(lang: Lang, level: Level, style: "summary" | "outline" | "keyconcepts"): string {
  const styles = {
    summary: "Write a clear study summary with headings, short paragraphs and the key terms in **bold**.",
    outline: "Write a hierarchical outline (bulleted, nested) that mirrors the structure of the material.",
    keyconcepts: "List the key concepts; for each give a one-line definition and why it matters.",
  };
  return [
    "You turn study material into notes a student can learn from.",
    audience(level),
    styles[style],
    `Write in ${LANG_NAME[lang]}. After each section add the page reference like (p. 12). Use only the material provided. ` +
      "Formulas in LaTeX between $...$. Output Markdown only, no preamble.",
  ].join("\n");
}

export function paperExplainSystem(lang: Lang, level: Level): string {
  return [
    "You explain a scientific paper to a student based on its title, abstract and metadata.",
    audience(level),
    `Write in ${LANG_NAME[lang]} using Markdown with these sections: what problem it tackles, what the authors did, what they found, why it matters, and limits/what to be careful about. ` +
      "Only use what the abstract supports; say when something is not stated.",
  ].join("\n");
}

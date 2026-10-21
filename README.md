# StudyLab

**Studia con i tuoi materiali e un tutor AI che cita le fonti.**
*Study with your own materials and an AI tutor that cites its sources.*

👉 **Apri l'app / Open the app: https://asfunz-lavoro.github.io/studylab/**

Non serve installare nulla: apri il link con Chrome, Edge o Firefox. Al primo avvio una procedura guidata ti accompagna passo passo (lingua, livello di studio, collegamento a un servizio AI gratuito come Google Gemini). La sezione **Guida** dentro l'app spiega come installarla come app su Windows, Linux e Mac.

Nothing to install: open the link in Chrome, Edge or Firefox. On first launch a wizard walks you through everything (language, study level, connecting a free AI service such as Google Gemini). The in-app **Guide** explains how to install it as an app on Windows, Linux and Mac.

## What it does

- **Materials** – upload PDFs (books, handouts), Word files, text or photos of notes. Text is extracted in the browser; scanned pages can be transcribed by the AI.
- **Tutor** – ask questions; answers are grounded in the uploaded materials and cite the exact pages `[1]`. Modes: *Explain*, *Quiz me*, *Keep it simple*. High-school or university level.
- **Review** – AI-generated flashcards (editable before saving) with FSRS spaced repetition, multiple-choice quizzes (mistakes become flashcards), summaries/outlines.
- **Notes** – Markdown notes with LaTeX math; tutor answers and summaries can be saved here.
- **Papers** – search 250M+ scientific papers via OpenAlex (no key needed) and Semantic Scholar (TL;DRs with a free key), save them, get a plain-language explanation.
- **Backup / Obsidian export** – one zip with everything; an Obsidian-ready vault (notes, papers, `Q :: A` flashcards).

## AI providers

Bring your own key; the app talks to the provider directly from the browser.

| Provider | Cost | Notes |
| --- | --- | --- |
| Google Gemini | free tier | recommended; reads scans/photos |
| Groq | free tier | very fast, open models, text only |
| OpenRouter | free models (`:free`) | one key, many models |
| Mistral | free tier | EU company |
| OpenAI | paid | |
| Anthropic Claude | paid | default `claude-opus-5-5`; `haiku` models are cheaper |
| DeepSeek | paid (cheap) | |
| Ollama | free, local | runs on the user's PC; needs `OLLAMA_ORIGINS` (the app shows the exact command per OS) |
| Custom | – | any OpenAI-compatible endpoint |

Most hosted providers (Gemini, OpenAI, Claude) require users to be **18+**. Ollama has no such requirement because it runs locally.

## Privacy model

- Everything (files, extracted text, notes, flashcards, chats, keys) lives in the browser's IndexedDB on that device. There is no StudyLab server.
- Requests go only to the chosen AI provider (question + retrieved excerpts) and to OpenAlex / Semantic Scholar (paper search).
- The production build ships a Content-Security-Policy that only allows the app's own scripts.
- Backups never include API keys.

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run build        # production build in dist/
npx playwright test  # end-to-end test in the installed Chrome (AI is mocked)
NETWORK=1 npx playwright test   # also hits the real paper-search APIs
```

Pushing to `main` runs type-check, unit tests and build, then publishes `dist/` to GitHub Pages (`.github/workflows/deploy.yml`).

### Layout

```
src/
  llm/        provider adapters (Gemini REST, OpenAI-compatible, Anthropic SDK), retries, JSON parsing
  rag/        PDF/DOCX/text/photo ingestion, chunking, MiniSearch retrieval
  tutor.ts    retrieval + prompt assembly for the tutor
  study.ts    flashcard/quiz/summary generation, FSRS scheduling
  s2.ts       Semantic Scholar client
  backup.ts   backup/restore, Obsidian export
  i18n/       Italian and English strings (type-checked to stay in sync)
  guides.ts   per-provider setup steps (OS-aware for Ollama)
  helpContent.ts  in-app guide
  pages/, ui/ React UI
```

import { expect, test, type Page, type Route } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

/** Fake Gemini: lists models, then answers according to what the system prompt asks for. */
async function mockGemini(page: Page, calls: string[]) {
  await page.route("https://generativelanguage.googleapis.com/**", async (route: Route) => {
    const url = route.request().url();
    if (url.includes("/models?")) {
      if (route.request().headers()["x-goog-api-key"] !== "AIza-test-key") return route.fulfill({ status: 400, body: "API key not valid" });
      return route.fulfill({
        json: {
          models: [
            { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
            { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
          ],
        },
      });
    }
    const body = route.request().postDataJSON() as { systemInstruction: { parts: { text: string }[] }; contents: { parts: { text?: string }[] }[] };
    const system = body.systemInstruction.parts[0].text;
    const user = body.contents.at(-1)?.parts.map((p) => p.text ?? "").join("") ?? "";
    let text: string;
    if (system.includes("search keywords")) {
      calls.push("rewrite");
      text = '{"queries": ["fotosintesi cloroplasti"]}';
    } else if (system.includes("spaced-repetition flashcards")) {
      calls.push("cards");
      text = JSON.stringify({ cards: [
        { front: "Dove avviene la fotosintesi?", back: "Nei cloroplasti delle cellule vegetali.", page: 2 },
        { front: "Quali sono le fasi della mitosi?", back: "Profase, metafase, anafase e telofase.", page: 3 },
      ] });
    } else if (system.includes("multiple-choice")) {
      calls.push("quiz");
      text = JSON.stringify({ questions: [
        { question: "Dove avviene il ciclo di Calvin?", options: ["Nel nucleo", "Nello stroma", "Nei mitocondri", "Nella membrana"], answer: 1, explanation: "Il ciclo di Calvin avviene nello stroma del cloroplasto.", page: 2 },
      ] });
    } else if (system.includes("study tutor")) {
      calls.push(user.includes("<sources>") && user.includes("cloroplasti") ? "tutor-with-sources" : "tutor-no-sources");
      text = "La fotosintesi avviene nei **cloroplasti** [1]. La formula è $6CO_2 + 6H_2O \\rightarrow C_6H_{12}O_6 + 6O_2$.";
    } else {
      calls.push("other");
      text = "## Riassunto\nLa cellula è l'unità della vita (p. 1).";
    }
    const half = Math.ceil(text.length / 2);
    const events = [text.slice(0, half), text.slice(half)].map((t) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`);
    await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" }, body: events.join("") });
  });
}

test("a new student can set up, upload a book, ask the tutor and study", async ({ page }) => {
  const calls: string[] = [];
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  await mockGemini(page, calls);
  await page.goto("/");

  // 1. Welcome + language
  await expect(page.getByRole("heading", { name: /Benvenuta in StudyLab/ })).toBeVisible();
  await shot(page, "01-welcome");
  await page.getByTestId("onb-next").click();

  // 2. About you
  await page.getByPlaceholder("Il tuo nome (facoltativo)").fill("Giulia");
  await page.getByRole("button", { name: /Scuola superiore/ }).click();
  await page.getByTestId("onb-next").click();

  // 3. Provider: Gemini is preselected and recommended
  await expect(page.getByRole("button", { name: /Google Gemini.*Consigliato/ })).toHaveClass(/active/);
  await shot(page, "03-provider");
  await page.getByTestId("onb-next").click();

  // 4. Connect: a wrong key is explained, the right one connects and picks gemini-2.5-flash
  await expect(page.getByRole("link", { name: /Apri il sito/ }).first()).toHaveAttribute("href", "https://aistudio.google.com/apikey");
  await page.getByTestId("api-key").fill("wrong");
  await page.getByRole("button", { name: "Prova la connessione" }).click();
  await expect(page.getByText(/Qualcosa è andato storto|La chiave non funziona/)).toBeVisible();
  await page.getByTestId("api-key").fill("AIza-test-key");
  await page.getByRole("button", { name: "Prova la connessione" }).click();
  await expect(page.getByText("Collegato! Modelli disponibili: 2")).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveValue("gemini-2.5-flash");
  await shot(page, "04-connect");
  await page.getByTestId("onb-next").click();

  // 5. Done: first subject
  await page.getByPlaceholder(/Biologia, Storia/).fill("Biologia");
  await shot(page, "05-done");
  await page.getByTestId("onb-finish").click();

  // Library: upload a real PDF and an image-only "scan"
  await expect(page.getByRole("heading", { name: "Materiale di studio" })).toBeVisible();
  await page.getByTestId("file-input").setInputFiles([path.join(FIXTURES, "biologia.pdf"), path.join(FIXTURES, "scansione.pdf")]);
  await expect(page.getByText("biologia", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/PDF · 3 pagine/)).toBeVisible();
  await expect(page.getByText(/Tutto il documento sembra una scansione/)).toBeVisible({ timeout: 30_000 });
  await shot(page, "06-library");

  // Read page 2 of the book
  await page.locator(".docrow", { hasText: "biologia" }).getByRole("button", { name: "Leggi" }).click();
  await page.getByRole("button", { name: "→" }).click();
  await expect(page.getByText(/ciclo di Calvin avviene nello stroma/)).toBeVisible();
  await page.getByRole("button", { name: /Indietro/ }).click();

  // Tutor: answer cites page 2 of the uploaded book
  await page.getByRole("button", { name: /Tutor/ }).first().click();
  await page.getByTestId("tutor-input").fill("Dove avviene la fotosintesi?");
  await page.getByTestId("tutor-send").click();
  await expect(page.locator(".msg.assistant .katex").first()).toBeVisible();
  await expect(page.locator(".source summary").first()).toContainText("biologia · pag. 2");
  await page.locator(".msg.assistant .cite").first().click();
  await expect(page.locator(".source[open] .excerpt")).toContainText("cloroplasti");
  expect(calls).toContain("tutor-with-sources");
  await shot(page, "07-tutor");
  await page.getByRole("button", { name: /Salva negli appunti/ }).click();
  await expect(page.getByText("Salvato negli appunti.")).toBeVisible();

  // Flashcards from pages 2-3, review them
  await page.getByRole("button", { name: /Ripasso/ }).first().click();
  await page.getByRole("tab", { name: "Crea flashcard" }).click();
  await page.getByTestId("doc-select").selectOption({ label: "biologia (3 pagine)" });
  await page.getByLabel("Dalla pagina").fill("2");
  await page.getByTestId("gen-cards").click();
  await expect(page.getByText("Controlla le flashcard")).toBeVisible();
  await shot(page, "08-cards-preview");
  await page.getByTestId("save-cards").click();
  await expect(page.getByText("2 flashcard salvate")).toBeVisible();

  await page.getByRole("tab", { name: "Ripassa" }).click();
  await expect(page.getByText("2 rimaste")).toBeVisible();
  await expect(page.getByText("Dove avviene la fotosintesi?")).toBeVisible();
  await page.getByRole("button", { name: "Mostra risposta" }).click();
  await expect(page.getByText("Nei cloroplasti delle cellule vegetali.")).toBeVisible();
  await shot(page, "09-review");
  await page.getByRole("button", { name: /La sapevo/ }).click();
  await expect(page.getByText("1 rimasta")).toBeVisible();

  // Quiz
  await page.getByRole("tab", { name: "Quiz" }).click();
  await page.getByTestId("start-quiz").click();
  await page.getByRole("button", { name: /Nel nucleo/ }).click();
  await page.getByRole("button", { name: "Controlla" }).click();
  await expect(page.getByText(/La risposta giusta è: B/)).toBeVisible();
  await page.getByRole("button", { name: /Prossima domanda/ }).click();
  await expect(page.getByText("Hai risposto bene a 0 domande su 1.")).toBeVisible();
  await page.getByRole("button", { name: /Trasforma gli errori in flashcard/ }).click();
  await expect(page.getByText(/Ho creato 1 flashcard/)).toBeVisible();

  // Home reflects everything; switching to English works
  await page.getByRole("button", { name: /Home/ }).first().click();
  await expect(page.getByRole("heading", { name: "Ciao Giulia!" })).toBeVisible();
  await expect(page.getByText(/1 documenti|2 documenti/)).toBeVisible();
  await shot(page, "10-home");
  await page.getByRole("button", { name: /Impostazioni/ }).first().click();
  await page.getByLabel("Lingua").selectOption("en");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText(/In use: Google Gemini · gemini-2.5-flash/)).toBeVisible();

  // Backup downloads a zip
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download backup/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^studylab-backup-.*\.zip$/);
  expect(consoleErrors.filter((e) => /Content Security Policy|Refused to/i.test(e))).toEqual([]);
});

test("paper search works against the real Semantic Scholar API @network", async ({ page }) => {
  test.skip(!process.env.NETWORK, "set NETWORK=1 to run");
  await page.goto("/");
  await page.evaluate(async () => {
    const req = indexedDB.open("studylab");
    await new Promise((r) => (req.onsuccess = r));
  });
  // Skip onboarding through the UI quickly.
  for (let i = 0; i < 4; i++) await page.getByTestId("onb-next").click();
  await page.getByPlaceholder(/Biologia, Storia/).fill("Fisica");
  await page.getByTestId("onb-finish").click();
  await page.getByRole("button", { name: /Articoli/ }).first().click();
  await page.getByPlaceholder(/Cerca un argomento/).fill("physics-informed neural networks");
  await page.getByRole("button", { name: /Cerca/ }).click();
  const result = page.locator(".paper h3").first();
  const busy = page.getByText(/troppo occupato/);
  await expect(result.or(busy)).toBeVisible({ timeout: 60_000 });
  if (await result.isVisible()) {
    await page.locator(".paper").first().getByRole("button", { name: /Salva nella materia/ }).click();
    await expect(page.getByText("Salvato in Materiale.")).toBeVisible();
  }
});

test("mobile layout uses bottom navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Benvenuta/ })).toBeVisible();
  await shot(page, "11-mobile-welcome");
  const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalScroll).toBe(false);
});

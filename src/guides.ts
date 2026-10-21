import type { Lang } from "./db";

export type OS = "windows" | "linux" | "mac";

export function detectOS(): OS {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("windows")) return "windows";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "mac";
  return "linux";
}

export interface SetupStep {
  /** Markdown text of the step. */
  text: string;
  /** Optional command the user copies into a terminal. */
  command?: string;
  link?: string;
}

export interface SetupGuide {
  steps: SetupStep[];
  note?: string;
}

type GuideFn = (lang: Lang, ctx: { origin: string; os: OS }) => SetupGuide;

const L = (lang: Lang, it: string, en: string) => (lang === "it" ? it : en);

const gemini: GuideFn = (lang) => ({
  steps: [
    {
      text: L(lang, "Apri il sito di **Google AI Studio** e accedi con il tuo account Google (lo stesso di Gmail o YouTube).", "Open **Google AI Studio** and sign in with your Google account (the same one you use for Gmail or YouTube)."),
      link: "https://aistudio.google.com/apikey",
    },
    {
      text: L(
        lang,
        "Se è la prima volta, accetta i termini di servizio. (Google richiede almeno **18 anni** per usare questo servizio.)",
        "If it's your first time, accept the terms of service. (Google requires you to be at least **18** to use this service.)",
      ),
    },
    { text: L(lang, "Clicca il pulsante blu **Create API key** (Crea chiave API). Se ti chiede un progetto, accetta quello proposto.", "Click the blue **Create API key** button. If it asks for a project, accept the suggested one.") },
    { text: L(lang, "Accanto alla chiave (inizia con **AIza…**) clicca l'icona **copia** 📋.", "Next to the key (it starts with **AIza…**) click the **copy** icon 📋.") },
    { text: L(lang, "Torna qui, incolla la chiave nel riquadro qui sotto e clicca **Prova la connessione**.", "Come back here, paste the key in the box below and click **Test the connection**.") },
  ],
  note: L(
    lang,
    "Il piano gratuito ha un limite di richieste al minuto e al giorno: se lo superi, basta aspettare. Nel piano gratuito Google può usare le richieste per migliorare i suoi prodotti, quindi evita di caricare dati personali delicati.",
    "The free tier limits requests per minute and per day: if you hit the limit, just wait. On the free tier Google may use requests to improve its products, so avoid uploading sensitive personal data.",
  ),
});

const groq: GuideFn = (lang) => ({
  steps: [
    { text: L(lang, "Apri la **console di Groq** e accedi (puoi usare il tuo account Google).", "Open the **Groq console** and sign in (you can use your Google account)."), link: "https://console.groq.com/keys" },
    { text: L(lang, "Clicca **Create API Key**, scrivi un nome qualsiasi (es. StudyLab) e conferma.", "Click **Create API Key**, type any name (e.g. StudyLab) and confirm.") },
    { text: L(lang, "Copia la chiave (inizia con **gsk_**). Attenzione: viene mostrata una volta sola!", "Copy the key (it starts with **gsk_**). Careful: it's shown only once!") },
    { text: L(lang, "Incollala qui sotto e clicca **Prova la connessione**.", "Paste it below and click **Test the connection**.") },
  ],
  note: L(lang, "Groq non legge immagini né PDF scansionati.", "Groq can't read images or scanned PDFs."),
});

const openrouter: GuideFn = (lang) => ({
  steps: [
    { text: L(lang, "Apri **OpenRouter** e accedi (puoi usare il tuo account Google).", "Open **OpenRouter** and sign in (you can use your Google account)."), link: "https://openrouter.ai/settings/keys" },
    { text: L(lang, "Nella pagina **Keys** clicca **Create Key**, dai un nome e conferma.", "On the **Keys** page click **Create Key**, give it a name and confirm.") },
    { text: L(lang, "Copia la chiave (inizia con **sk-or-**) e incollala qui sotto.", "Copy the key (it starts with **sk-or-**) and paste it below.") },
    { text: L(lang, "Clicca **Prova la connessione**. I modelli gratuiti hanno il nome che finisce con **:free**.", "Click **Test the connection**. Free models have names ending in **:free**.") },
  ],
  note: L(lang, "I modelli gratuiti hanno un limite di richieste giornaliere.", "Free models have a daily request limit."),
});

const mistral: GuideFn = (lang) => ({
  steps: [
    { text: L(lang, "Apri la **console di Mistral** e crea un account.", "Open the **Mistral console** and create an account."), link: "https://console.mistral.ai/api-keys" },
    { text: L(lang, "Scegli il piano gratuito **Experiment** (ti chiede di verificare il numero di telefono).", "Choose the free **Experiment** plan (it asks you to verify your phone number).") },
    { text: L(lang, "In **API Keys** clicca **Create new key**, poi copia la chiave.", "In **API Keys** click **Create new key**, then copy the key.") },
    { text: L(lang, "Incollala qui sotto e clicca **Prova la connessione**.", "Paste it below and click **Test the connection**.") },
  ],
});

const openai: GuideFn = (lang) => ({
  steps: [
    { text: L(lang, "Apri la **piattaforma OpenAI** e accedi.", "Open the **OpenAI platform** and sign in."), link: "https://platform.openai.com/api-keys" },
    {
      text: L(
        lang,
        "In **Billing** aggiungi un po' di credito (minimo 5 $). Nota: l'abbonamento a ChatGPT Plus **non** include questo servizio.",
        "In **Billing** add some credit (minimum $5). Note: a ChatGPT Plus subscription does **not** include this service.",
      ),
    },
    { text: L(lang, "In **API keys** clicca **Create new secret key** e copia la chiave (inizia con **sk-**).", "In **API keys** click **Create new secret key** and copy the key (it starts with **sk-**).") },
    { text: L(lang, "Incollala qui sotto e clicca **Prova la connessione**.", "Paste it below and click **Test the connection**.") },
  ],
});

const anthropic: GuideFn = (lang) => ({
  steps: [
    { text: L(lang, "Apri la **console di Anthropic** e crea un account.", "Open the **Anthropic console** and create an account."), link: "https://console.anthropic.com/settings/keys" },
    {
      text: L(lang, "In **Billing** acquista un po' di credito. Nota: l'abbonamento a Claude.ai è separato e non vale qui.", "In **Billing** buy some credit. Note: a Claude.ai subscription is separate and doesn't apply here."),
    },
    { text: L(lang, "In **API Keys** clicca **Create Key** e copia la chiave (inizia con **sk-ant-**).", "In **API Keys** click **Create Key** and copy the key (it starts with **sk-ant-**).") },
    { text: L(lang, "Incollala qui sotto e clicca **Prova la connessione**.", "Paste it below and click **Test the connection**.") },
  ],
  note: L(
    lang,
    "Il modello predefinito è il più capace (Claude Opus). Per spendere meno puoi scegliere un modello \"haiku\" dall'elenco qui sotto.",
    "The default model is the most capable one (Claude Opus). To spend less, pick a \"haiku\" model from the list below.",
  ),
});

const deepseek: GuideFn = (lang) => ({
  steps: [
    { text: L(lang, "Apri la **piattaforma DeepSeek** e crea un account.", "Open the **DeepSeek platform** and create an account."), link: "https://platform.deepseek.com/api_keys" },
    { text: L(lang, "Ricarica un po' di credito in **Top up**.", "Add some credit in **Top up**.") },
    { text: L(lang, "In **API keys** crea una chiave e copiala.", "In **API keys** create a key and copy it.") },
    { text: L(lang, "Incollala qui sotto e clicca **Prova la connessione**.", "Paste it below and click **Test the connection**.") },
  ],
});

const ollama: GuideFn = (lang, { origin, os }) => {
  const model = "gemma3:4b";
  const installStep: SetupStep =
    os === "linux"
      ? { text: L(lang, "Apri il **Terminale** (Ctrl+Alt+T), incolla questo comando e premi Invio. Ti chiederà la password del computer.", "Open the **Terminal** (Ctrl+Alt+T), paste this command and press Enter. It will ask for your computer password."), command: "curl -fsSL https://ollama.com/install.sh | sh" }
      : { text: L(lang, "Scarica **Ollama** dal sito ufficiale e installalo come un normale programma.", "Download **Ollama** from the official site and install it like any other program."), link: "https://ollama.com/download" };
  const allowStep: SetupStep =
    os === "windows"
      ? {
          text: L(
            lang,
            "Permetti a StudyLab di collegarsi: premi il tasto **Windows**, scrivi **PowerShell**, aprilo, incolla questo comando e premi Invio. Poi chiudi Ollama (icona del lama vicino all'orologio → tasto destro → **Quit**) e riaprilo dal menu Start.",
            "Allow StudyLab to connect: press the **Windows** key, type **PowerShell**, open it, paste this command and press Enter. Then close Ollama (llama icon near the clock → right-click → **Quit**) and reopen it from the Start menu.",
          ),
          command: `setx OLLAMA_ORIGINS "${origin}"`,
        }
      : os === "mac"
        ? {
            text: L(lang, "Permetti a StudyLab di collegarsi: apri **Terminale**, incolla questo comando e premi Invio. Poi chiudi Ollama dalla barra in alto e riaprilo.", "Allow StudyLab to connect: open **Terminal**, paste this command and press Enter. Then quit Ollama from the top bar and reopen it."),
            command: `launchctl setenv OLLAMA_ORIGINS "${origin}"`,
          }
        : {
            text: L(lang, "Permetti a StudyLab di collegarsi: incolla nel Terminale questi comandi e premi Invio.", "Allow StudyLab to connect: paste these commands in the Terminal and press Enter."),
            command: `sudo mkdir -p /etc/systemd/system/ollama.service.d && printf '[Service]\\nEnvironment="OLLAMA_ORIGINS=${origin}"\\n' | sudo tee /etc/systemd/system/ollama.service.d/studylab.conf && sudo systemctl daemon-reload && sudo systemctl restart ollama`,
          };
  return {
    steps: [
      installStep,
      allowStep,
      {
        text: L(
          lang,
          `Scarica un modello AI (circa 3 GB, ci vuole qualche minuto). ${os === "windows" ? "In PowerShell" : "Nel Terminale"} incolla:`,
          `Download an AI model (about 3 GB, takes a few minutes). In ${os === "windows" ? "PowerShell" : "the Terminal"} paste:`,
        ),
        command: `ollama pull ${model}`,
      },
      {
        text: L(
          lang,
          "Clicca **Prova la connessione** qui sotto. Se il browser chiede il permesso di accedere ai dispositivi della rete locale, clicca **Consenti**.",
          "Click **Test the connection** below. If the browser asks permission to access devices on your local network, click **Allow**.",
        ),
      },
    ],
    note: L(
      lang,
      "Serve un computer con almeno 8 GB di RAM (meglio 16). Le risposte sono più lente e un po' meno precise dei servizi online, ma è tutto gratis e nulla esce dal tuo PC.",
      "You need a computer with at least 8 GB of RAM (16 is better). Answers are slower and a bit less accurate than online services, but it's all free and nothing leaves your PC.",
    ),
  };
};

const custom: GuideFn = (lang) => ({
  steps: [
    {
      text: L(
        lang,
        "Inserisci l'indirizzo del server (deve terminare con /v1 se il servizio lo richiede) e la chiave, poi clicca **Prova la connessione**.",
        "Enter the server address (ending in /v1 if the service requires it) and the key, then click **Test the connection**.",
      ),
    },
  ],
});

const GUIDES: Record<string, GuideFn> = { gemini, groq, openrouter, mistral, openai, anthropic, deepseek, ollama, custom };

export function setupGuide(providerId: string, lang: Lang, origin = window.location.origin, os = detectOS()): SetupGuide {
  return (GUIDES[providerId] ?? custom)(lang, { origin, os });
}

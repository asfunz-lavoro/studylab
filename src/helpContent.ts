import type { Lang } from "./db";

export interface HelpSection {
  id: string;
  title: string;
  body: string;
}

const it: HelpSection[] = [
  {
    id: "what",
    title: "Che cos'è StudyLab?",
    body: `StudyLab è un'app per studiare con i **tuoi** materiali:

1. **Carichi** libri, dispense, appunti o foto delle pagine (sezione *Materiale*).
2. **Chiedi** al *Tutor*: risponde usando quei materiali e ti mostra le pagine da cui prende le informazioni.
3. **Ripassi** con flashcard e quiz creati automaticamente (sezione *Ripasso*).

L'intelligenza artificiale non è di StudyLab: l'app si collega a un servizio AI (per esempio Google Gemini, gratuito) con una tua chiave personale.`,
  },
  {
    id: "install",
    title: "Installarla come app sul computer",
    body: `Non è obbligatorio: StudyLab funziona anche semplicemente aprendo il sito. Installarla però ti dà un'icona sul desktop e una finestra tutta sua.

### Windows
1. Apri StudyLab con **Microsoft Edge** o **Google Chrome**.
2. **Edge:** clicca i tre puntini **⋯** in alto a destra → **App** → **Installa StudyLab**.
   **Chrome:** clicca l'icona con il monitor e la freccia ⤓ nella barra degli indirizzi (a destra), oppure i tre puntini **⋮** → **Trasmetti, salva e condividi** → **Installa pagina come app**.
3. Conferma con **Installa**. Troverai StudyLab nel menu Start e potrai fissarla alla barra delle applicazioni (tasto destro → *Aggiungi alla barra delle applicazioni*).

### Linux (Ubuntu, Mint, Fedora…)
1. Apri StudyLab con **Google Chrome**, **Chromium** o **Microsoft Edge** (Firefox non permette di installare app web: puoi semplicemente aggiungerla ai preferiti con Ctrl+D).
2. Clicca l'icona ⤓ nella barra degli indirizzi, oppure **⋮** → **Trasmetti, salva e condividi** → **Installa pagina come app**.
3. StudyLab comparirà tra le applicazioni del sistema.

### Mac
1. **Safari:** menu **File** → **Aggiungi al Dock**.
2. **Chrome:** icona ⤓ nella barra degli indirizzi → **Installa**.

> I dati restano legati al browser in cui hai installato l'app: se cambi browser, usa *Backup* e *Ripristina* dalle Impostazioni.`,
  },
  {
    id: "start",
    title: "Come iniziare (in 3 minuti)",
    body: `1. Vai in **Materiale** e crea una **materia** (es. "Biologia").
2. Trascina dentro il PDF del libro o delle dispense. L'app legge il testo pagina per pagina (per un libro di 300 pagine ci vuole circa un minuto).
3. Vai nel **Tutor**, scegli la materia e fai una domanda, per esempio *"Spiegami la mitosi"*.
4. Sotto la risposta trovi le **fonti**: clicca per vedere la pagina esatta del libro.
5. In **Ripasso → Crea flashcard** scegli il documento e le pagine del capitolo che stai studiando.
6. Ogni giorno apri **Ripasso → Ripassa**: bastano 10 minuti.`,
  },
  {
    id: "tutor",
    title: "Usare bene il Tutor",
    body: `**Tre modalità:**
- **Spiegami** – spiegazione passo passo, con una domanda finale per verificare che hai capito.
- **Interrogami** – il tutor ti fa domande una alla volta e corregge le tue risposte. Perfetta prima di una verifica o di un esame.
- **In parole semplici** – spiegazione breve con un esempio, per quando un argomento proprio non entra.

**Consigli:**
- Scegli la **materia giusta** in alto: il tutor cerca solo nei materiali di quella materia.
- Fai domande **precise**: *"Che differenza c'è tra mitosi e meiosi?"* funziona meglio di *"parlami delle cellule"*.
- Se la risposta dice **(conoscenza generale)**, quella parte non viene dai tuoi materiali: controllala sul libro.
- Le risposte buone puoi salvarle con **Salva negli appunti**.

> L'AI può sbagliare. Usa le fonti citate per controllare, soprattutto per date, numeri e formule.`,
  },
  {
    id: "review",
    title: "Flashcard e ripasso spaziato",
    body: `Il ripasso spaziato è il modo più efficace per ricordare a lungo: invece di ripassare tutto insieme la sera prima, rivedi ogni carta **poco prima di dimenticarla**.

Dopo aver visto la risposta, sii sincera:
- **Non la sapevo** → la rivedrai tra pochi minuti.
- **Difficile** → tra poco.
- **La sapevo** → tra qualche giorno.
- **Facilissima** → tra molto tempo.

L'app calcola da sola quando mostrarti ogni carta (algoritmo FSRS). Tu devi solo aprire **Ripasso** ogni giorno e smaltire le carte del giorno.

**Quiz:** genera domande a scelta multipla su un capitolo. Alla fine puoi trasformare gli errori in flashcard con un clic.`,
  },
  {
    id: "scans",
    title: "PDF scansionati e foto degli appunti",
    body: `Alcuni PDF sono "fotografie" delle pagine: non contengono testo che il computer possa leggere. StudyLab te lo segnala con un avviso giallo.

Clicca **Leggile con l'AI**: le pagine vengono inviate al servizio AI, che le trascrive (anche le formule). Funziona con Google Gemini, OpenAI, Claude, Mistral e alcuni modelli di OpenRouter.

Puoi anche caricare **foto** degli appunti scritti a mano (JPG, PNG): vengono trascritte automaticamente.

> Trascrivere molte pagine consuma molte richieste: nel piano gratuito di Gemini conviene farlo un capitolo alla volta.`,
  },
  {
    id: "privacy",
    title: "Privacy e costi",
    body: `- **Dove sono i miei dati?** Solo in questo browser, su questo computer. StudyLab non ha un server che li riceve.
- **Cosa viene inviato fuori?** Quando usi il tutor, le flashcard, i quiz o la trascrizione, il testo necessario (la domanda e i brani dei materiali) viene inviato **al servizio AI che hai scelto**, con la tua chiave. La ricerca di articoli contatta OpenAlex e/o Semantic Scholar.
- **La chiave è al sicuro?** È salvata in questo browser. Non condividerla con nessuno e non usare StudyLab su computer pubblici.
- **Quanto costa?** StudyLab è gratis. Google Gemini, Groq, OpenRouter (modelli :free) e Mistral hanno piani gratuiti con dei limiti; OpenAI, Claude e DeepSeek sono a pagamento in base all'uso. Ollama è gratis ma usa il tuo computer.
- **Età:** molti servizi AI (tra cui Gemini, OpenAI e Claude) richiedono almeno 18 anni. Se hai meno di 18 anni usa Ollama, che funziona sul tuo computer.`,
  },
  {
    id: "backup",
    title: "Backup e cambio computer",
    body: `Poiché i dati sono solo nel browser, **se cancelli i dati di navigazione o reinstalli il browser li perdi**. Per questo:

1. Ogni tanto vai in **Impostazioni → I tuoi dati → Scarica backup**.
2. Conserva il file \`.zip\` in un posto sicuro (Google Drive, OneDrive, una chiavetta).
3. Su un altro computer (o dopo una reinstallazione) apri StudyLab, completa la configurazione e usa **Ripristina da backup**.

Il backup **non** contiene la chiave del servizio AI: dovrai reinserirla.

Puoi anche **esportare per Obsidian** se usi Obsidian per i tuoi appunti.`,
  },
  {
    id: "trouble",
    title: "Problemi comuni",
    body: `**"La chiave non funziona"** – Rifai la copia dal sito del servizio, assicurandoti di prenderla tutta. Controlla di non aver incollato spazi.

**"Troppe richieste" / "quota esaurita"** – I piani gratuiti hanno limiti al minuto e al giorno. Aspetta un minuto (o fino a domani), oppure passa a un altro servizio nelle Impostazioni.

**Il tutor non trova le cose nel libro** – Controlla di aver scelto la materia giusta. Se il PDF è una scansione, trascrivilo con l'AI (vedi sopra). Prova a usare le parole del libro nella domanda.

**Ollama non si collega** – Controlla che Ollama sia aperto, che tu abbia fatto il passo "permetti a StudyLab di collegarsi" e riavviato Ollama. Se il browser chiede di accedere alla rete locale, consenti.

**Il caricamento di un PDF enorme è lento** – È normale: un libro di 800 pagine può richiedere qualche minuto. Non chiudere la pagina.

**Ho perso i dati** – Se hai un backup, usa *Ripristina da backup*. Per evitarlo in futuro attiva *Proteggi i dati dalla pulizia automatica* nelle Impostazioni.`,
  },
];

const en: HelpSection[] = [
  {
    id: "what",
    title: "What is StudyLab?",
    body: `StudyLab is an app for studying with **your own** materials:

1. **Upload** books, handouts, notes or photos of pages (*Materials*).
2. **Ask** the *Tutor*: it answers using those materials and shows you the pages the information comes from.
3. **Review** with automatically created flashcards and quizzes (*Review*).

The artificial intelligence isn't StudyLab's own: the app connects to an AI service (for example Google Gemini, which is free) with your personal key.`,
  },
  {
    id: "install",
    title: "Install it as an app on your computer",
    body: `It's optional: StudyLab also works by simply opening the website. Installing it gives you a desktop icon and its own window.

### Windows
1. Open StudyLab in **Microsoft Edge** or **Google Chrome**.
2. **Edge:** click the three dots **⋯** at the top right → **Apps** → **Install StudyLab**.
   **Chrome:** click the monitor-with-arrow icon ⤓ in the address bar (on the right), or the three dots **⋮** → **Cast, save and share** → **Install page as app**.
3. Confirm with **Install**. You'll find StudyLab in the Start menu and can pin it to the taskbar (right-click → *Pin to taskbar*).

### Linux (Ubuntu, Mint, Fedora…)
1. Open StudyLab in **Google Chrome**, **Chromium** or **Microsoft Edge** (Firefox can't install web apps: just bookmark it with Ctrl+D).
2. Click the ⤓ icon in the address bar, or **⋮** → **Cast, save and share** → **Install page as app**.
3. StudyLab will appear among your system's applications.

### Mac
1. **Safari:** **File** menu → **Add to Dock**.
2. **Chrome:** ⤓ icon in the address bar → **Install**.

> Your data is tied to the browser where you installed the app: if you switch browsers, use *Backup* and *Restore* in Settings.`,
  },
  {
    id: "start",
    title: "Getting started (in 3 minutes)",
    body: `1. Go to **Materials** and create a **subject** (e.g. "Biology").
2. Drag in the PDF of your book or handouts. The app reads the text page by page (a 300-page book takes about a minute).
3. Go to the **Tutor**, pick the subject and ask a question, for example *"Explain mitosis"*.
4. Below the answer you'll find the **sources**: click to see the exact page of the book.
5. In **Review → Create flashcards** pick the document and the pages of the chapter you're studying.
6. Open **Review → Review** every day: 10 minutes is enough.`,
  },
  {
    id: "tutor",
    title: "Getting the most out of the Tutor",
    body: `**Three modes:**
- **Explain** – step-by-step explanation, with a final question to check you understood.
- **Quiz me** – the tutor asks you questions one at a time and corrects your answers. Perfect before a test or exam.
- **Keep it simple** – a short explanation with an example, for when a topic just won't click.

**Tips:**
- Pick the **right subject** at the top: the tutor only searches that subject's materials.
- Ask **specific** questions: *"What's the difference between mitosis and meiosis?"* works better than *"tell me about cells"*.
- If the answer says **(general knowledge)**, that part doesn't come from your materials: check it in the book.
- Save good answers with **Save to notes**.

> AI can make mistakes. Use the cited sources to check, especially dates, numbers and formulas.`,
  },
  {
    id: "review",
    title: "Flashcards and spaced repetition",
    body: `Spaced repetition is the most effective way to remember long-term: instead of cramming the night before, you see each card **just before you'd forget it**.

After seeing the answer, be honest:
- **Didn't know** → you'll see it again in a few minutes.
- **Hard** → soon.
- **Knew it** → in a few days.
- **Very easy** → much later.

The app works out when to show each card (FSRS algorithm). You just open **Review** every day and clear the day's cards.

**Quiz:** generates multiple-choice questions on a chapter. At the end you can turn your mistakes into flashcards with one click.`,
  },
  {
    id: "scans",
    title: "Scanned PDFs and photos of notes",
    body: `Some PDFs are "photos" of pages: they contain no text the computer can read. StudyLab warns you with a yellow notice.

Click **Read them with AI**: the pages are sent to the AI service, which transcribes them (formulas included). It works with Google Gemini, OpenAI, Claude, Mistral and some OpenRouter models.

You can also upload **photos** of handwritten notes (JPG, PNG): they're transcribed automatically.

> Transcribing many pages uses many requests: on Gemini's free tier, do one chapter at a time.`,
  },
  {
    id: "privacy",
    title: "Privacy and costs",
    body: `- **Where is my data?** Only in this browser, on this computer. StudyLab has no server that receives it.
- **What gets sent out?** When you use the tutor, flashcards, quizzes or transcription, the necessary text (your question and excerpts from your materials) is sent **to the AI service you chose**, with your key. Paper search contacts OpenAlex and/or Semantic Scholar.
- **Is my key safe?** It's stored in this browser. Don't share it with anyone and don't use StudyLab on public computers.
- **How much does it cost?** StudyLab is free. Google Gemini, Groq, OpenRouter (:free models) and Mistral have free tiers with limits; OpenAI, Claude and DeepSeek charge by usage. Ollama is free but uses your computer.
- **Age:** many AI services (including Gemini, OpenAI and Claude) require you to be at least 18. If you're under 18, use Ollama, which runs on your own computer.`,
  },
  {
    id: "backup",
    title: "Backup and switching computers",
    body: `Because your data lives only in the browser, **clearing browsing data or reinstalling the browser loses it**. So:

1. Every now and then go to **Settings → Your data → Download backup**.
2. Keep the \`.zip\` file somewhere safe (Google Drive, OneDrive, a USB stick).
3. On another computer (or after reinstalling) open StudyLab, finish setup and use **Restore from backup**.

The backup does **not** include your AI service key: you'll need to enter it again.

You can also **export for Obsidian** if you use Obsidian for notes.`,
  },
  {
    id: "trouble",
    title: "Common problems",
    body: `**"The key doesn't work"** – Copy it again from the service's website, making sure you get all of it. Check you didn't paste any spaces.

**"Too many requests" / "quota used up"** – Free tiers have per-minute and per-day limits. Wait a minute (or until tomorrow), or switch to another service in Settings.

**The tutor can't find things in the book** – Check you picked the right subject. If the PDF is a scan, transcribe it with AI (see above). Try using the book's own words in your question.

**Ollama won't connect** – Make sure Ollama is running, that you did the "allow StudyLab to connect" step and restarted Ollama. If the browser asks to access the local network, allow it.

**Uploading a huge PDF is slow** – That's normal: an 800-page book can take a few minutes. Don't close the page.

**I lost my data** – If you have a backup, use *Restore from backup*. To prevent this, turn on *Protect data from automatic cleanup* in Settings.`,
  },
];

export function helpSections(lang: Lang): HelpSection[] {
  return lang === "it" ? it : en;
}

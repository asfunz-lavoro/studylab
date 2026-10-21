import { getJSON, postJSON, sseData } from "./sse";
import { LLMError, type LLMMessage, type Provider, type ProviderInfo } from "./types";

function toOpenAIContent(content: LLMMessage["content"]) {
  if (typeof content === "string") return content;
  return content.map((p) =>
    p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: `data:${p.mimeType};base64,${p.data}` } },
  );
}

interface CompatOptions {
  /** Keep only chat-capable model ids from GET /models. */
  modelFilter?: (id: string) => boolean;
  /** Ordered regexes; the first model matching the earliest pattern becomes the default. */
  preferred?: RegExp[];
  /** Extra request headers (e.g. OpenRouter attribution). */
  headers?: Record<string, string>;
  /** Models list endpoint differs (Ollama exposes /api/tags at the server root). */
  listModels?: (baseUrl: string, apiKey: string) => Promise<string[]>;
  jsonMode?: boolean;
  /** OpenAI's reasoning models (GPT-5, o-series) reject `max_tokens` and need `max_completion_tokens`. */
  maxTokensParam?: "max_tokens" | "max_completion_tokens";
}

export function pickPreferred(models: string[], preferred: RegExp[] = []): string {
  for (const re of preferred) {
    const hit = models.find((m) => re.test(m));
    if (hit) return hit;
  }
  return models[0] ?? "";
}

export function openAICompatible(info: ProviderInfo, opts: CompatOptions = {}): Provider {
  const base = (cfgBase?: string) => (cfgBase || info.defaultBaseUrl || "").replace(/\/+$/, "");
  const auth = (key: string): Record<string, string> => (key ? { authorization: `Bearer ${key}` } : {});

  return {
    ...info,
    async listModels(cfg) {
      const url = base(cfg.baseUrl);
      const ids = opts.listModels
        ? await opts.listModels(url, cfg.apiKey)
        : (await getJSON<{ data?: { id: string }[] }>(`${url}/models`, { ...auth(cfg.apiKey), ...opts.headers })).data?.map((m) => m.id) ?? [];
      return ids.filter(opts.modelFilter ?? (() => true)).sort();
    },
    pickDefaultModel(models) {
      return pickPreferred(models, opts.preferred);
    },
    async complete(cfg, req) {
      const body = {
        model: cfg.model,
        stream: true,
        [opts.maxTokensParam ?? "max_tokens"]: req.maxTokens ?? 8192,
        messages: [
          { role: "system", content: req.system },
          ...req.messages.map((m) => ({ role: m.role, content: toOpenAIContent(m.content) })),
        ],
        ...(req.json && opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      };
      const res = await postJSON(`${base(cfg.baseUrl)}/chat/completions`, { ...auth(cfg.apiKey), ...opts.headers }, body, req.signal);
      let text = "";
      for await (const data of sseData(res, req.signal)) {
        if (data === "[DONE]") break;
        const chunk = JSON.parse(data) as {
          choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
          error?: { message?: string };
        };
        if (chunk.error) throw new LLMError("server", chunk.error.message ?? "Provider error");
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          req.onText?.(text);
        }
        if (chunk.choices?.[0]?.finish_reason === "content_filter") throw new LLMError("refusal", "content_filter");
      }
      return text;
    },
  };
}

const NOT_CHAT = /embed|whisper|tts|audio|realtime|transcribe|image|dall-e|moderation|search|computer-use|davinci|babbage|guard|ocr/i;

export const openai = openAICompatible(
  {
    id: "openai",
    label: "OpenAI (ChatGPT)",
    blurb: { it: "I modelli di ChatGPT. A pagamento: serve credito prepagato.", en: "The models behind ChatGPT. Paid: needs prepaid credit." },
    free: "paid",
    needsKey: true,
    keyUrl: "https://platform.openai.com/api-keys",
    defaultBaseUrl: "https://api.openai.com/v1",
    vision: true,
  },
  {
    modelFilter: (id) => /^(gpt-|o\d|chatgpt)/.test(id) && !NOT_CHAT.test(id) && !/-\d{4}-\d{2}-\d{2}$/.test(id),
    preferred: [/^gpt-\d+(\.\d+)?-mini$/, /^gpt-\d+(\.\d+)?$/, /mini/],
    jsonMode: true,
    maxTokensParam: "max_completion_tokens",
  },
);

export const groq = openAICompatible(
  {
    id: "groq",
    label: "Groq",
    blurb: { it: "Gratuito con limiti giornalieri, velocissimo. Modelli open (Llama, Qwen…).", en: "Free with daily limits, very fast. Open models (Llama, Qwen…)." },
    free: "freeTier",
    needsKey: true,
    keyUrl: "https://console.groq.com/keys",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    vision: false,
  },
  { modelFilter: (id) => !NOT_CHAT.test(id), preferred: [/llama-3\.3-70b/, /llama.*70b/, /qwen/, /llama/], jsonMode: true },
);

export const openrouter = openAICompatible(
  {
    id: "openrouter",
    label: "OpenRouter",
    blurb: { it: "Un'unica chiave per centinaia di modelli, alcuni gratuiti (finiscono con :free).", en: "One key for hundreds of models, some free (ending in :free)." },
    free: "freeTier",
    needsKey: true,
    keyUrl: "https://openrouter.ai/settings/keys",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    vision: true,
  },
  {
    modelFilter: (id) => !NOT_CHAT.test(id),
    preferred: [/google\/gemini.*flash.*:free/, /:free$/, /google\/gemini.*flash/],
    headers: { "X-Title": "StudyLab" },
  },
);

export const mistral = openAICompatible(
  {
    id: "mistral",
    label: "Mistral AI",
    blurb: { it: "Azienda europea. Piano gratuito per provare (i dati possono essere usati per l'addestramento).", en: "European company. Free plan to try (data may be used for training)." },
    free: "freeTier",
    needsKey: true,
    keyUrl: "https://console.mistral.ai/api-keys",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    vision: true,
  },
  { modelFilter: (id) => !NOT_CHAT.test(id) && !/codestral|devstral|moderation/.test(id), preferred: [/mistral-medium-latest/, /mistral-small-latest/, /latest/], jsonMode: true },
);

export const deepseek = openAICompatible(
  {
    id: "deepseek",
    label: "DeepSeek",
    blurb: { it: "Molto economico, a pagamento con credito prepagato.", en: "Very cheap, paid with prepaid credit." },
    free: "paid",
    needsKey: true,
    keyUrl: "https://platform.deepseek.com/api_keys",
    defaultBaseUrl: "https://api.deepseek.com",
    vision: false,
  },
  { preferred: [/deepseek-chat/], jsonMode: true },
);

export const ollama = openAICompatible(
  {
    id: "ollama",
    label: "Ollama (sul tuo computer)",
    blurb: { it: "Gratis e privato: l'AI gira sul tuo PC. Serve un computer abbastanza potente.", en: "Free and private: the AI runs on your PC. Needs a reasonably powerful computer." },
    free: "local",
    needsKey: false,
    defaultBaseUrl: "http://localhost:11434/v1",
    vision: true,
  },
  {
    listModels: async (baseUrl) => {
      const root = baseUrl.replace(/\/v1$/, "");
      const data = await getJSON<{ models?: { name: string }[] }>(`${root}/api/tags`);
      return (data.models ?? []).map((m) => m.name).filter((n) => !/embed/.test(n));
    },
    preferred: [/gemma3/, /qwen3/, /llama3/],
    jsonMode: true,
  },
);

export const custom = openAICompatible(
  {
    id: "custom",
    label: "Altro (compatibile OpenAI)",
    blurb: { it: "Per esperti: qualsiasi servizio con API compatibile OpenAI.", en: "For experts: any service with an OpenAI-compatible API." },
    free: "paid",
    needsKey: true,
    vision: false,
  },
  {},
);

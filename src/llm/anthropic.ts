import type AnthropicSDK from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { LLMError, errorFromStatus, type LLMMessage, type Provider } from "./types";

const DEFAULT_MODEL = "claude-opus-5-5";
// Models that accept the server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|fable-5-1|sonnet-5-5)$/;

type SDK = typeof AnthropicSDK;
// Loaded on first use so people on other providers don't download the SDK.
const loadSDK = async (): Promise<SDK> => (await import("@anthropic-ai/sdk")).default;

function client(Anthropic: SDK, apiKey: string) {
  // The key belongs to the person using the app and never leaves their browser except to Anthropic.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

function toContent(content: LLMMessage["content"]): BetaMessageParam["content"] {
  if (typeof content === "string") return content;
  return content.map((p) =>
    p.type === "text"
      ? { type: "text" as const, text: p.text }
      : { type: "image" as const, source: { type: "base64" as const, media_type: p.mimeType as "image/jpeg" | "image/png", data: p.data } },
  );
}

function wrap(Anthropic: SDK, err: unknown): LLMError {
  if (err instanceof LLMError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return new LLMError("aborted", "Stopped");
  if (err instanceof Anthropic.APIConnectionError) return new LLMError("network", err.message);
  if (err instanceof Anthropic.APIError && typeof err.status === "number") {
    return errorFromStatus(err.status, err.message, err.headers?.get?.("retry-after") ?? null);
  }
  return new LLMError("server", String(err));
}

export const anthropic: Provider = {
  id: "anthropic",
  label: "Anthropic Claude",
  blurb: { it: "Ottimo per spiegazioni e ragionamento. A pagamento: serve credito prepagato.", en: "Great at explanations and reasoning. Paid: needs prepaid credit." },
  free: "paid",
  needsKey: true,
  keyUrl: "https://console.anthropic.com/settings/keys",
  vision: true,

  async listModels(cfg) {
    const Anthropic = await loadSDK();
    try {
      const ids: string[] = [];
      for await (const m of client(Anthropic, cfg.apiKey).models.list({ limit: 100 })) ids.push(m.id);
      return ids;
    } catch (err) {
      throw wrap(Anthropic, err);
    }
  },

  pickDefaultModel(models) {
    return models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : (models[0] ?? DEFAULT_MODEL);
  },

  async complete(cfg, req) {
    const model = cfg.model || DEFAULT_MODEL;
    const Anthropic = await loadSDK();
    try {
      const stream = client(Anthropic, cfg.apiKey).beta.messages.stream(
        {
          model,
          max_tokens: req.maxTokens ?? 16000,
          system: req.system,
          messages: req.messages.map((m) => ({ role: m.role, content: toContent(m.content) })),
          ...(FALLBACK_MODELS.test(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        },
        { signal: req.signal },
      );
      let text = "";
      stream.on("text", (delta) => {
        text += delta;
        req.onText?.(text);
      });
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") throw new LLMError("refusal", final.stop_details?.explanation ?? "refusal");
      return text;
    } catch (err) {
      throw wrap(Anthropic, err);
    }
  },
};

import type { Settings } from "../db";
import { anthropic } from "./anthropic";
import { gemini } from "./gemini";
import { custom, deepseek, groq, mistral, ollama, openai, openrouter } from "./openaiCompat";
import { LLMError, type LLMRequest, type Provider, type ProviderSettings } from "./types";

export const PROVIDERS: Provider[] = [gemini, groq, openrouter, mistral, openai, anthropic, deepseek, ollama, custom];

export function getProvider(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? gemini;
}

export function activeConfig(settings: Settings): { provider: Provider; cfg: ProviderSettings } {
  const provider = getProvider(settings.provider);
  const cfg = settings.providers[provider.id] ?? { apiKey: "", model: "" };
  return { provider, cfg: { ...cfg, baseUrl: cfg.baseUrl || provider.defaultBaseUrl } };
}

export function isConfigured(settings: Settings | undefined): boolean {
  if (!settings) return false;
  const { provider, cfg } = activeConfig(settings);
  return Boolean(cfg.model) && (!provider.needsKey || Boolean(cfg.apiKey));
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new LLMError("aborted", "Stopped"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new LLMError("aborted", "Stopped"));
    });
  });

/** Run a completion with the active provider, retrying short rate-limit waits (free tiers hit these often). */
export async function complete(settings: Settings, req: LLMRequest, onWait?: (seconds: number) => void): Promise<string> {
  const { provider, cfg } = activeConfig(settings);
  for (let attempt = 0; ; attempt++) {
    try {
      return await provider.complete(cfg, req);
    } catch (err) {
      if (req.signal?.aborted) throw new LLMError("aborted", "Stopped");
      const e = err instanceof LLMError ? err : new LLMError("server", String(err));
      const retryable = e.kind === "rateLimit" || e.kind === "server";
      const wait = Math.min(e.retryAfterS ?? 5 * 2 ** attempt, 60);
      if (!retryable || attempt >= 3) throw e;
      onWait?.(Math.ceil(wait));
      await sleep(wait * 1000, req.signal);
    }
  }
}

export { LLMError };
export type { LLMRequest, Provider };

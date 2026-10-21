import { getJSON, postJSON, sseData } from "./sse";
import { LLMError, type LLMMessage, type Provider } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiModel {
  name: string;
  supportedGenerationMethods?: string[];
}

function toParts(content: LLMMessage["content"]) {
  if (typeof content === "string") return [{ text: content }];
  return content.map((p) => (p.type === "text" ? { text: p.text } : { inlineData: { mimeType: p.mimeType, data: p.data } }));
}

/** Higher version first; within a version prefer plain "flash", then "pro", then "flash-lite". */
export function rankGeminiModel(name: string): number {
  const version = Number.parseFloat(/gemini-(\d+(?:\.\d+)?)/.exec(name)?.[1] ?? "0");
  const tier = /flash-lite/.test(name) ? 1 : /flash/.test(name) ? 3 : /pro/.test(name) ? 2 : 0;
  const preview = /preview|exp/.test(name) ? -0.5 : 0;
  return version * 10 + tier + preview;
}

export const gemini: Provider = {
  id: "gemini",
  label: "Google Gemini",
  blurb: {
    it: "Consigliato: piano gratuito generoso, legge anche PDF scansionati e foto.",
    en: "Recommended: generous free tier, also reads scanned PDFs and photos.",
  },
  free: "freeTier",
  needsKey: true,
  keyUrl: "https://aistudio.google.com/apikey",
  vision: true,

  async listModels(cfg) {
    const data = await getJSON<{ models?: GeminiModel[] }>(`${BASE}/models?pageSize=200`, { "x-goog-api-key": cfg.apiKey });
    return (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((n) => n.startsWith("gemini") && !/image|tts|audio|live|embedding|thinking-exp|learnlm|robotics|computer/.test(n))
      .sort((a, b) => rankGeminiModel(b) - rankGeminiModel(a));
  },

  pickDefaultModel(models) {
    return [...models].sort((a, b) => rankGeminiModel(b) - rankGeminiModel(a))[0] ?? "";
  },

  async complete(cfg, req) {
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: toParts(m.content) })),
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 8192,
        ...(req.json ? { responseMimeType: "application/json" } : {}),
      },
    };
    const url = `${BASE}/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse`;
    const res = await postJSON(url, { "x-goog-api-key": cfg.apiKey }, body, req.signal);
    let text = "";
    for await (const data of sseData(res, req.signal)) {
      const chunk = JSON.parse(data) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
      };
      if (chunk.promptFeedback?.blockReason) throw new LLMError("refusal", chunk.promptFeedback.blockReason);
      const cand = chunk.candidates?.[0];
      for (const part of cand?.content?.parts ?? []) {
        if (part.text && !part.thought) {
          text += part.text;
          req.onText?.(text);
        }
      }
      if (cand?.finishReason === "SAFETY" || cand?.finishReason === "PROHIBITED_CONTENT") throw new LLMError("refusal", cand.finishReason);
    }
    return text;
  },
};

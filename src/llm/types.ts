export interface ImagePart {
  type: "image";
  mimeType: string;
  /** base64 without the data: prefix */
  data: string;
}

export type MessageContent = string | Array<{ type: "text"; text: string } | ImagePart>;

export interface LLMMessage {
  role: "user" | "assistant";
  content: MessageContent;
}

export interface LLMRequest {
  system: string;
  messages: LLMMessage[];
  maxTokens?: number;
  /** Ask the provider for a JSON object when it has a native switch for it. */
  json?: boolean;
  signal?: AbortSignal;
  onText?: (fullTextSoFar: string) => void;
}

export interface ProviderSettings {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface ProviderInfo {
  id: string;
  label: string;
  /** Short line shown on the provider card. Keyed by language. */
  blurb: { it: string; en: string };
  free: "free" | "freeTier" | "paid" | "local";
  needsKey: boolean;
  keyUrl?: string;
  defaultBaseUrl?: string;
  vision: boolean;
}

export interface Provider extends ProviderInfo {
  listModels(cfg: ProviderSettings): Promise<string[]>;
  pickDefaultModel(models: string[]): string;
  complete(cfg: ProviderSettings, req: LLMRequest): Promise<string>;
}

export type LLMErrorKind = "auth" | "rateLimit" | "quota" | "network" | "notFound" | "refusal" | "badRequest" | "server" | "aborted";

export class LLMError extends Error {
  constructor(
    public kind: LLMErrorKind,
    message: string,
    public retryAfterS?: number,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export function errorFromStatus(status: number, body: string, retryAfter?: string | null): LLMError {
  const short = body.slice(0, 400);
  // Gemini puts the wait in the body ("retryDelay": "37s") rather than a Retry-After header.
  const bodyDelay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body)?.[1];
  const retry = retryAfter ? Number.parseFloat(retryAfter) : bodyDelay ? Number.parseFloat(bodyDelay) : undefined;
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|invalid[_ ]api[_ ]key|incorrect api key/i.test(body)) return new LLMError("auth", short);
  if (status === 404) return new LLMError("notFound", short);
  if (status === 429) {
    // Check per-minute limits first: Gemini's per-minute message also mentions "quota" and "billing".
    if (/PerMinute|per minute|requests per min|tokens per min|\bRPM\b|\bTPM\b/i.test(body)) return new LLMError("rateLimit", short, retry);
    if (/PerDay|per day|daily|insufficient_quota|credit|balance|billing/i.test(body)) return new LLMError("quota", short);
    return new LLMError("rateLimit", short, retry);
  }
  if (status === 402) return new LLMError("quota", short);
  if (status >= 500) return new LLMError("server", short, retry);
  return new LLMError("badRequest", short);
}

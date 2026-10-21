import { LLMError, errorFromStatus } from "./types";

/** Yield the `data:` payload of each server-sent event in a fetch response. */
export async function* sseData(res: Response, signal?: AbortSignal): AsyncGenerator<string> {
  if (!res.body) throw new LLMError("network", "Empty response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) throw new LLMError("aborted", "Stopped");
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        // fetch aborts surface as a DOMException from read(); report them as a user stop, not a server error.
        if (signal?.aborted) throw new LLMError("aborted", "Stopped");
        throw new LLMError("network", String(err));
      }
      const { value, done } = chunk;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, "");
        const data = rawEvent
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (data) yield data;
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith("data:")) yield tail.slice(5).trim();
  } finally {
    reader.releaseLock();
  }
}

export async function postJSON(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal });
  } catch (err) {
    if (signal?.aborted) throw new LLMError("aborted", "Stopped");
    throw new LLMError("network", String(err));
  }
  if (!res.ok) throw errorFromStatus(res.status, await res.text().catch(() => ""), res.headers.get("retry-after"));
  return res;
}

export async function getJSON<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    throw new LLMError("network", String(err));
  }
  if (!res.ok) throw errorFromStatus(res.status, await res.text().catch(() => ""), res.headers.get("retry-after"));
  return (await res.json()) as T;
}

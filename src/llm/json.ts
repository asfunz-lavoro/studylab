/** Parse JSON from model output that may be wrapped in ```json fences or surrounded by prose. */
export function parseJSONLoose<T = unknown>(raw: string): T {
  const text = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [text, fenced?.[1] ?? ""];
  const firstObj = text.indexOf("{");
  const firstArr = text.indexOf("[");
  const start = [firstObj, firstArr].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (start !== undefined) {
    const close = text[start] === "{" ? "}" : "]";
    candidates.push(text.slice(start, text.lastIndexOf(close) + 1));
  }
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c) as T;
    } catch {
      try {
        // Trailing commas are the most common model JSON mistake.
        return JSON.parse(c.replace(/,\s*([}\]])/g, "$1")) as T;
      } catch {
        /* try next */
      }
    }
  }
  throw new SyntaxError("No JSON found in model output");
}

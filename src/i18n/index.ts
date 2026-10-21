import type { Lang } from "../db";
import { en } from "./en";
import { it, type Dict } from "./it";

export type Key = keyof Dict;
export type T = (key: Key, vars?: Record<string, string | number>) => string;

const DICTS: Record<Lang, Dict> = { it, en };

export function translator(lang: Lang): T {
  const dict = DICTS[lang] ?? it;
  return (key, vars) => {
    let s = dict[key] ?? it[key] ?? key;
    if (vars) {
      // {n|one|many} picks the singular form when vars.n === 1.
      s = s.replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (_, k: string, one: string, many: string) => (Number(vars[k]) === 1 ? one : many));
      for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    }
    return s;
  };
}

export function browserLang(): Lang {
  return (navigator.language || "it").toLowerCase().startsWith("it") ? "it" : "en";
}

export function formatInterval(ms: number, t: T): string {
  const min = ms / 60_000;
  if (min < 1) return t("time.now");
  if (min < 60) return t("time.min", { n: Math.round(min) });
  const h = min / 60;
  if (h < 24) return t("time.hour", { n: Math.round(h) });
  const d = h / 24;
  if (d < 45) return t("time.day", { n: Math.round(d) });
  return t("time.month", { n: Math.round(d / 30) });
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

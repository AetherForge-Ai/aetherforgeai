const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(year: number, month: number, day: number): string | null {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Trade dates from broker files.
 * `dmy` is for NZ and AU brokers (day first). ISO and YYYYMMDD are accepted either way.
 */
export function parseTradeDate(raw: string, order: "dmy" | "mdy" | "iso" = "dmy"): string | null {
  const text = raw.trim().replace(/^"+|"+$/g, "");
  if (!text) return null;
  const isoHit = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoHit) return iso(Number(isoHit[1]), Number(isoHit[2]), Number(isoHit[3]));
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (compact) return iso(Number(compact[1]), Number(compact[2]), Number(compact[3]));
  const named = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/.exec(text);
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    return iso(Number(named[3]), month, Number(named[1]));
  }
  const slash = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/.exec(text);
  if (!slash) return null;
  const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
  const a = Number(slash[1]);
  const b = Number(slash[2]);
  if (order === "mdy") return iso(year, a, b);
  return iso(year, b, a);
}

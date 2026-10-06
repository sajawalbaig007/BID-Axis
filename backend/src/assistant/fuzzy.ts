export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n]!;
}

export function normToken(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9@._+-]/g, "");
}

/** Drop leftover words like "sttaus" (status) so they are not treated as names. */
export function isNearFiller(token: string, stop: Set<string>): boolean {
  const k = normToken(token);
  if (!k) return true;
  if (stop.has(k)) return true;
  if (k.length < 4) return false;
  for (const s of stop) {
    if (s.length < 4) continue;
    if (Math.abs(s.length - k.length) > 2) continue;
    const max = k.length <= 5 ? 1 : 2;
    if (levenshtein(k, s) <= max) return true;
  }
  return false;
}

const COMPANY_NAME_TOKENS = new Set([
  "ps", "bds", "bem", "gps", "bim", "pacific", "sunshine", "estimating", "studio", "design",
  "construction", "llc", "inc", "ltd", "company", "co",
]);

/** First/last name tokens only — drop “ps”, “k”, company words. */
export function extractPersonName(search: string): string {
  const parts = search
    .trim()
    .split(/\s+/)
    .filter(p => {
      const k = p.toLowerCase().replace(/[^a-z]/g, "");
      if (!k || COMPANY_NAME_TOKENS.has(k)) return false;
      return /^[a-z][a-z.'-]{2,}$/i.test(p);
    });
  return parts.slice(0, 3).join(" ");
}

export function looksLikePersonName(search: string): boolean {
  return extractPersonName(search).length >= 3;
}

function collapseRepeats(s: string) {
  return s.replace(/(.)\1+/g, "$1");
}

/** 0 = no match. Higher is closer (GPT-style spelling). */
export function nameScore(query: string, fullName: string): number {
  const q = query.trim().toLowerCase();
  const name = fullName.trim().toLowerCase();
  if (!q || q.length < 2 || !name) return 0;
  if (name === q) return 100;
  if (name.startsWith(q) || q.startsWith(name)) return 92;
  if (name.includes(q)) return 88;

  let best = 0;
  const parts = name.split(/[\s,./_-]+/).filter(p => p.length >= 2);
  const qParts = q.split(/\s+/).filter(Boolean);
  for (const qp of qParts.length ? qParts : [q]) {
    for (const p of parts) {
      if (p === qp) best = Math.max(best, 96);
      else if (p.startsWith(qp) || qp.startsWith(p)) best = Math.max(best, 86);
      else if (collapseRepeats(p) === collapseRepeats(qp)) best = Math.max(best, 84);
      else {
        const max = qp.length <= 4 ? 1 : 2;
        if (Math.abs(p.length - qp.length) <= 2) {
          const d = levenshtein(p, qp);
          if (d <= max) best = Math.max(best, 80 - d * 8);
        }
      }
    }
  }
  return best;
}

export function fuzzyNameHit(query: string, fullName: string): boolean {
  return nameScore(query, fullName) >= 72;
}

export function bestNameMatch<T>(query: string, items: T[], getName: (item: T) => string): T | null {
  let best: T | null = null;
  let score = 0;
  for (const item of items) {
    const s = nameScore(query, getName(item));
    if (s > score) {
      score = s;
      best = item;
    }
  }
  return score >= 72 ? best : null;
}

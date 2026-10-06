/** Match short accounts names to later Admin/HR full names (Ahmer → Ahmer Shah). */

export function pfNameTokens(label: string): string[] {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);
}

export function pfNormName(label: string): string {
  return pfNameTokens(label).join(" ");
}

/**
 * Same person when one name is a token-prefix of the other
 * ("ahmer" vs "ahmer shah") or a 2+ token subsequence ("faizan zafar" vs "syed faizan zafar").
 * Single-token middle names ("ali" vs "hafiz ali aman") are not treated as a match.
 */
export function pfNamesAreSamePerson(a: string, b: string): boolean {
  const ta = pfNameTokens(a);
  const tb = pfNameTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join(" ") === tb.join(" ")) return true;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.every((tok, i) => long[i] === tok)) return true;
  if (short.length >= 2) {
    let j = 0;
    for (const tok of long) {
      if (tok === short[j]) j += 1;
      if (j === short.length) return true;
    }
  }
  return false;
}

/** 1-token alias only merges when exactly one longer name in the set starts with that token. */
export function pfAliasMergeAllowed(a: string, b: string, pool: string[]): boolean {
  if (!pfNamesAreSamePerson(a, b)) return false;
  const ta = pfNameTokens(a);
  const tb = pfNameTokens(b);
  const short = ta.length <= tb.length ? ta : tb;
  if (short.length !== 1) return true;
  const token = short[0]!;
  const longerStarts = pool.filter(n => {
    const t = pfNameTokens(n);
    return t.length > 1 && t[0] === token;
  });
  const unique = [...new Set(longerStarts.map(n => pfNormName(n)))];
  return unique.length <= 1;
}

/** True when `name` is a shorter alias of a longer label already in `labels`. */
export function pfHasLongerCanonical(name: string, labels: string[]): boolean {
  const self = pfNormName(name);
  return labels.some(other => {
    if (pfNormName(other) === self) return false;
    if (pfNameTokens(other).length <= pfNameTokens(name).length) return false;
    return pfAliasMergeAllowed(name, other, labels);
  });
}

export type PfNameMerge = { from: string; to: string };

export function pfCanonicalKey(label: string, merges: PfNameMerge[] = []): string {
  const map = new Map(merges.map(m => [pfNormName(m.from), pfNormName(m.to)]));
  let k = pfNormName(label);
  const seen = new Set<string>();
  while (k && map.has(k) && !seen.has(k)) {
    seen.add(k);
    k = map.get(k) || k;
  }
  return k;
}

export function findPfNameMatchIndex(
  target: string,
  labels: string[],
  merges: PfNameMerge[] = [],
): number {
  const want = pfCanonicalKey(target, merges);
  if (!want) return -1;
  const exact = labels.findIndex(l => pfCanonicalKey(l, merges) === want);
  if (exact >= 0) return exact;
  const hits: number[] = [];
  labels.forEach((l, i) => {
    if (pfAliasMergeAllowed(target, l, labels.concat(target))) hits.push(i);
  });
  if (hits.length === 1) return hits[0]!;
  if (hits.length > 1) {
    return hits.sort((i, j) => pfNameTokens(labels[j]!).length - pfNameTokens(labels[i]!).length)[0]!;
  }
  return -1;
}

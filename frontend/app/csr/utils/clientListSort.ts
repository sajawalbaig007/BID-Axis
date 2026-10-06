export type SortDir = "asc" | "desc";
export type ClientListSortBy = "oldestNote" | "clientCode" | "name";

/** Prefer last number group so CSR1-1001 / 1001 both sort as 1001. */
export function clientCodeNumericKey(code: string | null | undefined): number {
  if (!code?.trim()) return Number.POSITIVE_INFINITY;
  const m = code.match(/(\d+)(?!.*\d)/);
  if (!m) return Number.POSITIVE_INFINITY;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

export function compareByClientCode(
  a: string | null | undefined,
  b: string | null | undefined,
  dir: SortDir,
): number {
  const na = clientCodeNumericKey(a);
  const nb = clientCodeNumericKey(b);
  if (na !== nb) return dir === "asc" ? na - nb : nb - na;
  const sa = (a ?? "").toLowerCase();
  const sb = (b ?? "").toLowerCase();
  const cmp = sa.localeCompare(sb);
  return dir === "asc" ? cmp : -cmp;
}

export function compareByName(a: string, b: string, dir: SortDir): number {
  const cmp = (a || "").localeCompare(b || "", undefined, { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

export function sortClientRows<T extends {
  name?: string;
  client?: string;
  clientCode?: string | null;
  projectCode?: string | null;
}>(
  rows: T[],
  sortBy: ClientListSortBy,
  sortDir: SortDir,
): T[] {
  const codeOf = (r: T) => r.clientCode || r.projectCode || null;
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sortBy === "oldestNote") return 0;
    if (sortBy === "clientCode") {
      const codeCmp = compareByClientCode(codeOf(a), codeOf(b), sortDir);
      if (codeCmp !== 0) return codeCmp;
      const nameA = a.name ?? a.client ?? "";
      const nameB = b.name ?? b.client ?? "";
      return compareByName(nameA, nameB, "asc");
    }
    const nameA = a.name ?? a.client ?? "";
    const nameB = b.name ?? b.client ?? "";
    const nameCmp = compareByName(nameA, nameB, sortDir);
    if (nameCmp !== 0) return nameCmp;
    return compareByClientCode(codeOf(a), codeOf(b), "asc");
  });
  return copy;
}

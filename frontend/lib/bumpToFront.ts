/** Move matching item to index 0 (optionally patched). No-op if missing. */
export function bumpToFront<T extends { id: string }>(
  list: T[],
  id: string,
  patch?: (item: T) => T,
): T[] {
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return list;
  const next = patch ? patch(list[idx]!) : list[idx]!;
  if (idx === 0) return [next, ...list.slice(1)];
  return [next, ...list.slice(0, idx), ...list.slice(idx + 1)];
}

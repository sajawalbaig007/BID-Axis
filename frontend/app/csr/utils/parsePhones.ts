/** Split a phone field into multiple numbers (slash, comma, or repeated patterns). */
export function parsePhones(raw: string | null | undefined): string[] {
  if (!raw || raw === "N/A") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const slashParts = trimmed
    .split(/\s*[\/|,;]\s*/)
    .map((p) => p.trim())
    .filter((p) => p.replace(/\D/g, "").length >= 7);
  if (slashParts.length > 1) return dedupePhones(slashParts);

  const matches = trimmed.match(/[\+\d][\d\s.()\-]{5,}\d/g);
  if (!matches || matches.length <= 1) {
    return trimmed.replace(/\D/g, "").length >= 7 ? [trimmed] : trimmed ? [trimmed] : [];
  }
  return dedupePhones(
    matches.map((p) => p.trim()).filter((p) => p.replace(/\D/g, "").length >= 7),
  );
}

function dedupePhones(parts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.replace(/\D/g, "") || p;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** Primary phone + sub-contact phones, deduped. */
export function collectLeadPhones(
  primaryPhone: string | null | undefined,
  subContacts?: Array<{ phone?: string | null }> | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    for (const p of parsePhones(raw)) {
      const key = p.replace(/\D/g, "") || p;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  };
  add(primaryPhone);
  for (const c of subContacts ?? []) add(c.phone);
  return out;
}

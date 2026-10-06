/** Split a raw email field that may contain multiple addresses. */
export function parseEmails(raw: string | null | undefined): string[] {
  if (!raw || raw === "N/A") return [];
  const matches = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  if (!matches || matches.length === 0) {
    const t = raw.trim();
    return t ? [t] : [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const key = m.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/** Primary email + sub-contact emails, deduped. */
export function collectLeadEmails(
  primaryEmail: string | null | undefined,
  subContacts?: Array<{ email?: string | null }> | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    for (const e of parseEmails(raw)) {
      const key = e.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
  };
  add(primaryEmail);
  for (const c of subContacts ?? []) add(c.email);
  return out;
}

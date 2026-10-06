/** One row per phone (7+ digits). Empty/short phones stay unique by id. */
export function uniqueLeadsByPhone<T extends { id: string; phone?: string | null }>(leads: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const lead of leads) {
    const digits = (lead.phone ?? "").replace(/\D/g, "");
    const key = digits.length >= 7 ? digits : lead.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lead);
  }
  return out;
}

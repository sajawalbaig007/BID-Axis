import { serviceOptions } from "../constants/services";

/** Split a stored interested-service field into individual entries (e.g. "IT-Networking, BIM"). */
export function parseInterestedServices(raw: string | null | undefined): string[] {
  if (!raw || raw === "N/A") return [];

  const parts = raw
    .split(/\s*(?:\/|,|;|\||\n|·|•|\band\b)\s*/i)
    .map(p => p.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];

  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }

  return out;
}

const KNOWN_SERVICES = [...serviceOptions.map(s => s.value)].sort((a, b) => b.length - a.length);

/** Prefill InterestedModal from a stored "Estimating-HVAC, IT-Networking" string. */
export function decomposeInterestedServices(raw: string | null | undefined): {
  services: string[];
  subtypes: Record<string, string>;
} {
  const entries = parseInterestedServices(raw);
  const services: string[] = [];
  const subtypes: Record<string, string> = {};

  for (const entry of entries) {
    const exact = KNOWN_SERVICES.find(k => k.toLowerCase() === entry.toLowerCase());
    if (exact) {
      if (!services.includes(exact)) services.push(exact);
      continue;
    }

    const base = KNOWN_SERVICES.find(k => {
      const lower = entry.toLowerCase();
      const kl = k.toLowerCase();
      return lower.startsWith(`${kl}-`) || lower.startsWith(`${kl} `) || lower.startsWith(`${kl}–`);
    });
    if (base) {
      if (!services.includes(base)) services.push(base);
      const rest = entry.slice(base.length).replace(/^[\s\-–—]+/, "").trim();
      if (rest) subtypes[base] = rest;
    }
  }

  return { services, subtypes };
}

export function formatInterestedServices(
  services: string[],
  subtypes: Record<string, string> = {},
): string {
  return services
    .map(s => {
      const sub = (subtypes[s] ?? "").trim();
      return sub ? `${s}-${sub}` : s;
    })
    .join(", ");
}

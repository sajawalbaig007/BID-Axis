import prisma from "../config/db";

/** CSI MasterFormat trades — names only, no division numbers. */
export const MASTER_FORMAT_TRADES = [
  "GC Commercial",
  "GC Residential",
  "Existing Conditions",
  "Concrete",
  "Masonry",
  "Metals",
  "Wood, Plastics, And Composites",
  "Thermal And Moisture Protection",
  "Openings",
  "Finishes",
  "Specialties",
  "Equipment",
  "Furnishings",
  "Special Construction",
  "Conveying Equipment",
  "Fire Suppression",
  "Plumbing",
  "Heating, Ventilating, And Air Conditioning (HVAC)",
  "Integrated Automation",
  "Electrical",
  "Communications",
  "Electronic Safety And Security",
  "Earthwork",
  "Exterior Improvements",
  "Utilities",
  "Transportation",
  "Waterway And Marine Construction",
  "Process Integration",
  "Material Processing And Handling Equipment",
  "Process Heating, Cooling, And Drying Equipment",
  "Process Gas And Liquid Handling, Purification, And Storage Equipment",
  "Pollution And Waste Control Equipment",
  "Industry-Specific Manufacturing Equipment",
  "Water And Wastewater Equipment",
  "Electrical Power Generation",
] as const;

const LEGACY_NUMBERED_TRADES = [
  "00 GENERAL PROJECT REQUIREMENTS",
  "01 General Requirements",
  "02 Existing Conditions",
  "03 Concrete",
  "04 Masonry",
  "05 Metals",
  "06 Wood, Plastics, And Composites",
  "07 Thermal And Moisture Protection",
  "08 Openings",
  "09 Finishes",
  "10 Specialties",
  "11 Equipment",
  "12 Furnishings",
  "13 Special Construction",
  "14 Conveying Equipment",
  "21 Fire Suppression",
  "22 Plumbing",
  "23 Heating, Ventilating, And Air Conditioning (HVAC)",
  "25 Integrated Automation",
  "26 Electrical",
  "27 Communications",
  "28 Electronic Safety And Security",
  "31 Earthwork",
  "32 Exterior Improvements",
  "33 Utilities",
  "34 Transportation",
  "35 Waterway And Marine Construction",
  "40 Process Integration",
  "41 Material Processing And Handling Equipment",
  "42 Process Heating, Cooling, And Drying Equipment",
  "43 Process Gas And Liquid Handling, Purification, And Storage Equipment",
  "44 Pollution And Waste Control Equipment",
  "45 Industry-Specific Manufacturing Equipment",
  "46 Water And Wastewater Equipment",
  "48 Electrical Power Generation",
] as const;

const TRADE_NAME_ALIASES: Record<string, string> = {
  "00 general project requirements": "GC Commercial",
  "general project requirements": "GC Commercial",
  "gc comercial": "GC Commercial",
  "gc commercial": "GC Commercial",
  "01 general requirements": "GC Residential",
  "general requirements": "GC Residential",
  "hvac": "Heating, Ventilating, And Air Conditioning (HVAC)",
};

function stripDivisionPrefix(raw: string): string {
  return raw.replace(/^\d{1,2}\s+/, "").trim();
}

export function canonicalTradeName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const stripped = stripDivisionPrefix(trimmed);
  for (const key of [trimmed.toLowerCase(), stripped.toLowerCase()]) {
    if (TRADE_NAME_ALIASES[key]) return TRADE_NAME_ALIASES[key];
  }
  const known = MASTER_FORMAT_TRADES.find(t => {
    const tk = t.toLowerCase();
    return tk === trimmed.toLowerCase() || tk === stripped.toLowerCase();
  });
  if (known) return known;
  return stripped;
}

const TRADE_MATCH_NAMES = [
  ...MASTER_FORMAT_TRADES,
  ...LEGACY_NUMBERED_TRADES,
  "HVAC",
];

export type ParsedSubContact = {
  name: string;
  designation?: string;
  phone?: string;
  email?: string;
};

/** Split Excel / stored trade strings; known MasterFormat names keep internal commas. */
export function parseTradeList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const text = raw.trim();
  const found: string[] = [];
  let rest = text;
  const known = [...TRADE_MATCH_NAMES].sort((a, b) => b.length - a.length);
  for (const name of known) {
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (re.test(rest)) {
      found.push(canonicalTradeName(name));
      rest = rest.replace(re, " ");
    }
  }
  const extras = rest
    .split(/\s*(?:;|\||\n|·|•)\s*|(?:\s*,\s*)/)
    .map(p => canonicalTradeName(p))
    .filter(p => p.length > 1);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of [...found, ...extras]) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

export function parseSubTradeList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/\s*(?:,|;|\||\n|·|•)\s*/)) {
    const p = canonicalTradeName(part);
    if (!p) continue;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export function parseTradeNotes(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(v => String(v).trim()).filter(Boolean);
    }
  } catch {
    /* plain text fallback */
  }
  return raw
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Excel subcontacts: comma-separated contacts.
 * Each contact may be `Name | designation | phone | email`.
 */
export function parseSubContactsCell(raw: string | null | undefined): ParsedSubContact[] {
  if (!raw?.trim()) return [];
  const chunks = raw
    .split(/\s*;\s*|\s*\n\s*/)
    .flatMap(block => {
      if (block.includes("|")) {
        return block.split(/\s*,\s*(?=[^|]*\|)/).length > 1
          ? block.split(/\s*,\s*(?=[^|]*\|)/)
          : block.split(/\s*,\s*/).filter(p => p.includes("|") || p.trim());
      }
      return [block];
    });

  const contacts: ParsedSubContact[] = [];
  for (const chunk of chunks.length ? chunks : [raw]) {
    const piece = chunk.trim();
    if (!piece) continue;
    if (piece.includes("|")) {
      const [name, designation, phone, email] = piece.split("|").map(s => s.trim());
      if (!name) continue;
      contacts.push({
        name,
        designation: designation || undefined,
        phone: phone || undefined,
        email: email || undefined,
      });
      continue;
    }
    const parts = piece.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
    if (parts.length === 1) {
      contacts.push({ name: parts[0]! });
      continue;
    }
    /* Name, Jane Smith, Bob — treat each comma piece as a name */
    for (const name of parts) {
      if (name.includes("@") && contacts.length > 0) {
        contacts[contacts.length - 1]!.email = name;
      } else if (/[\d+][\d\s\-()]{5,}/.test(name) && contacts.length > 0) {
        contacts[contacts.length - 1]!.phone = name;
      } else {
        contacts.push({ name });
      }
    }
  }
  return contacts.filter(c => c.name);
}

async function canonicalizeStoredTradeNames(): Promise<void> {
  const existing = await prisma.trade.findMany({ select: { id: true, name: true } });
  const haveCanon = new Set(
    existing.map(t => t.name).filter(n => canonicalTradeName(n) === n).map(n => n.toLowerCase()),
  );
  for (const row of existing) {
    const canon = canonicalTradeName(row.name);
    if (!canon || canon === row.name) continue;
    if (haveCanon.has(canon.toLowerCase())) {
      await prisma.trade.delete({ where: { id: row.id } }).catch(() => null);
      continue;
    }
    try {
      await prisma.trade.update({ where: { id: row.id }, data: { name: canon } });
      haveCanon.add(canon.toLowerCase());
    } catch {
      await prisma.trade.delete({ where: { id: row.id } }).catch(() => null);
    }
  }
}

export async function ensureMasterFormatTrades(): Promise<void> {
  await canonicalizeStoredTradeNames();
  await insertMissingTrades([...MASTER_FORMAT_TRADES]);
}

export async function insertMissingTrades(names: string[]): Promise<void> {
  const unique = [...new Set(names.map(n => canonicalTradeName(n)).filter(Boolean))];
  if (unique.length === 0) return;
  const existing = await prisma.trade.findMany({ select: { name: true } });
  const have = new Set(existing.map(t => canonicalTradeName(t.name).toLowerCase()));
  for (const canon of unique) {
    if (have.has(canon.toLowerCase())) continue;
    await prisma.trade.create({ data: { name: canon } }).catch(() => null);
    have.add(canon.toLowerCase());
  }
}

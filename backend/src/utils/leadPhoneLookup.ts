import prisma from "../config/db";
import { normalizePhone, phonesMatch } from "./phone";
import { parseProjectPayments, paidTotalFromEntries } from "./projectPayments";

const LEAD_PHONE_SELECT = {
  id: true,
  phone: true,
  email: true,
  website: true,
  status: true,
  inBin: true,
  assignedTo: true,
  interested: true,
  interestedService: true,
  updatedAt: true,
} as const;

export type LeadPhoneMatch = {
  id: string;
  phone: string | null;
  email: string | null;
  website?: string | null;
  status: string;
  inBin: boolean;
  assignedTo: string;
  interested?: boolean | null;
  interestedService?: string | null;
  updatedAt?: Date;
};

function phoneLookupKey(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length < 7) return "";
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Bulk phone match for large uploads — avoids N+1 findLeadsByPhone scans.
 * Returns Map keyed by each input phone string → matching leads (exact + fuzzy format).
 * fuzzy=false skips expensive `contains` scans (use for 1k+ row uploads).
 */
export async function findLeadsByPhonesBulk(
  phones: string[],
  chunkSize = 500,
  opts?: { fuzzy?: boolean },
): Promise<Map<string, LeadPhoneMatch[]>> {
  const fuzzy = opts?.fuzzy !== false;
  const result = new Map<string, LeadPhoneMatch[]>();
  const unique = [...new Set(phones.map(p => p.trim()).filter(p => p.length >= 7))];
  if (unique.length === 0) return result;

  const byKey = new Map<string, LeadPhoneMatch[]>();

  const addLead = (l: LeadPhoneMatch) => {
    if (!l.phone) return;
    const key = phoneLookupKey(l.phone);
    if (!key) return;
    const list = byKey.get(key) ?? [];
    if (!list.some(x => x.id === l.id)) list.push(l);
    byKey.set(key, list);
  };

  /* Expand each phone into common format variants so exact `in` catches more without fuzzy */
  const large = unique.length > 20_000;
  const compact = unique.length > 10_000;
  const queryChunk = large ? Math.max(chunkSize, 8_000) : chunkSize;
  const parallel = large ? 5 : 1;

  const queryValues = new Set<string>();
  for (const p of unique) {
    for (const v of phoneQueryVariants(p, compact)) queryValues.add(v);
  }
  const queryList = [...queryValues];
  const chunks: string[][] = [];
  for (let i = 0; i < queryList.length; i += queryChunk) {
    chunks.push(queryList.slice(i, i + queryChunk));
  }

  let cursor = 0;
  const worker = async () => {
    while (cursor < chunks.length) {
      const chunk = chunks[cursor++];
      if (!chunk) break;
      const exact = await prisma.lead.findMany({
        where:  { phone: { in: chunk } },
        select: LEAD_PHONE_SELECT,
        /* Sort in memory below — orderBy on a huge $in skips the phone index. */
        ...(large ? {} : { orderBy: { updatedAt: "desc" as const } }),
      });
      for (const l of exact) addLead(l);
    }
  };
  const workers = Math.max(1, Math.min(parallel, chunks.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));

  /* Fuzzy contains is O(n) on Mongo — only for smaller sheets */
  const useFuzzy = fuzzy && unique.length <= 800;
  if (useFuzzy) {
    const needFuzzy = unique.filter(p => {
      const key = phoneLookupKey(p);
      if (!key) return false;
      const candidates = byKey.get(key) ?? [];
      return !candidates.some(c => c.phone && phonesMatch(c.phone, p));
    });

    if (needFuzzy.length > 0) {
      const suffixes = [...new Set(needFuzzy.map(phoneLookupKey).filter(Boolean))];
      const FUZZY_OR = 40;
      for (let i = 0; i < suffixes.length; i += FUZZY_OR) {
        const chunk = suffixes.slice(i, i + FUZZY_OR);
        const candidates = await prisma.lead.findMany({
          where: {
            phone: { not: null },
            OR: chunk.map(s => ({ phone: { contains: s } })),
          },
          select:  LEAD_PHONE_SELECT,
          orderBy: { updatedAt: "desc" },
        });
        for (const l of candidates) addLead(l);
      }
    }
  }

  for (const phone of unique) {
    const key = phoneLookupKey(phone);
    const candidates = key ? (byKey.get(key) ?? []) : [];
    const matches = candidates
      .filter(c => c.phone && phonesMatch(c.phone, phone))
      .sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
      });
    result.set(phone, matches);
  }

  return result;
}

function phoneQueryVariants(phone: string, compact = false): string[] {
  const trimmed = phone.trim();
  const digits = normalizePhone(trimmed);
  const out = new Set<string>([trimmed]);
  if (!digits || digits.length < 7) return [...out];

  out.add(digits);
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  out.add(last10);
  if (last10.length === 10) {
    out.add(`+1${last10}`);
    out.add(`1${last10}`);
    if (!compact) {
      out.add(`(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`);
      out.add(`${last10.slice(0, 3)}-${last10.slice(3, 6)}-${last10.slice(6)}`);
      out.add(`${last10.slice(0, 3)}.${last10.slice(3, 6)}.${last10.slice(6)}`);
    }
  }
  return [...out];
}

export async function findLeadsByPhone(phone: string) {
  const trimmed = phone.trim();
  if (!trimmed) return [];

  const exact = await prisma.lead.findMany({
    where:   { phone: trimmed },
    orderBy: { updatedAt: "desc" },
  });
  if (exact.length > 0) return exact;

  const digits = normalizePhone(trimmed);
  if (digits.length < 7) return [];

  const suffix = digits.slice(-10);
  const candidates = await prisma.lead.findMany({
    where:   { phone: { not: null, contains: suffix } },
    orderBy: { updatedAt: "desc" },
  });
  return candidates.filter(l => l.phone && phonesMatch(l.phone, trimmed));
}

function paidTotal(lead: {
  paidAmount?: string | null;
  projectPayments?: string | null;
  projectBudget?: string | null;
}) {
  if (lead.projectPayments) {
    try {
      const fromPayments = paidTotalFromEntries(parseProjectPayments(lead.projectPayments));
      if (fromPayments > 0) return fromPayments;
    } catch { /* fall through */ }
  }
  const paid = parseFloat(String(lead.paidAmount ?? "").replace(/[^0-9.-]/g, ""));
  if (Number.isFinite(paid) && paid > 0) return paid;
  const budget = parseFloat(String(lead.projectBudget ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(budget) ? budget : 0;
}

function firstFilled(
  rows: Awaited<ReturnType<typeof findLeadsByPhone>>,
  pick: (row: Awaited<ReturnType<typeof findLeadsByPhone>>[number]) => string | null | undefined,
) {
  for (const row of rows) {
    const value = String(pick(row) ?? "").trim();
    if (value) return value;
  }
  return "";
}

function isWonStatus(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  return s === "close client" || s === "completed" || s === "closed";
}

export function buildPhoneLookupResponse(matches: Awaited<ReturnType<typeof findLeadsByPhone>>) {
  if (matches.length === 0) {
    return { success: true, found: false };
  }

  const latest = matches[0];
  const wonProject = matches.find(l => isWonStatus(l.status));

  const services = [...new Set(
    matches
      .map(l => l.interestedService?.trim())
      .filter((s): s is string => !!s),
  )];

  const projects = matches
    .filter(l => isWonStatus(l.status) || l.projectTitle || l.clientCode)
    .map(l => ({
      id: l.id,
      title: l.projectTitle || l.company || l.name || "Project",
      clientCode: l.clientCode,
      service: l.interestedService,
      status: l.status,
      paidAmount: paidTotal(l),
      deadline: l.projectDeadline,
      closedAt: l.updatedAt ?? l.createdAt,
      /* Full fields so CSR can open Edit form without a second fetch */
      name: l.name,
      company: l.company,
      phone: l.phone,
      email: l.email,
      ownerName: l.ownerName,
      state: l.state,
      projectCode: l.projectCode,
      projectTitle: l.projectTitle,
      projectScope: l.projectScope,
      interestedService: l.interestedService,
      projectBudget: l.projectBudget,
      projectDeadline: l.projectDeadline,
      projectPhase: l.projectPhase,
      takeoffDeadline: l.takeoffDeadline,
      pricingDeadline: l.pricingDeadline,
      qaDeadline: l.qaDeadline,
      projectPayments: l.projectPayments,
      projectNotes: l.projectNotes,
      assignedTo: l.assignedTo,
    }))
    .sort((a, b) => {
      const ta = a.closedAt ? new Date(a.closedAt).getTime() : 0;
      const tb = b.closedAt ? new Date(b.closedAt).getTime() : 0;
      return tb - ta;
    });

  const totalBusiness = projects.reduce((sum, p) => sum + p.paidAmount, 0);

  return {
    success:           true,
    found:             true,
    isReturningClient: matches.length >= 1,
    projectCount:      matches.length,
    totalBusiness,
    services,
    projects,
    history: matches.map(l => ({
      id: l.id,
      name: l.name,
      company: l.company,
      status: l.status,
      service: l.interestedService,
      clientCode: l.clientCode,
      paidAmount: paidTotal(l),
      updatedAt: l.updatedAt,
    })),
    client: {
      name:              firstFilled(matches, (l) => l.name),
      company:           firstFilled(matches, (l) => l.company),
      email:             firstFilled(matches, (l) => l.email),
      ownerName:         firstFilled(matches, (l) => l.ownerName),
      state:             firstFilled(matches, (l) => l.state),
      interestedService: (wonProject?.interestedService ?? "").trim()
        || firstFilled(matches, (l) => l.interestedService),
    },
  };
}

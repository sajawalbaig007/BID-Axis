import type { Prisma } from "@prisma/client";
import { wonClientStatusWhere } from "./projectLeads";
import { notInBinFilter } from "./binLeads";
import { parseProjectCodeSeq } from "./nextProjectCode";

export type AdminClientView = "all" | "important" | "schedule" | "interested" | "closed";

/**
 * Status is the source of truth for page routing.
 * Do not OR with boolean flags alone — stale important/interested flags
 * were putting leads on the wrong CSR pages after status changes.
 */
/** Index-friendly equality — `mode: "insensitive"` cannot use Mongo status indexes. */
function statusIn(values: string[]): Prisma.LeadWhereInput {
  const variants = new Set<string>();
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    variants.add(t);
    variants.add(t.toLowerCase());
    variants.add(t.toUpperCase());
    const titled = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    variants.add(titled);
  }
  return { status: { in: [...variants] } };
}

export function isImportantStatusWhere(): Prisma.LeadWhereInput {
  return statusIn(["important"]);
}

export function isInterestedStatusWhere(): Prisma.LeadWhereInput {
  return statusIn(["interested"]);
}

export function isPendingStatusWhere(): Prisma.LeadWhereInput {
  return statusIn(["pending"]);
}



export function leadHasMeetingDate(nextSchedule?: string | null): boolean {
  return !!(nextSchedule && String(nextSchedule).trim());
}

function noScheduleWhere(): Prisma.LeadWhereInput {
  return {
    OR: [
      { nextSchedule: { isSet: false } },
      { nextSchedule: null },
      { nextSchedule: "" },
    ],
  };
}

function hasScheduleWhere(): Prisma.LeadWhereInput {
  return {
    AND: [
      { nextSchedule: { isSet: true } },
      { NOT: { nextSchedule: "" } },
    ],
  };
}



/** Important flag only — no scheduled meeting date (matches CSR isImportantOnly) */

export function importantOnlyWhere(): Prisma.LeadWhereInput {

  return {

    AND: [isImportantStatusWhere(), noScheduleWhere()],

  };

}



/** Important + meeting scheduled (matches CSR isScheduledCall) */

export function scheduledCallWhere(): Prisma.LeadWhereInput {

  return {

    AND: [isImportantStatusWhere(), hasScheduleWhere()],

  };

}



/** Won / closed clients not in bin — includes admin-created closed records. */
export function closedClientStatusWhere(): Prisma.LeadWhereInput {
  return {
    AND: [
      wonClientStatusWhere(),
      notInBinFilter(),
    ],
  };
}

/** Admin/manager manual adds left on pending — must still appear on All / search. */
export function adminAssignedPendingWhere(): Prisma.LeadWhereInput {
  return {
    AND: [
      statusIn(["pending", "active"]),
      notInBinFilter(),
      { csr: { is: { role: { in: ["admin", "manager", "technical_manager"] } } } },
    ],
  };
}

/** Important + Schedule + Interested + Closed + admin-added pending (Admin Leads "All" pill). */
export function allAdminClientViewsWhere(): Prisma.LeadWhereInput {
  return {
    OR: [
      importantOnlyWhere(),
      scheduledCallWhere(),
      isInterestedStatusWhere(),
      closedClientStatusWhere(),
      adminAssignedPendingWhere(),
    ],
  };
}

export type AdminClientBucket = Exclude<AdminClientView, "all">;

export function adminClientBucket(
  status?: string | null,
  nextSchedule?: string | null,
): AdminClientBucket | null {
  const s = (status ?? "").toLowerCase();
  const hasSchedule = leadHasMeetingDate(nextSchedule);
  if (s === "important") return hasSchedule ? "schedule" : "important";
  if (s === "interested") return "interested";
  if (s === "close client" || s === "completed" || s === "closed") return "closed";
  return null;
}

export type AdminIdentityLead = {
  id: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  clientCode?: string | null;
  projectCode?: string | null;
  interestedService?: string | null;
  updatedAt?: Date | string;
  notes?: { createdAt?: Date | string }[];
};

export type ExtraProjectCode = {
  code: string;
  scope: string;
};

function leadCodeRaw(lead: AdminIdentityLead): string {
  return (lead.clientCode || lead.projectCode || "").trim();
}

function leadSeq(lead: AdminIdentityLead): number {
  return parseProjectCodeSeq(leadCodeRaw(lead))?.seq ?? 0;
}

function pickLatestRepresentative<T extends AdminIdentityLead>(group: T[]): T {
  return [...group].sort((a, b) => {
    const seqDiff = leadSeq(b) - leadSeq(a);
    if (seqDiff !== 0) return seqDiff;
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  })[0]!;
}

/** `CODE-01` / `code-02` → family key from the part before `-`. */
export function clientCodeFamilyKey(
  clientCode?: string | null,
  projectCode?: string | null,
): string | null {
  const raw = (clientCode ?? "").trim() || (projectCode ?? "").trim();
  if (!raw) return null;
  const parsed = parseProjectCodeSeq(raw);
  const base = (parsed?.base ?? raw).trim();
  return base ? `code:${base.toLowerCase()}` : null;
}

export function adminLeadIdentityKey(lead: AdminIdentityLead, preferClientCode: boolean): string {
  if (preferClientCode) {
    const codeKey = clientCodeFamilyKey(lead.clientCode, lead.projectCode);
    if (codeKey) return codeKey;
  }
  const digits = (lead.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 7) return `phone:${digits}`;
  const email = (lead.email ?? "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const co = (lead.company ?? "").trim().toLowerCase();
  if (co) return `company:${co}`;
  return `id:${lead.id}`;
}

export function dedupeAdminLeads<T extends AdminIdentityLead>(
  leads: T[],
  preferClientCode = false,
): {
  unique: T[];
  extraProjectCountById: Map<string, number>;
  extraProjectsById: Map<string, ExtraProjectCode[]>;
} {
  const groups = new Map<string, T[]>();
  for (const lead of leads) {
    const key = adminLeadIdentityKey(lead, preferClientCode);
    const group = groups.get(key);
    if (group) group.push(lead);
    else groups.set(key, [lead]);
  }
  const unique: T[] = [];
  const extraProjectCountById = new Map<string, number>();
  const extraProjectsById = new Map<string, ExtraProjectCode[]>();
  for (const group of groups.values()) {
    const representative = pickLatestRepresentative(group);
    unique.push(representative);
    const seen = new Set<string>();
    const extras: ExtraProjectCode[] = [];
    const repRaw = leadCodeRaw(representative).toLowerCase();
    for (const lead of group) {
      if (lead.id === representative.id) continue;
      const raw = leadCodeRaw(lead);
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (seen.has(key) || key === repRaw) continue;
      seen.add(key);
      extras.push({
        code: raw,
        scope: (lead.interestedService ?? "").trim(),
      });
    }
    extras.sort((a, b) => {
      const sa = parseProjectCodeSeq(a.code)?.seq ?? 0;
      const sb = parseProjectCodeSeq(b.code)?.seq ?? 0;
      return sb - sa;
    });
    extraProjectsById.set(representative.id, extras);
    extraProjectCountById.set(representative.id, extras.length);
  }
  return { unique, extraProjectCountById, extraProjectsById };
}

/** Same uniqueness as CSR Clients: one row per phone, else company, else id. */
export function uniqueLeadsByClientIdentity<T extends AdminIdentityLead>(leads: T[]): T[] {
  return dedupeAdminLeads(leads, false).unique;
}

/** Closed / old clients: one row per client-code prefix (`CODE` in `CODE-01`). */
export function uniqueClosedLeadsByClientCode<T extends AdminIdentityLead>(leads: T[]): T[] {
  return dedupeAdminLeads(leads, true).unique;
}

/** @deprecated alias — use uniqueLeadsByClientIdentity */
export const uniqueLeadsByPhone = uniqueLeadsByClientIdentity;

export function buildAdminClientViewWhere(view: AdminClientView): Prisma.LeadWhereInput {
  switch (view) {
    case "important":  return importantOnlyWhere();
    case "schedule":   return scheduledCallWhere();
    case "interested": return isInterestedStatusWhere();
    case "closed":     return closedClientStatusWhere();
    case "all":        return allAdminClientViewsWhere();
    default:           return allAdminClientViewsWhere();
  }
}



export function buildAdminClientListWhere(
  view: AdminClientView | "important_status",
  csrName?: string,
  search?: string,
  scheduleDate?: string,
  extras?: {
    state?: string;
    phonePrefix?: string;
    areaCodes?: string[];
    csrId?: string;
  },
): Prisma.LeadWhereInput {
  const parts: Prisma.LeadWhereInput[] = [
    view === "important_status" ? isImportantStatusWhere() : buildAdminClientViewWhere(view),
  ];

  const csrId = extras?.csrId?.trim();
  if (csrId && csrId !== "all") {
    parts.push({ assignedTo: csrId });
  } else if (csrName && csrName !== "all") {
    parts.push({ csr: { is: { name: csrName } } });
  }

  if (scheduleDate && view === "schedule") {
    parts.push({ nextSchedule: scheduleDate });
  }

  const q = search?.trim();
  if (q) {
    const contains = { contains: q, mode: "insensitive" as const };
    parts.push({
      OR: [
        { name: contains },
        { company: contains },
        { phone: contains },
        { email: contains },
        { ownerName: contains },
        { projectTitle: contains },
        { projectCode: contains },
        { clientCode: contains },
        { interestedService: contains },
        { status: contains },
        { comments: contains },
        { projectNotes: contains },
        { state: contains },
        { csr: { is: { name: contains } } },
        { csr: { is: { csrCode: contains } } },
      ],
    });
  }

  const phonePrefix = extras?.phonePrefix?.replace(/\D/g, "") ?? "";
  if (phonePrefix) {
    parts.push({ phone: { contains: phonePrefix } });
  }

  const state = extras?.state?.trim() ?? "";
  const areaCodes = (extras?.areaCodes ?? []).map(c => c.replace(/\D/g, "")).filter(c => c.length >= 3);
  if (state) {
    const stateOr: Prisma.LeadWhereInput[] = [
      { state: { contains: state, mode: "insensitive" } },
    ];
    for (const code of areaCodes.slice(0, 40)) {
      stateOr.push({ phone: { contains: code } });
    }
    parts.push({ OR: stateOr });
  }

  return parts.length === 1 ? parts[0]! : { AND: parts };
}



export const ADMIN_LEAD_LIST_SELECT = {

  id:                true,

  name:              true,

  company:           true,

  phone:             true,

  email:             true,

  ownerName:         true,

  website:           true,

  state:             true,

  status:            true,

  important:         true,

  interested:        true,

  isOldClient:       true,

  clientCode:        true,

  projectCode:       true,

  interestedService: true,

  comments:          true,

  followUpNotes:     true,

  nextSchedule:      true,

  nextTime:          true,

  timezone:          true,

  createdAt:         true,

  updatedAt:         true,

  csr: { select: { id: true, name: true, csrCode: true } },

  uploadFile: { select: { companyName: true } },

  subContacts: {
    select: { id: true, phone: true, email: true, name: true, designation: true },
  },

  _count: { select: { notes: true } },

  notes: {
    orderBy: { createdAt: "desc" as const },
    take: 5,
    select: { id: true, text: true, createdAt: true, parentId: true },
  },

} satisfies Prisma.LeadSelect;


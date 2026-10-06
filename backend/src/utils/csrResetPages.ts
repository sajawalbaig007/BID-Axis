import type { Prisma } from "@prisma/client";
import {
  importantOnlyWhere,
  isInterestedStatusWhere,
  scheduledCallWhere,
} from "./adminClientQueries";
import {
  NOT_INTERESTED_LIMIT,
  NOT_PICKED_LIMIT,
  activeCsrLeadWhere,
  buildBinWhere,
} from "./binLeads";
import { buildCsrTabWhere } from "./csrDashboardQueries";
import { buildProjectLeadWhere, wonClientStatusWhere } from "./projectLeads";

export type CsrResetScopeId = string;

export type CsrResetScopeDef = {
  id: CsrResetScopeId;
  label: string;
  description: string;
};

export type CsrResetGroupDef = {
  id: string;
  label: string;
  description?: string;
  children: CsrResetScopeDef[];
};

export const CSR_RESET_GROUPS: CsrResetGroupDef[] = [
  {
    id: "call-data",
    label: "Call Data",
    description: "Main CSR dashboard tabs",
    children: [
      { id: "call-data.pending", label: "Today / Pending", description: "Today's queue and pending leads" },
      { id: "call-data.not-picked", label: "Not Picked", description: "Not picked / not completed (under limit)" },
      { id: "call-data.not-interested", label: "Not Interested", description: "Not Interested tab (under limit)" },
      { id: "call-data.no-owner", label: "No Owner", description: "No owner available" },
      { id: "call-data.not-in-service", label: "Not In Service", description: "Not in service leads" },
      { id: "call-data.in-house", label: "In House", description: "In house leads" },
      { id: "call-data.important", label: "Important", description: "Important only (no schedule)" },
      { id: "call-data.schedule", label: "Schedule", description: "Scheduled follow-up calls" },
      { id: "call-data.interested", label: "Interested", description: "Interested pipeline leads" },
      { id: "call-data.close-client", label: "Close Client", description: "Won / close client on call data" },
    ],
  },
  {
    id: "potential-clients",
    label: "Potential Clients",
    description: "Important, schedule, and interested views",
    children: [
      { id: "potential.important", label: "Important (Bold / New)", description: "Important flag without meeting date" },
      { id: "potential.schedule", label: "Schedule Call", description: "Important leads with scheduled meeting" },
      { id: "potential.interested", label: "Interested Clients", description: "Interested service leads" },
    ],
  },
  {
    id: "not-interested-page",
    label: "Not Interested Page",
    description: "Follow-up and retry sub-tabs",
    children: [
      { id: "follow-up.not-interested", label: "Not Interested", description: "NI retry queue" },
      { id: "follow-up.not-picked", label: "Not Picked", description: "Not picked retry queue" },
      { id: "follow-up.no-owner", label: "No Owner", description: "No owner available" },
      { id: "follow-up.not-in-service", label: "Not In Service", description: "Not in service" },
      { id: "follow-up.in-house", label: "In House", description: "In house" },
    ],
  },
  {
    id: "clients",
    label: "Clients",
    description: "Won client tabs",
    children: [
      { id: "clients.new", label: "New Clients", description: "First-time won clients" },
      { id: "clients.old", label: "Old Clients", description: "Returning / repeat clients" },
    ],
  },
  {
    id: "active-projects",
    label: "Active Projects",
    children: [
      { id: "active-projects", label: "Project DB", description: "All active project entries" },
    ],
  },
  {
    id: "bin",
    label: "Bin",
    description: "Deleted and limit-reached leads",
    children: [
      { id: "bin.not-picked", label: "Not Picked", description: "NP limit or deleted from pending" },
      { id: "bin.not-interested", label: "Not Interested", description: "NI limit reached" },
      { id: "bin.deleted", label: "Deleted", description: "Manually deleted important / interested / other" },
      { id: "bin.in-house", label: "In House", description: "Binned in-house leads" },
      { id: "bin.no-owner", label: "No Owner", description: "Binned no-owner leads" },
      { id: "bin.not-in-service", label: "Not In Service", description: "Binned not-in-service leads" },
    ],
  },
];

export const CSR_RESET_SCOPE_IDS: CsrResetScopeId[] = CSR_RESET_GROUPS.flatMap(g =>
  g.children.map(c => c.id),
);

export function isCsrResetScopeId(value: string): value is CsrResetScopeId {
  return CSR_RESET_SCOPE_IDS.includes(value);
}

export function normalizeCsrResetScopes(scopes?: string[]): CsrResetScopeId[] {
  if (!scopes?.length) return [...CSR_RESET_SCOPE_IDS];
  const unique = [...new Set(scopes.filter(isCsrResetScopeId))];
  if (unique.length === 0) {
    throw new Error("Select at least one page or sub-page to reset");
  }
  return unique;
}

function binBase(csrId: string): Prisma.LeadWhereInput {
  return buildBinWhere(csrId);
}

export function buildCsrResetScopeWhere(csrId: string, scope: CsrResetScopeId): Prisma.LeadWhereInput {
  switch (scope) {
    case "call-data.pending":
      return buildCsrTabWhere(csrId, "pending");
    case "call-data.not-picked":
      return buildCsrTabWhere(csrId, "notpicked");
    case "call-data.not-interested":
      return buildCsrTabWhere(csrId, "notinterested");
    case "call-data.no-owner":
      return buildCsrTabWhere(csrId, "noowner");
    case "call-data.not-in-service":
      return buildCsrTabWhere(csrId, "notinservice");
    case "call-data.in-house":
      return buildCsrTabWhere(csrId, "inhouse");
    case "call-data.important":
      return buildCsrTabWhere(csrId, "important");
    case "call-data.schedule":
      return buildCsrTabWhere(csrId, "schedule");
    case "call-data.interested":
      return buildCsrTabWhere(csrId, "interested");
    case "call-data.close-client":
      return buildCsrTabWhere(csrId, "projectwon");

    case "potential.important":
      return { ...activeCsrLeadWhere(csrId), ...importantOnlyWhere() };
    case "potential.schedule":
      return { ...activeCsrLeadWhere(csrId), ...scheduledCallWhere() };
    case "potential.interested":
      return { ...activeCsrLeadWhere(csrId), ...isInterestedStatusWhere() };

    case "follow-up.not-interested":
      return buildCsrTabWhere(csrId, "notinterested");
    case "follow-up.not-picked":
      return buildCsrTabWhere(csrId, "notpicked");
    case "follow-up.no-owner":
      return buildCsrTabWhere(csrId, "noowner");
    case "follow-up.not-in-service":
      return buildCsrTabWhere(csrId, "notinservice");
    case "follow-up.in-house":
      return buildCsrTabWhere(csrId, "inhouse");

    case "clients.new":
      return {
        ...activeCsrLeadWhere(csrId),
        ...wonClientStatusWhere(),
        isOldClient: false,
      };
    case "clients.old":
      return {
        ...activeCsrLeadWhere(csrId),
        ...wonClientStatusWhere(),
        isOldClient: true,
      };

    case "active-projects":
      return buildProjectLeadWhere(csrId);

    case "bin.not-picked":
      return {
        AND: [
          binBase(csrId),
          {
            OR: [
              {
                AND: [
                  { status: { in: ["not picked", "not completed"] } },
                  { notPickedCount: { gte: NOT_PICKED_LIMIT } },
                ],
              },
              { binReason: { in: ["limit-not-picked", "deleted-pending", "deleted-other"] } },
            ],
          },
        ],
      };
    case "bin.not-interested":
      return {
        AND: [
          binBase(csrId),
          {
            OR: [
              {
                AND: [
                  { status: "Not Interested" },
                  { notInterestedCount: { gte: NOT_INTERESTED_LIMIT } },
                ],
              },
              { binReason: "limit-not-interested" },
            ],
          },
        ],
      };
    case "bin.deleted":
      return {
        AND: [
          binBase(csrId),
          {
            binReason: {
              in: ["deleted-important", "deleted-interested", "deleted-pending", "deleted-other"],
            },
          },
        ],
      };
    case "bin.in-house":
      return {
        AND: [
          binBase(csrId),
          {
            OR: [
              { binPreviousStatus: { equals: "in house", mode: "insensitive" } },
              { status: { equals: "in house", mode: "insensitive" } },
            ],
          },
        ],
      };
    case "bin.no-owner":
      return {
        AND: [
          binBase(csrId),
          {
            OR: [
              { binPreviousStatus: { equals: "no owner available", mode: "insensitive" } },
              { status: { equals: "no owner available", mode: "insensitive" } },
            ],
          },
        ],
      };
    case "bin.not-in-service":
      return {
        AND: [
          binBase(csrId),
          {
            OR: [
              { binPreviousStatus: { equals: "not in service", mode: "insensitive" } },
              { status: { equals: "not in service", mode: "insensitive" } },
            ],
          },
        ],
      };

    default:
      return { assignedTo: csrId };
  }
}

/** Lead filter for selective CSR reset — full reset when every scope is selected. */
export function buildCsrResetLeadWhere(
  csrId: string,
  scopes: CsrResetScopeId[],
): Prisma.LeadWhereInput {
  if (scopes.length >= CSR_RESET_SCOPE_IDS.length) {
    return { assignedTo: csrId };
  }
  return {
    OR: scopes.map(scope => buildCsrResetScopeWhere(csrId, scope)),
  };
}

// Backward-compatible aliases
export type CsrResetPageId = CsrResetScopeId;
export const CSR_RESET_PAGES = CSR_RESET_GROUPS.flatMap(g =>
  g.children.map(c => ({ ...c, group: g.label })),
);
export const CSR_RESET_PAGE_IDS = CSR_RESET_SCOPE_IDS;
export const isCsrResetPageId = isCsrResetScopeId;
export const normalizeCsrResetPages = normalizeCsrResetScopes;

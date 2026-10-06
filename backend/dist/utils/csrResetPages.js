"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCsrResetPages = exports.isCsrResetPageId = exports.CSR_RESET_PAGE_IDS = exports.CSR_RESET_PAGES = exports.CSR_RESET_SCOPE_IDS = exports.CSR_RESET_GROUPS = void 0;
exports.isCsrResetScopeId = isCsrResetScopeId;
exports.normalizeCsrResetScopes = normalizeCsrResetScopes;
exports.buildCsrResetScopeWhere = buildCsrResetScopeWhere;
exports.buildCsrResetLeadWhere = buildCsrResetLeadWhere;
const adminClientQueries_1 = require("./adminClientQueries");
const binLeads_1 = require("./binLeads");
const csrDashboardQueries_1 = require("./csrDashboardQueries");
const projectLeads_1 = require("./projectLeads");
exports.CSR_RESET_GROUPS = [
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
exports.CSR_RESET_SCOPE_IDS = exports.CSR_RESET_GROUPS.flatMap(g => g.children.map(c => c.id));
function isCsrResetScopeId(value) {
    return exports.CSR_RESET_SCOPE_IDS.includes(value);
}
function normalizeCsrResetScopes(scopes) {
    if (!scopes?.length)
        return [...exports.CSR_RESET_SCOPE_IDS];
    const unique = [...new Set(scopes.filter(isCsrResetScopeId))];
    if (unique.length === 0) {
        throw new Error("Select at least one page or sub-page to reset");
    }
    return unique;
}
function binBase(csrId) {
    return (0, binLeads_1.buildBinWhere)(csrId);
}
function buildCsrResetScopeWhere(csrId, scope) {
    switch (scope) {
        case "call-data.pending":
            return (0, csrDashboardQueries_1.buildCsrTabWhere)(csrId, "pending");
        case "call-data.not-picked":
            return (0, csrDashboardQueries_1.buildCsrTabWhere)(csrId, "notpicked");
        case "call-data.not-interested":
            return (0, csrDashboardQueries_1.buildCsrTabWhere)(csrId, "notinterested");
        case "call-data.no-owner":
            return (0, csrDashboardQueries_1.buildCsrTabWhere)(csrId, "noowner");
        case "call-data.not-in-service":
            return (0, csrDashboardQueries_1.buildCsrTabWhere)(csrId, "notinservice");
        case "call-data.in-house":
            return (0, csrDashboardQueries_1.buildCsrTabWhere)(csrId, "inhouse");
        case "call-data.important":
            return (0, csrDashboardQueries_1.buildCsrTabWhere)(csrId, "important");
        case "call-data.schedule":
            return (0, csrDashboardQueries_1.buildCsrTabWhere)(csrId, "schedule");
        case "call-data.interested":
            return (0, csrDashboardQueries_1.buildCsrTabWhere)(csrId, "interested");
        case "call-data.close-client":
            return (0, csrDashboardQueries_1.buildCsrTabWhere)(csrId, "projectwon");
        case "potential.important":
            return { ...(0, binLeads_1.activeCsrLeadWhere)(csrId), ...(0, adminClientQueries_1.importantOnlyWhere)() };
        case "potential.schedule":
            return { ...(0, binLeads_1.activeCsrLeadWhere)(csrId), ...(0, adminClientQueries_1.scheduledCallWhere)() };
        case "potential.interested":
            return { ...(0, binLeads_1.activeCsrLeadWhere)(csrId), ...(0, adminClientQueries_1.isInterestedStatusWhere)() };
        case "follow-up.not-interested":
            return (0, csrDashboardQueries_1.buildCsrTabWhere)(csrId, "notinterested");
        case "follow-up.not-picked":
            return (0, csrDashboardQueries_1.buildCsrTabWhere)(csrId, "notpicked");
        case "follow-up.no-owner":
            return (0, csrDashboardQueries_1.buildCsrTabWhere)(csrId, "noowner");
        case "follow-up.not-in-service":
            return (0, csrDashboardQueries_1.buildCsrTabWhere)(csrId, "notinservice");
        case "follow-up.in-house":
            return (0, csrDashboardQueries_1.buildCsrTabWhere)(csrId, "inhouse");
        case "clients.new":
            return {
                ...(0, binLeads_1.activeCsrLeadWhere)(csrId),
                ...(0, projectLeads_1.wonClientStatusWhere)(),
                isOldClient: false,
            };
        case "clients.old":
            return {
                ...(0, binLeads_1.activeCsrLeadWhere)(csrId),
                ...(0, projectLeads_1.wonClientStatusWhere)(),
                isOldClient: true,
            };
        case "active-projects":
            return (0, projectLeads_1.buildProjectLeadWhere)(csrId);
        case "bin.not-picked":
            return {
                AND: [
                    binBase(csrId),
                    {
                        OR: [
                            {
                                AND: [
                                    { status: { in: ["not picked", "not completed"] } },
                                    { notPickedCount: { gte: binLeads_1.NOT_PICKED_LIMIT } },
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
                                    { notInterestedCount: { gte: binLeads_1.NOT_INTERESTED_LIMIT } },
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
function buildCsrResetLeadWhere(csrId, scopes) {
    if (scopes.length >= exports.CSR_RESET_SCOPE_IDS.length) {
        return { assignedTo: csrId };
    }
    return {
        OR: scopes.map(scope => buildCsrResetScopeWhere(csrId, scope)),
    };
}
exports.CSR_RESET_PAGES = exports.CSR_RESET_GROUPS.flatMap(g => g.children.map(c => ({ ...c, group: g.label })));
exports.CSR_RESET_PAGE_IDS = exports.CSR_RESET_SCOPE_IDS;
exports.isCsrResetPageId = isCsrResetScopeId;
exports.normalizeCsrResetPages = normalizeCsrResetScopes;

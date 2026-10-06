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

export const ALL_CSR_RESET_SCOPE_IDS = CSR_RESET_GROUPS.flatMap(g =>
  g.children.map(c => c.id),
);

export function scopeLabel(id: string): string {
  for (const group of CSR_RESET_GROUPS) {
    const child = group.children.find(c => c.id === id);
    if (child) return child.label;
  }
  return id;
}

export interface StatusSlice {
  name: string;
  value: number;
  color: string;
}

interface StatusGroup {
  name: string;
  color: string;
  match: (status: string) => boolean;
}

export const STATUS_GROUPS: StatusGroup[] = [
  { name: "Pending",        color: "#0B84F3", match: s => s === "pending" },
  { name: "Important",      color: "#B42318", match: s => s === "important" },
  { name: "Interested",     color: "#D97706", match: s => s === "interested" },
  { name: "Close Client",   color: "#065F46", match: s => s === "Close Client" },
  { name: "Not Interested", color: "#475569", match: s => s === "Not Interested" || s === "completed" },
  { name: "Not Picked",     color: "#F97316", match: s => s === "not picked" || s === "not completed" },
  { name: "No Owner",       color: "#D97706", match: s => s === "no owner available" },
  { name: "Not In Service", color: "#7C3AED", match: s => s === "not in service" },
  { name: "In House",       color: "#0D9488", match: s => s === "in house" },
];

export function getStatusChartData(leads: { status: string }[]): StatusSlice[] {
  return STATUS_GROUPS
    .map(group => ({
      name: group.name,
      color: group.color,
      value: leads.filter(l => group.match(l.status)).length,
    }))
    .filter(slice => slice.value > 0);
}

/** All status buckets from server stats (full pipeline chart) */
export function getStatusChartDataFromStats(stats: {
  pendingCount: number;
  importantOnlyCount: number;
  scheduledCount: number;
  interestedCount: number;
  projectWonCount: number;
  notInterestedCount: number;
  notPickedCount: number;
  noOwnerCount: number;
  notInServiceCount: number;
  inHouseCount: number;
}): StatusSlice[] {
  return [
    { name: "Pending",        value: stats.pendingCount,        color: "#0B84F3" },
    { name: "Important",      value: stats.importantOnlyCount,  color: "#B42318" },
    { name: "Scheduled",      value: stats.scheduledCount,      color: "#6366F1" },
    { name: "Interested",     value: stats.interestedCount,     color: "#D97706" },
    { name: "Close Client",   value: stats.projectWonCount,     color: "#065F46" },
    { name: "Not Interested", value: stats.notInterestedCount,  color: "#475569" },
    { name: "Not Picked",     value: stats.notPickedCount,      color: "#F97316" },
    { name: "No Owner",       value: stats.noOwnerCount,        color: "#CA8A04" },
    { name: "Not In Service", value: stats.notInServiceCount,   color: "#7C3AED" },
    { name: "In House",       value: stats.inHouseCount,        color: "#0D9488" },
  ].filter(s => s.value > 0);
}

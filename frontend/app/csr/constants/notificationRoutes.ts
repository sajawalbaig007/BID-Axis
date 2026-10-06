export function getLeadPageForStatus(status: string): string {
  switch (status) {
    case "important":
      return "/csr/potential-clients";
    case "interested":
      return "/csr/potential-clients";
    case "Not Interested":
    case "completed":
      return "/csr/not-interested";
    case "not picked":
    case "not completed":
      return "/csr/bin";
    case "Close Client":
      return "/csr/active-projects";
    default:
      return "/csr";
  }
}

export function formatNotificationStatus(status: string): string {
  if (status === "Not Interested" || status === "completed") return "Not Interested";
  if (status === "not picked" || status === "not completed") return "Not Picked";
  if (status === "Close Client") return "Close Client";
  if (status === "important") return "Important";
  if (status === "interested") return "Interested";
  if (status === "pending") return "Pending";
  return status;
}

export const STATUS_BADGE_COLORS: Record<string, string> = {
  important:        "bg-rose-100 text-rose-700 dark:bg-rose-500/25 dark:text-rose-300",
  interested:       "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-300",
  pending:          "bg-blue-100 text-blue-700 dark:bg-blue-500/25 dark:text-blue-300",
  "Close Client":   "bg-violet-100 text-violet-700 dark:bg-violet-500/25 dark:text-violet-300",
  "Not Interested": "bg-slate-200 text-slate-700 dark:bg-slate-500/30 dark:text-slate-200",
  "not picked":     "bg-orange-100 text-orange-700 dark:bg-orange-500/25 dark:text-orange-300",
  completed:        "bg-slate-200 text-slate-700 dark:bg-slate-500/30 dark:text-slate-200",
  "not completed":  "bg-orange-100 text-orange-700 dark:bg-orange-500/25 dark:text-orange-300",
  "no owner available": "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/25 dark:text-yellow-300",
  "not in service": "bg-violet-100 text-violet-700 dark:bg-violet-500/25 dark:text-violet-300",
  "in house":       "bg-teal-100 text-teal-800 dark:bg-teal-500/25 dark:text-teal-300",
};

export function statusBadgeColor(status: string): string {
  const key = status.trim();
  return STATUS_BADGE_COLORS[key]
    ?? STATUS_BADGE_COLORS[key.toLowerCase()]
    ?? "bg-slate-200 text-slate-700 dark:bg-slate-500/30 dark:text-slate-200";
}

export function leadUrlForStatus(status: string, leadId: string): string {
  const params = new URLSearchParams({ leadId });
  if (status === "interested") params.set("tab", "interested");
  if (status === "important") params.set("tab", "important");
  return `${getLeadPageForStatus(status)}?${params.toString()}`;
}

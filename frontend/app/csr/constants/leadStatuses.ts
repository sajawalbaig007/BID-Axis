export const STATUS_NOT_INTERESTED = "Not Interested";
export const STATUS_NOT_USEFUL = "Not useful";
export const STATUS_NOT_PICKED = "not picked";
export const STATUS_NOT_COMPLETED = "not completed";
export const STATUS_NO_OWNER = "no owner available";
export const STATUS_NOT_IN_SERVICE = "not in service";
export const STATUS_IN_HOUSE = "in house";

export function normStatus(s?: string | null): string {
  return (s ?? "").trim().toLowerCase();
}

export type LeadStatusFlags = {
  status?: string | null;
  important?: boolean;
  interested?: boolean;
};

/** Matches admin/DB: status is source of truth (ignore stale flags). */
export function isImportantLead(lead: LeadStatusFlags): boolean {
  return normStatus(lead.status) === "important";
}

export function isInterestedLeadStatus(lead: LeadStatusFlags): boolean {
  return normStatus(lead.status) === "interested";
}

export function isWonClientStatus(s?: string | null): boolean {
  const n = normStatus(s);
  return n === "close client" || n === "completed" || n === "closed";
}

export function isNotPickedStatus(s: string) {
  return s === STATUS_NOT_PICKED || s === STATUS_NOT_COMPLETED;
}

export function isNotInterestedStatus(s: string) {
  return s === STATUS_NOT_INTERESTED || normStatus(s) === "completed";
}

export function isNotUsefulStatus(s?: string | null) {
  return normStatus(s) === normStatus(STATUS_NOT_USEFUL);
}

export function statusDisplayLabel(s: string): string {
  const n = normStatus(s);
  if (isNotUsefulStatus(s)) return "Not useful";
  if (isNotInterestedStatus(s)) return "Not Interested";
  if (isNotPickedStatus(s)) return "Not Picked";
  if (n === normStatus(STATUS_NO_OWNER)) return "No Owner Available";
  if (n === normStatus(STATUS_NOT_IN_SERVICE)) return "Not In Service";
  if (n === normStatus(STATUS_IN_HOUSE)) return "In House";
  if (n === "important") return "Important";
  if (n === "interested") return "Interested";
  if (isWonClientStatus(s)) return "Close Client";
  if (n === "pending") return "Pending";
  return s;
}

export function statusBadgeClass(s: string): string {
  const n = normStatus(s);
  if (isNotPickedStatus(s)) return "bg-[#FFF7E6] text-[#B54708]";
  if (isNotUsefulStatus(s)) return "bg-[#F3E8FF] text-[#6D28D9]";
  if (isNotInterestedStatus(s)) return "bg-[#F1F5F9] text-[#475569]";
  if (n === normStatus(STATUS_NO_OWNER)) return "bg-[#FEF3C7] text-[#B45309]";
  if (n === normStatus(STATUS_NOT_IN_SERVICE)) return "bg-[#F3E8FF] text-[#7C3AED]";
  if (n === normStatus(STATUS_IN_HOUSE)) return "bg-[#CCFBF1] text-[#0D9488]";
  if (n === "important") return "bg-[#EAF2FE] text-[#1B6FE8]";
  if (n === "interested") return "bg-[#FFF4E5] text-[#D97706]";
  if (isWonClientStatus(s)) return "bg-[#ECFDF5] text-[#065F46]";
  return "bg-[#F4F4F5] text-[#52525B]";
}

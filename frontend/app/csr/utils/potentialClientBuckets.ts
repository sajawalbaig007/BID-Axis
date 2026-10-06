import { isImportantLead, isInterestedLeadStatus } from "../constants/leadStatuses";

/** Shared buckets for Important / Schedule Call / Interested */

export function hasSchedule(nextSchedule?: string | null): boolean {
  return !!(nextSchedule && String(nextSchedule).trim());
}

export function isImportantOnly(lead: {
  status?: string;
  important?: boolean;
  nextSchedule?: string | null;
}): boolean {
  return isImportantLead(lead) && !hasSchedule(lead.nextSchedule);
}

export function isScheduledCall(lead: {
  status?: string;
  important?: boolean;
  nextSchedule?: string | null;
}): boolean {
  return isImportantLead(lead) && hasSchedule(lead.nextSchedule);
}

export function isInterestedLead(lead: { status?: string; interested?: boolean }): boolean {
  return isInterestedLeadStatus(lead);
}

export type PotentialTab = "all" | "important" | "schedule" | "interested";

export function matchesPotentialTab(
  lead: { status?: string; important?: boolean; interested?: boolean; nextSchedule?: string | null },
  tab: PotentialTab,
): boolean {
  if (tab === "all") return isImportantOnly(lead) || isScheduledCall(lead) || isInterestedLead(lead);
  if (tab === "important") return isImportantOnly(lead);
  if (tab === "schedule") return isScheduledCall(lead);
  return isInterestedLead(lead);
}

/** Admin leads page uses nextFollowup instead of nextSchedule */
export function isAdminImportantOnly(c: { rawStatus: string; nextFollowup?: string }): boolean {
  return c.rawStatus === "important" && !hasSchedule(c.nextFollowup);
}

export function isAdminScheduledCall(c: { rawStatus: string; nextFollowup?: string }): boolean {
  return c.rawStatus === "important" && hasSchedule(c.nextFollowup);
}

export function canAdminReassign(c: { rawStatus: string; nextFollowup?: string }): boolean {
  return (
    c.rawStatus === "interested" ||
    isAdminImportantOnly(c) ||
    isAdminScheduledCall(c)
  );
}

export function countLeadStats(leads: { status?: string | null }[]) {
  const norm = (s?: string | null) => (s ?? "").toLowerCase();
  return {
    totalLeads:  leads.length,
    pending:     leads.filter(l => norm(l.status) === "pending").length,
    important:   leads.filter(l => norm(l.status) === "important").length,
    interested:  leads.filter(l => norm(l.status) === "interested").length,
    completed:   leads.filter(l => ["completed", "closed"].includes(norm(l.status))).length,
    projectWon:  leads.filter(l => norm(l.status) === "close client").length,
  };
}

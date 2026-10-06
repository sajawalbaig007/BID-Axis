/** Shared potential-client bucket rules (matches CSR frontend). */

export function hasSchedule(nextSchedule?: string | null): boolean {
  return !!(nextSchedule && String(nextSchedule).trim());
}

/** Status is source of truth — ignore stale important/interested flags. */
export function isImportantLead(lead: { status?: string | null; important?: boolean }): boolean {
  return (lead.status ?? "").trim().toLowerCase() === "important";
}

export function isInterestedLead(lead: { status?: string | null; interested?: boolean }): boolean {
  return (lead.status ?? "").trim().toLowerCase() === "interested";
}

export function isImportantOnlyLead(lead: {
  status?: string | null;
  important?: boolean;
  nextSchedule?: string | null;
}): boolean {
  return isImportantLead(lead) && !hasSchedule(lead.nextSchedule);
}

export function isScheduledCallLead(lead: {
  status?: string | null;
  important?: boolean;
  nextSchedule?: string | null;
}): boolean {
  return isImportantLead(lead) && hasSchedule(lead.nextSchedule);
}

export function isPotentialClientLead(lead: {
  status?: string | null;
  important?: boolean;
  interested?: boolean;
  nextSchedule?: string | null;
}): boolean {
  return isInterestedLead(lead) || isImportantLead(lead);
}

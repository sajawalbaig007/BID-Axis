import { Lead } from "../types/lead";

/** Person's name */
export function clientName(lead: Lead): string {
  return lead.client;
}

/** Client's own company (their business) */
export function clientCompany(lead: Lead): string {
  const c = lead.company?.trim();
  if (c && c !== "N/A") return c;
  return "—";
}

/** Our company (PS Estimating etc. from upload) */
export function ourCompany(lead: Lead): string {
  const ours = lead.ourCompanyName?.trim();
  if (ours) return ours;
  return lead.sourceSudoName?.trim() || "—";
}

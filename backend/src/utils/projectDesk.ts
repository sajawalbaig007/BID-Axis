import type { Prisma } from "@prisma/client";

export type ProjectDesk = "estimation" | "bim";

export function isBimDeskRole(role: string | undefined | null): boolean {
  return role === "bim_manager" || role === "bim";
}

export function staffRoleForDesk(role: string | undefined | null): "estimator" | "bim" {
  return role === "bim_manager" || role === "bim" ? "bim" : "estimator";
}

/**
 * BIM desk is an explicit tag. Estimation projects often have no projectDesk field.
 * A Prisma `not` filter drops those unset Mongo rows, so only the BIM query is in SQL.
 * Everyone else filters `projectDesk === "bim"` out in memory.
 */
export function deskWhereForRole(role: string | undefined | null): Prisma.LeadWhereInput {
  if (role === "bim_manager" || role === "bim") return { projectDesk: "bim" };
  return {};
}

export function leadOnBimDesk(lead: { projectDesk?: string | null }): boolean {
  return lead.projectDesk === "bim";
}

export function leadVisibleOnDesk(lead: { projectDesk?: string | null }, role: string | undefined | null): boolean {
  const bim = leadOnBimDesk(lead);
  if (role === "bim_manager" || role === "bim") return bim;
  return !bim;
}

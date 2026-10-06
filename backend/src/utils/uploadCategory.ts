/** Categories matching upload zones on the admin Uploads page */
export type UploadCategory =
  | "call-data"
  | "new-client"
  | "old-client"
  | "interested"
  | "important"
  | "active-projects";

export const UPLOAD_CATEGORIES: UploadCategory[] = [
  "call-data",
  "new-client",
  "old-client",
  "interested",
  "important",
  "active-projects",
];

export const UPLOAD_CATEGORY_LABELS: Record<UploadCategory, string> = {
  "call-data":       "Call Data",
  "new-client":      "New Client",
  "old-client":      "Old Client",
  "interested":      "Interested",
  "important":       "Important",
  "active-projects": "Active Projects",
};

export function resolveUploadCategory(
  leadType: string,
  initialStatuses: string[]
): UploadCategory {
  const status = (initialStatuses[0] ?? "").toLowerCase();

  if (leadType === "active") return "active-projects";
  if (status === "important") return "important";
  if (status === "interested") return "interested";
  if (status === "pending") return "call-data";
  if (leadType === "old") return "old-client";
  if (leadType === "new") return "new-client";

  return "call-data";
}

export function isUploadCategory(value: string): value is UploadCategory {
  return (UPLOAD_CATEGORIES as string[]).includes(value);
}

/** Infer category from a linked lead when uploadCategory was not stored (older uploads) */
export function inferUploadCategoryFromLead(lead: {
  status: string;
  isOldClient: boolean;
  projectTitle: string | null;
}): UploadCategory {
  const status = lead.status.toLowerCase();

  if (status === "pending") return "call-data";
  if (status === "important") return "important";
  if (status === "interested") return "interested";
  if (lead.projectTitle && lead.isOldClient) return "active-projects";
  if (lead.isOldClient) return "old-client";
  if (status.includes("close")) return "new-client";

  return "call-data";
}

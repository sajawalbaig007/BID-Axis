import API from "@/lib/api";

type FetchAdminProjectsParams = {
  csrId?: string;
  from?: string;
  to?: string;
  search?: string;
  /** Exclude projects soft-removed from Technical portal */
  technicalView?: boolean;
  /** TM Revisions section only */
  revisionsOnly?: boolean;
  /** Hide revision-queue projects from TM Active Projects */
  excludeRevisions?: boolean;
};

/**
 * Same project set for Admin Project DB and Technical Active Projects.
 * TM All Projects fetches up to 2000 rows; Admin Project DB keeps the 50-row window.
 */
export async function fetchAllAdminProjects<T = Record<string, unknown>>(
  params: FetchAdminProjectsParams = {},
): Promise<{ leads: T[]; total: number }> {
  const query: Record<string, string> = {
    lite: "1",
    page: "1",
    limit: params.technicalView ? "2000" : "500",
  };
  if (params.csrId) query.csrId = params.csrId;
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;
  if (params.search?.trim()) query.search = params.search.trim();
  if (params.technicalView) query.technicalView = "1";
  if (params.revisionsOnly) query.revisions = "1";
  if (params.excludeRevisions) query.excludeRevisions = "1";

  const res = await API.get("/admin/projects", { params: query });
  const leads = (res.data.leads ?? []) as T[];
  // Tab counts use displayed leads (previous Admin All/Active), not raw DB total
  const total = leads.length;
  return { leads, total };
}

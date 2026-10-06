import API from "@/lib/api";

export const ESTIMATOR_KPI_FIELD_KEYS = [
  "projects_delivered",
  "productivity",
  "project_time_spent",
  "checkin_checkout",
  "retained_clients",
  "punctuality",
  "team_query_mistakes",
  "trades_history",
  "final_remarks",
  "marks_out_of_10",
  "rating_stars",
] as const;

export type EstimatorKpiFieldKey = (typeof ESTIMATOR_KPI_FIELD_KEYS)[number];

export type EstimatorKpiFieldMeta = {
  key: EstimatorKpiFieldKey;
  label: string;
  input: "number" | "text" | "textarea" | "marks10" | "stars5";
  hint?: string;
};

export const ESTIMATOR_KPI_FIELD_META: Record<
  EstimatorKpiFieldKey,
  Omit<EstimatorKpiFieldMeta, "key">
> = {
  projects_delivered: { label: "Projects delivered", input: "number", hint: "Auto from completed takeoffs" },
  productivity: {
    label: "Productivity %",
    input: "number",
    hint: "Auto % — logged hours vs planned (or delivered vs assigned)",
  },
  project_time_spent: {
    label: "Project time spent",
    input: "textarea",
    hint: "Auto per-project timer vs planned",
  },
  checkin_checkout: {
    label: "Check-in / Check-out (daily)",
    input: "textarea",
    hint: "Auto from estimator daily sessions",
  },
  retained_clients: { label: "Retained clients", input: "number", hint: "Auto — only -01 → -02 (3rd+ project is not retained)" },
  punctuality: { label: "Punctuality", input: "text", hint: "Auto from overdue vs assigned" },
  team_query_mistakes: { label: "Team query mistakes", input: "text", hint: "Auto from overdue follow-ups" },
  trades_history: { label: "Trades history", input: "textarea", hint: "Auto from scopes/trades" },
  final_remarks: { label: "Evaluation remarks (avg / month)", input: "textarea", hint: "Month-end summary of project-wise remarks" },
  marks_out_of_10: { label: "Marks (out of 10)", input: "marks10", hint: "Month average of Take Off Done evaluations" },
  rating_stars: { label: "Rating (out of 5)", input: "stars5", hint: "Auto from evaluation marks" },
};

export type EstimatorKpiRecord = {
  id: string;
  estimatorId: string;
  estimatorName: string;
  fieldKey: EstimatorKpiFieldKey | string;
  value: string;
  note: string | null;
  recordedAt: string;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EstimatorKpiRosterItem = {
  id: string;
  name: string;
  code: string;
};

export type EstimatorKpiAutoField = {
  fieldKey: EstimatorKpiFieldKey;
  value: string;
  note: string;
  auto: boolean;
};

export type EstimatorKpiAutoRow = {
  estimatorId: string;
  name: string;
  code: string;
  fields: EstimatorKpiAutoField[];
  deliveredByDate?: { date: string; count: number }[];
};

export async function fetchEstimatorKpiRecords(opts?: {
  month?: string;
  from?: string;
  to?: string;
  estimatorId?: string;
}) {
  const params: Record<string, string> = {};
  if (opts?.month) params.month = opts.month;
  if (opts?.from) params.from = opts.from;
  if (opts?.to) params.to = opts.to;
  if (opts?.estimatorId) params.estimatorId = opts.estimatorId;
  const res = await API.get("/admin/technical-kpi-records", { params });
  return res.data as {
    success: boolean;
    fields: EstimatorKpiFieldMeta[];
    estimators: EstimatorKpiRosterItem[];
    records: EstimatorKpiRecord[];
  };
}

export async function fetchEstimatorKpiAuto(month: string) {
  const res = await API.get("/admin/technical-kpi-auto", { params: { month } });
  return res.data as {
    success: boolean;
    month: string;
    generatedAt: string;
    estimators: EstimatorKpiAutoRow[];
  };
}

export async function seedEstimatorKpiAuto(payload: {
  month: string;
  estimatorId?: string;
  onlyEmpty?: boolean;
  fieldKeys?: EstimatorKpiFieldKey[];
}) {
  const res = await API.post("/admin/technical-kpi-auto-seed", payload);
  return res.data as { success: boolean; created: number; month: string; message?: string };
}

export async function createEstimatorKpiRecord(payload: {
  estimatorId: string;
  estimatorName?: string;
  fieldKey: EstimatorKpiFieldKey;
  value: string;
  note?: string;
  recordedAt?: string;
}) {
  const res = await API.post("/admin/technical-kpi-records", payload);
  return res.data as { success: boolean; record: EstimatorKpiRecord; message?: string };
}

export async function updateEstimatorKpiRecord(
  id: string,
  payload: Partial<{ value: string; note: string; recordedAt: string; fieldKey: EstimatorKpiFieldKey }>,
) {
  const res = await API.put(`/admin/technical-kpi-records/${id}`, payload);
  return res.data as { success: boolean; record: EstimatorKpiRecord; message?: string };
}

export async function deleteEstimatorKpiRecord(id: string) {
  const res = await API.delete(`/admin/technical-kpi-records/${id}`);
  return res.data as { success: boolean; message?: string };
}

export function currentMonthValue(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function toDatetimeLocalValue(iso: string | Date | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatKpiTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function starsLabel(value: string | number): string {
  const n = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return `${"★".repeat(n)}${"☆".repeat(5 - n)}`;
}

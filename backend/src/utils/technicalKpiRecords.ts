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

export const ESTIMATOR_KPI_FIELD_META: Record<
  EstimatorKpiFieldKey,
  { label: string; input: "number" | "text" | "textarea" | "marks10" | "stars5"; hint?: string }
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

export function isEstimatorKpiFieldKey(raw: unknown): raw is EstimatorKpiFieldKey {
  return typeof raw === "string" && (ESTIMATOR_KPI_FIELD_KEYS as readonly string[]).includes(raw);
}

export function validateKpiValue(fieldKey: EstimatorKpiFieldKey, raw: unknown): { ok: true; value: string } | { ok: false; message: string } {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false, message: "Value is required." };

  const meta = ESTIMATOR_KPI_FIELD_META[fieldKey];
  if (meta.input === "number") {
    const n = Number(value.replace(/,/g, "").replace(/%/g, "").trim());
    if (!Number.isFinite(n) || n < 0) return { ok: false, message: "Enter a valid non-negative number." };
    return { ok: true, value: String(n) };
  }
  if (meta.input === "marks10") {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 10) return { ok: false, message: "Marks must be between 0 and 10." };
    return { ok: true, value: String(Math.round(n * 10) / 10) };
  }
  if (meta.input === "stars5") {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1 || n > 5) return { ok: false, message: "Rating must be 1–5 stars." };
    return { ok: true, value: String(Math.round(n)) };
  }
  if (value.length > 8000) return { ok: false, message: "Value is too long." };
  return { ok: true, value };
}

export function parseRecordedAt(raw: unknown, fallback = new Date()): Date {
  if (raw == null || raw === "") return fallback;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

/** YYYY-MM bounds in UTC month window for filtering. */
export function monthBounds(month: string): { from: Date; to: Date } | null {
  const m = String(month ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo || mo < 1 || mo > 12) return null;
  const from = new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(y, mo, 1, 0, 0, 0, 0));
  return { from, to };
}

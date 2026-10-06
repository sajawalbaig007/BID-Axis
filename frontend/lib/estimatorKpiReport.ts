import {
  ESTIMATOR_KPI_FIELD_KEYS,
  ESTIMATOR_KPI_FIELD_META,
  formatKpiTimestamp,
  starsLabel,
  type EstimatorKpiFieldKey,
  type EstimatorKpiRecord,
  type EstimatorKpiRosterItem,
} from "./estimatorKpiRecords";

export type KpiReportPeriod =
  | { mode: "all" }
  | { mode: "month"; month: string }
  | { mode: "range"; from: string; to: string };

function latestByField(records: EstimatorKpiRecord[], fieldKey: string) {
  return [...records]
    .filter((r) => r.fieldKey === fieldKey)
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0] ?? null;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function kpiReportPeriodLabel(period: KpiReportPeriod): string {
  if (period.mode === "all") return "All time";
  if (period.mode === "month") {
    const [y, mo] = period.month.split("-").map(Number);
    if (!y || !mo) return period.month;
    return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return `${period.from} → ${period.to}`;
}

export function buildEstimatorKpiReportHtml(opts: {
  period: KpiReportPeriod;
  estimators: EstimatorKpiRosterItem[];
  records: EstimatorKpiRecord[];
  estimatorFilterId?: string;
}): string {
  const RED = "#1B6FE8";
  const NAVY = "#0B1220";
  const label = kpiReportPeriodLabel(opts.period);
  const roster = opts.estimatorFilterId
    ? opts.estimators.filter((e) => e.id === opts.estimatorFilterId)
    : opts.estimators;

  const byEst = new Map<string, EstimatorKpiRecord[]>();
  for (const r of opts.records) {
    if (opts.estimatorFilterId && r.estimatorId !== opts.estimatorFilterId) continue;
    const list = byEst.get(r.estimatorId) ?? [];
    list.push(r);
    byEst.set(r.estimatorId, list);
  }

  const people = roster.length
    ? roster
    : [...byEst.keys()].map((id) => ({
        id,
        name: byEst.get(id)?.[0]?.estimatorName ?? id,
        code: "—",
      }));

  const sections = people
    .map((est) => {
      const recs = byEst.get(est.id) ?? [];
      const rows = ESTIMATOR_KPI_FIELD_KEYS.map((key) => {
        const latest = latestByField(recs, key);
        const meta = ESTIMATOR_KPI_FIELD_META[key as EstimatorKpiFieldKey];
        let value = latest?.value?.trim() || "—";
        if (latest && key === "rating_stars") value = starsLabel(latest.value);
        if (latest && key === "productivity" && !String(latest.value).includes("%")) {
          value = `${latest.value}%`;
        }
        const note = latest?.note ? escapeHtml(latest.note) : "";
        const when = latest ? formatKpiTimestamp(latest.recordedAt) : "—";
        return `<tr>
          <td style="padding:6px 8px;border:1px solid #E2E8F0;font-size:10px;font-weight:bold;width:160px;">${escapeHtml(meta.label)}</td>
          <td style="padding:6px 8px;border:1px solid #E2E8F0;font-size:10px;white-space:pre-wrap;">${escapeHtml(value)}</td>
          <td style="padding:6px 8px;border:1px solid #E2E8F0;font-size:9px;color:#64748B;">${note || "—"}</td>
          <td style="padding:6px 8px;border:1px solid #E2E8F0;font-size:9px;color:#94A3B8;white-space:nowrap;">${when}</td>
        </tr>`;
      }).join("");

      return `
        <h2>${escapeHtml(est.name)} <span style="color:#94A3B8;font-weight:normal;font-size:12px;">${escapeHtml(est.code)}</span></h2>
        <p style="margin:0 0 8px;font-size:10px;color:#64748B;">${recs.length} saved entr${recs.length === 1 ? "y" : "ies"} in this period</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px;">
          <tr style="background:${NAVY};color:#fff;">
            <td style="padding:6px 8px;font-size:10px;">Field</td>
            <td style="padding:6px 8px;font-size:10px;">Value</td>
            <td style="padding:6px 8px;font-size:10px;">Note</td>
            <td style="padding:6px 8px;font-size:10px;">Recorded</td>
          </tr>
          ${rows}
        </table>`;
    })
    .join("");

  const who = opts.estimatorFilterId
    ? people[0]?.name ?? "Estimator"
    : `${people.length} estimator${people.length === 1 ? "" : "s"}`;

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>KPI Report ${escapeHtml(label)}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; color: #0F172A; margin: 24px; }
  h1 { color: ${RED}; font-size: 22px; margin: 0 0 4px; }
  h2 { color: ${NAVY}; font-size: 14px; margin: 20px 0 8px; border-bottom: 2px solid ${RED}; padding-bottom: 4px; }
  p.meta { color: #64748B; font-size: 10px; margin: 0 0 16px; }
</style></head>
<body>
  <h1>Chief Estimator — KPI report</h1>
  <p class="meta">${escapeHtml(label)} · ${escapeHtml(who)} · Generated ${new Date().toLocaleString("en-GB")}</p>
  ${sections || `<p style="color:#94A3B8;font-size:12px;">No KPI entries for this period.</p>`}
  <p style="margin-top:24px;font-size:9px;color:#94A3B8;">Latest saved value per field. Auto suggestions that were not saved are omitted.</p>
</body></html>`;
}

export function downloadEstimatorKpiReport(opts: {
  period: KpiReportPeriod;
  estimators: EstimatorKpiRosterItem[];
  records: EstimatorKpiRecord[];
  estimatorFilterId?: string;
}): void {
  const html = buildEstimatorKpiReportHtml(opts);
  const label = kpiReportPeriodLabel(opts.period).replace(/[^\w]+/g, "-");
  const who = opts.estimatorFilterId
    ? opts.estimators.find((e) => e.id === opts.estimatorFilterId)?.name ?? "estimator"
    : "all";
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `KPI-Report-${who}-${label}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

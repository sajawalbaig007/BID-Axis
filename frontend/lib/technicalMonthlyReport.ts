import { fetchAllAdminProjects } from "@/lib/fetchAdminProjects";
import { fetchEstimatorKpiAuto, type EstimatorKpiAutoRow } from "@/lib/estimatorKpiRecords";
import {
  fetchTechnicalMonitoring,
  formatLoggedHours,
  type TechnicalKpiPayload,
  type TechnicalMonitoringPayload,
} from "@/lib/technicalMonitoring";

export type TechnicalMonthlyReport = {
  month: string;
  generatedAt: string;
  monitoring: TechnicalMonitoringPayload;
  kpiAuto: EstimatorKpiAutoRow[];
  revisionsCount: number;
};

export function currentReportMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function monthLabel(month: string): string {
  const [y, mo] = month.split("-").map(Number);
  if (!y || !mo) return month;
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function fetchTechnicalMonthlyReport(month: string): Promise<TechnicalMonthlyReport> {
  const [monitoring, autoRes, revRes] = await Promise.all([
    fetchTechnicalMonitoring(),
    fetchEstimatorKpiAuto(month).catch(() => ({ estimators: [] as EstimatorKpiAutoRow[] })),
    fetchAllAdminProjects({ technicalView: true, revisionsOnly: true }).catch(() => ({ leads: [] })),
  ]);

  return {
    month,
    generatedAt: monitoring.generatedAt ?? new Date().toISOString(),
    monitoring,
    kpiAuto: Array.isArray(autoRes.estimators) ? autoRes.estimators : [],
    revisionsCount: revRes.leads?.length ?? 0,
  };
}

function kpiField(row: EstimatorKpiAutoRow, key: string): string {
  return row.fields.find((f) => f.fieldKey === key)?.value?.trim() ?? "—";
}

function barRow(label: string, value: number, max: number, color: string): string {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<tr>
    <td style="padding:4px 8px;border:1px solid #E2E8F0;font-size:10px;width:140px;">${label}</td>
    <td style="padding:4px 8px;border:1px solid #E2E8F0;font-size:10px;width:50px;text-align:right;font-weight:bold;">${value}</td>
    <td style="padding:4px 8px;border:1px solid #E2E8F0;">
      <table cellpadding="0" cellspacing="0" width="100%"><tr>
        <td width="${pct}%" bgcolor="${color}" style="height:14px;font-size:1px;">&nbsp;</td>
        <td width="${100 - pct}%" bgcolor="#F1F5F9" style="height:14px;font-size:1px;">&nbsp;</td>
      </tr></table>
    </td>
  </tr>`;
}

export function buildTechnicalWordHtml(report: TechnicalMonthlyReport): string {
  const label = monthLabel(report.month);
  const kpi = report.monitoring.kpi;
  const pipe = kpi.pipeline;
  const sum = kpi.summary;
  const RED = "#1B6FE8";
  const NAVY = "#0B1220";
  const GREEN = "#059669";
  const BLUE = "#0B84F3";
  const AMBER = "#D97706";
  const VIOLET = "#7C3AED";

  const pipeMax = Math.max(pipe.total, 1);
  const pipeBars = [
    barRow("Not assigned", pipe.notAssigned, pipeMax, AMBER),
    barRow("Assigned / working", pipe.assigned, pipeMax, BLUE),
    barRow("Takeoff done", pipe.takeoffDone, pipeMax, GREEN),
    barRow("Pricing", pipe.pricing, pipeMax, VIOLET),
    barRow("Final submission", pipe.finalSubmission, pipeMax, NAVY),
  ].join("");

  const scoreRows = kpi.scoreboard
    .slice(0, 12)
    .map(
      (r) => `<tr>
        <td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;">${r.name} <span style="color:#94A3B8;">(${r.code})</span></td>
        <td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;text-align:center;">${r.completed}/${r.assigned}</td>
        <td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;text-align:center;">${r.overdue}</td>
        <td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;text-align:center;font-weight:bold;color:${r.score >= 80 ? GREEN : r.score >= 55 ? AMBER : RED};">${r.score}</td>
      </tr>`,
    )
    .join("");

  const kpiRows = report.kpiAuto
    .filter((r) => r.fields.some((f) => f.auto && f.value.trim()))
    .map((r) => {
      const marks = kpiField(r, "marks_out_of_10");
      const stars = kpiField(r, "rating_stars");
      const delivered = kpiField(r, "projects_delivered");
      const retained = kpiField(r, "retained_clients");
      const remarks = kpiField(r, "final_remarks");
      return `<tr>
        <td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;font-weight:bold;">${r.name}</td>
        <td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;text-align:center;">${delivered}</td>
        <td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;text-align:center;">${retained}</td>
        <td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;text-align:center;font-weight:bold;">${marks}</td>
        <td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;text-align:center;">${stars} ★</td>
        <td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:9.5px;color:#475569;">${remarks.slice(0, 120)}${remarks.length > 120 ? "…" : ""}</td>
      </tr>`;
    })
    .join("");

  const card = (title: string, value: string, sub: string, bg: string) =>
    `<td width="25%" style="padding:6px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border-radius:8px;">
        <tr><td style="padding:12px 14px;">
          <p style="margin:0;font-size:9px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;font-weight:bold;">${title}</p>
          <p style="margin:4px 0 2px;font-size:22px;font-weight:bold;color:#0F172A;">${value}</p>
          <p style="margin:0;font-size:9px;color:#64748B;">${sub}</p>
        </td></tr>
      </table>
    </td>`;

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>Technical Report ${label}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
  body { font-family: Calibri, Arial, sans-serif; color: #0F172A; margin: 24px; }
  h1 { color: ${RED}; font-size: 22px; margin: 0 0 4px; }
  h2 { color: ${NAVY}; font-size: 14px; margin: 20px 0 8px; border-bottom: 2px solid ${RED}; padding-bottom: 4px; }
  p.meta { color: #64748B; font-size: 10px; margin: 0 0 16px; }
</style></head>
<body>
  <h1>Technical Team — Monthly Report</h1>
  <p class="meta">${label} · Generated ${new Date(report.generatedAt).toLocaleString("en-GB")} · BEM Solutions CRM</p>

  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    ${card("Pipeline projects", String(pipe.total), "Active technical queue", "#EFF6FF")}
    ${card("Completion rate", `${sum.completionRate}%`, `${sum.completedAssignments}/${sum.totalAssignments} assignments`, "#ECFDF5")}
    ${card("Overdue", String(sum.overdueAssignments), "Needs follow-up", "#EAF2FE")}
    ${card("Revisions queue", String(report.revisionsCount), "Admin-sent revisions", "#F5F3FF")}
  </tr></table>

  <h2>Pipeline breakdown</h2>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${pipeBars}</table>

  <h2>Live workload summary</h2>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr style="background:${NAVY};color:#fff;">
      <td style="padding:6px 8px;font-size:10px;">Metric</td>
      <td style="padding:6px 8px;font-size:10px;text-align:right;">Value</td>
    </tr>
    <tr><td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;">Timers running</td><td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;text-align:right;">${sum.timersRunning}</td></tr>
    <tr><td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;">Logged hours</td><td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;text-align:right;">${formatLoggedHours(sum.totalLoggedSeconds)}</td></tr>
    <tr><td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;">Planned man-hours</td><td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;text-align:right;">${sum.plannedManHours}h</td></tr>
    <tr><td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;">Emergency Morning</td><td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;text-align:right;">${sum.emergencyMorning}</td></tr>
    <tr><td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;">Emergency COB</td><td style="padding:5px 8px;border:1px solid #E2E8F0;font-size:10px;text-align:right;">${sum.emergencyCob}</td></tr>
  </table>

  <h2>Estimator scoreboard (live)</h2>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr style="background:${NAVY};color:#fff;">
      <td style="padding:6px 8px;font-size:10px;">Estimator</td>
      <td style="padding:6px 8px;font-size:10px;text-align:center;">Done/Assigned</td>
      <td style="padding:6px 8px;font-size:10px;text-align:center;">Overdue</td>
      <td style="padding:6px 8px;font-size:10px;text-align:center;">Score</td>
    </tr>
    ${scoreRows || `<tr><td colspan="4" style="padding:10px;text-align:center;color:#94A3B8;font-size:10px;">No scoreboard data</td></tr>`}
  </table>

  <h2>Monthly KPI evaluation — ${label}</h2>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr style="background:${NAVY};color:#fff;">
      <td style="padding:6px 8px;font-size:10px;">Estimator</td>
      <td style="padding:6px 8px;font-size:10px;text-align:center;">Delivered</td>
      <td style="padding:6px 8px;font-size:10px;text-align:center;">Retained</td>
      <td style="padding:6px 8px;font-size:10px;text-align:center;">Marks/10</td>
      <td style="padding:6px 8px;font-size:10px;text-align:center;">Stars</td>
      <td style="padding:6px 8px;font-size:10px;">Remarks</td>
    </tr>
    ${kpiRows || `<tr><td colspan="6" style="padding:10px;text-align:center;color:#94A3B8;font-size:10px;">No KPI auto data for this month</td></tr>`}
  </table>

  <p style="margin-top:24px;font-size:9px;color:#94A3B8;">Auto-generated from CRM timers, assignments, check-in sessions & KPI rules. Editable entries on KPI Dashboard override on save.</p>
</body></html>`;
}

export function downloadTechnicalWordReport(report: TechnicalMonthlyReport): void {
  const html = buildTechnicalWordHtml(report);
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const fileName = `Technical-Report-${report.month}.doc`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function pipelineChartData(kpi: TechnicalKpiPayload) {
  return [
    { name: "Unassigned", value: kpi.pipeline.notAssigned, fill: "#D97706" },
    { name: "Assigned", value: kpi.pipeline.assigned, fill: "#0B84F3" },
    { name: "Takeoff done", value: kpi.pipeline.takeoffDone, fill: "#059669" },
    { name: "Pricing", value: kpi.pipeline.pricing, fill: "#7C3AED" },
    { name: "Final", value: kpi.pipeline.finalSubmission, fill: "#0F172A" },
  ].filter((d) => d.value > 0);
}

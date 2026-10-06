import prisma from "../config/db";
import { buildProjectLeadWhere, isDisplayableProjectLead } from "./projectLeads";
import { isRetainedSecondProjectCode, projectCodeSeqOf } from "./nextProjectCode";
import {
  assignmentElapsedSeconds,
  listTechnicalEstimators,
  parseTechnicalAssignments,
} from "./technicalEstimators";
import {
  ESTIMATOR_KPI_FIELD_KEYS,
  isEstimatorKpiFieldKey,
  monthBounds,
  type EstimatorKpiFieldKey,
} from "./technicalKpiRecords";
import { CSR_REPORT_TIMEZONE, formatDurationMs } from "./estTime";

export type EstimatorKpiAutoField = {
  fieldKey: EstimatorKpiFieldKey;
  value: string;
  note: string;
  /** Fields that cannot be auto-derived stay null */
  auto: boolean;
};

export type EstimatorKpiAutoRow = {
  estimatorId: string;
  name: string;
  code: string;
  fields: EstimatorKpiAutoField[];
  deliveredByDate?: { date: string; count: number }[];
};

function ymdFromUnknown(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function formatShortEst(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CSR_REPORT_TIMEZONE,
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

function formatDayKeyEst(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CSR_REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function hoursLabel(seconds: number): string {
  const h = Math.max(0, seconds) / 3600;
  if (h < 10) return `${h.toFixed(1)}h`;
  return `${Math.round(h * 10) / 10}h`;
}

function parseManHours(raw: string): number {
  const n = Number(String(raw ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function assignmentOverdue(deadline: string, takeoffDone: boolean, todayYmd: string): boolean {
  if (takeoffDone || !deadline) return false;
  return deadline < todayYmd;
}

function leadTouchesMonth(
  lead: { technicalReceivedAt?: Date | null; updatedAt: Date },
  bounds: { from: Date; to: Date },
): boolean {
  const received = lead.technicalReceivedAt ?? lead.updatedAt;
  if (received >= bounds.from && received < bounds.to) return true;
  return lead.updatedAt >= bounds.from && lead.updatedAt < bounds.to;
}

function clientLabel(lead: {
  name?: string | null;
  company?: string | null;
  clientCode?: string | null;
  projectCode?: string | null;
}): string {
  return (
    lead.company?.trim() ||
    lead.name?.trim() ||
    lead.clientCode?.trim() ||
    lead.projectCode?.trim() ||
    "Client"
  );
}

/** Auto marks / stars / remarks from monthly estimator stats. */
function deriveReviewFields(
  acc: {
    assigned: number;
    delivered: number;
    pending: number;
    overdue: number;
    loggedSeconds: number;
    plannedHours: number;
    retainedProjects: number;
  },
  checkInDays: number,
  month: string,
): {
  marks: string;
  stars: string;
  remarks: string;
  queryMistakes: string;
  hasData: boolean;
} {
  const hasData = acc.assigned > 0 || checkInDays > 0 || acc.loggedSeconds > 0;
  if (!hasData) {
    return { marks: "", stars: "", remarks: "", queryMistakes: "", hasData: false };
  }

  const completionRate = acc.assigned > 0 ? acc.delivered / acc.assigned : 0;
  const punctualityRate = acc.assigned > 0 ? (acc.assigned - acc.overdue) / acc.assigned : 1;
  const loggedHours = acc.loggedSeconds / 3600;
  const activity =
    acc.plannedHours > 0
      ? Math.min(1, loggedHours / acc.plannedHours)
      : Math.min(1, loggedHours / 40);
  const attendance = checkInDays > 0 ? Math.min(1, checkInDays / 22) : 0;
  const retainedBonus = Math.min(1, acc.retainedProjects * 0.25);

  let marks =
    completionRate * 3.5 +
    punctualityRate * 2.5 +
    activity * 2 +
    attendance * 1 +
    retainedBonus * 1;
  marks = Math.max(0, Math.min(10, Math.round(marks * 10) / 10));

  const stars = marks <= 0 ? 1 : Math.min(5, Math.max(1, Math.round(marks / 2)));

  const tone =
    marks >= 8
      ? "Strong month"
      : marks >= 6
        ? "Solid performance"
        : marks >= 4
          ? "Needs improvement"
          : "Below target";

  const bits: string[] = [];
  if (acc.delivered > 0) bits.push(`${acc.delivered} takeoff(s) completed`);
  if (acc.retainedProjects > 0) bits.push(`${acc.retainedProjects} retained client project(s)`);
  if (acc.overdue > 0) bits.push(`${acc.overdue} overdue item(s)`);
  else if (acc.pending > 0) bits.push(`${acc.pending} pending`);
  if (checkInDays > 0) bits.push(`${checkInDays} check-in day(s)`);
  if (loggedHours > 0) bits.push(`${hoursLabel(acc.loggedSeconds)} logged`);

  const remarks = `${tone} (${month}). ${bits.length ? bits.join(" · ") : "Limited activity this month"}.`;

  return {
    marks: String(marks),
    stars: String(stars),
    remarks,
    queryMistakes: String(acc.overdue),
    hasData: true,
  };
}

/** Auto-computed KPI suggestions for the selected month (still editable when saved). */
export async function buildEstimatorKpiAuto(month: string): Promise<{
  month: string;
  generatedAt: string;
  estimators: EstimatorKpiAutoRow[];
}> {
  const bounds = monthBounds(month);
  if (!bounds) {
    return { month, generatedAt: new Date().toISOString(), estimators: [] };
  }

  const now = Date.now();
  const todayYmd = new Date().toISOString().split("T")[0] ?? "";

  const [roster, rawLeads, sessions] = await Promise.all([
    listTechnicalEstimators(),
    prisma.lead.findMany({
      where: buildProjectLeadWhere(),
      select: {
        id: true,
        name: true,
        company: true,
        phone: true,
        status: true,
        projectTitle: true,
        projectCode: true,
        clientCode: true,
        projectPhase: true,
        projectDeadline: true,
        projectWorkStatus: true,
        interestedService: true,
        trade: true,
        technicalAssignments: true,
        technicalReceivedAt: true,
        hiddenOnTechnical: true,
        inBin: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 2000,
    }),
    prisma.csrWorkSession.findMany({
      where: {
        loginAt: { gte: bounds.from, lt: bounds.to },
        user: { role: "estimator" },
      },
      select: {
        userId: true,
        loginAt: true,
        logoutAt: true,
        dashboardMs: true,
        awayMs: true,
      },
      orderBy: { loginAt: "asc" },
      take: 5000,
    }),
  ]);

  const allProjects = rawLeads.filter(isDisplayableProjectLead);
  const leads = allProjects
    .filter((l) => (l as { hiddenOnTechnical?: boolean | null }).hiddenOnTechnical !== true)
    .filter((l) => leadTouchesMonth(l, bounds));

  const byBaseSeq = new Map<string, typeof allProjects>();
  for (const p of allProjects) {
    const parsed = projectCodeSeqOf(p);
    if (!parsed) continue;
    const key = `${parsed.base.toLowerCase()}::${parsed.seq}`;
    const list = byBaseSeq.get(key) ?? [];
    list.push(p);
    byBaseSeq.set(key, list);
  }

  type Acc = {
    id: string;
    name: string;
    code: string;
    delivered: number;
    pending: number;
    assigned: number;
    overdue: number;
    onTimeDone: number;
    doneWithDeadline: number;
    loggedSeconds: number;
    plannedHours: number;
    trades: Set<string>;
    projectLines: string[];
    timerHoursSamples: number[];
    retainedProjects: number;
    retainedLines: string[];
    evalMarks: number[];
    evalRemarkLines: string[];
    deliveredDates: string[];
  };

  const byId = new Map<string, Acc>();
  for (const e of roster) {
    byId.set(e.id, {
      id: e.id,
      name: e.name,
      code: e.code,
      delivered: 0,
      pending: 0,
      assigned: 0,
      overdue: 0,
      onTimeDone: 0,
      doneWithDeadline: 0,
      loggedSeconds: 0,
      plannedHours: 0,
      trades: new Set(),
      projectLines: [],
      timerHoursSamples: [],
      retainedProjects: 0,
      retainedLines: [],
      evalMarks: [],
      evalRemarkLines: [],
      deliveredDates: [],
    });
  }

  const ensure = (estimatorId: string, estimatorName: string): Acc => {
    const existing = byId.get(estimatorId);
    if (existing) return existing;
    const byName = [...byId.values()].find(
      (m) => m.name.trim().toLowerCase() === estimatorName.trim().toLowerCase(),
    );
    if (byName) return byName;
    const created: Acc = {
      id: estimatorId,
      name: estimatorName,
      code: "—",
      delivered: 0,
      pending: 0,
      assigned: 0,
      overdue: 0,
      onTimeDone: 0,
      doneWithDeadline: 0,
      loggedSeconds: 0,
      plannedHours: 0,
      trades: new Set(),
      projectLines: [],
      timerHoursSamples: [],
      retainedProjects: 0,
      retainedLines: [],
      evalMarks: [],
      evalRemarkLines: [],
      deliveredDates: [],
    };
    byId.set(estimatorId, created);
    return created;
  };

  for (const lead of leads) {
    const assignments = parseTechnicalAssignments(lead.technicalAssignments);
    if (assignments.length === 0) continue;
    const code = (lead.projectCode ?? lead.clientCode ?? "").trim() || "—";
    const title = (lead.projectTitle ?? "").trim() || "Untitled";
    const tradeBits = [
      ...(lead.interestedService ? [lead.interestedService] : []),
      ...(lead.trade ? [lead.trade] : []),
    ];

    for (const a of assignments) {
      const acc = ensure(a.estimatorId, a.estimatorName);
      const logged = assignmentElapsedSeconds(a, now);
      acc.assigned += 1;
      acc.loggedSeconds += logged;
      acc.plannedHours += parseManHours(a.manHours);
      for (const t of tradeBits) if (t.trim()) acc.trades.add(t.trim());
      for (const s of a.scopes) if (s.trim()) acc.trades.add(s.trim());

      if (a.takeoffDone) {
        acc.delivered += 1;
        acc.deliveredDates.push(
          ymdFromUnknown(a.evaluatedAt) ||
            ymdFromUnknown(lead.updatedAt) ||
            bounds.from.toISOString().slice(0, 10),
        );
        if (logged > 0) acc.timerHoursSamples.push(logged / 3600);
        if (a.deadline) {
          acc.doneWithDeadline += 1;
          acc.onTimeDone += 1;
        }
      } else {
        acc.pending += 1;
        if (assignmentOverdue(a.deadline, false, todayYmd)) acc.overdue += 1;
      }

      if (a.evaluationMarks != null && Number.isFinite(a.evaluationMarks)) {
        acc.evalMarks.push(a.evaluationMarks);
        const remark = (a.evaluationRemarks ?? "").trim();
        const when = a.evaluatedAt
          ? new Date(a.evaluatedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
          : "";
        acc.evalRemarkLines.push(
          `${code} ${title}: ${a.evaluationMarks}/10${remark ? ` — ${remark}` : ""}${when ? ` (${when})` : ""}`,
        );
      }

      if (logged > 0 || a.takeoffDone || !a.takeoffDone) {
        const status = a.takeoffDone ? "done" : assignmentOverdue(a.deadline, false, todayYmd) ? "overdue" : "pending";
        acc.projectLines.push(
          `${code} ${title}: ${hoursLabel(logged)}${a.manHours ? ` / ${a.manHours}h planned` : ""} (${status})`,
        );
      }
    }
  }

  for (const lead of leads) {
    const secondAssignments = parseTechnicalAssignments(lead.technicalAssignments);
    if (secondAssignments.length === 0) continue;
    if (!isRetainedSecondProjectCode(lead)) continue;
    const parsed = projectCodeSeqOf(lead);
    if (!parsed) continue;
    const firsts = byBaseSeq.get(`${parsed.base.toLowerCase()}::1`) ?? [];
    const first = firsts.find((p) => p.id !== lead.id) ?? firsts[0];
    if (!first) continue;
    const firstAssignments = parseTechnicalAssignments(first.technicalAssignments);
    if (firstAssignments.length === 0) continue;
    const firstDelivered =
      firstAssignments.some((a) => a.takeoffDone) ||
      String(first.projectWorkStatus ?? "").toLowerCase() === "completed" ||
      String(first.status ?? "").toLowerCase() === "completed";
    if (!firstDelivered) continue;

    const retainedLabel = clientLabel(lead);
    const code = (lead.projectCode ?? lead.clientCode ?? "").trim() || "—";
    const title = (lead.projectTitle ?? "").trim() || "Untitled";
    const credited = new Set<string>();
    for (const a of firstAssignments) {
      if (!a.estimatorId || credited.has(a.estimatorId)) continue;
      credited.add(a.estimatorId);
      const acc = ensure(a.estimatorId, a.estimatorName);
      acc.retainedProjects += 1;
      acc.retainedLines.push(`${retainedLabel} · ${code} ${title} (from ${parsed.base}-01)`);
    }
  }

  const sessionsByUser = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const list = sessionsByUser.get(s.userId) ?? [];
    list.push(s);
    sessionsByUser.set(s.userId, list);
  }

  const estimators: EstimatorKpiAutoRow[] = [...byId.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((acc) => {
      const userSessions = sessionsByUser.get(acc.id) ?? [];
      const dayLines: string[] = [];
      let checkInDays = 0;
      let totalDash = 0;
      for (const s of userSessions) {
        checkInDays += 1;
        const end = s.logoutAt ?? new Date();
        const wall = Math.max(0, end.getTime() - s.loginAt.getTime());
        const tracked = Math.max(0, (s.dashboardMs ?? 0) + (s.awayMs ?? 0));
        const totalMs = tracked > 0 ? Math.min(tracked, wall || tracked) : wall;
        totalDash += s.dashboardMs ?? 0;
        const day = formatDayKeyEst(s.loginAt);
        const inLabel = formatShortEst(s.loginAt);
        const outLabel = s.logoutAt ? formatShortEst(s.logoutAt) : "Still checked in";
        dayLines.push(
          `${day}: In ${inLabel} · Out ${outLabel} · ${formatDurationMs(totalMs)} (dash ${formatDurationMs(s.dashboardMs ?? 0)})`,
        );
      }

      const punctuality =
        acc.assigned > 0
          ? `${Math.round(((acc.assigned - acc.overdue) / acc.assigned) * 100)}% on track (${acc.overdue} overdue / ${acc.pending} pending)`
          : "No assignments";

      const avgTakeoff =
        acc.timerHoursSamples.length > 0
          ? `${(acc.timerHoursSamples.reduce((s, n) => s + n, 0) / acc.timerHoursSamples.length).toFixed(1)}h avg timer on completed`
          : acc.delivered > 0
            ? `${acc.delivered} completed (no timer samples)`
            : "No completed takeoffs";
      void avgTakeoff;

      const loggedHours = acc.loggedSeconds / 3600;
      let productivityPct = 0;
      if (acc.plannedHours > 0) {
        productivityPct = (loggedHours / acc.plannedHours) * 100;
      } else if (acc.assigned > 0) {
        productivityPct = (acc.delivered / acc.assigned) * 100;
      }
      productivityPct = Math.max(0, Math.min(200, Math.round(productivityPct)));
      const productivity = `${productivityPct}`;

      const evalAvg =
        acc.evalMarks.length > 0
          ? Math.round((acc.evalMarks.reduce((s, n) => s + n, 0) / acc.evalMarks.length) * 10) / 10
          : null;
      const evalStars =
        evalAvg == null ? "" : String(evalAvg <= 0 ? 1 : Math.min(5, Math.max(1, Math.round(evalAvg / 2))));
      const evalRemarks =
        acc.evalRemarkLines.length > 0
          ? `Avg ${evalAvg}/10 from ${acc.evalMarks.length} project(s)\n${acc.evalRemarkLines.slice(0, 40).join("\n")}`
          : "";

      const projectTime =
        acc.projectLines.length > 0
          ? acc.projectLines.slice(0, 40).join("\n")
          : "No project timer data";

      const checkInOut =
        dayLines.length > 0
          ? `${checkInDays} day(s)\n${dayLines.join("\n")}`
          : "No check-in sessions this month";

      const trades =
        acc.trades.size > 0 ? [...acc.trades].sort((a, b) => a.localeCompare(b)).join(", ") : "No trades/scopes yet";

      const review = deriveReviewFields(acc, checkInDays, month);

      const fieldMap: Partial<Record<EstimatorKpiFieldKey, { value: string; note: string; auto: boolean }>> = {
        projects_delivered: {
          value: String(acc.delivered),
          note: `Auto: completed takeoffs this month (${month})`,
          auto: true,
        },
        productivity: {
          value: acc.assigned > 0 || acc.loggedSeconds > 0 ? productivity : "",
          note: `Auto: ${hoursLabel(acc.loggedSeconds)} logged / ${acc.plannedHours || 0}h planned · ${acc.delivered}/${acc.assigned} done (${month})`,
          auto: true,
        },
        project_time_spent: {
          value: projectTime,
          note: `Auto: per-project timer logged vs planned (${month})`,
          auto: true,
        },
        checkin_checkout: {
          value: checkInOut,
          note: "Auto: daily estimator check-in / check-out (EST)",
          auto: true,
        },
        punctuality: {
          value: punctuality,
          note: `Auto: pending overdue vs assigned (${month})`,
          auto: true,
        },
        trades_history: {
          value: trades,
          note: `Auto: scopes / trades from assigned projects (${month})`,
          auto: true,
        },
        retained_clients: {
          value: acc.retainedProjects > 0 ? String(acc.retainedProjects) : "",
          note:
            acc.retainedLines.length > 0
              ? `Auto: -01 → -02 retained this month — ${acc.retainedLines.slice(0, 12).join("; ")}`
              : `Auto: retained only when project code goes -01 → -02 and the second job is assigned (${month})`,
          auto: true,
        },
        team_query_mistakes: {
          value: review.queryMistakes,
          note: `Auto: overdue assignments / follow-ups needing attention (${month})`,
          auto: review.hasData,
        },
        final_remarks: {
          value: evalRemarks || review.remarks,
          note: evalRemarks
            ? `Auto: project-wise evaluation remarks this month (${month})`
            : `Auto: monthly performance summary (${month})`,
          auto: !!evalRemarks || review.hasData,
        },
        marks_out_of_10: {
          value: evalAvg != null ? String(evalAvg) : "",
          note: evalAvg != null
            ? `Auto: average of ${acc.evalMarks.length} Take Off Done evaluation(s) (${month})`
            : `No project evaluations this month (${month})`,
          auto: evalAvg != null,
        },
        rating_stars: {
          value: evalStars,
          note: evalAvg != null
            ? `Auto: rating derived from evaluation average ${evalAvg}/10 (${month})`
            : `No project evaluations this month (${month})`,
          auto: !!evalStars,
        },
      };

      const fields: EstimatorKpiAutoField[] = ESTIMATOR_KPI_FIELD_KEYS.map((key) => {
        const f = fieldMap[key] ?? { value: "", note: "Manual", auto: false };
        return { fieldKey: key, value: f.value, note: f.note, auto: f.auto && !!f.value.trim() };
      });

      const countByDate = new Map<string, number>();
      for (const day of acc.deliveredDates) {
        countByDate.set(day, (countByDate.get(day) ?? 0) + 1);
      }
      const deliveredByDate = [...countByDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));

      return {
        estimatorId: acc.id,
        name: acc.name,
        code: acc.code,
        fields,
        deliveredByDate,
      };
    });

  return {
    month,
    generatedAt: new Date().toISOString(),
    estimators,
  };
}

export function autoFieldsForEstimator(
  snapshot: Awaited<ReturnType<typeof buildEstimatorKpiAuto>>,
  estimatorId: string,
): EstimatorKpiAutoField[] {
  const row = snapshot.estimators.find((e) => e.estimatorId === estimatorId);
  return (row?.fields ?? []).filter((f) => f.auto && f.value.trim());
}

export { isEstimatorKpiFieldKey };

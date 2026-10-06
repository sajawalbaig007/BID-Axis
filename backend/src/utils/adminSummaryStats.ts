import type { Prisma } from "@prisma/client";
import prisma from "../config/db";
import { buildBinWhere, buildNotBinWhere } from "./binLeads";
import {
  adminClientBucket,
  buildAdminClientListWhere,
  importantOnlyWhere,
  isImportantStatusWhere,
  isInterestedStatusWhere,
  scheduledCallWhere,
  uniqueLeadsByPhone,
  uniqueClosedLeadsByClientCode,
  type AdminClientBucket,
} from "./adminClientQueries";
import {
  addDaysToYmd,
  businessChartSinceUtc,
  businessDayStartUtc,
  businessHourBucketKey,
  currentBusinessYmd,
  fmtMonthShortFromYmd,
  fmtShortDateFromYmd,
  fmtWeekDayFromYmd,
  getBusinessYmd,
  initBusinessHourBuckets,
  isSameBusinessDay,
} from "./businessCalendar";

const CHART_DAYS = 45;
const LOG_BATCH = 2000;

export type ChartSeriesPoint = { label: string; calls: number };
export type ChartSeries = {
  today: ChartSeriesPoint[];
  week: ChartSeriesPoint[];
  month: ChartSeriesPoint[];
  year: ChartSeriesPoint[];
};

function initChartBuckets(now = new Date()): {
  today: Record<string, number>;
  week: Record<string, number>;
  month: Record<string, number>;
  year: Record<string, number>;
  weekKeys: string[];
  monthKeys: string[];
  yearKeys: string[];
  currentBizYmd: string;
} {
  const currentBizYmd = currentBusinessYmd(now);
  const today = initBusinessHourBuckets();
  const week: Record<string, number> = {};
  const month: Record<string, number> = {};
  const year: Record<string, number> = {};
  const weekKeys: string[] = [];
  const monthKeys: string[] = [];
  const yearKeys: string[] = [];

  for (let d = 6; d >= 0; d--) {
    const ymd = addDaysToYmd(currentBizYmd, -d);
    weekKeys.push(ymd);
    week[ymd] = 0;
  }

  for (let d = 28; d >= 0; d -= 7) {
    const ymd = addDaysToYmd(currentBizYmd, -d);
    monthKeys.push(ymd);
    month[ymd] = 0;
  }

  const seenMonths = new Set<string>();
  for (let d = 364; d >= 0; d -= 28) {
    const ymd = addDaysToYmd(currentBizYmd, -d);
    const monthLabel = fmtMonthShortFromYmd(ymd);
    if (seenMonths.has(monthLabel)) continue;
    seenMonths.add(monthLabel);
    yearKeys.push(ymd);
    year[ymd] = 0;
  }

  return { today, week, month, year, weekKeys, monthKeys, yearKeys, currentBizYmd };
}

function pickMonthBucketKey(bizYmd: string, monthKeys: string[]): string | null {
  if (monthKeys.length === 0) return null;
  let chosen = monthKeys[0]!;
  for (const key of monthKeys) {
    if (key <= bizYmd) chosen = key;
  }
  return chosen;
}

function pickYearBucketKey(bizYmd: string, yearKeys: string[]): string | null {
  if (yearKeys.length === 0) return null;
  const month = fmtMonthShortFromYmd(bizYmd);
  return yearKeys.find(k => fmtMonthShortFromYmd(k) === month) ?? null;
}

function bumpChartBuckets(
  buckets: ReturnType<typeof initChartBuckets>,
  createdAt: Date,
  now: Date,
) {
  const bizYmd = getBusinessYmd(createdAt);

  if (isSameBusinessDay(createdAt, now)) {
    const hourKey = businessHourBucketKey(createdAt);
    if (hourKey in buckets.today) buckets.today[hourKey]++;
  }

  if (bizYmd in buckets.week) buckets.week[bizYmd]++;

  const monthKey = pickMonthBucketKey(bizYmd, buckets.monthKeys);
  if (monthKey && monthKey in buckets.month) buckets.month[monthKey]++;

  const yearKey = pickYearBucketKey(bizYmd, buckets.yearKeys);
  if (yearKey && yearKey in buckets.year) buckets.year[yearKey]++;
}

function bucketsToSeries(buckets: ReturnType<typeof initChartBuckets>): ChartSeries {
  const toPoints = (map: Record<string, number>, labels: Record<string, string>): ChartSeriesPoint[] =>
    Object.keys(map).map(key => ({ label: labels[key] ?? key, calls: map[key] ?? 0 }));

  const weekLabels = Object.fromEntries(
    buckets.weekKeys.map(k => [k, fmtWeekDayFromYmd(k)]),
  );
  const monthLabels = Object.fromEntries(
    buckets.monthKeys.map(k => [k, fmtShortDateFromYmd(k)]),
  );
  const yearLabels = Object.fromEntries(
    buckets.yearKeys.map(k => [k, fmtMonthShortFromYmd(k)]),
  );

  return {
    today: Object.entries(buckets.today).map(([label, calls]) => ({ label, calls })),
    week:  toPoints(buckets.week, weekLabels),
    month: toPoints(buckets.month, monthLabels),
    year:  toPoints(buckets.year, yearLabels),
  };
}

/** Call activity charts — full CallLog scan in batches (no 5k cap). */
export async function fetchChartSeries(since: Date): Promise<ChartSeries> {
  const now = new Date();
  const buckets = initChartBuckets(now);
  let skip = 0;

  for (;;) {
    const batch = await prisma.callLog.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take: LOG_BATCH,
    });

    if (batch.length === 0) break;

    for (const row of batch) bumpChartBuckets(buckets, row.createdAt, now);
    skip += batch.length;
    if (batch.length < LOG_BATCH) break;
  }

  return bucketsToSeries(buckets);
}

const legacyCompletedWhere: Prisma.LeadWhereInput = {
  status: { in: ["completed", "closed"], mode: "insensitive" },
};

const closeClientOnlyWhere: Prisma.LeadWhereInput = {
  status: { equals: "Close Client", mode: "insensitive" },
};

const pendingWhere: Prisma.LeadWhereInput = {
  status: { equals: "pending", mode: "insensitive" },
};

const performerResolvedWhere: Prisma.LeadWhereInput = {
  OR: [
    closeClientOnlyWhere,
    isInterestedStatusWhere(),
    isImportantStatusWhere(),
  ],
};

const wonWhere: Prisma.LeadWhereInput = {
  OR: [closeClientOnlyWhere, legacyCompletedWhere],
};

function andWhere(...parts: Prisma.LeadWhereInput[]): Prisma.LeadWhereInput {
  return { AND: parts };
}

function notBinAnd(...parts: Prisma.LeadWhereInput[]): Prisma.LeadWhereInput {
  return andWhere(buildNotBinWhere(), ...parts);
}

/** Mutually exclusive pipeline buckets (priority: won → interested → schedule → important → pending → other); bin counted separately. */
async function countExclusivePipeline() {
  const binWhere = buildBinWhere();
  const notBin = buildNotBinWhere();

  const [
    totalLeads,
    inBin,
    projectWon,
    interested,
    scheduled,
    importantOnly,
    pending,
    activeNotBin,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: binWhere }),
    prisma.lead.count({ where: notBinAnd(wonWhere) }),
    prisma.lead.count({
      where: notBinAnd(isInterestedStatusWhere(), { NOT: wonWhere }),
    }),
    prisma.lead.count({
      where: notBinAnd(
        scheduledCallWhere(),
        { NOT: wonWhere },
        { NOT: isInterestedStatusWhere() },
      ),
    }),
    prisma.lead.count({
      where: notBinAnd(
        importantOnlyWhere(),
        { NOT: wonWhere },
        { NOT: isInterestedStatusWhere() },
        { NOT: scheduledCallWhere() },
      ),
    }),
    prisma.lead.count({
      where: notBinAnd(
        pendingWhere,
        { NOT: wonWhere },
        { NOT: isInterestedStatusWhere() },
        { NOT: scheduledCallWhere() },
        { NOT: importantOnlyWhere() },
      ),
    }),
    prisma.lead.count({ where: notBin }),
  ]);

  const categorizedActive = projectWon + interested + scheduled + importantOnly + pending;
  const other = Math.max(0, activeNotBin - categorizedActive);

  return {
    totalLeads,
    inBin,
    projectWon,
    interested,
    scheduled,
    importantOnly,
    pending,
    other,
    legacyCompleted: await prisma.lead.count({
      where: notBinAnd(legacyCompletedWhere, { NOT: closeClientOnlyWhere }),
    }),
  };
}

function performerRate(resolved: number, total: number): number {
  if (total <= 0 || resolved <= 0) return 0;
  const pct = (resolved / total) * 100;
  if (pct < 1) return Math.round(pct * 100) / 100;
  return Math.round(pct * 10) / 10;
}

export async function buildAdminTabCountsPayload(filters?: {
  search?: string;
  state?: string;
  phonePrefix?: string;
  areaCodes?: string[];
  scheduleDate?: string;
  csrName?: string;
  csrId?: string;
}) {
  const extras = {
    state: filters?.state,
    phonePrefix: filters?.phonePrefix,
    areaCodes: filters?.areaCodes,
    csrId: filters?.csrId,
  };
  const search = filters?.search;
  const scheduleDate = filters?.scheduleDate;
  const csrName = filters?.csrName;

  /* Same uniqueness as /admin/clients table: phone for pipeline tabs, client-code family for Closed / All */
  const rows = await prisma.lead.findMany({
    where: buildAdminClientListWhere("all", csrName, search, undefined, extras),
    select: {
      id: true,
      phone: true,
      email: true,
      company: true,
      clientCode: true,
      projectCode: true,
      status: true,
      nextSchedule: true,
    },
  });

  const buckets: Record<AdminClientBucket, typeof rows> = {
    important: [],
    schedule: [],
    interested: [],
    closed: [],
  };
  for (const row of rows) {
    const bucket = adminClientBucket(row.status, row.nextSchedule);
    if (bucket) buckets[bucket].push(row);
  }
  if (scheduleDate) {
    buckets.schedule = buckets.schedule.filter(l => l.nextSchedule === scheduleDate);
  }

  return {
    success: true,
    tabCounts: {
      all: uniqueLeadsByPhone(rows).length,
      important: uniqueLeadsByPhone(buckets.important).length,
      schedule: uniqueLeadsByPhone(buckets.schedule).length,
      interested: uniqueLeadsByPhone(buckets.interested).length,
      closed: uniqueClosedLeadsByClientCode(buckets.closed).length,
    },
  };
}

/** Closed leads only — dashboard used to load every lead just to unique-count Close Client. */
async function countUniqueClosedForSummary(): Promise<number | null> {
  try {
    const rows = await prisma.lead.findMany({
      where: buildAdminClientListWhere("closed"),
      select: {
        id: true,
        phone: true,
        email: true,
        company: true,
        clientCode: true,
        projectCode: true,
        status: true,
        nextSchedule: true,
      },
    });
    return uniqueClosedLeadsByClientCode(rows).length;
  } catch (err) {
    console.log("[admin summary] unique closed count failed", err);
    return null;
  }
}

export async function buildAdminClientSummaryPayload() {
  const chartSince = businessChartSinceUtc(CHART_DAYS);

  const pipelinePromise = countExclusivePipeline();
  const notBin = buildNotBinWhere();

  const todayYmd = currentBusinessYmd();
  const todayStart = businessDayStartUtc(todayYmd);
  const tomorrowStart = businessDayStartUtc(addDaysToYmd(todayYmd, 1));

  const [
    pipeline,
    uniqueClosedCount,
    todayCompletedCalls,
    totalCompletedCalls,
    recent,
    recentStatusLogs,
    chartSeries,
    csrGroups,
    resolvedGroups,
    onlineCSRs,
    totalOnline,
  ] = await Promise.all([
    pipelinePromise,
    countUniqueClosedForSummary(),
    prisma.callLog.count({
      where: { createdAt: { gte: todayStart, lt: tomorrowStart } },
    }),
    /** All-time CSR status updates (same source as Reports “Completed”) */
    prisma.callLog.count(),
    prisma.lead.findMany({
      select: {
        id: true,
        name: true,
        company: true,
        status: true,
        updatedAt: true,
        csr: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 15,
    }),
    prisma.callLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        createdAt: true,
        lead: { select: { name: true, company: true } },
        csr: { select: { name: true } },
      },
    }),
    fetchChartSeries(chartSince),
    prisma.lead.groupBy({
      by: ["assignedTo"],
      where: { assignedTo: { not: "" }, ...notBin },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["assignedTo"],
      where: {
        assignedTo: { not: "" },
        ...notBin,
        ...performerResolvedWhere,
      },
      _count: { _all: true },
    }),
    prisma.user.count({ where: { role: "csr", isOnline: true } }),
    prisma.user.count({ where: { isOnline: true } }),
  ]);

  const csrIds = [...new Set([
    ...csrGroups.map(g => g.assignedTo),
    ...resolvedGroups.map(g => g.assignedTo),
  ])].filter((id): id is string => typeof id === "string" && id.length > 0);

  const csrUsers = csrIds.length
    ? await prisma.user.findMany({
        where: { id: { in: csrIds }, role: "csr", isActive: true },
        select: { id: true, name: true },
      })
    : [];

  const csrNameById = new Map(csrUsers.map(u => [u.id, u.name]));
  const totalMap = new Map(
    csrGroups
      .filter(g => csrNameById.has(g.assignedTo))
      .map(g => [g.assignedTo, g._count._all]),
  );
  const resolvedMap = new Map(resolvedGroups.map(g => [g.assignedTo, g._count._all]));

  const performers = [...totalMap.entries()]
    .map(([id, total]) => {
      const resolved = resolvedMap.get(id) ?? 0;
      const name = csrNameById.get(id) ?? "Unknown CSR";
      return { name, resolved, total, rate: performerRate(resolved, total) };
    })
    .filter(p => p.total > 0)
    .sort((a, b) => b.resolved - a.resolved || b.rate - a.rate)
    .slice(0, 5);

  const {
    totalLeads,
    pending,
    interested,
    importantOnly,
    scheduled,
    other,
    inBin,
    legacyCompleted,
  } = pipeline;
  const uniqueClosed = uniqueClosedCount ?? pipeline.projectWon;
  const tabCounts = { closed: uniqueClosed };

  const distribution: Record<string, number> = {
    Pending: pending,
    Important: importantOnly,
    Schedule: scheduled,
    Interested: interested,
    "Close Client": uniqueClosed,
  };
  if (legacyCompleted > 0) distribution.Completed = legacyCompleted;
  if (other > 0) distribution.Other = other;
  if (inBin > 0) distribution["In Bin"] = inBin;

  return {
    success: true,
    stats: {
      totalLeads,
      pending,
      important: importantOnly,
      importantOnly,
      scheduled,
      interested,
      projectWon: uniqueClosed,
      /** All-time CallLog rows = every CSR status update */
      completed: totalCompletedCalls,
      closed: uniqueClosed,
      todayCompletedCalls,
      other,
      inBin,
      onlineCSRs,
      totalOnline,
    },
    tabCounts,
    distribution,
    recent,
    recentStatus: recentStatusLogs.map(log => ({
      id: log.id,
      status: log.status,
      createdAt: log.createdAt,
      leadName: log.lead?.name?.trim() || log.lead?.company?.trim() || "Lead",
      csrName: log.csr?.name ?? "Unknown CSR",
    })),
    chartSeries,
    businessDay: {
      timezone: process.env.BUSINESS_TIMEZONE?.trim() || "America/New_York",
      startHour: Number(process.env.BUSINESS_DAY_START_HOUR ?? 4),
      currentBusinessDate: currentBusinessYmd(),
    },
    performers,
  };
}

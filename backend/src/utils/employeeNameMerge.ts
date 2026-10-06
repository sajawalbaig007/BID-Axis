import prisma from "../config/db";
import { pfNormName } from "./pfNameAlias";

/** Accounts names typed before Admin Users full names (through July 2026). */
export const LEGACY_EMPLOYEE_FROM = "2026-03-01";
export const LEGACY_EMPLOYEE_TO = "2026-07-31";

const JUNK_NAME = /^(sr#?|name|basic|allowance|overtime|deduction|remark|comment|total|loan|pf|tax|net salary|head)$/i;
const TEAMISH = /(salaries|provident fund|\bpf\b|loans?|opex|section total)$/i;

export type StoredNameMerge = {
  from: string;
  to: string;
  fromKey: string;
  toKey: string;
};

export type PreviousEmployeeRow = {
  id: string;
  previousName: string;
  previousNameKey: string;
  currentName: string | null;
  currentNameKey: string | null;
  currentStaffId: string | null;
  currentUserId: string | null;
  payrollHead: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  status: "previous" | "merged";
  pfAllTime: number;
  mergedAt: string | null;
};

function isPersonName(label: string): boolean {
  const n = label.trim();
  if (n.length < 2 || n.length > 80) return false;
  if (/^\d+([.,]\d+)?$/.test(n)) return false;
  if (JUNK_NAME.test(n)) return false;
  if (TEAMISH.test(n)) return false;
  return true;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function subLabels(node: unknown): { name: string; amount: number }[] {
  const rec = asRecord(node);
  const subs = rec?.subHeads;
  if (!Array.isArray(subs)) return [];
  return subs
    .map(s => {
      const row = asRecord(s);
      return {
        name: String(row?.label ?? "").trim(),
        amount: Number(row?.amount) || 0,
      };
    })
    .filter(s => isPersonName(s.name));
}

type HistHit = { name: string; head: string; date: string; pf: number };
type LegacyInfo = { name: string; head: string; firstSeen: string; lastSeen: string };

function collectFromIncomeData(data: unknown, date: string): HistHit[] {
  const rec = asRecord(data);
  if (!rec) return [];
  const out: HistHit[] = [];

  const teams = rec.teamSalaries;
  if (Array.isArray(teams)) {
    for (const t of teams) {
      const team = asRecord(t);
      const head = String(team?.team ?? "").trim() || "Team Salaries";
      for (const s of subLabels(t)) {
        out.push({ name: s.name, head, date, pf: 0 });
      }
    }
  }

  const pfHeads = rec.providentFundHeads;
  if (Array.isArray(pfHeads)) {
    for (const h of pfHeads) {
      const head = asRecord(h);
      const headLabel = String(head?.label ?? "").trim() || "Provident Fund";
      for (const s of subLabels(h)) {
        out.push({ name: s.name, head: headLabel, date, pf: s.amount });
      }
    }
  }

  return out;
}

export async function loadMergedNamePairs(): Promise<StoredNameMerge[]> {
  const rows = await prisma.employeeNameMerge.findMany({
    where: { status: "merged" },
  });
  return rows
    .map(r => {
      const from = String(r.previousName || "").trim();
      const to = String(r.currentName || "").trim();
      if (!from || !to) return null;
      const fromKey = r.previousNameKey || pfNormName(from);
      const toKey = r.currentNameKey || pfNormName(to);
      if (!fromKey || !toKey || fromKey === toKey) return null;
      return { from, to, fromKey, toKey };
    })
    .filter((x): x is StoredNameMerge => !!x);
}

export function resolveMergedName(
  name: string,
  pairs: StoredNameMerge[],
): { key: string; name: string } {
  const byFrom = new Map(pairs.map(p => [p.fromKey, p]));
  let key = pfNormName(name);
  let display = name.trim();
  const seen = new Set<string>();
  while (key && byFrom.has(key) && !seen.has(key)) {
    seen.add(key);
    const hit = byFrom.get(key)!;
    key = hit.toKey;
    display = hit.to;
  }
  return { key, name: display };
}

async function currentRosterNameKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  const users = await prisma.user.findMany({ select: { name: true } });
  for (const u of users) {
    const k = pfNormName(u.name);
    if (k) keys.add(k);
  }
  const staff = await prisma.staffEmployee.findMany({
    select: { name: true, userId: true },
  });
  const userIds = staff.map(s => s.userId).filter((id): id is string => !!id);
  const linked =
    userIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
  const byId = new Map(linked.map(u => [u.id, u.name]));
  for (const s of staff) {
    const live = s.userId ? byId.get(s.userId) : null;
    const k = pfNormName(live || s.name || "");
    if (k) keys.add(k);
  }
  return keys;
}

async function pfTotalsByNameKey(): Promise<Map<string, number>> {
  const recs = await prisma.accountsRecord.findMany({
    where: { page: "income_statement" },
    select: { data: true },
  });
  const totals = new Map<string, number>();
  for (const rec of recs) {
    const data = asRecord(rec.data);
    const heads = data?.providentFundHeads;
    if (!Array.isArray(heads)) continue;
    for (const h of heads) {
      for (const s of subLabels(h)) {
        const k = pfNormName(s.name);
        if (!k || !s.amount) continue;
        totals.set(k, Math.round(((totals.get(k) ?? 0) + s.amount) * 100) / 100);
      }
    }
  }
  return totals;
}

async function collectLegacyNameMap(): Promise<Map<string, LegacyInfo>> {
  const recs = await prisma.accountsRecord.findMany({
    where: {
      page: "income_statement",
      recordDate: { gte: LEGACY_EMPLOYEE_FROM, lte: LEGACY_EMPLOYEE_TO },
    },
    select: { recordDate: true, data: true },
  });

  const byKey = new Map<string, LegacyInfo>();
  for (const rec of recs) {
    for (const hit of collectFromIncomeData(rec.data, rec.recordDate)) {
      const key = pfNormName(hit.name);
      if (!key) continue;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, {
          name: hit.name,
          head: hit.head,
          firstSeen: rec.recordDate,
          lastSeen: rec.recordDate,
        });
        continue;
      }
      if (rec.recordDate < prev.firstSeen) prev.firstSeen = rec.recordDate;
      if (rec.recordDate > prev.lastSeen) prev.lastSeen = rec.recordDate;
      if (hit.name.length > prev.name.length) prev.name = hit.name;
      if (hit.head) prev.head = hit.head;
    }
  }
  return byKey;
}

/** Scan Mar–Jul income-statement names and upsert previous rows (does not un-merge). */
export async function scanPreviousEmployees(): Promise<{ upserted: number; skippedCurrent: number }> {
  const byKey = await collectLegacyNameMap();
  const current = await currentRosterNameKeys();
  let upserted = 0;
  let skippedCurrent = 0;

  for (const [key, info] of byKey) {
    if (current.has(key)) {
      skippedCurrent += 1;
      continue;
    }
    const existing = await prisma.employeeNameMerge.findUnique({
      where: { previousNameKey: key },
    });
    if (existing) {
      await prisma.employeeNameMerge.update({
        where: { id: existing.id },
        data: {
          previousName: existing.status === "merged" ? existing.previousName : info.name,
          payrollHead: info.head,
          firstSeen: info.firstSeen,
          lastSeen: info.lastSeen,
        },
      });
    } else {
      await prisma.employeeNameMerge.create({
        data: {
          previousName: info.name,
          previousNameKey: key,
          payrollHead: info.head,
          firstSeen: info.firstSeen,
          lastSeen: info.lastSeen,
          status: "previous",
        },
      });
    }
    upserted += 1;
  }

  return { upserted, skippedCurrent };
}

type StoredMerge = Awaited<ReturnType<typeof prisma.employeeNameMerge.findMany>>[number];

function mapStoredRow(
  r: StoredMerge,
  pfTotals: Map<string, number>,
  staffName: Map<string, string>,
): PreviousEmployeeRow {
  const liveCurrent =
    (r.currentStaffId && staffName.get(r.currentStaffId)) || r.currentName || null;
  const fromKey = r.previousNameKey || pfNormName(r.previousName);
  const toKey = liveCurrent ? pfNormName(liveCurrent) : r.currentNameKey;
  return {
    id: r.id,
    previousName: r.previousName,
    previousNameKey: fromKey,
    currentName: liveCurrent,
    currentNameKey: toKey || null,
    currentStaffId: r.currentStaffId,
    currentUserId: r.currentUserId,
    payrollHead: r.payrollHead,
    firstSeen: r.firstSeen,
    lastSeen: r.lastSeen,
    status: r.status === "merged" ? "merged" : "previous",
    pfAllTime: pfTotals.get(fromKey) ?? 0,
    mergedAt: r.mergedAt ? r.mergedAt.toISOString() : null,
  };
}

export async function listPreviousEmployeeRows(): Promise<PreviousEmployeeRow[]> {
  const [stored, pfTotals, staff, legacy, current] = await Promise.all([
    prisma.employeeNameMerge.findMany({ orderBy: { previousName: "asc" } }),
    pfTotalsByNameKey(),
    prisma.staffEmployee.findMany({ select: { id: true, name: true, userId: true } }),
    collectLegacyNameMap(),
    currentRosterNameKeys(),
  ]);

  const staffUserIds = staff.map(s => s.userId).filter((id): id is string => !!id);
  const users =
    staffUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: staffUserIds } },
          select: { id: true, name: true },
        })
      : [];
  const userName = new Map(users.map(u => [u.id, u.name]));
  const staffName = new Map(
    staff.map(s => [s.id, (s.userId && userName.get(s.userId)) || s.name || ""]),
  );

  const storedByKey = new Map(stored.map(r => [r.previousNameKey || pfNormName(r.previousName), r]));
  const out: PreviousEmployeeRow[] = [];
  const used = new Set<string>();

  for (const r of stored) {
    if (r.status !== "merged") continue;
    const row = mapStoredRow(r, pfTotals, staffName);
    out.push(row);
    used.add(row.previousNameKey);
  }

  for (const [key, info] of legacy) {
    if (used.has(key) || current.has(key)) continue;
    const storedRow = storedByKey.get(key);
    if (storedRow?.status === "merged") continue;
    used.add(key);
    if (storedRow) {
      out.push(mapStoredRow(storedRow, pfTotals, staffName));
      continue;
    }
    out.push({
      id: `live:${key}`,
      previousName: info.name,
      previousNameKey: key,
      currentName: null,
      currentNameKey: null,
      currentStaffId: null,
      currentUserId: null,
      payrollHead: info.head,
      firstSeen: info.firstSeen,
      lastSeen: info.lastSeen,
      status: "previous",
      pfAllTime: pfTotals.get(key) ?? 0,
      mergedAt: null,
    });
  }

  const staffKeys = new Set<string>();
  for (const name of staffName.values()) {
    const k = pfNormName(name);
    if (k) staffKeys.add(k);
  }

  for (const r of stored) {
    if (r.status === "merged") continue;
    const key = r.previousNameKey || pfNormName(r.previousName);
    if (!key || used.has(key)) continue;
    // "moved" rows stay on the old list even if a dashboard login with that name still exists.
    // They drop off only when the name is back on All Employees.
    if (r.status === "moved") {
      if (staffKeys.has(key)) continue;
    } else if (current.has(key)) {
      continue;
    }
    used.add(key);
    out.push(mapStoredRow(r, pfTotals, staffName));
  }

  out.sort((a, b) => {
    if (a.status !== b.status) return a.status === "merged" ? 1 : -1;
    return a.previousName.localeCompare(b.previousName);
  });
  return out;
}

export async function mergePreviousEmployee(
  id: string,
  target: { currentName: string; currentStaffId?: string | null; currentUserId?: string | null },
): Promise<PreviousEmployeeRow | null> {
  const existing = await prisma.employeeNameMerge.findUnique({ where: { id } });
  if (!existing) return null;
  const currentName = target.currentName.trim();
  const toKey = pfNormName(currentName);
  if (!currentName || !toKey) {
    throw new Error("Current employee name is required.");
  }
  if (toKey === (existing.previousNameKey || pfNormName(existing.previousName))) {
    throw new Error("Pick a different (new) name to merge into.");
  }
  await prisma.employeeNameMerge.update({
    where: { id },
    data: {
      status: "merged",
      currentName,
      currentNameKey: toKey,
      currentStaffId: target.currentStaffId || null,
      currentUserId: target.currentUserId || null,
      mergedAt: new Date(),
    },
  });
  const list = await listPreviousEmployeeRows();
  return list.find(r => r.id === id) ?? null;
}

export async function mergePreviousByName(
  previousName: string,
  target: { currentName: string; currentStaffId?: string | null; currentUserId?: string | null },
): Promise<PreviousEmployeeRow | null> {
  const name = previousName.trim();
  const key = pfNormName(name);
  if (!name || !key) {
    throw new Error("Select a previous name.");
  }
  let existing = await prisma.employeeNameMerge.findUnique({ where: { previousNameKey: key } });
  if (!existing) {
    const legacy = await collectLegacyNameMap();
    const info = legacy.get(key);
    existing = await prisma.employeeNameMerge.create({
      data: {
        previousName: info?.name || name,
        previousNameKey: key,
        payrollHead: info?.head || null,
        firstSeen: info?.firstSeen || null,
        lastSeen: info?.lastSeen || null,
        status: "previous",
      },
    });
  }
  return mergePreviousEmployee(existing.id, target);
}

/** Take someone off All Employees and list them under Previous names. Dashboard login is kept. */
export async function moveStaffEmployeeToPrevious(staffId: string): Promise<string> {
  const row = await prisma.staffEmployee.findUnique({ where: { id: staffId } });
  if (!row) throw new Error("Employee not found.");

  let name = (row.name || "").trim();
  if (row.userId) {
    const user = await prisma.user.findUnique({
      where: { id: row.userId },
      select: { name: true },
    });
    if (user?.name?.trim()) name = user.name.trim();
  }
  const key = pfNormName(name);
  if (!name || !key) throw new Error("Employee name is required.");

  const today = new Date().toISOString().slice(0, 10);
  const start = row.payrollStartMonth && /^\d{4}-\d{2}$/.test(row.payrollStartMonth)
    ? `${row.payrollStartMonth}-01`
    : today;
  const existing = await prisma.employeeNameMerge.findUnique({ where: { previousNameKey: key } });

  if (!existing || existing.status !== "merged") {
    const data = {
      previousName: name,
      payrollHead: row.payrollHead || existing?.payrollHead || null,
      firstSeen: existing?.firstSeen || start,
      lastSeen: today,
      status: "moved",
      currentName: null,
      currentNameKey: null,
      currentStaffId: null,
      currentUserId: null,
      mergedAt: null,
    };
    if (existing) {
      await prisma.employeeNameMerge.update({ where: { id: existing.id }, data });
    } else {
      await prisma.employeeNameMerge.create({
        data: { ...data, previousNameKey: key },
      });
    }
  }

  await prisma.staffEmployee.delete({ where: { id: staffId } });
  return name;
}

export async function unmergePreviousEmployee(id: string): Promise<PreviousEmployeeRow | null> {
  const existing = await prisma.employeeNameMerge.findUnique({ where: { id } });
  if (!existing) return null;
  await prisma.employeeNameMerge.update({
    where: { id },
    data: {
      status: "previous",
      currentName: null,
      currentNameKey: null,
      currentStaffId: null,
      currentUserId: null,
      mergedAt: null,
    },
  });
  const list = await listPreviousEmployeeRows();
  return list.find(r => r.id === id) ?? null;
}

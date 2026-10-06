import prisma from "../config/db";
import { buildEstimatorKpiAuto } from "./estimatorKpiAuto";
import { listTechnicalEstimators } from "./technicalEstimators";
import { monthBounds } from "./technicalKpiRecords";

export type EstimatorMonthRating = {
  estimatorId: string;
  name: string;
  code: string;
  marks: string;
  stars: string;
  remarks: string;
  delivered: string;
};

export function previousMonthValue(from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthDisplayLabel(month: string): string {
  const [y, mo] = month.split("-").map(Number);
  if (!y || !mo) return month;
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function latestRecordValue(
  records: Array<{ estimatorId: string; fieldKey: string; value: string; recordedAt: Date }>,
  estimatorId: string,
  fieldKey: string,
): string {
  const hit = records
    .filter((r) => r.estimatorId === estimatorId && r.fieldKey === fieldKey)
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
  return hit?.value?.trim() ?? "";
}

function autoFieldValue(
  autoRows: Awaited<ReturnType<typeof buildEstimatorKpiAuto>>["estimators"],
  estimatorId: string,
  fieldKey: string,
): string {
  const row = autoRows.find((e) => e.estimatorId === estimatorId);
  return row?.fields.find((f) => f.fieldKey === fieldKey)?.value?.trim() ?? "";
}

function pickValue(saved: string, auto: string): string {
  return saved || auto;
}

/** Previous calendar month KPI marks/stars (saved records override auto). */
export async function buildPreviousMonthRatings(staffRole: "estimator" | "bim" = "estimator"): Promise<{
  month: string;
  monthLabel: string;
  ratings: EstimatorMonthRating[];
}> {
  const month = previousMonthValue();
  const bounds = monthBounds(month);

  const [autoSnap, roster, records] = await Promise.all([
    buildEstimatorKpiAuto(month),
    listTechnicalEstimators(staffRole),
    bounds
      ? prisma.estimatorKpiRecord.findMany({
          where: {
            recordedAt: { gte: bounds.from, lt: bounds.to },
            fieldKey: { in: ["marks_out_of_10", "rating_stars", "final_remarks", "projects_delivered"] },
          },
          select: { estimatorId: true, fieldKey: true, value: true, recordedAt: true },
          orderBy: { recordedAt: "desc" },
          take: 2000,
        })
      : Promise.resolve([]),
  ]);

  const ids = new Set<string>();
  for (const e of roster) ids.add(e.id);
  if (staffRole !== "bim") {
    for (const e of autoSnap.estimators) ids.add(e.estimatorId);
    for (const r of records) ids.add(r.estimatorId);
  }

  const nameById = new Map(roster.map((e) => [e.id, { name: e.name, code: e.code }]));
  for (const e of autoSnap.estimators) {
    if (!nameById.has(e.estimatorId)) {
      nameById.set(e.estimatorId, { name: e.name, code: e.code });
    }
  }

  const ratings: EstimatorMonthRating[] = [];

  for (const estimatorId of ids) {
    const meta = nameById.get(estimatorId) ?? { name: "Estimator", code: "—" };
    const marks = pickValue(
      latestRecordValue(records, estimatorId, "marks_out_of_10"),
      autoFieldValue(autoSnap.estimators, estimatorId, "marks_out_of_10"),
    );
    const stars = pickValue(
      latestRecordValue(records, estimatorId, "rating_stars"),
      autoFieldValue(autoSnap.estimators, estimatorId, "rating_stars"),
    );
    const remarks = pickValue(
      latestRecordValue(records, estimatorId, "final_remarks"),
      autoFieldValue(autoSnap.estimators, estimatorId, "final_remarks"),
    );
    const delivered = pickValue(
      latestRecordValue(records, estimatorId, "projects_delivered"),
      autoFieldValue(autoSnap.estimators, estimatorId, "projects_delivered"),
    );

    if (!marks && !stars && !remarks && !delivered) continue;

    ratings.push({
      estimatorId,
      name: meta.name,
      code: meta.code,
      marks,
      stars,
      remarks,
      delivered,
    });
  }

  ratings.sort((a, b) => {
    const ma = Number(a.marks) || 0;
    const mb = Number(b.marks) || 0;
    if (mb !== ma) return mb - ma;
    return (Number(b.stars) || 0) - (Number(a.stars) || 0);
  });

  return {
    month,
    monthLabel: monthDisplayLabel(month),
    ratings,
  };
}

export function topPerformers(ratings: EstimatorMonthRating[], limit = 5): EstimatorMonthRating[] {
  return ratings.filter((r) => r.marks || r.stars).slice(0, limit);
}

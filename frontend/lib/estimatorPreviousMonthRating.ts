import API from "@/lib/api";

export type EstimatorMonthRating = {
  estimatorId: string;
  name: string;
  code: string;
  marks: string;
  stars: string;
  remarks: string;
  delivered: string;
};

export type PreviousMonthRatingsPayload = {
  success: boolean;
  month: string;
  monthLabel: string;
  ratings: EstimatorMonthRating[];
};

export async function fetchPreviousMonthRatings(): Promise<PreviousMonthRatingsPayload> {
  const res = await API.get("/admin/technical-previous-month-ratings");
  return res.data as PreviousMonthRatingsPayload;
}

export async function fetchMyPreviousMonthRating(): Promise<{
  success: boolean;
  month: string;
  monthLabel: string;
  rating: EstimatorMonthRating | null;
}> {
  const res = await API.get("/estimator/previous-month-rating");
  return res.data as {
    success: boolean;
    month: string;
    monthLabel: string;
    rating: EstimatorMonthRating | null;
  };
}

export function topPerformers(ratings: EstimatorMonthRating[], limit = 5): EstimatorMonthRating[] {
  return ratings.filter((r) => r.marks || r.stars).slice(0, limit);
}

export function ratingByEstimatorId(
  ratings: EstimatorMonthRating[],
): Map<string, EstimatorMonthRating> {
  const map = new Map<string, EstimatorMonthRating>();
  for (const r of ratings) map.set(r.estimatorId, r);
  return map;
}

export function starsDisplay(stars: string): string {
  const n = Math.min(5, Math.max(0, Math.round(Number(stars) || 0)));
  if (n <= 0) return "—";
  return "★".repeat(n) + "☆".repeat(5 - n);
}

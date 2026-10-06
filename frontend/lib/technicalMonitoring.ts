import API from "@/lib/api";

export type TechnicalTeamProjectRow = {
  leadId: string;
  projectCode: string | null;
  projectTitle: string | null;
  projectPhase: string | null;
  deadline: string;
  takeoffDone: boolean;
  timerSeconds: number;
  timerStartedAt: string | null;
  loggedSeconds: number;
  manHours: string;
  scopes: string[];
  divisions: string[];
  workDetail?: string;
  overdue: boolean;
  timerRunning: boolean;
  deadlineTiming: string | null;
};

export type TechnicalTeamMember = {
  estimatorId: string;
  name: string;
  code: string;
  assigned: number;
  pending: number;
  completed: number;
  overdue: number;
  timersRunning: number;
  loggedSeconds: number;
  plannedHours: number;
  completionRate: number;
  score: number;
  projects: TechnicalTeamProjectRow[];
};

export type TechnicalKpiPayload = {
  pipeline: {
    total: number;
    notAssigned: number;
    assigned: number;
    takeoffDone: number;
    pricing: number;
    finalSubmission: number;
  };
  summary: {
    totalAssignments: number;
    pendingAssignments: number;
    completedAssignments: number;
    overdueAssignments: number;
    timersRunning: number;
    totalLoggedSeconds: number;
    plannedManHours: number;
    completionRate: number;
    emergencyMorning: number;
    emergencyCob: number;
  };
  scoreboard: Array<{
    estimatorId: string;
    name: string;
    code: string;
    assigned: number;
    pending: number;
    completed: number;
    overdue: number;
    timersRunning: number;
    loggedSeconds: number;
    plannedHours: number;
    completionRate: number;
    score: number;
  }>;
};

export type TechnicalMonitoringPayload = {
  success: boolean;
  generatedAt: string;
  kpi: TechnicalKpiPayload;
  team: TechnicalTeamMember[];
};

export async function fetchTechnicalMonitoring(): Promise<TechnicalMonitoringPayload> {
  const res = await API.get("/admin/technical-monitoring");
  return res.data as TechnicalMonitoringPayload;
}

export function formatLoggedHours(seconds: number): string {
  const h = Math.max(0, seconds) / 3600;
  if (h < 10) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
}

export function formatDeadline(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso.split("T")[0] || "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function scoreTone(score: number): string {
  if (score >= 80) return "text-emerald-700 bg-emerald-50";
  if (score >= 55) return "text-amber-700 bg-amber-50";
  return "text-[#1B6FE8] bg-[#EAF2FE]";
}

import API from "@/lib/api";

export type TechnicalInboxNotification = {
  id: string;
  leadId: string;
  projectTitle: string | null;
  projectCode: string | null;
  source: "admin" | "estimator" | "system" | string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  title: string;
  message: string;
  changes: string[];
  readAt: string | null;
  createdAt: string;
};

export async function fetchTechnicalNotifications(limit = 50) {
  const res = await API.get("/admin/technical-notifications", {
    params: { limit: String(limit) },
  });
  return res.data as {
    success: boolean;
    notifications: TechnicalInboxNotification[];
    unreadCount: number;
  };
}

export async function markTechnicalNotificationRead(id: string) {
  const res = await API.put(`/admin/technical-notifications/${id}/read`);
  return res.data;
}

export async function markAllTechnicalNotificationsRead() {
  const res = await API.put("/admin/technical-notifications/read-all");
  return res.data;
}

export async function dismissTechnicalNotification(id: string) {
  const res = await API.delete(`/admin/technical-notifications/${id}`);
  return res.data;
}

export function technicalProjectHref(leadId: string): string {
  return `/technical/active-projects?project=${encodeURIComponent(leadId)}`;
}

export function technicalRevisionHref(leadId: string): string {
  return `/technical/revisions?project=${encodeURIComponent(leadId)}`;
}

export function formatNotifTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function sourceLabel(source: string, role?: string | null): string {
  if (source === "estimator") return "Estimator";
  if (source === "tm_estimator") return "Technical";
  if (source === "admin") {
    if (role === "manager") return "Manager";
    return "Admin";
  }
  return "System";
}

export type EstimatorInboxNotification = {
  id: string;
  leadId: string;
  projectTitle: string | null;
  projectCode: string | null;
  title: string;
  message: string;
  actorName: string | null;
  createdAt: string;
  readAt: string | null;
};

export async function fetchEstimatorNotifications(limit = 40) {
  const res = await API.get("/estimator/notifications", {
    params: { limit: String(limit) },
  });
  return res.data as {
    success: boolean;
    notifications: EstimatorInboxNotification[];
    unreadCount: number;
  };
}

export async function markEstimatorNotificationRead(id: string) {
  const res = await API.put(`/estimator/notifications/${id}/read`);
  return res.data;
}

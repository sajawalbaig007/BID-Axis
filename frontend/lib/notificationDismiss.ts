const DISMISSED_KEY = "crm_dismissed_notifications";

export function getDismissedNotificationIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export function dismissNotification(id: string): void {
  if (typeof window === "undefined") return;
  const set = getDismissedNotificationIds();
  set.add(id);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
}

export function clearDismissedNotifications(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DISMISSED_KEY);
}

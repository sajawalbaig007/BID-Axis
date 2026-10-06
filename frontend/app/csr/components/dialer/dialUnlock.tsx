"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import toast from "react-hot-toast";
import { noteCsrStatusUpdate, noteCsrZoomDial } from "@/lib/csrEngagement";

const STORAGE_KEY = "crm_zoom_dial_unlock";
const UNLOCK_DELAY_MS = 10_000;
export const DIAL_BEFORE_STATUS = "Click this client's Zoom number first. Status update opens 10 seconds after that click.";

let readyAt = new Map<string, number>();
const listeners = new Set<() => void>();

function readStored(): Map<string, number> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : {};
    const next = new Map<string, number>();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
        const n = Number(at);
        if (id && Number.isFinite(n)) next.set(id, n);
      }
    }
    return next;
  } catch {
    return new Map();
  }
}

function persist() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(readyAt)));
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") readyAt = readStored();

export function markLeadDialed(leadId: string | undefined) {
  if (!leadId) return;
  readyAt = new Map(readyAt);
  readyAt.set(leadId, Date.now() + UNLOCK_DELAY_MS);
  persist();
  noteCsrZoomDial();
}

export function consumeLeadDial(leadId: string | undefined) {
  if (!leadId || !readyAt.has(leadId)) return;
  readyAt = new Map(readyAt);
  readyAt.delete(leadId);
  persist();
}

export function dialReadyAt(leadId: string) {
  return readyAt.get(leadId) ?? 0;
}

export function isLeadDialUnlocked(leadId: string) {
  const at = readyAt.get(leadId) ?? 0;
  return at > 0 && Date.now() >= at;
}

export function requireLeadDial(leadId: string): boolean {
  if (isLeadDialUnlocked(leadId)) {
    noteCsrStatusUpdate();
    return true;
  }
  const at = dialReadyAt(leadId);
  if (at > Date.now()) {
    const secs = Math.max(1, Math.ceil((at - Date.now()) / 1000));
    toast.error(`Status update opens in ${secs}s after the Zoom click.`);
    return false;
  }
  toast.error(DIAL_BEFORE_STATUS);
  return false;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLeadDialUnlocked(leadId: string) {
  const at = useSyncExternalStore(subscribe, () => dialReadyAt(leadId), () => 0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at || at <= Date.now()) return;
    const timer = window.setTimeout(() => setNow(Date.now()), at - Date.now() + 20);
    return () => window.clearTimeout(timer);
  }, [at, now]);
  return at > 0 && now >= at;
}

export function DialGatedSelect({
  leadId,
  className,
  onPick,
  children,
}: {
  leadId: string;
  className: string;
  onPick: (status: string) => void;
  children: ReactNode;
}) {
  const unlocked = useLeadDialUnlocked(leadId);
  const at = useSyncExternalStore(subscribe, () => dialReadyAt(leadId), () => 0);
  const waiting = at > Date.now();
  const secs = waiting ? Math.max(1, Math.ceil((at - Date.now()) / 1000)) : 0;
  return (
    <select
      defaultValue=""
      disabled={!unlocked}
      title={unlocked ? "Update status" : waiting ? `Status update opens in ${secs}s` : DIAL_BEFORE_STATUS}
      onChange={(e) => {
        const value = e.target.value;
        e.currentTarget.value = "";
        if (!value) return;
        if (!requireLeadDial(leadId)) return;
        noteCsrStatusUpdate();
        consumeLeadDial(leadId);
        onPick(value);
      }}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </select>
  );
}

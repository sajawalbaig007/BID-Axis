"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LogIn, LogOut, Loader2, Pause, Play } from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage, getApiBase, getClientAuthToken } from "@/lib/api";
import { CSR_IDLE_RECHECK_KEY, requestCsrIdlePermission } from "@/app/csr/hooks/useCsrPresence";
import ShiftHistoryButton from "@/app/components/ShiftHistoryButton";
import StaffRequestButton from "@/app/components/StaffRequestButton";
import { engagementSnapshot } from "@/lib/csrEngagement";

type WorkSession = {
  id: string;
  checkInAt: string;
  checkInAtEst: string;
  paused?: boolean;
  pausedAt?: string | null;
  totalDuration: string;
  dashboardDuration: string;
  awayDuration: string;
  pausedDuration?: string;
};

type StatusResponse = {
  success: boolean;
  checkedIn?: boolean;
  paused?: boolean;
  created?: boolean;
  session?: WorkSession | null;
  message?: string;
};

const AUTO_PAUSE_KEY = "csr_lock_auto_paused";

function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatCheckInLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Karachi",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function postKeepalive(path: "/csr/pause" | "/csr/resume") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getClientAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${getApiBase()}${path}`, {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers,
    body: "{}",
  });
}

function readAutoPausedFlag() {
  try {
    return sessionStorage.getItem(AUTO_PAUSE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeAutoPausedFlag(on: boolean) {
  try {
    if (on) sessionStorage.setItem(AUTO_PAUSE_KEY, "1");
    else sessionStorage.removeItem(AUTO_PAUSE_KEY);
  } catch {
    /* ignore */
  }
}

export default function CsrCheckInControl({ compact = false }: { compact?: boolean }) {
  const [checkedIn, setCheckedIn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [session, setSession] = useState<WorkSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [engagement, setEngagement] = useState(() => engagementSnapshot());

  const checkedInRef = useRef(false);
  const pausedRef = useRef(false);
  const autoPausedRef = useRef(readAutoPausedFlag());
  const lockBusyRef = useRef(false);

  const applyStatus = useCallback((data: StatusResponse | undefined, forceIn = false) => {
    const inNow = forceIn || !!data?.checkedIn || !!data?.session;
    const pausedNow = !!data?.paused || !!data?.session?.paused;
    setCheckedIn(inNow);
    setPaused(pausedNow);
    setSession(data?.session ?? null);
    checkedInRef.current = inNow;
    pausedRef.current = pausedNow;
    if (!inNow) {
      autoPausedRef.current = false;
      writeAutoPausedFlag(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await API.get<StatusResponse>("/csr/work-session");
      applyStatus(res.data);
    } catch {
      /* ignore — presence still works */
    } finally {
      setLoading(false);
    }
  }, [applyStatus]);

  useEffect(() => {
    void refresh();
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ checkedIn?: boolean; paused?: boolean }>).detail;
      if (detail && typeof detail.checkedIn === "boolean") {
        setCheckedIn(detail.checkedIn);
        checkedInRef.current = detail.checkedIn;
        if (!detail.checkedIn) {
          setSession(null);
          setPaused(false);
          pausedRef.current = false;
          autoPausedRef.current = false;
          writeAutoPausedFlag(false);
        } else if (typeof detail.paused === "boolean") {
          setPaused(detail.paused);
          pausedRef.current = detail.paused;
        }
        return;
      }
      void refresh();
    };
    window.addEventListener("csr-checkin-changed", onChanged);
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.removeEventListener("csr-checkin-changed", onChanged);
      window.clearInterval(id);
    };
  }, [refresh]);

  /* Live elapsed timer between server polls */
  useEffect(() => {
    if (!checkedIn || !session?.checkInAt) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
      setEngagement(engagementSnapshot());
    }, 1000);
    return () => window.clearInterval(id);
  }, [checkedIn, session?.checkInAt]);

  const notifyPause = (nextPaused: boolean) => {
    window.dispatchEvent(
      new CustomEvent("csr-checkin-changed", { detail: { checkedIn: true, paused: nextPaused } }),
    );
  };

  const autoResumeAfterUnlock = useCallback(async () => {
    if (!checkedInRef.current || !autoPausedRef.current || lockBusyRef.current) return;
    lockBusyRef.current = true;
    autoPausedRef.current = false;
    writeAutoPausedFlag(false);
    pausedRef.current = false;
    setPaused(false);
    try {
      await postKeepalive("/csr/resume");
      notifyPause(false);
    } catch {
      autoPausedRef.current = true;
      writeAutoPausedFlag(true);
      pausedRef.current = true;
      setPaused(true);
    } finally {
      lockBusyRef.current = false;
    }
  }, []);

  /* Tab switch / hide must not pause — only the Pause button does.
     Resume leftover auto-pauses from older sessions. */
  useEffect(() => {
    if (autoPausedRef.current) {
      void autoResumeAfterUnlock();
    }
  }, [autoResumeAfterUnlock]);

  const liveDuration =
    session?.checkInAt
      ? formatDurationMs(nowMs - new Date(session.checkInAt).getTime())
      : session?.totalDuration ?? "";
  const inactiveNow = !paused && checkedIn && !engagement.engaged;
  const inactiveLabel = inactiveNow ? formatDurationMs(engagement.inactiveFor) : "";

  const checkIn = async () => {
    requestCsrIdlePermission();
    setBusy(true);
    try {
      const res = await API.post<StatusResponse>("/csr/check-in", {});
      applyStatus(res.data, true);
      if (!res.data?.session) {
        await refresh();
      }
      toast.success(res.data.message || "Checked in.");
      try { sessionStorage.removeItem(CSR_IDLE_RECHECK_KEY); } catch { /* ignore */ }
      window.dispatchEvent(
        new CustomEvent("csr-checkin-changed", { detail: { checkedIn: true, paused: false } }),
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "Check-in failed."));
    } finally {
      setBusy(false);
    }
  };

  const checkOut = async () => {
    setBusy(true);
    try {
      const lastActionAt = (() => {
        try { return sessionStorage.getItem("csr_last_real_action"); } catch { return null; }
      })();
      const res = await API.post<StatusResponse>("/csr/check-out", lastActionAt ? { lastActionAt } : {});
      try { sessionStorage.removeItem("csr_last_real_action"); } catch { /* ignore */ }
      setCheckedIn(false);
      setPaused(false);
      setSession(null);
      checkedInRef.current = false;
      pausedRef.current = false;
      autoPausedRef.current = false;
      writeAutoPausedFlag(false);
      toast.success(res.data.message || "Checked out.");
      window.dispatchEvent(
        new CustomEvent("csr-checkin-changed", { detail: { checkedIn: false, paused: false } }),
      );
      await refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Check-out failed."));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const pause = async () => {
    setBusy(true);
    autoPausedRef.current = false;
    writeAutoPausedFlag(false);
    try {
      const res = await API.post<StatusResponse>("/csr/pause", {});
      applyStatus(res.data, true);
      setPaused(true);
      pausedRef.current = true;
      toast.success(res.data.message || "Paused.");
      window.dispatchEvent(
        new CustomEvent("csr-checkin-changed", { detail: { checkedIn: true, paused: true } }),
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "Pause failed."));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    setBusy(true);
    autoPausedRef.current = false;
    writeAutoPausedFlag(false);
    try {
      const res = await API.post<StatusResponse>("/csr/resume", {});
      applyStatus(res.data, true);
      setPaused(false);
      pausedRef.current = false;
      toast.success(res.data.message || "Resumed.");
      window.dispatchEvent(
        new CustomEvent("csr-checkin-changed", { detail: { checkedIn: true, paused: false } }),
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "Resume failed."));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const history = <ShiftHistoryButton url="/csr/shift-history" compact={compact} />;
  const request = <StaffRequestButton compact={compact} mode="evening" />;

  if (loading) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 w-full min-w-0 [&>*]:shrink-0">
        <div className={`flex items-center gap-1.5 ${compact ? "h-9 px-2" : "h-10 px-3"} rounded-xl bg-crm-nav-pill text-crm-text-muted text-[11px] font-semibold`}>
          <Loader2 size={13} className="animate-spin" />
          <span className="hidden lg:inline">Session…</span>
        </div>
        {history}
        {request}
      </div>
    );
  }

  if (!checkedIn) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 w-full min-w-0 [&>*]:shrink-0">
      <button
        type="button"
        onClick={() => void checkIn()}
        disabled={busy}
        title="Check in to start tracking work time"
        className={`inline-flex items-center gap-1.5 ${compact ? "h-9 px-2.5" : "h-10 px-3"} rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] sm:text-xs font-bold shadow-sm shadow-emerald-500/25 disabled:opacity-60 transition-colors shrink-0`}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}
        <span>Check In</span>
      </button>
      {history}
      {request}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 w-full min-w-0 [&>*]:shrink-0">
      <div
        className={`flex items-center gap-1.5 ${compact ? "h-9 px-2" : "h-10 px-3"} rounded-xl border text-[11px] font-semibold max-w-[180px] sm:max-w-none overflow-hidden ${
          paused
            ? "bg-amber-50 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-200/80 dark:border-amber-500/30"
            : inactiveNow
              ? "bg-slate-100 dark:bg-slate-500/20 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-500/30"
              : "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-500/30"
        }`}
        title={
          session
            ? `Active ${session.dashboardDuration} · Inactive ${session.awayDuration}${
                inactiveNow ? ` · this break ${inactiveLabel}` : ""
              }${session.pausedDuration ? ` · Paused ${session.pausedDuration}` : ""}`
            : paused
              ? "Paused"
              : inactiveNow
                ? `Inactive ${inactiveLabel}`
                : "Checked in"
        }
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            paused ? "bg-amber-500" : inactiveNow ? "bg-slate-400" : "bg-emerald-500 animate-pulse"
          }`}
        />
        <span className="hidden xl:inline shrink-0">{paused ? "Paused" : inactiveNow ? "Inactive" : "Active"}</span>
        {session ? (
          <span className="opacity-80 font-medium truncate tabular-nums">
            <span className="hidden xl:inline">{formatCheckInLabel(session.checkInAt)} · </span>
            {inactiveNow ? inactiveLabel : liveDuration}
          </span>
        ) : (
          <span className="truncate">{paused ? "Paused" : "Checked in"}</span>
        )}
      </div>

      {paused ? (
        <button
          type="button"
          onClick={() => void resume()}
          disabled={busy}
          title="Resume work time — back on dashboard"
          className={`inline-flex items-center gap-1 ${compact ? "h-9 px-2" : "h-10 px-3"} rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] sm:text-xs font-bold shadow-sm shadow-emerald-500/25 disabled:opacity-60 transition-colors`}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          <span>Resume</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void pause()}
          disabled={busy}
          title="Pause work time — leaving for WhatsApp / break"
          className={`inline-flex items-center gap-1 ${compact ? "h-9 px-2" : "h-10 px-3"} rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[11px] sm:text-xs font-bold shadow-sm shadow-sky-500/25 disabled:opacity-60 transition-colors`}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Pause size={13} />}
          <span>Pause</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => void checkOut()}
        disabled={busy}
        title="Check out to end your shift (logout does not check you out)"
        className={`inline-flex items-center gap-1 ${compact ? "h-9 px-2.5" : "h-10 px-3"} rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[11px] sm:text-xs font-bold shadow-sm shadow-amber-500/25 disabled:opacity-60 transition-colors`}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
        <span>Check Out</span>
      </button>
      {history}
      {request}
    </div>
  );
}

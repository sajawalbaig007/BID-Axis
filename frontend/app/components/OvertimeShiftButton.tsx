"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage } from "@/lib/api";

const NINE_MS = 9 * 60 * 60 * 1000;
const TIMER_KEY = "overtime_timer_start";

function readTimerStart(): number | null {
  try {
    const raw = sessionStorage.getItem(TIMER_KEY);
    const n = raw ? Number(raw) : 0;
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

function formatTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export type ShiftOvertimeItem = {
  id: string;
  personKey: string;
  personName: string;
  department: string;
  day: string;
  comment: string;
  status: string;
  editedBy: string | null;
};

export default function OvertimeShiftButton({ compact = false }: { compact?: boolean }) {
  const [gate, setGate] = useState({ allowed: false, weekend: false, shiftMs: 0, open: false, at: Date.now() });
  const [now, setNow] = useState(Date.now());
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = () => {
      API.get("/attendance/overtime/gate")
        .then((res) => {
          if (stop) return;
          setGate({
            allowed: !!res.data.allowed,
            weekend: !!res.data.weekend,
            shiftMs: Number(res.data.shiftMs) || 0,
            open: !!res.data.open,
            at: Date.now(),
          });
        })
        .catch(() => {});
    };
    setStartedAt(readTimerStart());
    load();
    const id = window.setInterval(load, 15_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      window.clearInterval(id);
      window.clearInterval(tick);
    };
  }, []);

  const liveMs = gate.shiftMs + (gate.open ? Math.max(0, now - gate.at) : 0);
  const ready = gate.allowed || gate.weekend || liveMs >= NINE_MS;
  const running = startedAt != null;
  const elapsed = running ? Math.max(0, now - startedAt) : 0;
  const shiftLabel = formatTimer(liveMs);

  const start = () => {
    const at = Date.now();
    setStartedAt(at);
    try { sessionStorage.setItem(TIMER_KEY, String(at)); } catch { /* ignore */ }
  };

  const stop = async () => {
    if (startedAt == null || busy) return;
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    setBusy(true);
    try {
      await API.post("/attendance/overtime", { minutes });
      toast.success("Overtime sent.");
      setStartedAt(null);
      try { sessionStorage.removeItem(TIMER_KEY); } catch { /* ignore */ }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not send overtime."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy || (!ready && !running)}
      title={running ? "Stop overtime" : ready ? "Start overtime" : `Weekday overtime opens after a 9 hour shift. This shift is ${shiftLabel}.`}
      onClick={() => { if (running) void stop(); else start(); }}
      className={`${compact ? "h-9 text-xs" : "h-10 text-sm"} px-2.5 rounded-xl font-semibold inline-flex items-center gap-1 disabled:opacity-40 touch-manipulation tabular-nums ${
        running ? "bg-[#1B6FE8] text-white" : "bg-[#FEF3C7] text-[#92400E]"
      }`}
    >
      <Clock size={compact ? 14 : 15} />
      {running ? `${formatTimer(elapsed)} · Stop` : "Start"}
    </button>
  );
}

export function OvertimeShiftCell({
  item,
  canReview,
  onChanged,
}: {
  item: ShiftOvertimeItem | null;
  canReview: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState("0");
  const [mins, setMins] = useState("0");
  const [busy, setBusy] = useState(false);
  if (!item) return <span className="text-xs text-gray-300">—</span>;

  const review = async (action: "approve" | "decline" | "edit", minutes?: number) => {
    setBusy(true);
    try {
      await API.put(`/attendance/overtime/${item.id}`, { action, ...(minutes != null ? { minutes } : {}) });
      toast.success(action === "approve" ? "Approved." : action === "decline" ? "Declined." : "Time updated.");
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not update overtime."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-w-[150px]">
      <p className="text-xs font-semibold text-[#111827]">{item.comment}</p>
      <p className={`text-[10px] font-bold uppercase tracking-wide ${
        item.status === "approved" ? "text-green-700" : item.status === "declined" ? "text-red-600" : "text-amber-600"
      }`}>
        {item.status}{item.editedBy ? ` · ${item.editedBy}` : ""}
      </p>
      {canReview && item.status === "pending" ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <button type="button" disabled={busy} onClick={() => void review("approve")} className="h-7 px-2 rounded-lg bg-green-600 text-white text-[10px] font-bold disabled:opacity-50">Approve</button>
          <button type="button" disabled={busy} onClick={() => void review("decline")} className="h-7 px-2 rounded-lg bg-red-600 text-white text-[10px] font-bold disabled:opacity-50">Decline</button>
          <button type="button" disabled={busy} onClick={() => { setHours("1"); setMins("0"); setEditing(true); }} className="h-7 px-2 rounded-lg bg-gray-100 text-gray-700 text-[10px] font-bold">Edit</button>
        </div>
      ) : null}
      {editing ? (
        <div className="mt-2 flex items-center gap-1">
          <input type="number" min={0} max={12} value={hours} onChange={(e) => setHours(e.target.value)} className="w-14 h-8 rounded-lg border border-gray-200 px-2 text-xs" />
          <span className="text-[10px] text-gray-400">h</span>
          <input type="number" min={0} max={59} value={mins} onChange={(e) => setMins(e.target.value)} className="w-14 h-8 rounded-lg border border-gray-200 px-2 text-xs" />
          <button type="button" disabled={busy} onClick={() => void review("edit", Number(hours) * 60 + Number(mins))} className="h-8 px-2 rounded-lg bg-[#1B6FE8] text-white text-[10px] font-bold">Save</button>
        </div>
      ) : null}
    </div>
  );
}

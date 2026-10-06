"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ClipboardList, X } from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage, officeProxy } from "@/lib/api";

export type StaffRequestItem = {
  id: string;
  personKey: string;
  personName: string;
  department: string;
  kind: string;
  kindLabel: string;
  day: string;
  summary: string;
  detail: string;
  status: string;
  reviewedBy: string | null;
};

const KINDS = [
  { key: "attendance_correction", label: "Attendance Correction" },
  { key: "leave", label: "Leave Request" },
  { key: "reimbursement", label: "Reimbursement" },
  { key: "wfh", label: "Work From Home" },
  { key: "asset", label: "Asset Issue" },
  { key: "custom", label: "Custom Request" },
] as const;

type Kind = (typeof KINDS)[number]["key"];
type DayMode = "pkt" | "evening" | "est";

function ymd(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDay(mode: DayMode): string {
  if (mode === "est") return ymd("America/New_York");
  const day = ymd("Asia/Karachi");
  if (mode !== "evening") return day;
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  if (time >= "17:00") return day;
  const [y, m, d] = day.split("-").map(Number);
  const prev = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prev.toISOString().slice(0, 10);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "mt-1 w-full h-11 rounded-xl border border-gray-200 px-3 text-sm text-[#0B1220] outline-none focus:border-[#1B6FE8]";

export default function StaffRequestButton({
  compact = false,
  large = false,
  mode = "pkt",
  department,
  personKey,
  personName,
  publicPunch = false,
  dashboard,
  office = false,
}: {
  compact?: boolean;
  large?: boolean;
  mode?: DayMode;
  department?: string;
  personKey?: string;
  personName?: string;
  publicPunch?: boolean;
  dashboard?: "chief";
  office?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind | "">("");
  const [day, setDay] = useState(() => shiftDay(mode));
  const [endDay, setEndDay] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const label = useMemo(() => KINDS.find((item) => item.key === kind)?.label ?? "", [kind]);

  const reset = () => {
    setKind("");
    setDay(shiftDay(mode));
    setEndDay("");
    setCheckIn("");
    setCheckOut("");
    setAmount("");
    setTitle("");
    setDetail("");
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const submit = async () => {
    if (!kind) return;
    setBusy(true);
    try {
      await API.post(publicPunch ? "/attendance/requests/public" : "/attendance/requests", {
        kind,
        day,
        endDay: endDay || undefined,
        checkIn: checkIn || undefined,
        checkOut: checkOut || undefined,
        amount: amount || undefined,
        title: title || undefined,
        detail,
        ...(publicPunch ? { department, personKey, personName } : {}),
        ...(dashboard ? { dashboard } : {}),
      }, office ? officeProxy : undefined);
      toast.success("Request sent.");
      close();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not send the request."));
    } finally {
      setBusy(false);
    }
  };

  const height = large ? "h-14 text-base" : compact ? "h-9 text-xs" : "h-10 text-sm";

  return (
    <>
      <button
        type="button"
        onClick={() => { reset(); setOpen(true); }}
        className={`${height} px-3 rounded-xl bg-[#EEF2FF] text-[#3730A3] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[#E0E7FF] touch-manipulation`}
      >
        <ClipboardList size={large ? 18 : 14} />
        Request
      </button>
      {open ? (
        <div className="fixed inset-0 z-[140] bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-[#111827]">Create a request</h3>
                <p className="text-xs text-gray-400 mt-0.5">{label || "Choose a type"}</p>
              </div>
              <button type="button" onClick={close} className="w-8 h-8 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center">
                <X size={14} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {!kind ? (
                <div className="grid grid-cols-2 gap-3">
                  {KINDS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setKind(item.key)}
                      className="rounded-2xl border border-gray-100 bg-[#F8FAFC] px-3 py-4 text-left text-sm font-semibold text-[#111827] hover:border-[#1B6FE8]/40 hover:bg-[#EAF2FE]"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <Field label="Date">
                    <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={inputClass} />
                  </Field>
                  {kind === "attendance_correction" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Check in">
                        <input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={inputClass} />
                      </Field>
                      <Field label="Check out">
                        <input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={inputClass} />
                      </Field>
                    </div>
                  ) : null}
                  {kind === "leave" || kind === "wfh" ? (
                    <Field label="End date">
                      <input type="date" value={endDay} onChange={(e) => setEndDay(e.target.value)} className={inputClass} />
                    </Field>
                  ) : null}
                  {kind === "reimbursement" ? (
                    <Field label="Amount">
                      <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500" className={inputClass} />
                    </Field>
                  ) : null}
                  {kind === "asset" || kind === "custom" ? (
                    <Field label={kind === "asset" ? "Item" : "Title"}>
                      <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
                    </Field>
                  ) : null}
                  <Field label={kind === "attendance_correction" ? "Note" : "Details"}>
                    <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} className={`${inputClass} h-auto py-2`} />
                  </Field>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setKind("")} className="flex-1 h-11 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm">Back</button>
                    <button type="button" disabled={busy} onClick={() => void submit()} className="flex-1 h-11 rounded-xl bg-[#1B6FE8] text-white font-semibold text-sm disabled:opacity-50">
                      {busy ? "Sending…" : "Send"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function StaffRequestCell({
  items,
  canApprove,
  onChanged,
}: {
  items: StaffRequestItem[];
  canApprove: boolean;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState("");
  if (!items.length) return <span className="text-xs text-gray-300">—</span>;

  const review = async (id: string, action: "approve" | "decline") => {
    setBusyId(id);
    try {
      const res = await API.post(`/attendance/requests/${id}/review`, { action });
      toast.success(res.data?.message || (action === "approve" ? "Approved." : "Declined."));
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not review the request."));
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-2 min-w-[180px]">
      {items.map((item) => (
        <div key={item.id} className="rounded-xl bg-[#F8FAFC] px-2.5 py-2">
          <p className="text-[11px] font-bold text-[#111827]">{item.kindLabel}</p>
          <p className="text-[11px] text-gray-600 whitespace-pre-wrap">{item.summary}</p>
          {item.detail ? <p className="text-[10px] text-gray-400 whitespace-pre-wrap">{item.detail}</p> : null}
          <p className={`mt-1 text-[10px] font-bold uppercase tracking-wide ${
            item.status === "approved" ? "text-green-700" : item.status === "declined" ? "text-red-600" : "text-amber-600"
          }`}>
            {item.status}{item.reviewedBy ? ` · ${item.reviewedBy}` : ""}
          </p>
          {canApprove && item.status === "pending" ? (
            <div className="mt-1.5 flex gap-1.5">
              <button type="button" disabled={busyId === item.id} onClick={() => void review(item.id, "approve")} className="h-7 px-2 rounded-lg bg-green-600 text-white text-[10px] font-bold disabled:opacity-50">Approve</button>
              <button type="button" disabled={busyId === item.id} onClick={() => void review(item.id, "decline")} className="h-7 px-2 rounded-lg bg-red-600 text-white text-[10px] font-bold disabled:opacity-50">Decline</button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

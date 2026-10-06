"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import API, { apiErrorMessage } from "@/lib/api";
import { StaffRequestCell, type StaffRequestItem } from "@/app/components/StaffRequestButton";
import { OvertimeShiftCell, type ShiftOvertimeItem } from "@/app/components/OvertimeShiftButton";
import { EST_TZ_ABBR, EST_TZ_LABEL } from "@/lib/estTime";
import { Check, ChevronDown, Clock, Download, LogIn, LogOut, Monitor, Pencil, RotateCcw, Users, X } from "lucide-react";

type ClockTz = "est" | "pkt";

const CLOCKS: Record<ClockTz, { tz: string; abbr: string; label: string; button: string }> = {
  est: { tz: "America/New_York", abbr: EST_TZ_ABBR, label: EST_TZ_LABEL, button: "EST" },
  pkt: { tz: "Asia/Karachi", abbr: "PKT", label: "Pakistan Time (PKT)", button: "Pakistan" },
};

function formatSessionStamp(iso: string | null | undefined, timeZone: string, empty = "—"): string {
  if (!iso) return empty;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return empty;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(d);
}

type CsrOption = { id: string; name: string; csrCode?: string | null; isActive?: boolean };

type SessionRow = {
  id: string;
  csrId: string;
  csrName: string;
  csrCode: string | null;
  loginAt: string;
  logoutAt: string | null;
  loginAtEst: string;
  logoutAtEst: string;
  checkInAtEst?: string;
  checkOutAtEst?: string;
  dashboardDuration: string;
  awayDuration: string;
  totalDuration: string;
  status: "active" | "closed";
  browser: string | null;
  ip: string | null;
  closedReason: string | null;
  closedReasonLabel?: string;
  lastActionAt?: string | null;
  otherActivityDuration?: string;
  overtimeId?: string | null;
  overtimeComment?: string | null;
  overtimeStatus?: string | null;
  overtimeEditedBy?: string | null;
  sessionCount?: number;
  memberIds?: string[];
  day?: string;
};

type SummaryRow = {
  csrId: string;
  csrName: string;
  csrCode: string | null;
  sessions: number;
  dashboardDuration: string;
  awayDuration: string;
  totalDuration: string;
  firstLoginAt?: string;
  lastLogoutAt?: string | null;
  stillOpen?: boolean;
  day?: string;
  lastActionAt?: string | null;
  otherActivityDuration?: string;
  overtimeId?: string | null;
  overtimeComment?: string | null;
  overtimeStatus?: string | null;
  overtimeEditedBy?: string | null;
};

type ReportResponse = {
  success: boolean;
  timezoneLabel: string;
  sessions: SessionRow[];
  summary: SummaryRow[];
};

function pktShiftYmd(value: Date = new Date()): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
  if (hm >= "17:00") return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

function calendarYmd(timeZone: string, value: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function zonedParts(date: Date, timeZone: string): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { day: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour.padStart(2, "0")}:${get("minute").padStart(2, "0")}` };
}

function wallToPkt(day: string, time: string, tz: string): { day: string; time: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  if (tz === "Asia/Karachi") return { day, time };
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  let utc = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
  for (let i = 0; i < 3; i++) {
    const wall = zonedParts(new Date(utc), tz);
    const [wy, wm, wd] = wall.day.split("-").map(Number);
    const [wh, wmin] = wall.time.split(":").map(Number);
    utc += Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0) - Date.UTC(wy, (wm || 1) - 1, wd || 1, wh || 0, wmin || 0);
  }
  return zonedParts(new Date(utc), "Asia/Karachi");
}

function formatClockLocalInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

function pktWeekStart(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  utc.setUTCDate(utc.getUTCDate() - utc.getUTCDay());
  return utc.toISOString().slice(0, 10);
}

type PeriodPreset = "daily" | "previous" | "weekly" | "monthly" | "all";
const ALL_TIME_FROM = "2020-01-01";

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function rangeForPeriod(period: PeriodPreset, today: string): { from: string; to: string } {
  if (period === "daily") return { from: today, to: today };
  if (period === "previous") {
    const yesterday = addDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (period === "weekly") return { from: pktWeekStart(today), to: today };
  if (period === "monthly") return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: ALL_TIME_FROM, to: today };
}

function periodFromDates(from: string, to: string, today: string): PeriodPreset | "custom" {
  const yesterday = addDays(today, -1);
  if (from === today && to === today) return "daily";
  if (from === yesterday && to === yesterday) return "previous";
  if (from === pktWeekStart(today) && to === today) return "weekly";
  if (from === `${today.slice(0, 7)}-01` && to === today) return "monthly";
  if (from === ALL_TIME_FROM && to === today) return "all";
  return "custom";
}

function overtimeStatusLabel(status: string | null | undefined, comment: string | null | undefined) {
  if (status === "approved") return "Approved";
  if (status === "declined") return "Declined";
  if (comment) return "Pending";
  return "";
}

function downloadCsv(rows: SessionRow[], filename: string, personLabel: string, clock: ClockTz, includeOvertime = false) {
  const tz = CLOCKS[clock];
  const headers = [
    personLabel,
    "Code",
    `Check In (${tz.abbr})`,
    `Check Out (${tz.abbr})`,
    "On Dashboard",
    "Away",
    "Total",
    "Status",
    "Other activity",
    ...(includeOvertime ? ["Overtime", "Decision", "Edited by"] : []),
    "Browser",
    "IP",
    "Closed Reason",
  ];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    headers.join(","),
    ...rows.map(r => [
      escape(r.csrName),
      escape(r.csrCode ?? ""),
      escape(formatSessionStamp(r.loginAt, tz.tz)),
      escape(r.logoutAt ? formatSessionStamp(r.logoutAt, tz.tz) : "Still checked in"),
      escape(r.dashboardDuration),
      escape(r.awayDuration),
      escape(r.totalDuration),
      escape(r.status === "active" ? "Checked In" : "Checked Out"),
      escape(r.otherActivityDuration || "—"),
      ...(includeOvertime ? [
        escape(r.overtimeComment ?? ""),
        escape(overtimeStatusLabel(r.overtimeStatus, r.overtimeComment)),
        escape(r.overtimeEditedBy ? `Edited by ${r.overtimeEditedBy}` : ""),
      ] : []),
      escape(r.browser ?? ""),
      escape(r.ip ?? ""),
      escape(r.closedReasonLabel ?? r.closedReason ?? ""),
    ].join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escHtml(v: string) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadExcel(
  sessions: SessionRow[],
  summary: SummaryRow[],
  filename: string,
  personLabel: string,
  title: string,
  clock: ClockTz,
  includeOvertime = false,
) {
  const tz = CLOCKS[clock];
  const sessionHeader = [personLabel, "Code", `Check In (${tz.abbr})`, `Check Out (${tz.abbr})`, "On Dashboard", "Away", "Total", "Status", "Other activity", ...(includeOvertime ? ["Overtime", "Decision", "Edited by"] : []), "Browser", "IP", "Closed Reason"];
  const sessionBody = sessions.map(r => [
    r.csrName,
    r.csrCode ?? "",
    formatSessionStamp(r.loginAt, tz.tz),
    r.logoutAt ? formatSessionStamp(r.logoutAt, tz.tz) : "Still checked in",
    r.dashboardDuration,
    r.awayDuration,
    r.totalDuration,
    r.status === "active" ? "Checked In" : "Checked Out",
    r.otherActivityDuration || "—",
    ...(includeOvertime ? [
      r.overtimeComment ?? "",
      overtimeStatusLabel(r.overtimeStatus, r.overtimeComment),
      r.overtimeEditedBy ? `Edited by ${r.overtimeEditedBy}` : "",
    ] : []),
    r.browser ?? "",
    r.ip ?? "",
    r.closedReasonLabel ?? r.closedReason ?? "",
  ].map(escHtml));
  const summaryHeader = [personLabel, `First Check In (${tz.abbr})`, `Last Check Out (${tz.abbr})`, "Other activity", ...(includeOvertime ? ["Overtime", "Decision", "Edited by"] : []), "Sessions", "On Dashboard", "Away", "Total"];
  const summaryBody = summary.map(r => [
    r.csrName,
    r.firstLoginAt ? formatSessionStamp(r.firstLoginAt, tz.tz) : "—",
    r.stillOpen || !r.lastLogoutAt ? "Still checked in" : formatSessionStamp(r.lastLogoutAt, tz.tz),
    r.otherActivityDuration || "—",
    ...(includeOvertime ? [
      r.overtimeComment ?? "",
      overtimeStatusLabel(r.overtimeStatus, r.overtimeComment),
      r.overtimeEditedBy ? `Edited by ${r.overtimeEditedBy}` : "",
    ] : []),
    String(r.sessions),
    r.dashboardDuration,
    r.awayDuration,
    r.totalDuration,
  ].map(escHtml));

  const table = (headers: string[], rows: string[][]) =>
    `<table border="1"><thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join("")}</tr></thead><tbody>${
      rows.map(row => `<tr>${row.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")
    }</tbody></table>`;

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="UTF-8"></head>
<body>
<h2>${escHtml(title)}</h2>
<p>All times in ${escHtml(tz.label)}</p>
<h3>Per session</h3>
${table(sessionHeader, sessionBody)}
<h3>Per ${escHtml(personLabel)}</h3>
${table(summaryHeader, summaryBody)}
</body></html>`;

  const blob = new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

function OvertimeCells({
  row,
  canReview,
  reviewing,
  onReview,
  onEdit,
}: {
  row: {
    overtimeId?: string | null;
    overtimeComment?: string | null;
    overtimeStatus?: string | null;
    overtimeEditedBy?: string | null;
  };
  canReview: boolean;
  reviewing: boolean;
  onReview: (action: "approve" | "decline") => void;
  onEdit: () => void;
}) {
  return (
    <>
      <td className="px-3 py-3 text-xs text-gray-700 max-w-[240px]">
        <p className="whitespace-pre-wrap">{row.overtimeComment?.trim() || "—"}</p>
        {row.overtimeEditedBy ? (
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#1B6FE8]">Edited by {row.overtimeEditedBy}</p>
        ) : null}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          {row.overtimeStatus === "approved" ? (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-green-700" title="Approved"><Check size={14} /></span>
          ) : null}
          {row.overtimeStatus === "declined" ? (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-600" title="Declined"><X size={14} /></span>
          ) : null}
          {row.overtimeComment && row.overtimeStatus !== "approved" && row.overtimeStatus !== "declined" ? (
            <span className="text-[10px] font-bold text-gray-400">Pending</span>
          ) : null}
          {canReview && row.overtimeId ? (
            <>
              <button type="button" disabled={reviewing} title="Approve" onClick={() => onReview("approve")} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-600 text-white disabled:opacity-50"><Check size={14} /></button>
              <button type="button" disabled={reviewing} title="Decline" onClick={() => onReview("decline")} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white disabled:opacity-50"><X size={14} /></button>
              <button type="button" disabled={reviewing} title="Edit comment" onClick={onEdit} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-700"><Pencil size={13} /></button>
            </>
          ) : null}
        </div>
      </td>
    </>
  );
}

export default function CsrActivityReport({
  staffRole = "csr",
  allowEdit = true,
  defaultOpen = false,
}: {
  staffRole?: "csr" | "estimator" | "bim";
  allowEdit?: boolean;
  defaultOpen?: boolean;
}) {
  const pathname = usePathname();
  const canEdit = allowEdit && pathname.startsWith("/admin");
  const isEstimator = staffRole === "estimator" || staffRole === "bim";
  const isBim = staffRole === "bim";
  const today = isEstimator ? calendarYmd(CLOCKS.est.tz) : pktShiftYmd();
  const showOvertime = false;
  const canReviewOt = false;
  const showShiftOt = isEstimator && (pathname.startsWith("/technical") || pathname.startsWith("/admin") || pathname.startsWith("/manager"));
  const canReviewShiftOt = isEstimator && pathname.startsWith("/technical");
  const showRequests = pathname.startsWith("/admin") || pathname.startsWith("/manager");
  const canApproveRequests = pathname.startsWith("/admin");
  const sessionCols = 9 + (showRequests ? 1 : 0) + (showShiftOt ? 1 : 0) + (showOvertime ? 2 : 0) + (canEdit ? 1 : 0);
  const summaryCols = 8 + (showRequests ? 1 : 0) + (showShiftOt ? 1 : 0) + (showOvertime ? 2 : 0);
  const title = isBim ? "BIM Check In / Check Out" : isEstimator ? "Estimator Check In / Check Out" : "CSR Check In / Check Out";
  const personLabel = isBim ? "BIM" : isEstimator ? "Estimator" : "CSR";
  const peopleLabel = isBim ? "BIM" : isEstimator ? "Estimators" : "CSRs";
  const allLabel = isBim ? "All BIM" : isEstimator ? "All Estimators" : "All CSRs";

  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [csrId, setCsrId] = useState("all");
  const [csrs, setCsrs] = useState<CsrOption[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [requests, setRequests] = useState<StaffRequestItem[]>([]);
  const [overtimeNotes, setOvertimeNotes] = useState<ShiftOvertimeItem[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [clockTz, setClockTz] = useState<ClockTz>("pkt");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const [view, setView] = useState<"sessions" | "summary">("sessions");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [editing, setEditing] = useState<SessionRow | null>(null);
  const [editCheckIn, setEditCheckIn] = useState("");
  const [editCheckOut, setEditCheckOut] = useState("");
  const [editStillOpen, setEditStillOpen] = useState(false);
  const [editNote, setEditNote] = useState("admin_adjusted");
  const [savingEdit, setSavingEdit] = useState(false);
  const [resettingId, setResettingId] = useState("");
  const [overtimeEdit, setOvertimeEdit] = useState<SessionRow | SummaryRow | null>(null);
  const [overtimeText, setOvertimeText] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const resetDay = async (row: SessionRow) => {
    const ids = row.memberIds?.length ? row.memberIds : [row.id];
    if (!window.confirm(`Clear this day's check-in and check-out for ${row.csrName}? They can check in again. You can edit the correct time after they check in.`)) return;
    setResettingId(row.id);
    try {
      await API.post("/admin/csr-work-session/reset", { memberIds: ids });
      toast.success("Time reset.");
      await loadReport();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not reset time."));
    } finally {
      setResettingId("");
    }
  };

  const openEdit = (row: SessionRow) => {
    setEditing(row);
    setEditCheckIn(formatClockLocalInput(row.loginAt, CLOCKS[clockTz].tz));
    setEditCheckOut(formatClockLocalInput(row.logoutAt, CLOCKS[clockTz].tz));
    setEditStillOpen(row.status === "active" || !row.logoutAt);
    setEditNote("admin_adjusted");
  };

  const closeEdit = () => {
    setEditing(null);
    setSavingEdit(false);
  };

  const openMissing = (person: CsrOption) => {
    setEditing({
      id: `new:${person.id}`,
      csrId: person.id,
      csrName: person.name,
      csrCode: person.csrCode ?? null,
      loginAt: "",
      logoutAt: null,
      loginAtEst: "",
      logoutAtEst: "",
      dashboardDuration: "—",
      awayDuration: "—",
      totalDuration: "—",
      status: "closed",
      browser: null,
      ip: null,
      closedReason: null,
      day: fromDate,
    });
    setEditCheckIn(`${fromDate}T09:00`);
    setEditCheckOut("");
    setEditStillOpen(false);
    setEditNote("admin_adjusted");
  };

  const saveEdit = async () => {
    if (!editing || !editCheckIn) {
      toast.error("Check-in time is required.");
      return;
    }
    if (!editStillOpen && !editCheckOut) {
      toast.error("Enter check-out time, or mark as still checked in.");
      return;
    }
    try {
      setSavingEdit(true);
      if (editing.id.startsWith("new:")) {
        const tz = CLOCKS[clockTz].tz;
        const checkInMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(editCheckIn);
        const checkInPkt = checkInMatch ? wallToPkt(checkInMatch[1], checkInMatch[2], tz) : null;
        if (!checkInPkt) {
          toast.error("Enter a valid check-in time.");
          return;
        }
        let checkOut = "";
        if (!editStillOpen) {
          const checkOutMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(editCheckOut);
          const checkOutPkt = checkOutMatch ? wallToPkt(checkOutMatch[1], checkOutMatch[2], tz) : null;
          if (!checkOutPkt) {
            toast.error("Enter a valid check-out time.");
            return;
          }
          checkOut = checkOutPkt.time;
        }
        await API.post("/attendance/ceo-day", {
          department: staffRole,
          personKey: editing.csrId,
          personName: editing.csrName,
          day: checkInPkt.day,
          checkIn: checkInPkt.time,
          checkOut,
        });
        toast.success("Time saved.");
        closeEdit();
        await loadReport();
        return;
      }
      await API.put(`/admin/csr-work-session/${editing.id}`, {
        checkInAt: editCheckIn,
        checkOutAt: editStillOpen ? null : editCheckOut,
        clearCheckOut: editStillOpen,
        note: editNote.trim() || "admin_adjusted",
        tz: clockTz === "pkt" ? "Asia/Karachi" : "America/New_York",
        memberIds: editing.memberIds?.length ? editing.memberIds : [editing.id],
      });
      toast.success("Session times updated.");
      closeEdit();
      await loadReport();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update session."));
    } finally {
      setSavingEdit(false);
    }
  };

  useEffect(() => {
    const load = () => {
      const role = isBim ? "bim" : isEstimator ? "estimator" : "csr";
      API.get(`/admin/csrs?role=${role}`)
        .then(res => setCsrs(res.data.csrs ?? []))
        .catch(() => {});
    };
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [isBim, isEstimator]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const loadReport = useCallback(async () => {
    if (!fromDate || !toDate) return;
    try {
      setLoading(true);
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        role: staffRole,
        tz: clockTz === "pkt" ? "Asia/Karachi" : "America/New_York",
      });
      if (csrId !== "all") params.set("csrId", csrId);
      const res = await API.get<ReportResponse>(`/admin/csr-session-report?${params}`);
      const reqs = showRequests
        ? await API.get("/attendance/requests", { params: { from: fromDate, to: toDate } }).catch(() => ({ data: { requests: [] } }))
        : { data: { requests: [] as StaffRequestItem[] } };
      setSessions(res.data.sessions ?? []);
      setSummary(res.data.summary ?? []);
      setRequests(reqs.data.requests ?? []);
      if (showShiftOt) {
        const ot = await API.get("/attendance/overtime", { params: { from: fromDate, to: toDate } }).catch(() => ({ data: { overtime: [] } }));
        setOvertimeNotes(ot.data.overtime ?? []);
      } else {
        setOvertimeNotes([]);
      }
      setHasLoaded(true);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to load ${personLabel} activity report.`));
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, csrId, staffRole, personLabel, clockTz, showRequests, showShiftOt]);

  const reviewOvertime = async (id: string, action: "approve" | "decline" | "edit", comment?: string) => {
    setReviewing(true);
    try {
      await API.put(`/attendance/overtime/${id}`, { action, comment });
      toast.success(action === "approve" ? "Approved." : action === "decline" ? "Declined." : "Comment updated.");
      setOvertimeEdit(null);
      await loadReport();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not update overtime."));
    } finally {
      setReviewing(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadReport();
  }, [open, loadReport]);

  const selectedCsr = csrs.find(c => c.id === csrId) ?? null;
  const dropdownLabel = selectedCsr ? selectedCsr.name : allLabel;
  const clock = CLOCKS[clockTz];
  const timezoneLabel = clock.label;
  const periodToday = isEstimator ? calendarYmd(clock.tz) : pktShiftYmd();
  const activePeriod = periodFromDates(fromDate, toDate, periodToday);

  const applyPeriod = (period: PeriodPreset) => {
    const range = rangeForPeriod(period, periodToday);
    setFromDate(range.from);
    setToDate(range.to);
  };

  const totals = useMemo(() => ({
    sessions: sessions.length,
    csrs: summary.length,
  }), [sessions, summary]);

  const missingPeople = useMemo(() => {
    const today = calendarYmd("Asia/Karachi");
    if (!canEdit || fromDate !== toDate || fromDate > today) return [];
    const present = new Set(sessions.map((row) => row.csrId));
    return csrs.filter((person) => person.isActive !== false && !present.has(person.id) && (csrId === "all" || csrId === person.id));
  }, [canEdit, fromDate, toDate, sessions, csrs, csrId]);

  return (
    <div className="rounded-[1.75rem] border border-gray-100/90 bg-white dark:bg-crm-surface shadow-[0_10px_40px_-24px_rgba(15,23,42,0.35)] p-4 sm:p-5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors -m-1 p-1 sm:p-1.5"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 shrink-0">
            <Clock size={18} />
          </div>
          <div className="text-left min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-[#111827] dark:text-gray-100 truncate">
              {title}
            </h2>
            <p className="text-xs text-gray-400 truncate">
              {open
                ? `Shift tracking · all times in ${timezoneLabel}`
                : hasLoaded
                  ? `${totals.sessions} session${totals.sessions === 1 ? "" : "s"} · click to expand`
                  : "Click to expand shift tracking report"}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold shrink-0 transition-colors ${
          open
            ? "bg-gray-100 dark:bg-crm-muted text-gray-600 dark:text-gray-300"
            : "bg-[#1B6FE8] text-white"
        }`}>
          {open ? "Collapse" : "Expand"}
          <ChevronDown size={16} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr] mt-3 sm:mt-4" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden min-h-0">
          {open && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {([
              ["daily", "Daily"],
              ["previous", "Previous day"],
              ["weekly", "Weekly"],
              ["monthly", "Monthly"],
              ["all", "All time"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPeriod(key)}
                className={`h-8 px-3 rounded-full text-xs font-bold border ${
                  activePeriod === key
                    ? "bg-[#1B6FE8] text-white border-[#1B6FE8]"
                    : "bg-white dark:bg-crm-muted text-gray-600 dark:text-crm-text-secondary border-gray-200 dark:border-crm-border"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="h-10 flex-1 min-w-[130px] sm:flex-none rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8]"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="h-10 flex-1 min-w-[130px] sm:flex-none rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8]"
            />
            <div className="flex items-center gap-1.5">
              {(["est", "pkt"] as const).map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setClockTz(key)}
                  className={`h-10 px-3 rounded-xl text-xs font-bold border ${
                    clockTz === key
                      ? "bg-[#1B6FE8] text-white border-[#1B6FE8]"
                      : "bg-white text-gray-600 border-gray-200 hover:border-[#1B6FE8]/40"
                  }`}
                >
                  {CLOCKS[key].button}
                </button>
              ))}
            </div>
            <p className="w-full text-[11px] text-gray-400 -mt-1">
              {isEstimator
                ? `From / To follow ${timezoneLabel} calendar days.`
                : "Each day runs 5:00 PM to 5:00 PM PKT."}
            </p>

            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(v => !v)}
                className="h-10 px-4 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 flex items-center gap-2 min-w-[140px]"
              >
                <Users size={14} className="text-gray-400" />
                <span className="truncate max-w-[120px]">{dropdownLabel}</span>
                <ChevronDown size={14} className="text-gray-400 ml-auto" />
              </button>
              {dropdownOpen && (
                <div className="absolute z-20 mt-1 w-52 max-h-60 overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-lg py-1">
                  <button
                    type="button"
                    onClick={() => { setCsrId("all"); setDropdownOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${csrId === "all" ? "text-[#1B6FE8] font-semibold" : "text-gray-700"}`}
                  >
                    {allLabel}
                  </button>
                  {csrs.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setCsrId(c.id); setDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${csrId === c.id ? "text-[#1B6FE8] font-semibold" : "text-gray-700"}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => void loadReport()}
              disabled={loading || !fromDate || !toDate}
              className="h-10 px-4 rounded-xl bg-[#1B6FE8] text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() => downloadCsv(sessions, `${isEstimator ? "estimator" : "csr"}-activity-${fromDate}-${toDate}.csv`, personLabel, clockTz, showOvertime)}
              disabled={!sessions.length}
              className="h-10 px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
            >
              <Download size={14} />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => downloadExcel(
                sessions,
                summary,
                `${isEstimator ? "estimator" : "csr"}-activity-${fromDate}-${toDate}`,
                personLabel,
                title,
                clockTz,
                showOvertime,
              )}
              disabled={!sessions.length && !summary.length}
              className="h-10 px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
            >
              <Download size={14} />
              Download Excel
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs sm:text-sm">
              <LogIn size={14} className="text-green-600" />
              <span className="text-gray-500">Sessions:</span>
              <span className="font-bold text-gray-800">{totals.sessions}</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs sm:text-sm">
              <Users size={14} className="text-blue-600" />
              <span className="text-gray-500">{peopleLabel}:</span>
              <span className="font-bold text-gray-800">{totals.csrs}</span>
            </div>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs sm:text-sm">
              <button
                type="button"
                onClick={() => setView("sessions")}
                className={`px-3 py-2 font-semibold ${view === "sessions" ? "bg-[#1B6FE8] text-white" : "bg-white text-gray-600"}`}
              >
                Per session
              </button>
              <button
                type="button"
                onClick={() => setView("summary")}
                className={`px-3 py-2 font-semibold ${view === "summary" ? "bg-[#1B6FE8] text-white" : "bg-white text-gray-600"}`}
              >
                Per {personLabel}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {view === "sessions" ? (
              <>
              <table className="w-full" style={{ minWidth: "980px" }}>
                <thead>
                  <tr className="border-b border-gray-100 bg-white">
                    <th colSpan={sessionCols} className="px-3 py-2 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Times</span>
                        {(["est", "pkt"] as const).map(key => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setClockTz(key)}
                            className={`h-7 px-3 rounded-lg text-[11px] font-bold border ${
                              clockTz === key
                                ? "bg-[#1B6FE8] text-white border-[#1B6FE8]"
                                : "bg-white text-gray-600 border-gray-200 hover:border-[#1B6FE8]/40"
                            }`}
                          >
                            {CLOCKS[key].button}
                          </button>
                        ))}
                        <span className="text-[11px] text-gray-400">{clock.label}</span>
                      </div>
                    </th>
                  </tr>
                  <tr className="border-b border-gray-100 text-left bg-[#FAFAFB]">
                    {[personLabel, `Check In (${clock.abbr})`, `Check Out (${clock.abbr})`, ...(showShiftOt ? ["Overtime"] : []), ...(showRequests ? ["Request"] : []), "Other activity", "On Dashboard", "Away", "Total", "Status", "Closed By", ...(showOvertime ? ["Overtime", "Decision"] : []), ...(canEdit ? [""] : [])].map(h => (
                      <th key={h || "actions"} className="px-3 py-2.5 text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [1, 2, 3].map(i => (
                      <tr key={i} className="border-b border-gray-50">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(j => (
                          <td key={j} className="px-3 py-3">
                            <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : sessions.length === 0 && missingPeople.length === 0 ? (
                    <tr>
                      <td colSpan={sessionCols} className="py-12 text-center text-gray-400 text-sm">
                        {canEdit && fromDate !== toDate
                          ? "Pick one day to add a time for someone who did not check in."
                          : `No ${personLabel.toLowerCase()} check-in sessions in this date range`}
                      </td>
                    </tr>
                  ) : <>{sessions.map(row => (
                    <tr key={row.id} className="border-b border-gray-50 hover:bg-[#FAFAFB]">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-sm text-[#111827]">{row.csrName}</div>
                        {row.csrCode && <div className="text-[10px] text-gray-400">{row.csrCode}</div>}
                        {(row.sessionCount ?? 1) > 1 ? (
                          <div className="text-[10px] font-semibold text-[#1B6FE8] mt-0.5">
                            {row.sessionCount} check-ins combined
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1"><LogIn size={12} className="text-green-500" />{formatSessionStamp(row.loginAt, clock.tz)}</span>
                      </td>
                      <td className="px-3 py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <LogOut size={12} className={row.status === "active" ? "text-amber-500" : "text-gray-400"} />
                          {row.logoutAt ? formatSessionStamp(row.logoutAt, clock.tz) : "Still checked in"}
                        </span>
                      </td>
                      {showShiftOt ? (
                        <td className="px-3 py-3">
                          <OvertimeShiftCell
                            item={(() => {
                              const hit = overtimeNotes.find((item) => item.department === "estimator" && item.personKey === row.csrId && item.day === row.day) ?? null;
                              if (!hit || (!canReviewShiftOt && hit.status !== "approved" && hit.status !== "declined")) return null;
                              return hit;
                            })()}
                            canReview={canReviewShiftOt}
                            onChanged={() => void loadReport()}
                          />
                        </td>
                      ) : null}
                      {showRequests ? (
                        <td className="px-3 py-3">
                          <StaffRequestCell
                            items={requests.filter((item) => item.department === staffRole && item.personKey === row.csrId && item.day === row.day)}
                            canApprove={canApproveRequests}
                            onChanged={() => void loadReport()}
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-3 text-xs sm:text-sm font-semibold text-gray-700 whitespace-nowrap">
                        {row.otherActivityDuration || "—"}
                      </td>
                      <td className="px-3 py-3 text-xs sm:text-sm font-semibold text-emerald-600 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1"><Monitor size={12} />{row.dashboardDuration}</span>
                      </td>
                      <td className="px-3 py-3 text-xs sm:text-sm font-semibold text-amber-600 whitespace-nowrap">{row.awayDuration}</td>
                      <td className="px-3 py-3 text-xs sm:text-sm font-semibold text-gray-800 whitespace-nowrap">{row.totalDuration}</td>
                      <td className="px-3 py-3">
                        <span className={`text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full ${
                          row.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {row.status === "active" ? "Checked In" : "Checked Out"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-gray-500 whitespace-nowrap">
                        {row.closedReasonLabel ?? (row.status === "active" ? "—" : (row.closedReason ?? "—"))}
                      </td>
                      {showOvertime ? (
                        <OvertimeCells
                          row={row}
                          canReview={canReviewOt}
                          reviewing={reviewing}
                          onReview={(action) => row.overtimeId && void reviewOvertime(row.overtimeId, action)}
                          onEdit={() => { setOvertimeEdit(row); setOvertimeText(row.overtimeComment ?? ""); }}
                        />
                      ) : null}
                      {canEdit ? (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-[#EAF2FE] text-[#1B6FE8] text-[11px] font-bold hover:bg-[#1B6FE8] hover:text-white transition-colors"
                            title="Adjust check-in / check-out times"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={resettingId === row.id}
                            onClick={() => void resetDay(row)}
                            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-gray-100 text-gray-700 text-[11px] font-bold hover:bg-gray-200 disabled:opacity-50"
                            title="Clear this day's check-in and check-out"
                          >
                            <RotateCcw size={12} />
                            Reset
                          </button>
                        </div>
                      </td>
                      ) : null}
                    </tr>
                  ))}
                  {missingPeople.map((person) => (
                    <tr key={`missing-${person.id}`} className="border-b border-gray-50">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-sm text-[#111827]">{person.name}</div>
                        {person.csrCode ? <div className="text-[10px] text-gray-400">{person.csrCode}</div> : null}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-400">—</td>
                      <td className="px-3 py-3 text-xs text-gray-400">—</td>
                      {showShiftOt ? <td className="px-3 py-3" /> : null}
                      {showRequests ? <td className="px-3 py-3" /> : null}
                      <td className="px-3 py-3 text-xs text-gray-400">—</td>
                      <td className="px-3 py-3 text-xs text-gray-400">—</td>
                      <td className="px-3 py-3 text-xs text-gray-400">—</td>
                      <td className="px-3 py-3 text-xs text-gray-400">—</td>
                      <td className="px-3 py-3">
                        <span className="text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-700">No check-in</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-400">—</td>
                      {showOvertime ? <><td className="px-3 py-3" /><td className="px-3 py-3" /></> : null}
                      {canEdit ? (
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => openMissing(person)}
                            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-[#EAF2FE] text-[#1B6FE8] text-[11px] font-bold hover:bg-[#1B6FE8] hover:text-white transition-colors"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  </>}
                </tbody>
              </table>
              {showRequests && requests.some((item) => item.department === staffRole && !sessions.some((row) => row.csrId === item.personKey && row.day === item.day)) ? (
                <div className="px-3 pb-3 space-y-2">
                  {requests.filter((item) => item.department === staffRole && !sessions.some((row) => row.csrId === item.personKey && row.day === item.day)).map((item) => (
                    <div key={item.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-gray-100 px-3 py-2">
                      <div className="min-w-[140px]">
                        <p className="text-sm font-semibold">{item.personName}</p>
                        <p className="text-[11px] text-gray-400">{item.day}</p>
                      </div>
                      <StaffRequestCell items={[item]} canApprove={canApproveRequests} onChanged={() => void loadReport()} />
                    </div>
                  ))}
                </div>
              ) : null}
              </>
            ) : (
              <table className="w-full" style={{ minWidth: "980px" }}>
                <thead>
                  <tr className="border-b border-gray-100 bg-white">
                    <th colSpan={summaryCols} className="px-3 py-2 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Times</span>
                        {(["est", "pkt"] as const).map(key => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setClockTz(key)}
                            className={`h-7 px-3 rounded-lg text-[11px] font-bold border ${
                              clockTz === key
                                ? "bg-[#1B6FE8] text-white border-[#1B6FE8]"
                                : "bg-white text-gray-600 border-gray-200 hover:border-[#1B6FE8]/40"
                            }`}
                          >
                            {CLOCKS[key].button}
                          </button>
                        ))}
                        <span className="text-[11px] text-gray-400">{clock.label} · first check-in, last check-out</span>
                      </div>
                    </th>
                  </tr>
                  <tr className="border-b border-gray-100 text-left bg-[#FAFAFB]">
                    {[personLabel, `First Check In (${clock.abbr})`, `Last Check Out (${clock.abbr})`, ...(showShiftOt ? ["Overtime"] : []), ...(showRequests ? ["Request"] : []), "Other activity", ...(showOvertime ? ["Overtime", "Decision"] : []), "Sessions", "On Dashboard", "Away", "Total"].map(h => (
                      <th key={h} className="px-3 py-2.5 text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [1, 2, 3].map(i => (
                      <tr key={i} className="border-b border-gray-50">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(j => (
                          <td key={j} className="px-3 py-3">
                            <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : summary.length === 0 ? (
                    <tr>
                      <td colSpan={summaryCols} className="py-12 text-center text-gray-400 text-sm">
                        No summary for this date range
                      </td>
                    </tr>
                  ) : summary.map(row => (
                    <tr key={`${row.csrId}-${row.day ?? row.firstLoginAt}`} className="border-b border-gray-50 hover:bg-[#FAFAFB]">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-sm text-[#111827]">{row.csrName}</div>
                        {row.csrCode ? <div className="text-[10px] text-gray-400">{row.csrCode}</div> : null}
                        {(row.sessions ?? 1) > 1 ? (
                          <div className="text-[10px] font-semibold text-[#1B6FE8] mt-0.5">
                            {row.sessions} check-ins combined
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <LogIn size={12} className="text-green-500" />
                          {row.firstLoginAt ? formatSessionStamp(row.firstLoginAt, clock.tz) : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <LogOut size={12} className={row.stillOpen ? "text-amber-500" : "text-gray-400"} />
                          {row.stillOpen || !row.lastLogoutAt
                            ? "Still checked in"
                            : formatSessionStamp(row.lastLogoutAt, clock.tz)}
                        </span>
                      </td>
                      {showShiftOt ? (
                        <td className="px-3 py-3">
                          <OvertimeShiftCell
                            item={(() => {
                              const hit = overtimeNotes.find((item) => item.department === "estimator" && item.personKey === row.csrId && item.day === row.day) ?? null;
                              if (!hit || (!canReviewShiftOt && hit.status !== "approved" && hit.status !== "declined")) return null;
                              return hit;
                            })()}
                            canReview={canReviewShiftOt}
                            onChanged={() => void loadReport()}
                          />
                        </td>
                      ) : null}
                      {showRequests ? (
                        <td className="px-3 py-3">
                          <StaffRequestCell
                            items={requests.filter((item) => item.department === staffRole && item.personKey === row.csrId && item.day === row.day)}
                            canApprove={canApproveRequests}
                            onChanged={() => void loadReport()}
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-3 text-xs sm:text-sm font-semibold text-gray-700 whitespace-nowrap">
                        {row.otherActivityDuration || "—"}
                      </td>
                      {showOvertime ? (
                        <OvertimeCells
                          row={row}
                          canReview={canReviewOt}
                          reviewing={reviewing}
                          onReview={(action) => row.overtimeId && void reviewOvertime(row.overtimeId, action)}
                          onEdit={() => { setOvertimeEdit(row); setOvertimeText(row.overtimeComment ?? ""); }}
                        />
                      ) : null}
                      <td className="px-3 py-3 text-sm font-bold text-gray-700">{row.sessions}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-emerald-600">{row.dashboardDuration}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-amber-600">{row.awayDuration}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-gray-800">{row.totalDuration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
          )}
        </div>
      </div>

      {editing && canEdit && (
        <div className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-[#111827]">Adjust session times</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {editing.csrName} · edit times in {timezoneLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="w-8 h-8 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Check In</label>
                <input
                  type="datetime-local"
                  value={editCheckIn}
                  max={`${calendarYmd(clock.tz)}T23:59`}
                  onChange={e => setEditCheckIn(e.target.value)}
                  className="w-full h-11 rounded-xl border-2 border-gray-200 px-3 text-sm outline-none focus:border-[#1B6FE8]"
                />
                <p className="text-[11px] text-gray-400 mt-1">Change the date here to correct a previous day.</p>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editStillOpen}
                  onChange={e => setEditStillOpen(e.target.checked)}
                  className="rounded border-gray-300 text-[#1B6FE8] focus:ring-[#1B6FE8]"
                />
                Still checked in (no check-out)
              </label>

              {!editStillOpen && (
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Check Out</label>
                  <input
                    type="datetime-local"
                    value={editCheckOut}
                    max={`${calendarYmd(clock.tz)}T23:59`}
                    onChange={e => setEditCheckOut(e.target.value)}
                    className="w-full h-11 rounded-xl border-2 border-gray-200 px-3 text-sm outline-none focus:border-[#1B6FE8]"
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Note / reason</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  placeholder="admin_adjusted"
                  className="w-full h-11 rounded-xl border-2 border-gray-200 px-3 text-sm outline-none focus:border-[#1B6FE8]"
                />
              </div>
            </div>

            <div className="px-5 pb-5 flex gap-2">
              <button
                type="button"
                onClick={closeEdit}
                className="flex-1 h-11 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={savingEdit}
                className="flex-1 h-11 rounded-xl bg-[#1B6FE8] text-white font-semibold text-sm disabled:opacity-50"
              >
                {savingEdit ? "Saving…" : "Save times"}
              </button>
            </div>
          </div>
        </div>
      )}
      {overtimeEdit && canReviewOt ? (
        <div className="fixed inset-0 z-[120] bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-[#111827]">Edit overtime comment</h3>
                <p className="text-xs text-gray-400 mt-0.5">{overtimeEdit.csrName} · this will say edited by you</p>
              </div>
              <button type="button" onClick={() => setOvertimeEdit(null)} className="w-8 h-8 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center">
                <X size={14} />
              </button>
            </div>
            <div className="p-5">
              <textarea
                value={overtimeText}
                onChange={(event) => setOvertimeText(event.target.value)}
                rows={4}
                maxLength={500}
                className="w-full rounded-2xl border-2 border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#1B6FE8]"
              />
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button type="button" onClick={() => setOvertimeEdit(null)} className="flex-1 h-11 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm">Cancel</button>
              <button
                type="button"
                disabled={reviewing || !overtimeEdit.overtimeId}
                onClick={() => overtimeEdit.overtimeId && void reviewOvertime(overtimeEdit.overtimeId, "edit", overtimeText)}
                className="flex-1 h-11 rounded-xl bg-[#1B6FE8] text-white font-semibold text-sm disabled:opacity-50"
              >
                {reviewing ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

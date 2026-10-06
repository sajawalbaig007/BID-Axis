"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, ChevronDown, Clock, Download, LogIn, LogOut, Pencil, RotateCcw, X } from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage } from "@/lib/api";
import { StaffRequestCell, type StaffRequestItem } from "@/app/components/StaffRequestButton";
import { OvertimeShiftCell, type ShiftOvertimeItem } from "@/app/components/OvertimeShiftButton";
import { EST_TZ_ABBR, EST_TZ_LABEL } from "@/lib/estTime";

type ClockTz = "est" | "pkt";

const CLOCKS: Record<ClockTz, { tz: string; abbr: string; label: string; button: string }> = {
  est: { tz: "America/New_York", abbr: EST_TZ_ABBR, label: EST_TZ_LABEL, button: "EST" },
  pkt: { tz: "Asia/Karachi", abbr: "PKT", label: "Pakistan Time (PKT)", button: "Pakistan" },
};

const DEPTS = [
  { key: "dev", title: "Dev Check In / Check Out", person: "Dev" },
  { key: "office_boy", title: "Office Boy Check In / Check Out", person: "Office Boy" },
  { key: "hr", title: "HR Check In / Check Out", person: "HR" },
  { key: "bim_modeler", title: "BIM Modeler Check In / Check Out", person: "BIM Modeler" },
  { key: "chief_estimator", title: "Chief Estimator Check In / Check Out", person: "Chief Estimator" },
  { key: "bim_manager", title: "BIM Manager Check In / Check Out", person: "BIM Manager" },
  { key: "admin", title: "Admin Check In / Check Out", person: "Admin" },
  { key: "accounts", title: "Accounts Check In / Check Out", person: "Accounts" },
] as const;

type Row = {
  id: string;
  personKey: string;
  personName: string;
  department: string;
  day: string;
  checkIn: string | null;
  checkOut: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  comment?: string | null;
  overnight?: boolean;
  overtimeId?: string | null;
  overtimeComment?: string | null;
  overtimeStatus?: string | null;
  overtimeEditedBy?: string | null;
};

type Person = { department: string; personKey: string; personName: string };

function calendarYmd(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function pktInstant(day: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const date = new Date(`${day}T${time}:00+05:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIso(iso: string | null | undefined, tz: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

function ymdInZone(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatStamp(day: string, time: string | null, tz: string): string {
  if (!time) return "—";
  const date = pktInstant(day, time);
  if (!date) return time;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
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
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { day: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour.padStart(2, "0")}:${get("minute").padStart(2, "0")}` };
}

function pktToWall(day: string, time: string, tz: string): { day: string; time: string } {
  const date = pktInstant(day, time);
  if (!date) return { day, time };
  return zonedParts(date, tz);
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

function shiftOutDay(day: string, checkIn: string | null, checkOut: string | null): string {
  if (!checkIn || !checkOut || checkOut >= checkIn) return day;
  return addDays(day, 1);
}

function rowCheckIn(row: Row, tz: string): string {
  if (row.checkInAt) return formatIso(row.checkInAt, tz);
  return formatStamp(row.day, row.checkIn, tz);
}

function rowCheckOut(row: Row, tz: string): { text: string; nextDay: boolean } {
  if (row.checkInAt) {
    if (!row.checkOutAt) return { text: "Still checked in", nextDay: false };
    const nextDay = ymdInZone(row.checkOutAt, tz) > ymdInZone(row.checkInAt, tz);
    return { text: formatIso(row.checkOutAt, tz), nextDay };
  }
  if (!row.checkOut) return { text: "Still checked in", nextDay: false };
  return {
    text: formatStamp(shiftOutDay(row.day, row.checkIn, row.checkOut), row.checkOut, tz),
    nextDay: !!row.checkIn && row.checkOut < row.checkIn,
  };
}

function durationLabel(day: string, checkIn: string | null, checkOut: string | null, row?: Row): string {
  if (row?.checkInAt) {
    if (!row.checkOutAt) return "Still in";
    const mins = Math.round((new Date(row.checkOutAt).getTime() - new Date(row.checkInAt).getTime()) / 60000);
    if (mins <= 0) return "—";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  if (!checkIn || !checkOut) return checkIn && !checkOut ? "Still in" : "—";
  const start = pktInstant(day, checkIn);
  const end = pktInstant(shiftOutDay(day, checkIn, checkOut), checkOut);
  if (!start || !end || end <= start) return "—";
  const mins = Math.round((end.getTime() - start.getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function escHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function downloadExcel(title: string, filename: string, tzLabel: string, headers: string[], body: string[][]) {
  const table = `<table border="1"><thead><tr>${headers.map((h) => `<th>${escHtml(h)}</th>`).join("")}</tr></thead><tbody>${
    body.map((row) => `<tr>${row.map((c) => `<td>${escHtml(c)}</td>`).join("")}</tr>`).join("")
  }</tbody></table>`;
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><h2>${escHtml(title)}</h2><p>All times in ${escHtml(tzLabel)}</p>${table}</body></html>`;
  const blob = new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function StaffAttendanceReport({ scope = "all" }: { scope?: "all" | "estimators" | "chief" }) {
  const pathname = usePathname();
  const [rows, setRows] = useState<Row[]>([]);
  const [requests, setRequests] = useState<StaffRequestItem[]>([]);
  const [overtimeNotes, setOvertimeNotes] = useState<ShiftOvertimeItem[]>([]);
  const [estimators, setEstimators] = useState<Row[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("/attendance/report", { params: { from: "2000-01-01", to: "2100-01-01" } });
      const reqs = await API.get("/attendance/requests", { params: { from: "2000-01-01", to: "2100-01-01" } }).catch(() => ({ data: { requests: [] } }));
      const ot = await API.get("/attendance/overtime", { params: { from: "2000-01-01", to: "2100-01-01" } }).catch(() => ({ data: { overtime: [] } }));
      setRows(res.data.rows ?? []);
      setRequests(reqs.data.requests ?? []);
      setOvertimeNotes(ot.data.overtime ?? []);
      setEstimators(res.data.estimators ?? []);
      setPeople(res.data.people ?? []);
      setLoaded(true);
    } catch {
      setRows([]);
      setEstimators([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const onReports = scope === "estimators" || scope === "chief"
    ? pathname.startsWith("/technical")
    : pathname.startsWith("/admin") || pathname.startsWith("/manager");
  const canEdit = scope === "all" && pathname.startsWith("/admin");
  const canReview = scope === "estimators" ? pathname.startsWith("/technical") : pathname.startsWith("/admin");

  useEffect(() => {
    if (!onReports) return;
    void load();
  }, [load, onReports]);

  if (!onReports) return null;

  return (
    <div className="space-y-4">
      {scope === "estimators" || scope === "chief" ? null : DEPTS.map((dept) => (
        <DeptCard
          key={dept.key}
          title={dept.title}
          department={dept.key}
          personLabel={dept.person}
          roster={people.filter((person) => person.department === dept.key)}
          rows={rows.filter((r) => r.department === dept.key)}
          requests={requests.filter((r) => r.department === dept.key)}
          overtimeNotes={overtimeNotes.filter((item) => item.department === dept.key && (item.status === "approved" || item.status === "declined"))}
          reviewOvertime={false}
          loading={loading}
          loaded={loaded}
          canEdit={canEdit}
          canApproveRequests={pathname.startsWith("/admin")}
          showOvertime={false}
          canReview={canReview}
          onRefresh={() => void load()}
        />
      ))}
      {scope === "chief" ? (
      <DeptCard
        title="Chief Estimator Check In / Check Out"
        personLabel="Chief Estimator"
        rows={rows.filter((r) => r.department === "chief_estimator")}
        requests={requests.filter((r) => r.department === "chief_estimator")}
        overtimeNotes={overtimeNotes.filter((item) => item.department === "chief_estimator")}
        reviewOvertime
        loading={loading}
        loaded={loaded}
        canEdit={false}
        showOvertime={false}
        canReview={false}
        onRefresh={() => void load()}
      />
      ) : null}
      {scope === "estimators" ? (
      <DeptCard
        title="Estimator Check In / Check Out"
        personLabel="Estimator"
        rows={estimators}
        loading={loading}
        loaded={loaded}
        canEdit={false}
        showOvertime={false}
        defaultClock="est"
        canReview={canReview}
        onRefresh={() => void load()}
      />
      ) : null}
    </div>
  );
}

function DeptCard({
  title,
  department = "",
  personLabel,
  roster = [],
  rows,
  requests = [],
  overtimeNotes = [],
  reviewOvertime = false,
  loading,
  loaded,
  canEdit,
  canApproveRequests = false,
  showOvertime = false,
  canReview = false,
  defaultClock = "pkt",
  onRefresh,
}: {
  title: string;
  department?: string;
  personLabel: string;
  roster?: Person[];
  rows: Row[];
  requests?: StaffRequestItem[];
  overtimeNotes?: ShiftOvertimeItem[];
  reviewOvertime?: boolean;
  loading: boolean;
  loaded: boolean;
  canEdit: boolean;
  canApproveRequests?: boolean;
  showOvertime?: boolean;
  canReview?: boolean;
  defaultClock?: ClockTz;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [clockTz, setClockTz] = useState<ClockTz>(defaultClock);
  const [fromDate, setFromDate] = useState(() => calendarYmd("Asia/Karachi"));
  const [toDate, setToDate] = useState(() => calendarYmd("Asia/Karachi"));
  const [person, setPerson] = useState("all");
  const [editing, setEditing] = useState<Row | null>(null);
  const [editDay, setEditDay] = useState("");
  const [editCheckIn, setEditCheckIn] = useState("");
  const [editCheckOut, setEditCheckOut] = useState("");
  const [editStillOpen, setEditStillOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [resettingId, setResettingId] = useState("");
  const [overtimeEdit, setOvertimeEdit] = useState<Row | null>(null);
  const [overtimeText, setOvertimeText] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const clock = CLOCKS[clockTz];

  const reviewOvertimeComment = async (id: string, action: "approve" | "decline" | "edit", comment?: string) => {
    setReviewing(true);
    try {
      await API.put(`/attendance/overtime/${id}`, { action, comment });
      toast.success(action === "approve" ? "Approved." : action === "decline" ? "Declined." : "Comment updated.");
      setOvertimeEdit(null);
      onRefresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not update overtime."));
    } finally {
      setReviewing(false);
    }
  };

  const resetDay = async (row: Row) => {
    if (!window.confirm(`Clear check-in and check-out for ${row.personName} on ${row.day}? They can check in again. You can edit the correct time after.`)) return;
    setResettingId(row.id);
    try {
      await API.post(`/attendance/report/${row.id}/reset`);
      toast.success("Time reset.");
      onRefresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not reset time."));
    } finally {
      setResettingId("");
    }
  };

  const openEdit = (row: Row) => {
    const cin = row.checkIn ? pktToWall(row.day, row.checkIn, clock.tz) : { day: row.day, time: "" };
    const cout = row.checkOut ? pktToWall(row.day, row.checkOut, clock.tz) : { day: cin.day, time: "" };
    setEditing(row);
    setEditDay(cin.day);
    setEditCheckIn(cin.time);
    setEditCheckOut(cout.time);
    setEditStillOpen(row.id.startsWith("missing:") ? false : !row.checkOut);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editDay || !editCheckIn) {
      toast.error("Date and check-in time are required.");
      return;
    }
    if (!editStillOpen && !editCheckOut) {
      toast.error("Enter a check-out time, or mark as still checked in.");
      return;
    }
    const checkInPkt = wallToPkt(editDay, editCheckIn, clock.tz);
    const checkOutPkt = editStillOpen ? null : wallToPkt(editDay, editCheckOut, clock.tz);
    if (!checkInPkt || (!editStillOpen && !checkOutPkt)) {
      toast.error("Enter a valid date and time.");
      return;
    }
    if (checkOutPkt && checkOutPkt.day !== checkInPkt.day && checkOutPkt.day !== addDays(checkInPkt.day, 1)) {
      toast.error("Check-out must be the same day or the next day.");
      return;
    }
    try {
      setSavingEdit(true);
      if (editing.id.startsWith("missing:")) {
        await API.post("/attendance/ceo-day", {
          department,
          personKey: editing.personKey,
          personName: editing.personName,
          day: checkInPkt.day,
          checkIn: checkInPkt.time,
          checkOut: checkOutPkt?.time ?? "",
        });
      } else {
        await API.put(`/attendance/report/${editing.id}`, {
          day: checkInPkt.day,
          checkIn: checkInPkt.time,
          checkOut: checkOutPkt?.time ?? null,
        });
      }
      toast.success("Time saved.");
      setEditing(null);
      onRefresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not save time."));
    } finally {
      setSavingEdit(false);
    }
  };

  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of roster) map.set(member.personKey, member.personName);
    for (const row of rows) map.set(row.personKey, row.personName);
    return [...map.entries()].map(([key, name]) => ({ key, name }));
  }, [roster, rows]);

  const visible = useMemo(() => {
    const matched = rows.filter((row) => {
      if (person !== "all" && row.personKey !== person) return false;
      return row.day >= fromDate && row.day <= toDate;
    });
    const today = calendarYmd("Asia/Karachi");
    const oneDay = canEdit && fromDate === toDate && fromDate <= today && /^\d{4}-\d{2}-\d{2}$/.test(fromDate);
    if (!oneDay) return matched;
    const present = new Set(matched.map((row) => row.personKey));
    const missing = people
      .filter((member) => !present.has(member.key) && (person === "all" || person === member.key))
      .map((member): Row => ({
        id: `missing:${member.key}`,
        personKey: member.key,
        personName: member.name,
        department,
        day: fromDate,
        checkIn: null,
        checkOut: null,
      }));
    return [...matched, ...missing];
  }, [rows, person, fromDate, toDate, canEdit, people, department]);

  const applyPeriod = (key: "daily" | "previous" | "weekly" | "monthly" | "all") => {
    const today = calendarYmd(clock.tz);
    if (key === "daily") {
      setFromDate(today);
      setToDate(today);
    } else if (key === "previous") {
      const yesterday = addDays(today, -1);
      setFromDate(yesterday);
      setToDate(yesterday);
    } else if (key === "weekly") {
      setFromDate(addDays(today, -6));
      setToDate(today);
    } else if (key === "monthly") {
      setFromDate(addDays(today, -29));
      setToDate(today);
    } else {
      setFromDate("2000-01-01");
      setToDate("2100-01-01");
    }
  };

  const rowRequests = (row: Row) => requests.filter((item) => item.personKey === row.personKey && item.day === row.day);
  const showShiftOt = overtimeNotes.length > 0 || reviewOvertime;
  const headers = ["Name", "Date", `Check In (${clock.abbr})`, `Check Out (${clock.abbr})`, ...(showShiftOt ? ["Overtime"] : []), "Request", "Total", "Status", "Comment"];
  const tableHeaders = showOvertime ? [...headers, "Overtime", "Decision"] : headers;
  const excelHeaders = showOvertime ? [...tableHeaders, "Edited by"] : headers;
  const excelBody = visible.filter((row) => !row.id.startsWith("missing:")).map((row) => {
    const out = rowCheckOut(row, clock.tz);
    const base = [
      row.personName,
      row.day,
      rowCheckIn(row, clock.tz),
      out.text,
      ...(showShiftOt ? [(() => {
        const hit = overtimeNotes.find((item) => item.personKey === row.personKey && item.day === row.day);
        if (!hit || (!reviewOvertime && hit.status !== "approved" && hit.status !== "declined")) return "";
        return `${hit.comment} (${hit.status})`;
      })()] : []),
      rowRequests(row).map((item) => `${item.kindLabel}: ${item.summary} (${item.status})`).join(" | "),
      durationLabel(row.day, row.checkIn, row.checkOut, row),
      row.checkOut || row.checkOutAt ? "Checked Out" : row.checkIn || row.checkInAt ? "Checked In" : "—",
      row.comment?.trim() || "",
    ];
    if (!showOvertime) return base;
    return [
      ...base,
      row.overtimeComment?.trim() || "",
      row.overtimeStatus === "approved" ? "Approved" : row.overtimeStatus === "declined" ? "Declined" : row.overtimeComment ? "Pending" : "",
      row.overtimeEditedBy ? `Edited by ${row.overtimeEditedBy}` : "",
    ];
  });

  return (
    <div className="rounded-[1.75rem] border border-gray-100/90 bg-white shadow-[0_10px_40px_-24px_rgba(15,23,42,0.35)] p-4 sm:p-5 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shrink-0">
            <Clock size={18} />
          </div>
          <div className="text-left min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-[#111827] truncate">{title}</h2>
            <p className="text-xs text-gray-400 truncate">
              {open ? `All times in ${clock.label}` : loaded ? `${visible.filter((row) => !row.id.startsWith("missing:")).length} day${visible.filter((row) => !row.id.startsWith("missing:")).length === 1 ? "" : "s"} · click to expand` : "Click to expand"}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold ${open ? "bg-gray-100 text-gray-600" : "bg-[#1B6FE8] text-white"}`}>
          {open ? "Collapse" : "Expand"}
          <ChevronDown size={16} className={open ? "rotate-180" : ""} />
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {([
              ["daily", "Daily"],
              ["previous", "Previous day"],
              ["weekly", "Weekly"],
              ["monthly", "Monthly"],
              ["all", "All time"],
            ] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => applyPeriod(key)} className="h-8 px-3 rounded-full text-xs font-bold border border-gray-200 text-gray-600">
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10 rounded-xl border border-gray-200 px-3 text-sm" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-10 rounded-xl border border-gray-200 px-3 text-sm" />
            {(["est", "pkt"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setClockTz(key)}
                className={`h-10 px-3 rounded-xl text-xs font-bold border ${clockTz === key ? "bg-[#1B6FE8] text-white border-[#1B6FE8]" : "bg-white text-gray-600 border-gray-200"}`}
              >
                {CLOCKS[key].button}
              </button>
            ))}
            <select value={person} onChange={(e) => setPerson(e.target.value)} className="h-10 rounded-xl border border-gray-200 px-3 text-sm">
              <option value="all">All {personLabel}</option>
              {people.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
            <button type="button" onClick={onRefresh} className="h-10 px-4 rounded-xl bg-[#1B6FE8] text-white text-sm font-semibold">
              {loading ? "Loading…" : "Refresh"}
            </button>
            <button
              type="button"
              disabled={!visible.some((row) => !row.id.startsWith("missing:"))}
              onClick={() => downloadExcel(title, `${personLabel.toLowerCase().replace(/\s+/g, "-")}-attendance-${fromDate}-${toDate}`, clock.label, excelHeaders, excelBody)}
              className="h-10 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Download size={14} /> Download Excel
            </button>
          </div>
          <p className="text-[11px] text-gray-400">{clock.label}. Saved time is shown in the clock you pick.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  {tableHeaders.map((h) => <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}
                  {canEdit ? <th className="px-3 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={tableHeaders.length + (canEdit ? 1 : 0)} className="px-3 py-8 text-gray-400">Loading…</td></tr>
                ) : visible.length === 0 ? (
                  <tr><td colSpan={tableHeaders.length + (canEdit ? 1 : 0)} className="px-3 py-8 text-center text-gray-400">{canEdit && fromDate !== toDate ? "Pick one day to add a time for someone who did not check in." : "No check-in sessions in this date range"}</td></tr>
                ) : visible.map((row) => {
                  const absent = row.id.startsWith("missing:");
                  return (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="px-3 py-3 font-semibold">{row.personName}</td>
                    <td className="px-3 py-3 tabular-nums">{row.day}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1"><LogIn size={12} className="text-green-500" />{absent ? "—" : rowCheckIn(row, clock.tz)}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <LogOut size={12} className={absent ? "text-gray-300" : row.checkOut || row.checkOutAt ? "text-gray-400" : "text-amber-500"} />
                        {absent ? "—" : rowCheckOut(row, clock.tz).text}
                        {!absent && rowCheckOut(row, clock.tz).nextDay ? <span className="ml-1 text-[10px] font-bold text-[#1B6FE8]">next day</span> : null}
                      </span>
                    </td>
                    {showShiftOt ? (
                      <td className="px-3 py-3">
                        <OvertimeShiftCell
                          item={(() => {
                            const hit = overtimeNotes.find((item) => item.personKey === row.personKey && item.day === row.day) ?? null;
                            if (!hit || (!reviewOvertime && hit.status !== "approved" && hit.status !== "declined")) return null;
                            return hit;
                          })()}
                          canReview={reviewOvertime}
                          onChanged={onRefresh}
                        />
                      </td>
                    ) : null}
                    <td className="px-3 py-3">
                      <StaffRequestCell items={rowRequests(row)} canApprove={canApproveRequests} onChanged={onRefresh} />
                    </td>
                    <td className="px-3 py-3 font-semibold">{absent ? "—" : durationLabel(row.day, row.checkIn, row.checkOut, row)}</td>
                    <td className="px-3 py-3">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${absent ? "bg-amber-50 text-amber-700" : row.checkOut || row.checkOutAt ? "bg-gray-100 text-gray-500" : "bg-green-50 text-green-700"}`}>
                        {absent ? "No check-in" : row.checkOut || row.checkOutAt ? "Checked Out" : "Checked In"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-700 max-w-[220px]">{row.comment?.trim() || "—"}</td>
                    {showOvertime ? (
                      <td className="px-3 py-3 text-xs text-gray-700 max-w-[240px]">
                        <p className="whitespace-pre-wrap">{row.overtimeComment?.trim() || "—"}</p>
                        {row.overtimeEditedBy ? (
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#1B6FE8]">Edited by {row.overtimeEditedBy}</p>
                        ) : null}
                      </td>
                    ) : null}
                    {showOvertime ? (
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
                              <button type="button" disabled={reviewing} title="Approve" onClick={() => void reviewOvertimeComment(row.overtimeId!, "approve")} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-600 text-white disabled:opacity-50"><Check size={14} /></button>
                              <button type="button" disabled={reviewing} title="Decline" onClick={() => void reviewOvertimeComment(row.overtimeId!, "decline")} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white disabled:opacity-50"><X size={14} /></button>
                              <button type="button" disabled={reviewing} title="Edit comment" onClick={() => { setOvertimeEdit(row); setOvertimeText(row.overtimeComment ?? ""); }} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-700"><Pencil size={13} /></button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                    {canEdit ? (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-[#EAF2FE] text-[#1B6FE8] text-[11px] font-bold hover:bg-[#1B6FE8] hover:text-white transition-colors"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                          {absent ? null : (
                          <button
                            type="button"
                            disabled={resettingId === row.id}
                            onClick={() => void resetDay(row)}
                            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-gray-100 text-gray-700 text-[11px] font-bold hover:bg-gray-200 disabled:opacity-50"
                          >
                            <RotateCcw size={12} />
                            Reset
                          </button>
                          )}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {requests.filter((item) => item.day >= fromDate && item.day <= toDate && (person === "all" || item.personKey === person) && !visible.some((row) => row.personKey === item.personKey && row.day === item.day)).length ? (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Requests with no check-in that day</p>
              {requests.filter((item) => item.day >= fromDate && item.day <= toDate && (person === "all" || item.personKey === person) && !visible.some((row) => row.personKey === item.personKey && row.day === item.day)).map((item) => (
                <div key={item.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-gray-100 px-3 py-2">
                  <div className="min-w-[140px]">
                    <p className="text-sm font-semibold">{item.personName}</p>
                    <p className="text-[11px] text-gray-400">{item.day}</p>
                  </div>
                  <StaffRequestCell items={[item]} canApprove={canApproveRequests} onChanged={onRefresh} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {editing && canEdit ? (
        <div className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-[#111827]">Edit date and time</h3>
                <p className="text-xs text-gray-400 mt-0.5">{editing.personName} · {clock.label}</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="w-8 h-8 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center">
                <X size={14} />
              </button>
            </div>
            <div className="p-5 space-y-3.5">
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Date</label>
                <input type="date" value={editDay} max={calendarYmd(clock.tz)} onChange={(e) => setEditDay(e.target.value)} className="w-full h-11 rounded-xl border-2 border-gray-200 px-3 text-sm outline-none focus:border-[#1B6FE8]" />
                <p className="text-[11px] text-gray-400 mt-1">Today or any previous day.</p>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Check in</label>
                <input type="time" value={editCheckIn} onChange={(e) => setEditCheckIn(e.target.value)} className="w-full h-11 rounded-xl border-2 border-gray-200 px-3 text-sm outline-none focus:border-[#1B6FE8]" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={editStillOpen} onChange={(e) => setEditStillOpen(e.target.checked)} className="rounded border-gray-300" />
                Still checked in
              </label>
              {!editStillOpen ? (
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Check out</label>
                  <input type="time" value={editCheckOut} onChange={(e) => setEditCheckOut(e.target.value)} className="w-full h-11 rounded-xl border-2 border-gray-200 px-3 text-sm outline-none focus:border-[#1B6FE8]" />
                </div>
              ) : null}
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button type="button" onClick={() => setEditing(null)} className="flex-1 h-11 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm">Cancel</button>
              <button type="button" onClick={() => void saveEdit()} disabled={savingEdit} className="flex-1 h-11 rounded-xl bg-[#1B6FE8] text-white font-semibold text-sm disabled:opacity-50">
                {savingEdit ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {overtimeEdit && canReview ? (
        <div className="fixed inset-0 z-[120] bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-[#111827]">Edit overtime comment</h3>
                <p className="text-xs text-gray-400 mt-0.5">{overtimeEdit.personName} · this will say edited by you</p>
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
                onClick={() => void reviewOvertimeComment(overtimeEdit.overtimeId!, "edit", overtimeText)}
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

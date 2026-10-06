"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage } from "@/lib/api";

function pktMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

type Person = {
  personKey: string;
  personName: string;
  checkIn: string;
  checkOut: string;
  saved: boolean;
  carriedFrom: string | null;
};

type Dept = {
  department: string;
  label: string;
  checkIn: string;
  checkOut: string;
  saved: boolean;
  carriedFrom: string | null;
  employees: Person[];
};

function statusLine(saved: boolean, carriedFrom: string | null) {
  if (saved) return "Saved for this month";
  if (carriedFrom) return `Keeps ${carriedFrom} until you save this month`;
  return "Default hours";
}

function windowLabel(checkIn: string, checkOut: string) {
  return checkOut <= checkIn ? "Overnight" : "Same day";
}

export default function ShiftHoursCard() {
  const pathname = usePathname();
  const ceo = pathname.startsWith("/admin");
  const [month, setMonth] = useState(pktMonth);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async (ym: string) => {
    setLoading(true);
    try {
      const res = await API.get("/attendance/shift-schedules", { params: { month: ym } });
      setDepartments(res.data.departments ?? []);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not load shift hours."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ceo) return;
    void load(month);
  }, [ceo, load, month]);

  if (!ceo) return null;

  async function save(department: string, personKey: string, personName: string, checkIn: string, checkOut: string) {
    const key = `${department}:${personKey}`;
    setBusy(key);
    try {
      await API.put("/attendance/shift-schedules", {
        month,
        department,
        personKey,
        personName,
        checkIn,
        checkOut,
      });
      toast.success("Shift hours saved.");
      await load(month);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not save shift hours."));
    } finally {
      setBusy("");
    }
  }

  async function clear(department: string, personKey: string) {
    const key = `${department}:${personKey}`;
    setBusy(key);
    try {
      await API.delete("/attendance/shift-schedules", { params: { month, department, personKey } });
      toast.success("This month’s hours cleared.");
      await load(month);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not clear shift hours."));
    } finally {
      setBusy("");
    }
  }

  function patchDept(department: string, field: "checkIn" | "checkOut", value: string) {
    setDepartments((list) =>
      list.map((dept) => (dept.department === department ? { ...dept, [field]: value } : dept)),
    );
  }

  function patchPerson(department: string, personKey: string, field: "checkIn" | "checkOut", value: string) {
    setDepartments((list) =>
      list.map((dept) =>
        dept.department === department
          ? {
              ...dept,
              employees: dept.employees.map((person) =>
                person.personKey === personKey ? { ...person, [field]: value } : person,
              ),
            }
          : dept,
      ),
    );
  }

  return (
    <div className="rounded-[1.5rem] sm:rounded-[1.75rem] border border-gray-100/90 dark:border-crm-border bg-white dark:bg-crm-surface shadow-[0_10px_40px_-24px_rgba(15,23,42,0.35)] p-4 sm:p-5 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold text-[#0F172A] dark:text-white text-base sm:text-lg tracking-tight">
            Shift hours
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-xl">
            Pakistan time. Pick a month, then set check-in and check-out for a department or one employee.
            Winter and summer can differ. An employee row overrides the department. A month you leave blank keeps the previous month.
          </p>
        </div>
        <label className="text-xs text-gray-500 dark:text-gray-400">
          Month
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-1 block rounded-lg border border-gray-200 dark:border-crm-border bg-white dark:bg-[#0B1220] px-2 py-1.5 text-sm text-[#0F172A] dark:text-white"
          />
        </label>
      </div>

      {loading && departments.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400 inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading shift hours…
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {departments.map((dept) => {
            const deptBusy = busy === `${dept.department}:`;
            const expanded = open === dept.department;
            return (
              <div key={dept.department} className="rounded-xl border border-gray-100 dark:border-crm-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[9rem] flex-1">
                    <p className="text-sm font-semibold text-[#0F172A] dark:text-white">{dept.label}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {statusLine(dept.saved, dept.carriedFrom)} · {windowLabel(dept.checkIn, dept.checkOut)}
                    </p>
                  </div>
                  <label className="text-[11px] text-gray-500 dark:text-gray-400">
                    Check in
                    <input
                      type="time"
                      value={dept.checkIn}
                      onChange={(e) => patchDept(dept.department, "checkIn", e.target.value)}
                      className="mt-1 block rounded-lg border border-gray-200 dark:border-crm-border bg-white dark:bg-[#0B1220] px-2 py-1 text-sm text-[#0F172A] dark:text-white"
                    />
                  </label>
                  <label className="text-[11px] text-gray-500 dark:text-gray-400">
                    Check out
                    <input
                      type="time"
                      value={dept.checkOut}
                      onChange={(e) => patchDept(dept.department, "checkOut", e.target.value)}
                      className="mt-1 block rounded-lg border border-gray-200 dark:border-crm-border bg-white dark:bg-[#0B1220] px-2 py-1 text-sm text-[#0F172A] dark:text-white"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={deptBusy}
                    onClick={() => void save(dept.department, "", "", dept.checkIn, dept.checkOut)}
                    className="rounded-lg bg-[#0F172A] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {deptBusy ? "Saving…" : "Save department"}
                  </button>
                  {dept.saved ? (
                    <button
                      type="button"
                      disabled={deptBusy}
                      onClick={() => void clear(dept.department, "")}
                      className="rounded-lg border border-gray-200 dark:border-crm-border px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : dept.department)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300"
                  >
                    Employees
                    <ChevronDown size={14} className={expanded ? "rotate-180" : ""} />
                  </button>
                </div>
                {expanded ? (
                  <div className="mt-3 space-y-2 border-t border-gray-100 dark:border-crm-border pt-3">
                    {dept.employees.length === 0 ? (
                      <p className="text-xs text-gray-400">No employees in this department.</p>
                    ) : (
                      dept.employees.map((person) => {
                        const personBusy = busy === `${dept.department}:${person.personKey}`;
                        return (
                          <div key={person.personKey} className="flex flex-wrap items-center gap-2">
                            <div className="min-w-[9rem] flex-1">
                              <p className="text-sm text-[#0F172A] dark:text-white">{person.personName}</p>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                {person.saved ? statusLine(true, null) : person.carriedFrom ? statusLine(false, person.carriedFrom) : "Follows the department"}
                                {" · "}
                                {windowLabel(person.checkIn, person.checkOut)}
                              </p>
                            </div>
                            <input
                              type="time"
                              aria-label={`${person.personName} check in`}
                              value={person.checkIn}
                              onChange={(e) => patchPerson(dept.department, person.personKey, "checkIn", e.target.value)}
                              className="rounded-lg border border-gray-200 dark:border-crm-border bg-white dark:bg-[#0B1220] px-2 py-1 text-sm text-[#0F172A] dark:text-white"
                            />
                            <input
                              type="time"
                              aria-label={`${person.personName} check out`}
                              value={person.checkOut}
                              onChange={(e) => patchPerson(dept.department, person.personKey, "checkOut", e.target.value)}
                              className="rounded-lg border border-gray-200 dark:border-crm-border bg-white dark:bg-[#0B1220] px-2 py-1 text-sm text-[#0F172A] dark:text-white"
                            />
                            <button
                              type="button"
                              disabled={personBusy}
                              onClick={() =>
                                void save(dept.department, person.personKey, person.personName, person.checkIn, person.checkOut)
                              }
                              className="rounded-lg bg-[#0F172A] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {personBusy ? "Saving…" : "Save"}
                            </button>
                            {person.saved ? (
                              <button
                                type="button"
                                disabled={personBusy}
                                onClick={() => void clear(dept.department, person.personKey)}
                                className="rounded-lg border border-gray-200 dark:border-crm-border px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 disabled:opacity-50"
                              >
                                Clear
                              </button>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

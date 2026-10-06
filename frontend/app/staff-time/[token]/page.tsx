"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import API, { apiErrorMessage } from "@/lib/api";
import AttendanceFrame from "@/app/components/AttendanceFrame";

const TOKEN = "r7k2m9qx4p8w3n6";

type Person = { key: string; name: string };
type Row = {
  personKey: string;
  personName: string;
  department: string;
  checkIn: string | null;
  checkOut: string | null;
};

export default function ReviseAttendancePage() {
  const params = useParams<{ token: string }>();
  const token = String(params.token ?? "");
  const [day, setDay] = useState("");
  const [dev, setDev] = useState<Person[]>([]);
  const [chiefs, setChiefs] = useState<Person[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busyKey, setBusyKey] = useState("");

  const apply = (res: { data: { day: string; dev?: Person[]; chiefs?: Person[]; rows?: Row[] } }) => {
    setDay(res.data.day);
    setDev(res.data.dev ?? []);
    setChiefs(res.data.chiefs ?? []);
    setRows(res.data.rows ?? []);
  };

  const load = useCallback(async (nextDay?: string) => {
    if (token !== TOKEN) return;
    const res = await API.get(`/attendance/revise/${token}`, { params: { day: nextDay || undefined } });
    apply(res);
  }, [token]);

  useEffect(() => {
    if (token !== TOKEN) return;
    let cancelled = false;
    API.get(`/attendance/revise/${token}`)
      .then((res) => {
        if (!cancelled) apply(res);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load times.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (token !== TOKEN) {
    return (
      <div className="min-h-[100dvh] bg-[#EEF1F7] grid place-items-center text-sm text-gray-500 px-4">
        Page not found.
      </div>
    );
  }

  const save = async (department: "dev" | "chief_estimator", person: Person, checkIn: string, checkOut: string) => {
    if (!day) return;
    setBusyKey(person.key);
    try {
      await API.post(`/attendance/revise/${token}`, {
        department,
        personKey: person.key,
        personName: person.name,
        day,
        checkIn,
        checkOut,
      });
      toast.success("Saved.");
      await load(day);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not save time."));
    } finally {
      setBusyKey("");
    }
  };

  const groups: { title: string; department: "dev" | "chief_estimator"; people: Person[] }[] = [
    { title: "Dev", department: "dev", people: dev },
    { title: "Chief Estimator", department: "chief_estimator", people: chiefs },
  ];

  return (
    <AttendanceFrame
      title="Times"
      subtitle="Pick any date for Dev or Chief Estimator, then save check-in and check-out."
    >
      <div className="space-y-5">
        <label className="block rounded-3xl bg-white shadow-[0_20px_50px_-28px_rgba(15,23,42,0.45)] px-5 py-5 sm:px-7 sm:flex sm:items-end sm:justify-between sm:gap-6">
          <span>
            <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-[#1B6FE8]">Date</span>
            <span className="mt-1 block text-sm text-gray-500">Any day. Pakistan time.</span>
          </span>
          <input
            type="date"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              void load(e.target.value);
            }}
            className="mt-3 sm:mt-0 h-12 w-full sm:w-56 rounded-2xl border border-gray-200 px-3 text-base bg-[#F8FAFC]"
          />
        </label>

        <div className="grid gap-4 xl:grid-cols-2">
          {groups.map((group) => (
            <section key={group.department} className="rounded-3xl bg-white shadow-[0_20px_50px_-28px_rgba(15,23,42,0.45)] overflow-hidden">
              <h2 className="px-5 sm:px-7 py-4 font-bold text-base border-b border-gray-100">{group.title}</h2>
              {group.people.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-400">No one in this list.</p>
              ) : group.people.map((person) => {
                const row = rows.find((r) => r.personKey === person.key && r.department === group.department);
                return (
                  <PersonRow
                    key={`${person.key}:${day}:${row?.checkIn ?? ""}:${row?.checkOut ?? ""}`}
                    person={person}
                    row={row}
                    busy={busyKey === person.key}
                    onSave={(checkIn, checkOut) => void save(group.department, person, checkIn, checkOut)}
                  />
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </AttendanceFrame>
  );
}

function PersonRow({
  person,
  row,
  busy,
  onSave,
}: {
  person: Person;
  row?: Row;
  busy: boolean;
  onSave: (checkIn: string, checkOut: string) => void;
}) {
  const [checkIn, setCheckIn] = useState(row?.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(row?.checkOut ?? "");
  const [stillIn, setStillIn] = useState(Boolean(row?.checkIn) && !row?.checkOut);

  return (
    <div className="px-5 sm:px-7 py-5 border-t border-gray-50 space-y-3">
      <p className="text-base font-bold">{person.name}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Check in
          <input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="mt-1.5 w-full h-12 rounded-2xl border border-gray-200 bg-[#F8FAFC] px-3 text-base" />
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Check out
          <input
            type="time"
            value={stillIn ? "" : checkOut}
            disabled={stillIn}
            onChange={(e) => setCheckOut(e.target.value)}
            className="mt-1.5 w-full h-12 rounded-2xl border border-gray-200 bg-[#F8FAFC] px-3 text-base disabled:opacity-50"
          />
        </label>
      </div>
      <label className="inline-flex items-center gap-2 text-sm text-[#0F172A]">
        <input
          type="checkbox"
          checked={stillIn}
          onChange={(e) => {
            setStillIn(e.target.checked);
            if (e.target.checked) setCheckOut("");
          }}
        />
        Still checked in
      </label>
      <button
        type="button"
        disabled={busy || !checkIn}
        onClick={() => onSave(checkIn, stillIn ? "" : checkOut)}
        className="w-full sm:w-auto sm:min-w-40 h-12 px-5 rounded-2xl bg-[#0F172A] text-white text-sm font-semibold disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save this date"}
      </button>
    </div>
  );
}

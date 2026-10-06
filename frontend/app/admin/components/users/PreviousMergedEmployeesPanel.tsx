"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { GitMerge, Loader2, Search, Unlink, Users } from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage } from "@/lib/api";
import { payrollHeadShortLabel } from "@/app/admin/utils/accountsPayrollHeads";
import type { StaffEmployeeRow } from "./AllEmployeesPanel";

type PreviousRow = {
  id: string;
  previousName: string;
  previousNameKey?: string;
  currentName: string | null;
  currentStaffId: string | null;
  payrollHead: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  status: "previous" | "merged";
  pfAllTime: number;
  mergedAt: string | null;
};

function money(n: number): string {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function ymLabel(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 7);
}

type Props = {
  currentEmployees: StaffEmployeeRow[];
  refreshKey?: number;
};

export default function PreviousMergedEmployeesPanel({ currentEmployees, refreshKey = 0 }: Props) {
  const [rows, setRows] = useState<PreviousRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedPrevId, setSelectedPrevId] = useState<string | null>(null);
  const [selectedNewId, setSelectedNewId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const applyList = (list: PreviousRow[]) => setRows(list);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("/admin/staff-employees/previous");
      applyList((res.data?.previous as PreviousRow[]) ?? []);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load previous employees"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const previous = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter(r => r.status !== "merged");
    if (!q) return list;
    return list.filter(r =>
      [r.previousName, r.payrollHead]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const merged = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter(r => r.status === "merged");
    if (!q) return list;
    return list.filter(r =>
      [r.previousName, r.currentName, r.payrollHead]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const newNames = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = currentEmployees
      .filter(e => e.name.trim())
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return list;
    return list.filter(e =>
      [e.name, e.payrollHead, e.employeeCode]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q)),
    );
  }, [currentEmployees, search]);

  const selectedPrev = previous.find(r => r.id === selectedPrevId) ?? null;
  const selectedNew = newNames.find(e => e.id === selectedNewId) ?? null;

  const confirmMerge = async () => {
    if (!selectedPrev || !selectedNew) {
      toast.error("Select one previous name and one current name");
      return;
    }
    if (selectedPrev.previousName.trim().toLowerCase() === selectedNew.name.trim().toLowerCase()) {
      toast.error("Pick two different names");
      return;
    }
    if (
      !confirm(
        `Merge “${selectedPrev.previousName}” into “${selectedNew.name}”? PF under the previous name will count toward ${selectedNew.name} All time.`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const res = await API.post("/admin/staff-employees/previous/merge-pair", {
        previousName: selectedPrev.previousName,
        currentStaffId: selectedNew.id,
        currentName: selectedNew.name,
        currentUserId: selectedNew.userId,
      });
      applyList((res.data?.previous as PreviousRow[]) ?? []);
      toast.success(`Merged ${selectedPrev.previousName} → ${selectedNew.name}`);
      setSelectedPrevId(null);
      setSelectedNewId(null);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Merge failed"));
    } finally {
      setSaving(false);
    }
  };

  const unmerge = async (row: PreviousRow) => {
    if (!confirm(`Undo merge of “${row.previousName}” from “${row.currentName}”?`)) return;
    try {
      const res = await API.post(`/admin/staff-employees/previous/${row.id}/unmerge`);
      applyList((res.data?.previous as PreviousRow[]) ?? []);
      toast.success("Merge undone");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Unmerge failed"));
    }
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-start gap-2.5 px-0.5">
        <span className="w-1 h-10 rounded-full bg-[#0F766E] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h2 className="font-extrabold text-[#0F172A] text-sm tracking-tight">
            Previous &amp; merged employees
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
            Tick one previous name and one current name, then Merge. PF All time on the new name
            will include everything recorded under the old name (Mar–Jul 2026).
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search names…"
            className="w-full h-10 pl-10 pr-3 rounded-2xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-[#0F766E]/20"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-gray-500 font-semibold min-w-0">
            {selectedPrev && selectedNew
              ? `${selectedPrev.previousName} → ${selectedNew.name}`
              : "Select one name from each list"}
          </p>
          <button
            type="button"
            disabled={saving || !selectedPrev || !selectedNew}
            onClick={() => void confirmMerge()}
            className="h-10 px-4 rounded-2xl text-sm font-bold bg-[#0F766E] text-white hover:bg-[#0d5f58] disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <GitMerge size={15} />}
            Merge selected
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Previous</p>
          <p className="text-xl font-extrabold text-amber-700 mt-0.5">
            {rows.filter(r => r.status !== "merged").length}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Current / new</p>
          <p className="text-xl font-extrabold text-teal-700 mt-0.5">{currentEmployees.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <NamePickTable
          title="Previous names"
          empty="No leftover names from Mar–Jul accounts."
          loading={loading}
          count={previous.length}
        >
          {previous.map(r => {
            const checked = selectedPrevId === r.id;
            return (
              <tr
                key={r.id}
                className={`border-b border-gray-50 cursor-pointer ${checked ? "bg-amber-50/80" : "hover:bg-[#FAFBFC]"}`}
                onClick={() => setSelectedPrevId(checked ? null : r.id)}
              >
                <td className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSelectedPrevId(checked ? null : r.id)}
                    onClick={e => e.stopPropagation()}
                    className="w-4 h-4 rounded border-gray-300 text-[#0F766E] accent-[#0F766E]"
                  />
                </td>
                <td className="px-2 py-3">
                  <p className="text-sm font-semibold text-[#0F172A]">{r.previousName}</p>
                  {r.payrollHead && (
                    <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                      {payrollHeadShortLabel(r.payrollHead)}
                    </p>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                  {ymLabel(r.firstSeen)} → {ymLabel(r.lastSeen)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-gray-800">
                  {money(r.pfAllTime)}
                </td>
              </tr>
            );
          })}
        </NamePickTable>

        <NamePickTable
          title="Current / new names"
          empty="No employees on the current roster."
          loading={false}
          count={newNames.length}
          headers={["", "Name", "Team / code"]}
        >
          {newNames.map(e => {
            const checked = selectedNewId === e.id;
            return (
              <tr
                key={e.id}
                className={`border-b border-gray-50 cursor-pointer ${checked ? "bg-teal-50/80" : "hover:bg-[#FAFBFC]"}`}
                onClick={() => setSelectedNewId(checked ? null : e.id)}
              >
                <td className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSelectedNewId(checked ? null : e.id)}
                    onClick={ev => ev.stopPropagation()}
                    className="w-4 h-4 rounded border-gray-300 text-[#0F766E] accent-[#0F766E]"
                  />
                </td>
                <td className="px-2 py-3">
                  <p className="text-sm font-semibold text-[#0F172A]">{e.name}</p>
                </td>
                <td className="px-4 py-3 text-[11px] text-gray-500 font-semibold">
                  {e.payrollHead ? payrollHeadShortLabel(e.payrollHead) : "—"}
                  {e.employeeCode ? ` · ${e.employeeCode}` : ""}
                </td>
              </tr>
            );
          })}
        </NamePickTable>
      </div>

      <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 bg-[#FAFBFC] flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Merged</h3>
          <span className="text-[10px] font-bold text-teal-700">{merged.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-white border-b border-gray-100">
                <th className="px-5 py-3">Previous name</th>
                <th className="px-4 py-3">Merged into</th>
                <th className="px-4 py-3">Seen</th>
                <th className="px-4 py-3 text-right">PF (old name)</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-5 py-4" colSpan={5}>
                    <div className="h-9 bg-gray-100 rounded-xl animate-pulse" />
                  </td>
                </tr>
              ) : merged.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <Users size={24} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">
                      No merges yet. Tick one name from each list and click Merge selected.
                    </p>
                  </td>
                </tr>
              ) : (
                merged.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-[#FAFBFC]">
                    <td className="px-5 py-3">
                      <p className="text-sm font-semibold text-[#0F172A]">{r.previousName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-1 rounded-lg bg-teal-50 text-teal-800 text-[11px] font-bold">
                        {r.currentName || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {ymLabel(r.firstSeen)} → {ymLabel(r.lastSeen)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-gray-800">
                      {money(r.pfAllTime)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void unmerge(r)}
                        className="h-8 px-3 rounded-xl text-[11px] font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 inline-flex items-center gap-1.5"
                      >
                        <Unlink size={13} />
                        Undo
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NamePickTable({
  title,
  empty,
  loading,
  count,
  headers = ["", "Name", "Seen", "PF (old)"],
  children,
}: {
  title: string;
  empty: string;
  loading: boolean;
  count: number;
  headers?: string[];
  children: ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-gray-100 bg-[#FAFBFC] flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{title}</h3>
        <span className="text-[10px] font-bold text-gray-400">{count}</span>
      </div>
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full min-w-[420px]">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
              {headers.map((h, i) => (
                <th
                  key={`${h}-${i}`}
                  className={`px-3 py-3 ${i === 0 ? "px-4 w-10" : ""} ${i === headers.length - 1 && h.toLowerCase().includes("pf") ? "text-right px-4" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1, 2, 3].map(i => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-5 py-4" colSpan={headers.length}>
                    <div className="h-9 bg-gray-100 rounded-xl animate-pulse" />
                  </td>
                </tr>
              ))
            ) : count === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-5 py-12 text-center">
                  <Users size={24} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">{empty}</p>
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

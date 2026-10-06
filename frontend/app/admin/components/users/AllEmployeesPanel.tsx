"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive, CheckSquare, Plus, Pencil, Trash2, UserPlus, Users, X, Loader2, Search, FileText,
} from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage, getApiBase } from "@/lib/api";
import RequiredMark from "@/app/components/form/RequiredMark";
import { PdfPreview } from "@/app/components/chat/MessageExtras";
import { ACCOUNTS_PAYROLL_HEADS, payrollHeadShortLabel } from "@/app/admin/utils/accountsPayrollHeads";
import PreviousMergedEmployeesPanel from "./PreviousMergedEmployeesPanel";

/** Same preview rules as Admin → Users (Cloudinary raw PDFs blank in iframes). */
function cnicDocumentPreview(url: string): { kind: "image" | "pdf"; src: string } {
  const u = url.trim();
  if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(u)) {
    return { kind: "image", src: u };
  }
  if (u.includes("/image/upload/") && /\.pdf(\?|$)/i.test(u)) {
    return { kind: "image", src: u.replace("/upload/", "/upload/f_jpg,pg_1,q_auto,w_900/") };
  }
  if (u.includes("/raw/upload/") || /\.pdf(\?|$)/i.test(u)) {
    return {
      kind: "pdf",
      src: `https://docs.google.com/gview?url=${encodeURIComponent(u)}&embedded=true`,
    };
  }
  return { kind: "pdf", src: u };
}

export type StaffEmployeeRow = {
  id: string;
  userId: string | null;
  source: "dashboard" | "manual";
  company: "BEM" | "GPS" | string;
  role: string;
  manualRole: string | null;
  name: string;
  email: string | null;
  employeeCode: string | null;
  fatherName: string | null;
  currentAddress: string | null;
  contactNo: string | null;
  cnic: string | null;
  cnicPdfUrl: string | null;
  profilePic: string | null;
  csrCode: string | null;
  isActive: boolean;
  isOnline: boolean;
  lastActive: string | null;
  notes: string | null;
  allowedIps: string[];
  payrollHead: string | null;
  payrollStartMonth: string | null;
  createdAt: string;
  updatedAt: string;
};

type DashboardUserOption = {
  id: string;
  name: string;
  email: string;
  role: string;
  employeeCode: string | null;
  profilePic: string | null;
  company: "BEM" | "GPS";
};

type ManualForm = {
  name: string;
  manualRole: string;
  company: "BEM" | "GPS";
  email: string;
  employeeCode: string;
  fatherName: string;
  currentAddress: string;
  contactNo: string;
  cnic: string;
  cnicPdfUrl: string;
  csrCode: string;
  notes: string;
  allowedIps: string[];
  payrollHead: string;
  payrollStartMonth: string;
};

const EMPTY_MANUAL: ManualForm = {
  name: "",
  manualRole: "",
  company: "BEM",
  email: "",
  employeeCode: "",
  fatherName: "",
  currentAddress: "",
  contactNo: "",
  cnic: "",
  cnicPdfUrl: "",
  csrCode: "",
  notes: "",
  allowedIps: [""],
  payrollHead: "",
  payrollStartMonth: "",
};

type AllEmployeesPanelProps = {
  dashboardUsers: DashboardUserOption[];
};

export default function AllEmployeesPanel({ dashboardUsers }: AllEmployeesPanelProps) {
  const [employees, setEmployees] = useState<StaffEmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [editing, setEditing] = useState<StaffEmployeeRow | null>(null);
  const [detail, setDetail] = useState<StaffEmployeeRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pickSearch, setPickSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [manualForm, setManualForm] = useState<ManualForm>(EMPTY_MANUAL);
  const [uploadingCnic, setUploadingCnic] = useState(false);
  const [oldListTick, setOldListTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await API.get("/admin/staff-employees");
      setEmployees((res.data?.employees as StaffEmployeeRow[]) ?? []);
    } catch {
      toast.error("Failed to load All Employees");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const linkedUserIds = useMemo(
    () => new Set(employees.map((e) => e.userId).filter(Boolean) as string[]),
    [employees],
  );

  const pickableUsers = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    return dashboardUsers
      .filter((u) => !linkedUserIds.has(u.id))
      .filter((u) => {
        if (!q) return true;
        return (
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q) ||
          (u.employeeCode ?? "").toLowerCase().includes(q)
        );
      });
  }, [dashboardUsers, linkedUserIds, pickSearch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      [e.name, e.email, e.role, e.manualRole, e.employeeCode, e.contactNo, e.company, e.cnic, e.fatherName, e.payrollHead, ...(e.allowedIps ?? [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [employees, search]);

  const togglePick = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePickAll = () => {
    if (selectedIds.size === pickableUsers.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(pickableUsers.map((u) => u.id)));
  };

  const addFromUsers = async () => {
    if (!selectedIds.size) {
      toast.error("Select at least one employee");
      return;
    }
    setSaving(true);
    try {
      const res = await API.post("/admin/staff-employees/from-users", {
        userIds: [...selectedIds],
      });
      setEmployees((res.data?.employees as StaffEmployeeRow[]) ?? []);
      const added = Number(res.data?.added ?? 0);
      const skipped = Number(res.data?.skipped ?? 0);
      toast.success(
        skipped > 0
          ? `Added ${added} · ${skipped} already on list`
          : `Added ${added} employee${added === 1 ? "" : "s"}`,
      );
      setPickOpen(false);
      setSelectedIds(new Set());
      setPickSearch("");
    } catch {
      toast.error("Failed to add selected users");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (row?: StaffEmployeeRow) => {
    if (row) {
      setEditing(row);
      setManualForm({
        name: row.name || "",
        manualRole: row.manualRole || row.role || "",
        company: row.company === "GPS" ? "GPS" : "BEM",
        email: row.email || "",
        employeeCode: row.employeeCode || "",
        fatherName: row.fatherName || "",
        currentAddress: row.currentAddress || "",
        contactNo: row.contactNo || "",
        cnic: row.cnic || "",
        cnicPdfUrl: row.cnicPdfUrl || "",
        csrCode: row.csrCode || "",
        notes: row.notes || "",
        allowedIps: row.allowedIps?.length ? row.allowedIps : [""],
        payrollHead: row.payrollHead || "",
        payrollStartMonth: row.payrollStartMonth || "",
      });
    } else {
      setEditing(null);
      setManualForm(EMPTY_MANUAL);
    }
    setManualOpen(true);
  };

  const handleCnicUpload = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are allowed for CNIC.");
      return;
    }
    setUploadingCnic(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${getApiBase()}/users/upload-cnic`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "CNIC PDF upload failed.");
        return;
      }
      setManualForm((f) => ({ ...f, cnicPdfUrl: data.url }));
      toast.success("CNIC PDF uploaded.");
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploadingCnic(false);
    }
  };

  const saveEmployee = async () => {
    if (!manualForm.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const isManual = !editing || editing.source === "manual";
    if (isManual && !manualForm.manualRole.trim()) {
      toast.error("Role is required");
      return;
    }
    if (manualForm.payrollHead && !manualForm.payrollStartMonth) {
      toast.error("Select start month for Accounts payroll head");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: manualForm.name.trim(),
        manualRole: manualForm.manualRole.trim() || editing?.role || null,
        company: manualForm.company,
        email: manualForm.email.trim() || null,
        employeeCode: manualForm.employeeCode.trim() || null,
        fatherName: manualForm.fatherName.trim() || null,
        currentAddress: manualForm.currentAddress.trim() || null,
        contactNo: manualForm.contactNo.trim() || null,
        cnic: manualForm.cnic.trim() || null,
        cnicPdfUrl: manualForm.cnicPdfUrl.trim() || null,
        csrCode: manualForm.csrCode.trim() || null,
        notes: manualForm.notes.trim() || null,
        ...(isManual
          ? { allowedIps: manualForm.allowedIps.map((v) => v.trim()).filter(Boolean).slice(0, 5) }
          : {}),
        payrollHead: manualForm.payrollHead || null,
        payrollStartMonth: manualForm.payrollHead
          ? manualForm.payrollStartMonth || null
          : null,
      };
      const res = editing
        ? await API.put(`/admin/staff-employees/${editing.id}`, payload)
        : await API.post("/admin/staff-employees", payload);
      setEmployees((res.data?.employees as StaffEmployeeRow[]) ?? []);
      toast.success(editing ? "Employee updated" : "Employee added");
      setManualOpen(false);
      setEditing(null);
      setManualForm(EMPTY_MANUAL);
      if (detail && editing && detail.id === editing.id) {
        const next = ((res.data?.employees as StaffEmployeeRow[]) ?? []).find((x) => x.id === editing.id);
        if (next) setDetail(next);
      }
    } catch {
      toast.error(editing ? "Update failed" : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const moveToOld = async (row: StaffEmployeeRow) => {
    const loginNote = row.source === "dashboard" ? " Their dashboard login stays." : "";
    if (!confirm(`Move ${row.name} to old employees? They will leave All Employees and show under Previous names.${loginNote}`)) return;
    try {
      const res = await API.post(`/admin/staff-employees/${row.id}/move-to-previous`);
      setEmployees((res.data?.employees as StaffEmployeeRow[]) ?? []);
      setOldListTick((n) => n + 1);
      toast.success(`${row.name} moved to old employees`);
      if (detail?.id === row.id) setDetail(null);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not move employee"));
    }
  };

  const removeEmployee = async (row: StaffEmployeeRow) => {
    if (!confirm(`Remove ${row.name} from All Employees?`)) return;
    try {
      const res = await API.delete(`/admin/staff-employees/${row.id}`);
      setEmployees((res.data?.employees as StaffEmployeeRow[]) ?? []);
      toast.success("Removed from All Employees");
      if (detail?.id === row.id) setDetail(null);
    } catch {
      toast.error("Remove failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all employees…"
            className="w-full h-10 pl-10 pr-3 rounded-2xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/20"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedIds(new Set());
              setPickSearch("");
              setPickOpen(true);
            }}
            className="h-10 px-4 rounded-2xl text-sm font-semibold bg-white border border-gray-200 text-gray-800 hover:bg-gray-50 inline-flex items-center gap-2"
          >
            <CheckSquare size={15} />
            From dashboard users
          </button>
          <button
            type="button"
            onClick={() => openEdit()}
            className="h-10 px-4 rounded-2xl text-sm font-semibold bg-[#1B6FE8] text-white hover:bg-[#a30f27] inline-flex items-center gap-2 shadow-sm shadow-[#1B6FE8]/20"
          >
            <UserPlus size={15} />
            Add manual employee
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total</p>
          <p className="text-xl font-extrabold text-[#0F172A] mt-0.5">{employees.length}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Dashboard linked</p>
          <p className="text-xl font-extrabold text-emerald-700 mt-0.5">
            {employees.filter((e) => e.source === "dashboard").length}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-3.5 col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Manual (no login)</p>
          <p className="text-xl font-extrabold text-slate-700 mt-0.5">
            {employees.filter((e) => e.source === "manual").length}
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-[#FAFBFC] border-b border-gray-100">
                <th className="px-5 py-3.5">Employee</th>
                <th className="px-4 py-3.5">Role</th>
                <th className="px-4 py-3.5">Accounts head</th>
                <th className="px-4 py-3.5">From month</th>
                <th className="px-4 py-3.5">CNIC</th>
                <th className="px-4 py-3.5">Contact</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3].map((i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-5 py-4" colSpan={7}>
                      <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center">
                    <Users size={28} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm font-semibold text-gray-600">No employees on this list yet</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Pick dashboard users with checkboxes, or add someone without a login.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-[#FAFBFC]">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm overflow-hidden shrink-0 ${
                            e.profilePic ? "" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {e.profilePic ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={e.profilePic} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (e.name || "?").charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-sm font-semibold text-[#0F172A] truncate">{e.name || "—"}</h3>
                            {e.employeeCode && (
                              <span className="inline-flex items-center bg-slate-100 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded-md font-mono">
                                {e.employeeCode}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 truncate">{e.email || "No email"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700">
                        {e.role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-semibold text-gray-700 max-w-[140px]">
                      {e.payrollHead ? (
                        <span className="inline-flex px-2 py-1 rounded-lg bg-teal-50 text-teal-800 text-[10px] font-bold">
                          {payrollHeadShortLabel(e.payrollHead)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-mono text-gray-600 whitespace-nowrap">
                      {e.payrollStartMonth || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-mono text-gray-700 whitespace-nowrap">
                      {e.cnic || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                      {e.contactNo || "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetail(e)}
                          className="h-8 px-3 rounded-xl text-[11px] font-bold bg-gray-100 text-gray-700 hover:bg-gray-200"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(e)}
                          className="w-8 h-8 rounded-xl text-blue-600 hover:bg-blue-50 inline-flex items-center justify-center"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void moveToOld(e)}
                          className="w-8 h-8 rounded-xl text-amber-700 hover:bg-amber-50 inline-flex items-center justify-center"
                          title="Move to old employees"
                        >
                          <Archive size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeEmployee(e)}
                          className="w-8 h-8 rounded-xl text-red-500 hover:bg-red-50 inline-flex items-center justify-center"
                          title="Remove from list"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pick dashboard users */}
      {pickOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 bg-black/40" onClick={() => setPickOpen(false)}>
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[#0F172A] text-sm">Add from dashboard users</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Select users with checkboxes — role and details fill in automatically
                </p>
              </div>
              <button type="button" onClick={() => setPickOpen(false)} className="w-8 h-8 rounded-xl hover:bg-gray-100 inline-flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-3 border-b border-gray-50 space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={pickSearch}
                  onChange={(e) => setPickSearch(e.target.value)}
                  placeholder="Search users…"
                  className="w-full h-9 pl-9 pr-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/20"
                />
              </div>
              <button
                type="button"
                onClick={togglePickAll}
                className="text-[11px] font-bold text-[#1B6FE8] hover:underline"
              >
                {selectedIds.size === pickableUsers.length && pickableUsers.length > 0
                  ? "Clear all"
                  : "Select all visible"}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              {pickableUsers.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-10">
                  {dashboardUsers.length === 0
                    ? "No dashboard users loaded."
                    : "All dashboard users are already on this list."}
                </p>
              ) : (
                pickableUsers.map((u) => {
                  const checked = selectedIds.has(u.id);
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer border transition-colors ${
                        checked ? "bg-[#EAF2FE] border-[#1B6FE8]/25" : "border-transparent hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePick(u.id)}
                        className="w-4 h-4 rounded border-gray-300 text-[#1B6FE8] focus:ring-[#1B6FE8]"
                      />
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 overflow-hidden shrink-0">
                        {u.profilePic ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.profilePic} alt="" className="w-full h-full object-cover" />
                        ) : (
                          u.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#0F172A] truncate">{u.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {u.role} · {u.company} · {u.email}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between gap-2 bg-[#FAFBFC]">
              <p className="text-[11px] text-gray-400 font-medium">{selectedIds.size} selected</p>
              <button
                type="button"
                disabled={saving || selectedIds.size === 0}
                onClick={() => void addFromUsers()}
                className="h-9 px-4 rounded-xl text-xs font-bold bg-[#1B6FE8] text-white hover:bg-[#a30f27] disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Add to All Employees
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit employee form */}
      {manualOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 bg-black/40" onClick={() => setManualOpen(false)}>
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-[#0F172A] text-sm">
                  {editing
                    ? editing.source === "dashboard"
                      ? "Edit employee info"
                      : "Edit manual employee"
                    : "Add manual employee"}
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {editing?.source === "dashboard"
                    ? "Updates dashboard user profile (CNIC, contact, address…)"
                    : "No dashboard login — fill employee info + free-text role"}
                </p>
              </div>
              <button type="button" onClick={() => setManualOpen(false)} className="w-8 h-8 rounded-xl hover:bg-gray-100 inline-flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-xs font-semibold text-gray-600">
                Name <RequiredMark />
                <input
                  value={manualForm.name}
                  onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/20"
                />
              </label>
              {(!editing || editing.source === "manual") && (
                <label className="block text-xs font-semibold text-gray-600">
                  Role <RequiredMark />
                  <span className="text-[10px] font-normal text-gray-400 ml-1">(e.g. Driver, HR, Office Boy)</span>
                  <input
                    value={manualForm.manualRole}
                    onChange={(e) => setManualForm({ ...manualForm, manualRole: e.target.value })}
                    placeholder="Type role…"
                    className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/20"
                  />
                </label>
              )}
              {editing?.source === "dashboard" && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Dashboard role</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{editing.role}</p>
                </div>
              )}
              {(!editing || editing.source === "manual") && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1.5">Company</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["BEM", "GPS"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setManualForm({ ...manualForm, company: c })}
                        className={`h-10 rounded-xl text-xs font-bold border transition-colors ${
                          manualForm.company === c
                            ? c === "GPS"
                              ? "bg-[#0F398A] text-white border-[#0F398A]"
                              : "bg-[#1B6FE8] text-white border-[#1B6FE8]"
                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        {c === "GPS" ? "GPS · Global" : "BEM Solutions"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(!editing || editing.source === "manual") && (
                <div className="border border-gray-100 rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-700">IP access <span className="font-normal text-gray-400">(optional)</span></p>
                      <p className="text-[11px] text-gray-400">Leave blank for the company network only. Up to 5 addresses.</p>
                    </div>
                    {manualForm.allowedIps.length < 5 && (
                      <button
                        type="button"
                        onClick={() => setManualForm((f) => ({ ...f, allowedIps: [...f.allowedIps, ""] }))}
                        className="w-7 h-7 rounded-lg bg-[#1B6FE8] text-white flex items-center justify-center"
                        title="Add IP"
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {manualForm.allowedIps.map((ip, idx) => (
                      <div key={`ip-${idx}`} className="flex items-center gap-2 min-w-0">
                        <input
                          type="text"
                          value={ip}
                          onChange={(e) => {
                            const value = e.target.value;
                            setManualForm((f) => ({
                              ...f,
                              allowedIps: f.allowedIps.map((v, i) => (i === idx ? value : v)),
                            }));
                          }}
                          placeholder={`Approved IP ${idx + 1}`}
                          className="flex-1 min-w-0 h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/20"
                        />
                        {manualForm.allowedIps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setManualForm((f) => ({ ...f, allowedIps: f.allowedIps.filter((_, i) => i !== idx) }))}
                            className="text-xs font-semibold text-red-500 shrink-0 px-1"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pt-1">
                Accounts payroll (Income Statement)
              </p>
              <label className="block text-xs font-semibold text-gray-600">
                Team salary head
                <select
                  value={manualForm.payrollHead}
                  onChange={(e) =>
                    setManualForm({
                      ...manualForm,
                      payrollHead: e.target.value,
                      payrollStartMonth:
                        e.target.value && !manualForm.payrollStartMonth
                          ? new Date().toISOString().slice(0, 7)
                          : e.target.value
                            ? manualForm.payrollStartMonth
                            : manualForm.payrollStartMonth,
                    })
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/20 bg-white"
                >
                  <option value="">— Not in Accounts payroll —</option>
                  {ACCOUNTS_PAYROLL_HEADS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-gray-600">
                Start month {manualForm.payrollHead ? <RequiredMark /> : null}
                <span className="text-[10px] font-normal text-gray-400 ml-1 block sm:inline sm:ml-1">
                  Month when they join this Accounts head (auto-continues after)
                </span>
                <input
                  type="month"
                  value={manualForm.payrollStartMonth}
                  onChange={(e) => setManualForm({ ...manualForm, payrollStartMonth: e.target.value })}
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/20"
                />
              </label>

              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pt-1">Employee Info</p>
              {(
                [
                  ["email", "Email"],
                  ["employeeCode", "Employee Code"],
                  ["csrCode", "CSR / Coding Code"],
                  ["contactNo", "Contact No"],
                  ["fatherName", "Father Name"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-xs font-semibold text-gray-600">
                  {label}
                  <input
                    value={manualForm[key]}
                    onChange={(e) => setManualForm({ ...manualForm, [key]: e.target.value })}
                    className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/20"
                  />
                </label>
              ))}

              <label className="block text-xs font-semibold text-gray-600">
                CNIC
                <input
                  value={manualForm.cnic}
                  onChange={(e) => setManualForm({ ...manualForm, cnic: e.target.value })}
                  placeholder="e.g. 12345-6789012-3"
                  maxLength={15}
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm font-mono outline-none focus:ring-2 focus:ring-[#1B6FE8]/20"
                />
              </label>
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">
                  CNIC Document (PDF)
                  <span className="text-[10px] font-normal text-gray-400 ml-1">(optional)</span>
                </p>
                {manualForm.cnicPdfUrl ? (
                  <div className="mb-2 space-y-2">
                    {(() => {
                      const preview = cnicDocumentPreview(manualForm.cnicPdfUrl);
                      return preview.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={preview.src}
                          alt="CNIC"
                          className="w-full max-h-48 object-contain rounded-xl border border-gray-200 bg-white"
                        />
                      ) : (
                        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                          <iframe src={preview.src} title="CNIC document" className="w-full h-48" />
                        </div>
                      );
                    })()}
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-[#1B6FE8]/20 bg-[#EAF2FE]">
                      <PdfPreview url={manualForm.cnicPdfUrl} fileName="CNIC document" />
                      <button
                        type="button"
                        onClick={() => setManualForm((f) => ({ ...f, cnicPdfUrl: "" }))}
                        className="text-[11px] font-semibold text-gray-500 hover:text-[#1B6FE8] shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : null}
                <label className="flex items-center justify-center gap-2 h-11 rounded-2xl border-2 border-dashed border-gray-200 hover:border-[#1B6FE8]/40 bg-[#FAFAFA] cursor-pointer text-xs font-semibold text-gray-600 hover:text-[#1B6FE8] transition-colors">
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    disabled={uploadingCnic}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleCnicUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <FileText size={14} />
                  {uploadingCnic ? "Uploading PDF…" : manualForm.cnicPdfUrl ? "Replace CNIC PDF" : "Upload CNIC PDF"}
                </label>
                <p className="text-[11px] text-gray-400 mt-1">Same as dashboard users — PDF, max 10MB</p>
              </div>

              {(
                [
                  ["currentAddress", "Current Address"],
                  ["notes", "Notes"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-xs font-semibold text-gray-600">
                  {label}
                  <textarea
                    value={manualForm[key]}
                    onChange={(e) => setManualForm({ ...manualForm, [key]: e.target.value })}
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1B6FE8]/20"
                  />
                </label>
              ))}
            </div>
            <div className="px-5 py-3.5 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="h-9 px-4 rounded-xl text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveEmployee()}
                className="h-9 px-4 rounded-xl text-xs font-bold bg-[#1B6FE8] text-white hover:bg-[#a30f27] disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {editing ? "Save" : "Add employee"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail view */}
      {detail && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 bg-black/40" onClick={() => setDetail(null)}>
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center text-xl font-bold overflow-hidden">
                  {detail.profilePic ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={detail.profilePic} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (detail.name || "?").charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">{detail.name}</h2>
                  <p className="text-sm text-gray-400">{detail.role}</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-2 space-y-3 min-h-0">
              {[
                { label: "Role", value: detail.role },
                { label: "Company", value: detail.company === "GPS" ? "GPS · Global" : "BEM Solutions" },
                { label: "Source", value: detail.source === "dashboard" ? "Dashboard" : "Manual" },
                ...(detail.source === "manual"
                  ? [{ label: "IP access", value: detail.allowedIps?.filter(Boolean).join(", ") || "Company network" }]
                  : []),
                { label: "Email", value: detail.email },
              ].map((f) => (
                <div key={f.label} className="rounded-xl bg-[#F8FAFC] px-3.5 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{f.label}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{f.value || "—"}</p>
                </div>
              ))}
              <div className="rounded-2xl bg-[#F8FAFC] border border-gray-100 p-3.5 space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Employee Info</p>
                {[
                  { label: "Employee Code", value: detail.employeeCode },
                  { label: "Father Name", value: detail.fatherName },
                  { label: "Contact No", value: detail.contactNo },
                  { label: "Current Address", value: detail.currentAddress },
                  { label: "CSR Code", value: detail.csrCode },
                ].map((f) => (
                  <div key={f.label}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{f.label}</p>
                    <p className="text-sm font-medium text-gray-800">{f.value || "—"}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl bg-[#F8FAFC] px-3.5 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">CNIC</p>
                <p className="text-sm font-semibold text-gray-800 mt-0.5 font-mono">{detail.cnic || "—"}</p>
                {detail.cnicPdfUrl ? (
                  <div className="mt-3 space-y-2">
                    {(() => {
                      const preview = cnicDocumentPreview(detail.cnicPdfUrl);
                      return preview.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={preview.src}
                          alt="CNIC"
                          className="w-full max-h-56 object-contain rounded-xl border border-gray-200 bg-white"
                        />
                      ) : (
                        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                          <iframe src={preview.src} title="CNIC document" className="w-full h-56" />
                        </div>
                      );
                    })()}
                    <div className="flex items-center gap-3">
                      <PdfPreview url={detail.cnicPdfUrl} fileName="CNIC document" />
                      <a
                        href={detail.cnicPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-[#1B6FE8] hover:underline"
                      >
                        Open in new tab
                      </a>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="rounded-2xl bg-teal-50/60 border border-teal-100 p-3.5 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-teal-800">Accounts payroll</p>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Head</p>
                  <p className="text-sm font-medium text-gray-800">{detail.payrollHead || "— Not assigned —"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">From month</p>
                  <p className="text-sm font-medium text-gray-800">{detail.payrollStartMonth || "—"}</p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  openEdit(detail);
                  setDetail(null);
                }}
                className="flex-1 h-10 rounded-2xl text-sm font-bold bg-blue-50 text-blue-700 hover:bg-blue-100"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="flex-1 h-10 rounded-2xl text-sm font-bold bg-[#1B6FE8] text-white hover:bg-[#a30f27]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <PreviousMergedEmployeesPanel currentEmployees={employees} refreshKey={oldListTick} />
    </div>
  );
}

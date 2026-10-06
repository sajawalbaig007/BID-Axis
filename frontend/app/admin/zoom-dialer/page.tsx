"use client";

import { useCallback, useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { Eye, EyeOff, Phone, Plus, Trash2 } from "lucide-react";
import DashboardSidebar from "../components/layout/Sidebar";
import DashboardNavbar from "../components/layout/Navbar";
import API, { apiErrorMessage } from "@/lib/api";

type AccountForm = {
  id?: string;
  label: string;
  email: string;
  password: string;
  numbersText: string;
  isActive: boolean;
};

const emptyForm = (): AccountForm => ({
  label: "",
  email: "",
  password: "",
  numbersText: "",
  isActive: true,
});

function fromApi(row: {
  id: string;
  label: string;
  email?: string;
  password?: string;
  numbers: string[];
  isActive: boolean;
}): AccountForm {
  return {
    id: row.id,
    label: row.label,
    email: row.email ?? "",
    password: row.password ?? "",
    numbersText: (row.numbers ?? []).join("\n"),
    isActive: row.isActive !== false,
  };
}

export default function AdminZoomDialerPage() {
  const [accounts, setAccounts] = useState<AccountForm[]>([]);
  const [draft, setDraft] = useState<AccountForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await API.get("/dialer/admin/accounts");
      setAccounts((res.data.accounts ?? []).map(fromApi));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not load Zoom accounts."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (form: AccountForm) => {
    const numbers = form.numbersText.split(/[\n,]+/).map((n) => n.trim()).filter(Boolean);
    if (!form.label.trim()) { toast.error("Account name is required."); return; }
    if (numbers.length === 0) { toast.error("Add at least one number."); return; }
    const key = form.id ?? "new";
    setSavingId(key);
    const body = {
      label: form.label.trim(),
      email: form.email.trim(),
      password: form.password,
      numbers,
      isActive: form.isActive,
    };
    try {
      if (form.id) await API.put(`/dialer/admin/accounts/${form.id}`, body);
      else await API.post("/dialer/admin/accounts", body);
      toast.success(form.id ? "Zoom account updated." : "Zoom account added.");
      setDraft(null);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not save the Zoom account."));
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (form: AccountForm) => {
    if (!form.id) return;
    if (!window.confirm(`Remove ${form.label}? CSRs will no longer see it.`)) return;
    setSavingId(form.id);
    try {
      await API.delete(`/dialer/admin/accounts/${form.id}`);
      toast.success("Zoom account removed.");
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not remove the Zoom account."));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F5F6FA]">
      <Toaster position="top-right" />
      <DashboardSidebar />
      <main className="flex-1 min-w-0 p-3 sm:p-6 overflow-x-hidden mt-[64px]">
        <DashboardNavbar />
        <div className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-800">Zoom dialer</h1>
            <p className="text-sm text-gray-400 mt-1 max-w-xl">
              Add each Zoom account, its sign-in, and the phone numbers on it. A CSR picks the account, then the number, and can save that pair as their default.
            </p>
          </div>
          {!draft && (
            <button
              type="button"
              onClick={() => setDraft(emptyForm())}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-[#1B6FE8] text-white text-sm font-semibold"
            >
              <Plus size={16} /> Add account
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 text-xs text-gray-500 leading-relaxed">
          CSRs click an account, then a number, and Zoom Phone dials from that number.
          Zoom desktop must be installed on the CSR computer and signed in to that account once. Saved email and password are for your records. Zoom only dials from the account already signed in on that computer.
        </div>

        {draft && (
          <AccountCard
            form={draft}
            saving={savingId === "new"}
            onChange={setDraft}
            onSave={() => save(draft)}
            onCancel={() => setDraft(null)}
          />
        )}

        {loading ? (
          <div className="h-32 rounded-2xl bg-white border border-gray-100 animate-pulse" />
        ) : accounts.length === 0 && !draft ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">
            <Phone className="mx-auto mb-2 text-[#1B6FE8]" size={20} />
            No Zoom accounts yet.
          </div>
        ) : (
          <div className="space-y-4">
            {accounts.map((form) => (
              <AccountCard
                key={form.id}
                form={form}
                saving={savingId === form.id}
                onChange={(next) => setAccounts((prev) => prev.map((row) => row.id === next.id ? next : row))}
                onSave={() => save(form)}
                onDelete={() => remove(form)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function AccountCard({
  form, saving, onChange, onSave, onCancel, onDelete,
}: {
  form: AccountForm;
  saving: boolean;
  onChange: (form: AccountForm) => void;
  onSave: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const set = (patch: Partial<AccountForm>) => onChange({ ...form, ...patch });
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm space-y-3">
      <p className="font-semibold text-[#0F172A]">{form.id ? form.label || "Zoom account" : "New Zoom account"}</p>
      <label className="block">
        <span className="text-[11px] font-semibold text-gray-400">Account name</span>
        <input
          value={form.label}
          placeholder="Zoom 1"
          onChange={(e) => set({ label: e.target.value })}
          className="mt-1 w-full h-10 px-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#1B6FE8]"
        />
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-gray-400">Zoom email</span>
          <input
            type="email"
            autoComplete="off"
            value={form.email}
            placeholder="name@email.com"
            onChange={(e) => set({ email: e.target.value })}
            className="mt-1 w-full h-10 px-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#1B6FE8]"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-gray-400">Zoom password</span>
          <span className="mt-1 flex h-10 rounded-xl border border-gray-200 focus-within:border-[#1B6FE8]">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="off"
              value={form.password}
              onChange={(e) => set({ password: e.target.value })}
              className="min-w-0 flex-1 h-full px-3 rounded-l-xl text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="px-3 text-gray-400"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </label>
      </div>
      <label className="block">
        <span className="text-[11px] font-semibold text-gray-400">Numbers on this account, one per line. First line is the main number.</span>
        <textarea
          value={form.numbersText}
          onChange={(e) => set({ numbersText: e.target.value })}
          rows={3}
          placeholder={"+1 202 555 0101"}
          className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#1B6FE8]"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-[#0F172A]">
        <input type="checkbox" className="accent-[#1B6FE8]" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
        Visible to CSRs
      </label>
      <div className="flex items-center justify-end gap-2">
        {onDelete && (
          <button type="button" onClick={onDelete} disabled={saving} className="h-10 px-3 rounded-xl text-[#1B6FE8] text-sm font-semibold inline-flex items-center gap-1.5">
            <Trash2 size={14} /> Remove
          </button>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-10 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">
            Cancel
          </button>
        )}
        <button type="button" onClick={onSave} disabled={saving} className="h-10 px-4 rounded-xl bg-[#1B6FE8] text-white text-sm font-semibold disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

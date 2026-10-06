"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Eye, EyeOff, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import API, { apiErrorMessage } from "@/lib/api";
import { formatEstDate } from "@/lib/estTime";
import type { PortalCompany } from "@/lib/companyGate";
import { COMPANY_META } from "@/lib/companyGate";

type CredentialRow = {
  company: string;
  username: string;
  updatedAt: string;
  createdAt: string;
};

export default function CompanyPortalAccessCard({ company }: { company: PortalCompany }) {
  const meta = COMPANY_META[company];
  const [row, setRow] = useState<CredentialRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState<string>(company);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("/admin/company-credentials");
      const list = (res.data?.credentials ?? []) as CredentialRow[];
      const found = list.find(c => c.company === company) ?? null;
      setRow(found);
      setUsername(found?.username ?? company);
      setPassword("");
      setEditing(!found);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load company access."));
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const name = username.trim();
    if (!name) {
      toast.error("Username is required.");
      return;
    }
    if (!row && !password) {
      toast.error("Password is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await API.put(`/admin/company-credentials/${company}`, {
        username: name,
        password: password || undefined,
      });
      toast.success(res.data?.message ?? "Saved.");
      setEditing(false);
      setPassword("");
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not save company access."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!row) return;
    if (!window.confirm(`Remove ${meta.name} company login? Portals will stay locked until you create it again.`)) {
      return;
    }
    setSaving(true);
    try {
      await API.delete(`/admin/company-credentials/${company}`);
      toast.success(`${meta.name} company access removed.`);
      setRow(null);
      setEditing(true);
      setUsername(company);
      setPassword("");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not delete company access."));
    } finally {
      setSaving(false);
    }
  }

  const accent = meta.accent;

  return (
    <div className="mb-4 rounded-[1.5rem] border border-gray-100 bg-white p-4 sm:p-5 shadow-[0_10px_40px_-24px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>
            Company portal login
          </p>
          <h2 className="text-base sm:text-lg font-bold text-[#0F172A] tracking-tight mt-0.5">
            {meta.name} shared credentials
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Everyone uses this username and password on the landing page before opening {meta.portalsLabel} portals.
          </p>
        </div>
        {!loading && row && !editing && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => { setEditing(true); setUsername(row.username); setPassword(""); }}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Pencil size={13} /> Edit
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-red-100 text-xs font-semibold text-[#1B6FE8] hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="mt-4 h-16 bg-gray-100 rounded-2xl animate-pulse" />
      ) : !editing && row ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#FAFBFC] border border-gray-100 px-4 py-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
            style={{ background: accent }}
          >
            <KeyRound size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Username</p>
            <p className="text-sm font-bold text-[#0F172A] truncate">{row.username}</p>
          </div>
          <p className="ml-auto text-[11px] text-gray-400 hidden sm:block">
            Password hidden · last updated {formatEstDate(row.updatedAt)}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2.5">
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Username"
            className="h-11 rounded-2xl border border-gray-200 px-3.5 text-sm outline-none focus:border-[#1B6FE8]"
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={row ? "New password (optional)" : "Password"}
              className="w-full h-11 rounded-2xl border border-gray-200 px-3.5 pr-11 text-sm outline-none focus:border-[#1B6FE8]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="h-11 px-4 rounded-2xl text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
              style={{ background: accent }}
            >
              <Plus size={14} />
              {row ? "Save" : "Create"}
            </button>
            {row && (
              <button
                type="button"
                onClick={() => { setEditing(false); setPassword(""); setUsername(row.username); }}
                className="h-11 px-3 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

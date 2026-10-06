"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FolderKanban, ChevronRight, ChevronDown, User2, X } from "lucide-react";
import API from "@/lib/api";

type ProjectRow = {
  id: string;
  name: string | null;
  projectTitle: string | null;
  csr: { id: string; name: string; csrCode: string | null } | null;
};

type CSROption = { id: string; name: string; csrCode: string | null };

export default function ActiveProjectsWidget({ enabled = false }: { enabled?: boolean }) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [csrs,     setCsrs]     = useState<CSROption[]>([]);
  const [filter,   setFilter]   = useState("all");
  const [loading,  setLoading]  = useState(false);
  const [open,     setOpen]     = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const load = () => {
      API.get("/admin/csrs")
        .then(res => setCsrs(res.data.csrs ?? []))
        .catch(() => {});
    };
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [enabled]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    const params: Record<string, string> = { lite: "1", limit: "8" };
    if (filter !== "all") params.csrId = filter;

    API.get("/admin/projects", { params })
      .then(res => { if (!cancelled) setProjects(res.data.leads ?? []); })
      .catch(() => { if (!cancelled) setProjects([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filter, enabled]);

  const preview = useMemo(() => projects.slice(0, 5), [projects]);
  const selectedCsr = csrs.find(c => c.id === filter) ?? null;
  const dropdownLabel = selectedCsr
    ? (selectedCsr.csrCode ? `${selectedCsr.csrCode} — ${selectedCsr.name}` : selectedCsr.name)
    : "All CSRs";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <FolderKanban size={16} className="text-[#065F46]" />
          <h3 className="font-semibold text-gray-800 dark:text-crm-text">Project DB</h3>
          {!loading && (
            <span className="text-xs font-bold bg-[#ECFDF5] text-[#065F46] px-2 py-0.5 rounded-lg">
              {projects.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative z-50" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 min-w-[140px] transition-colors ${
                filter !== "all"
                  ? "border-[#1B6FE8] bg-[#EAF2FE] text-[#1B6FE8]"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <User2 size={13} className="shrink-0" />
              <span className="truncate flex-1 text-left">{dropdownLabel}</span>
              {filter !== "all" ? (
                <span
                  role="button"
                  onClick={e => { e.stopPropagation(); setFilter("all"); }}
                  className="shrink-0"
                >
                  <X size={12} />
                </span>
              ) : (
                <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
              )}
            </button>
            {open && (
              <div className="absolute right-0 top-10 z-[60] min-w-[200px] bg-white border border-gray-100 rounded-xl shadow-2xl overflow-hidden max-h-[240px] overflow-y-auto">
                <button
                  type="button"
                  onClick={() => { setFilter("all"); setOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 text-xs font-semibold hover:bg-[#EAF2FE] ${
                    filter === "all" ? "text-[#1B6FE8] bg-[#EAF2FE]" : "text-gray-700"
                  }`}
                >
                  All CSRs
                </button>
                {csrs.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setFilter(c.id); setOpen(false); }}
                    className={`w-full text-left px-3 py-2.5 text-xs font-semibold border-t border-gray-50 hover:bg-[#EAF2FE] truncate ${
                      filter === c.id ? "text-[#1B6FE8] bg-[#EAF2FE]" : "text-gray-700"
                    }`}
                  >
                    {c.csrCode ? `${c.csrCode} — ${c.name}` : c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Link
            href={filter !== "all" ? `/admin/active-projects?csr=${filter}` : "/admin/active-projects"}
            prefetch={false}
            className="text-xs text-[#1B6FE8] hover:underline flex items-center gap-1 whitespace-nowrap"
          >
            View All <ChevronRight size={12} />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : preview.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">
          {filter !== "all" ? "No projects for this CSR." : "No active projects yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {preview.map(p => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {p.projectTitle || p.name || "Untitled project"}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {p.name && p.projectTitle ? p.name : ""}
                  {p.csr?.name ? ` · ${p.csr.csrCode ? `${p.csr.csrCode} ` : ""}${p.csr.name}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

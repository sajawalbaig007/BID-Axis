"use client";

import { useEffect, useState } from "react";
import { X, Briefcase, DollarSign, History, Loader2, Pencil, Plus } from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage } from "@/lib/api";
import { formatEstDate } from "@/lib/estTime";
import ProjectWorkbenchModal from "@/app/components/projects/ProjectWorkbenchModal";
import {
  ProjectWorkbenchData,
  emptyWorkbench,
  parsePayments,
} from "@/lib/projectFields";

type ProjectRow = {
  id: string;
  title: string;
  clientCode?: string | null;
  service?: string | null;
  status?: string | null;
  paidAmount: number;
  deadline?: string | null;
  closedAt?: string;
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  ownerName?: string | null;
  state?: string | null;
  projectCode?: string | null;
  projectTitle?: string | null;
  projectScope?: string | null;
  interestedService?: string | null;
  projectBudget?: string | null;
  projectDeadline?: string | null;
  projectPhase?: string | null;
  takeoffDeadline?: string | null;
  pricingDeadline?: string | null;
  qaDeadline?: string | null;
  projectPayments?: unknown;
  projectNotes?: string | null;
  createdAt?: string | null;
};

type HistoryData = {
  client?: { name: string; company: string; email: string };
  services?: string[];
  totalBusiness?: number;
  projects?: ProjectRow[];
};

interface ClientHistoryModalProps {
  phone: string;
  clientName?: string;
  sourceClientId?: string;
  /** Optional — used to prefill / identify when adding a project */
  sourceClient?: { id: string; name: string };
  onClose: () => void;
  lookupPath?: string;
  editable?: boolean;
  onProjectSaved?: () => void;
  onAddProject?: () => void;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  const label = formatEstDate(iso);
  return label === "—" ? "" : label;
}

function projectToWorkbench(p: ProjectRow): ProjectWorkbenchData {
  const deadlineRaw = p.projectDeadline || p.deadline || "";
  const deadline = typeof deadlineRaw === "string" ? deadlineRaw.split("T")[0] : "";
  return {
    ...emptyWorkbench(),
    id: p.id,
    name: p.name ?? "",
    company: p.company ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    ownerName: p.ownerName ?? "",
    state: p.state ?? "",
    projectCode: p.projectCode || p.clientCode || "",
    projectTitle: p.projectTitle || p.title || "",
    projectScope: p.projectScope ?? "",
    interestedService: p.interestedService || p.service || "",
    projectBudget: p.projectBudget ?? "",
    projectDeadline: deadline,
    projectPhase: p.projectPhase || "not_started",
    takeoffDeadline: typeof p.takeoffDeadline === "string" ? p.takeoffDeadline.split("T")[0] : "",
    pricingDeadline: typeof p.pricingDeadline === "string" ? p.pricingDeadline.split("T")[0] : "",
    qaDeadline: typeof p.qaDeadline === "string" ? p.qaDeadline.split("T")[0] : "",
    projectPayments: parsePayments(p.projectPayments),
    projectNotes: p.projectNotes ?? "",
    projectCreatedAt: p.createdAt ?? "",
  };
}

function leadToWorkbench(lead: Record<string, unknown>): ProjectWorkbenchData {
  const deadline = typeof lead.projectDeadline === "string" ? lead.projectDeadline.split("T")[0] : "";
  return {
    ...emptyWorkbench(),
    id: String(lead.id ?? ""),
    name: String(lead.name ?? ""),
    company: String(lead.company ?? ""),
    phone: String(lead.phone ?? ""),
    email: String(lead.email ?? ""),
    ownerName: String(lead.ownerName ?? ""),
    state: String(lead.state ?? ""),
    projectCode: String(lead.projectCode ?? lead.clientCode ?? ""),
    projectTitle: String(lead.projectTitle ?? ""),
    projectScope: String(lead.projectScope ?? ""),
    interestedService: String(lead.interestedService ?? ""),
    projectBudget: String(lead.projectBudget ?? ""),
    projectDeadline: deadline,
    projectPhase: String(lead.projectPhase ?? "not_started"),
    takeoffDeadline: typeof lead.takeoffDeadline === "string" ? lead.takeoffDeadline.split("T")[0] : "",
    pricingDeadline: typeof lead.pricingDeadline === "string" ? lead.pricingDeadline.split("T")[0] : "",
    qaDeadline: typeof lead.qaDeadline === "string" ? lead.qaDeadline.split("T")[0] : "",
    projectPayments: parsePayments(lead.projectPayments),
    projectNotes: String(lead.projectNotes ?? ""),
    projectCreatedAt: typeof lead.createdAt === "string" ? lead.createdAt : "",
  };
}

export default function ClientHistoryModal({
  phone,
  clientName,
  sourceClientId: _sourceClientId,
  sourceClient: _sourceClient,
  onClose,
  lookupPath = "/csr/lookup-by-phone",
  editable = true,
  onProjectSaved,
  onAddProject,
}: ClientHistoryModalProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HistoryData | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ProjectWorkbenchData | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await API.get(lookupPath, { params: { phone } });
      if (res.data?.found) setData(res.data);
      else setError("No history found for this client.");
    } catch {
      setError("Failed to load client history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await API.get(lookupPath, { params: { phone } });
        if (!cancelled) {
          if (res.data?.found) setData(res.data);
          else setError("No history found for this client.");
        }
      } catch {
        if (!cancelled) setError("Failed to load client history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [phone, lookupPath]);

  const openEdit = async (project: ProjectRow) => {
    setEditLoading(true);
    setError("");
    try {
      /* Prefer live lead fetch; fall back to history payload so form always opens */
      try {
        const res = await API.get(`/csr/lead/${project.id}`);
        if (res.data?.lead) {
          setEditing(leadToWorkbench(res.data.lead));
          return;
        }
      } catch {
        /* fall through — use embedded project fields */
      }
      setEditing(projectToWorkbench(project));
    } finally {
      setEditLoading(false);
    }
  };

  const saveProject = async (form: ProjectWorkbenchData) => {
    setSaving(true);
    try {
      await API.put(`/csr/lead/${form.id}`, {
        name: form.name,
        company: form.company,
        phone: form.phone,
        email: form.email,
        ownerName: form.ownerName,
        state: form.state,
        projectCode: form.projectCode,
        projectTitle: form.projectTitle,
        projectScope: form.projectScope,
        interestedService: form.interestedService,
        projectBudget: form.projectBudget,
        projectDeadline: form.projectDeadline,
        projectPhase: form.projectPhase,
        takeoffDeadline: form.takeoffDeadline,
        pricingDeadline: form.pricingDeadline,
        qaDeadline: form.qaDeadline,
        projectPayments: form.projectPayments,
        projectNotes: form.projectNotes,
      });
      toast.success("Project updated.");
      setEditing(null);
      await reload();
      onProjectSaved?.();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not save project."));
    } finally {
      setSaving(false);
    }
  };

  const title = clientName || data?.client?.name || "Client History";
  const services = data?.services ?? [];
  const projects = data?.projects ?? [];
  const totalBusiness = data?.totalBusiness ?? 0;

  /* Edit form takes over — history stays underneath but hidden so form is visible */
  if (editing) {
    return (
      <ProjectWorkbenchModal
        open
        onClose={() => setEditing(null)}
        initial={editing}
        mode="csr"
        saving={saving}
        onSave={saveProject}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-[120] p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#0F172A]">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Services, projects & business history{editable ? " — tap Edit to update any project" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editable && onAddProject && (
              <button
                type="button"
                onClick={onAddProject}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-[#1B6FE8] text-white text-xs font-bold hover:bg-[#9a0e26] transition-colors"
              >
                <Plus size={14} strokeWidth={2.5} />
                Add Project
              </button>
            )}
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading || editLoading ? (
            <div className="flex flex-col items-center py-12 text-gray-400">
              <Loader2 size={28} className="animate-spin mb-3" />
              <p className="text-sm">{editLoading ? "Opening edit form…" : "Loading history…"}</p>
            </div>
          ) : error ? (
            <p className="text-sm text-gray-500 text-center py-8">{error}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#EAF2FE] rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-[#1B6FE8] mb-1">
                    <DollarSign size={14} />
                    <span className="text-[11px] font-semibold uppercase tracking-wide">Total Business</span>
                  </div>
                  <p className="text-2xl font-bold text-[#0F172A]">${totalBusiness.toLocaleString()}</p>
                </div>
                <div className="bg-[#EFF6FF] rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-[#0B84F3] mb-1">
                    <Briefcase size={14} />
                    <span className="text-[11px] font-semibold uppercase tracking-wide">Projects</span>
                  </div>
                  <p className="text-2xl font-bold text-[#0F172A]">{projects.length}</p>
                </div>
              </div>

              {services.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Services Used</h3>
                  <div className="flex flex-wrap gap-2">
                    {services.map(s => (
                      <span key={s} className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#F8F9FC] text-gray-700 border border-gray-100">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {projects.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <History size={12} /> Project History
                  </h3>
                  <div className="space-y-2">
                    {projects.map((p, idx) => {
                      const code = (p.projectCode || p.clientCode || "").trim();
                      return (
                      <div key={p.id} className="bg-[#FAFAFA] rounded-2xl p-3 border border-gray-100">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold text-gray-400">#{projects.length - idx}</span>
                              {code && (
                                <span className="bg-[#1B6FE8]/10 text-[#1B6FE8] text-[10px] font-bold px-2 py-0.5 rounded-lg">
                                  {code}
                                </span>
                              )}
                              <p className="text-sm font-semibold text-[#0F172A] truncate">{p.title}</p>
                            </div>
                            {p.service && <p className="text-[11px] text-gray-500 mt-1">{p.service}</p>}
                            {(p.closedAt || p.deadline) && (
                              <p className="text-[10px] text-gray-400 mt-1">
                                {p.closedAt ? `Closed ${fmtDate(p.closedAt)}` : `Deadline ${fmtDate(p.deadline)}`}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0 flex flex-col items-end gap-2">
                            <p className="text-sm font-bold text-green-600">${p.paidAmount.toLocaleString()}</p>
                            {p.status && <p className="text-[10px] text-gray-400 capitalize">{p.status}</p>}
                            {editable && (
                              <button
                                type="button"
                                onClick={() => void openEdit(p)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EAF2FE] text-[#1B6FE8] text-[11px] font-semibold hover:bg-[#FFE4E8]"
                              >
                                <Pencil size={11} /> Edit
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {projects.length === 0 && editable && onAddProject && (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-400 mb-3">No projects yet</p>
                  <button
                    type="button"
                    onClick={onAddProject}
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#1B6FE8] text-white text-sm font-bold"
                  >
                    <Plus size={15} /> Add Project
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

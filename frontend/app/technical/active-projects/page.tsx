"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import toast, { Toaster } from "react-hot-toast";
import {
  Search, FolderKanban, Calendar, Users, ClipboardList, CheckCircle2,
  Calculator, Send, Layers, UserPlus, Check, Eye, Trash2, RefreshCw, RotateCcw,
  ArrowRightLeft, Plus,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis,
} from "recharts";

import { peekAuthMe } from "@/lib/authMeCache";
import DashboardNavbar from "@/app/admin/components/layout/Navbar";
import CapsuleTabs from "@/app/components/CapsuleTabs";
import RechartsBox from "@/app/components/charts/RechartsBox";
import ProjectWorkbenchModal from "@/app/components/projects/ProjectWorkbenchModal";
import CommentCell from "@/app/csr/components/shared/CommentCell";
import StateFilterDropdown from "@/app/csr/components/shared/StateFilterDropdown";
import PhoneAreaCodeFilterInput from "@/app/csr/components/shared/PhoneAreaCodeFilterInput";
import { matchesStateLocationFilter, matchesPhoneAreaCodeFilter } from "@/lib/stateLocationFilter";
import { NoteEntry } from "@/app/csr/hooks/useLeadsData";
import { buildNoteHistory } from "@/app/csr/utils/noteHistory";
import { useFixedPopover } from "@/app/csr/hooks/useFixedPopover";
import {
  TECHNICAL_PROJECT_COLS,
  TECHNICAL_ASSIGNED_COLS,
  TECHNICAL_FINAL_COLS,
  TECHNICAL_PRICING_COLS,
  CsrColGroup,
  CSR_THEAD,
} from "@/app/csr/components/shared/csrTableStyles";
import {
  ProjectDetailCell,
  DeadlineTimingBadge,
  TechnicalWorkflowStatusBadge,
  PROJECT_TABLE_CARD,
  PROJECT_TABLE_HEAD,
} from "@/app/components/projects/ProjectTableCells";
import AssignEstimatorsModal from "../components/AssignEstimatorsModal";
import MoveTechnicalStageModal, { type TechnicalMoveTarget } from "../components/MoveTechnicalStageModal";
import TechnicalPageShell from "../components/TechnicalPageShell";
import { STAFF_PAGE_PAD, BENTO_CARD } from "@/lib/staffPageLayout";
import API, { apiErrorMessage } from "@/lib/api";
import { fetchAllAdminProjects } from "@/lib/fetchAdminProjects";
import {
  emptyWorkbench,
  parsePayments,
  type ProjectWorkbenchData,
} from "@/lib/projectFields";
import {
  matchesTechnicalTab,
  parseTechnicalAssignments,
  parseTechnicalNotes,
  parseEstimatorNotes,
  parseTechnicalNotesBundle,
  projectReceiveDate,
  pricingReceiveDate,
  formatDivisionSummary,
  formatElapsed,
  assignmentElapsedSeconds,
  getPricingQaMode,
  PRICING_QA_OPTIONS,
  isAssignmentWorking,
  isAssignmentTakeoffReady,
  allAssignmentsSentForPricing,
  pricedAssignments,
  type TechnicalAssignment,
  type TechnicalEstimator,
  type TechnicalWorkflowTab,
  type PricingQaMode,
} from "@/lib/technicalAssignments";
import { previousProjectEstimatorIds } from "@/lib/projectCodeSeq";

type Project = {
  id: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  state: string | null;
  ownerName: string | null;
  interestedService: string | null;
  projectTitle: string | null;
  projectCode: string | null;
  clientCode?: string | null;
  projectScope: string | null;
  projectPhase: string | null;
  projectDeadline: string | null;
  deadlineTiming?: string | null;
  projectNotes: string | null;
  projectPayments: string | null;
  projectBudget?: string | null;
  projectSource?: string | null;
  projectWorkStatus?: string | null;
  takeoffDeadline?: string | null;
  pricingDeadline?: string | null;
  qaDeadline?: string | null;
  technicalReceivedAt?: string | null;
  pricingReceivedAt?: string | null;
  technicalAssignments?: string | null;
  technicalNotes?: string | null;
  needsRevision?: boolean;
  revisionRequestedAt?: string | null;
  revisionNotes?: string | null;
  createdAt?: string;
  updatedAt: string;
  csr: { id: string; name: string; email: string; csrCode: string | null };
  uploadFile: { companyName: string | null } | null;
  notes?: { id: string; text: string; createdAt: string }[];
};

const PAGE_SIZE = 30;

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.split("T")[0] || "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

function notesToHistory(
  notes?: { id: string; text: string; createdAt: string; parentId?: string | null }[],
): NoteEntry[] {
  return buildNoteHistory({ notes: notes ?? [] }).noteHistory;
}

function threadNotesHistory(
  notes?: {
    id: string;
    text: string;
    createdAt: string;
    authorId?: string;
    authorRole?: string;
    authorName?: string;
  }[],
): NoteEntry[] {
  return (notes ?? [])
    .filter((n) => n.text?.trim())
    .map((n) => ({
      id: n.id,
      text: n.text,
      createdAt: n.createdAt,
      authorId: n.authorId,
      authorRole: n.authorRole,
      authorName: n.authorName,
    }));
}

function projectToWorkbench(p: Project, keepClient = false): ProjectWorkbenchData {
  return {
    id: p.id,
    name: keepClient ? (p.name ?? "") : "",
    company: keepClient ? (p.company ?? "") : "",
    phone: keepClient ? (p.phone ?? "") : "",
    email: keepClient ? (p.email ?? "") : "",
    ownerName: keepClient ? (p.ownerName ?? "") : "",
    state: p.state ?? "",
    projectCode: p.projectCode || p.clientCode || "",
    projectTitle: p.projectTitle ?? "",
    projectScope: p.projectScope ?? "",
    interestedService: p.interestedService ?? "",
    projectBudget: keepClient ? (p.projectBudget ?? "") : "",
    projectDeadline: (p.projectDeadline ?? "").split("T")[0],
    deadlineTiming: (p.deadlineTiming === "morning" || p.deadlineTiming === "cob" ? p.deadlineTiming : "") as "" | "morning" | "cob",
    projectPhase: p.projectPhase ?? "not_started",
    takeoffDeadline: p.takeoffDeadline ?? "",
    pricingDeadline: p.pricingDeadline ?? "",
    qaDeadline: p.qaDeadline ?? "",
    projectPayments: parsePayments(p.projectPayments),
    assignedTo: p.csr?.id,
    projectSource: p.projectSource ?? "",
    projectNotes: p.projectNotes ?? "",
    projectCreatedAt: p.createdAt ?? "",
  };
}

function projectAsRow(p: Project) {
  return {
    id: p.id,
    name: p.name,
    company: p.company ?? p.uploadFile?.companyName ?? null,
    ownerName: p.ownerName,
    phone: p.phone,
    email: p.email,
    projectCode: p.projectCode,
    clientCode: p.clientCode,
    projectTitle: p.projectTitle,
    projectScope: p.projectScope,
    interestedService: p.interestedService,
    projectBudget: null,
    projectDeadline: p.projectDeadline,
    projectPhase: p.projectPhase,
    projectPayments: p.projectPayments,
    state: p.state,
  };
}

function PricingProjectDetailCell({
  p,
  assignments,
}: {
  p: Project;
  assignments: TechnicalAssignment[];
}) {
  const priced = pricedAssignments(assignments);
  const showMainScope = allAssignmentsSentForPricing(assignments) || priced.length === 0;
  const code = (p.projectCode || p.clientCode || "").trim();
  const title = (p.projectTitle || "").trim();
  const mainScope = (p.projectScope || "").trim();
  const othersWorking =
    assignments.some(isAssignmentWorking) || assignments.some(isAssignmentTakeoffReady);

  const panelW = 300;
  const { open, toggle, anchorRef, panelRef, style } = useFixedPopover(panelW, 320, "start");
  const primary = priced[0];
  const extra = Math.max(0, priced.length - 1);

  const popup =
    open &&
    !showMainScope &&
    createPortal(
      <div
        ref={panelRef}
        style={style}
        className="bg-white border border-gray-200 rounded-xl shadow-xl py-1 max-h-80 overflow-y-auto z-[80]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2.5 py-1.5 border-b border-gray-100 sticky top-0 bg-white">
          <span className="text-[10px] font-bold text-violet-700 uppercase tracking-wide">
            Sent for pricing ({priced.length})
          </span>
        </div>
        {priced.map((a) => (
          <div key={a.estimatorId} className="px-2.5 py-2 border-b border-gray-50 last:border-0 space-y-0.5">
            <p className="text-[12px] font-bold text-[#0F172A] truncate">{a.estimatorName}</p>
            <p className="text-[10px] font-semibold text-gray-700">
              Scope: {(a.scopes ?? []).filter(Boolean).join(", ") || "—"}
            </p>
            <p className="text-[10px] font-semibold text-gray-700">
              Division: {formatDivisionSummary(a.divisions) || "—"}
            </p>
            {a.workDetail ? (
              <p className="text-[10px] text-gray-500 line-clamp-3">{a.workDetail}</p>
            ) : null}
          </div>
        ))}
        {othersWorking ? (
          <p className="px-2.5 py-2 text-[9px] text-amber-700 font-semibold">
            Others still on Assigned / Take Off Done
          </p>
        ) : null}
      </div>,
      document.body,
    );

  return (
    <div className="min-w-0 bg-[#F8F9FC] rounded-xl px-2.5 py-1.5 border border-gray-100/80 space-y-1">
      {title ? (
        <p className="text-xs font-semibold text-[#0F172A] truncate">{title}</p>
      ) : null}
      {code ? (
        <p className="text-[10px] text-gray-600">
          Code: <span className="font-bold text-[#1B6FE8]">{code}</span>
        </p>
      ) : null}

      {showMainScope ? (
        <div className="space-y-0.5">
          <p className="text-[9px] font-bold uppercase tracking-wide text-violet-700">Full project scope</p>
          <p className="text-[11px] font-semibold text-[#0F172A] truncate">Scope: {mainScope || "—"}</p>
          {p.interestedService ? (
            <p className="text-[11px] font-semibold text-gray-700 truncate">
              Division: {p.interestedService}
            </p>
          ) : null}
        </div>
      ) : primary ? (
        <button
          ref={anchorRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className="w-full flex items-center gap-1.5 rounded-lg bg-white border border-violet-100 px-1.5 py-1 hover:border-violet-300 text-left"
          title="View who was sent for pricing"
        >
          <div className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
            {primary.estimatorName.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-[#0F172A] truncate">{primary.estimatorName}</p>
            <p className="text-[9px] font-semibold text-violet-700 truncate">
              {(primary.scopes ?? []).filter(Boolean).join(", ") || "—"}
              {primary.divisions?.length ? ` · ${formatDivisionSummary(primary.divisions)}` : ""}
            </p>
          </div>
          {extra > 0 && (
            <span className="shrink-0 h-5 min-w-[20px] px-1 rounded-md bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center">
              +{extra}
            </span>
          )}
        </button>
      ) : null}
      {popup}
    </div>
  );
}

function EstimatorEvalForm({
  assignment,
  onSave,
}: {
  assignment: TechnicalAssignment;
  onSave: (marks: number, remarks: string) => void;
}) {
  const [marks, setMarks] = useState(
    assignment.evaluationMarks != null ? String(assignment.evaluationMarks) : "",
  );
  const [remarks, setRemarks] = useState(assignment.evaluationRemarks ?? "");

  const stamp = assignment.evaluatedAt
    ? new Date(assignment.evaluatedAt).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/70 p-1.5 space-y-1">
      <p className="text-[9px] font-extrabold uppercase tracking-wide text-amber-800">Evaluation</p>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={10}
          step={0.5}
          value={marks}
          onChange={(e) => setMarks(e.target.value)}
          placeholder="0–10"
          className="h-6 w-14 rounded-md border border-amber-200 bg-white px-1.5 text-[10px] font-bold tabular-nums outline-none"
        />
        <span className="text-[9px] font-semibold text-amber-800 shrink-0">/ 10</span>
      </div>
      <textarea
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        placeholder="Remarks"
        rows={2}
        className="w-full rounded-md border border-amber-200 bg-white px-1.5 py-1 text-[10px] outline-none resize-none"
      />
      <div className="flex items-center justify-between gap-1">
        {stamp ? <span className="text-[8px] text-amber-700/80 tabular-nums">{stamp}</span> : <span />}
        <button
          type="button"
          onClick={() => {
            const n = Number(marks);
            if (!Number.isFinite(n) || n < 0 || n > 10) {
              toast.error("Marks must be 0–10");
              return;
            }
            onSave(n, remarks.trim());
          }}
          className="h-6 px-2 rounded-md bg-[#1B6FE8] text-white text-[9px] font-bold"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function ProjectStatusCell({
  p,
}: {
  p: Project;
}) {
  return (
    <TechnicalWorkflowStatusBadge
      status={p.status}
      projectDeadline={p.projectDeadline}
      projectWorkStatus={p.projectWorkStatus}
      projectPhase={p.projectPhase}
      technicalAssignments={p.technicalAssignments}
    />
  );
}

function PricingQaSelect({
  phase,
  disabled,
  onChange,
}: {
  phase?: string | null;
  disabled?: boolean;
  onChange: (mode: PricingQaMode) => void;
}) {
  const mode = getPricingQaMode(phase);
  return (
    <select
      value={mode || ""}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value as PricingQaMode;
        if (v) onChange(v);
      }}
      className="h-8 w-full max-w-full rounded-lg border border-violet-200 bg-violet-50 text-violet-800 px-1.5 text-[10px] font-bold outline-none cursor-pointer disabled:opacity-60"
      title="QA type — shown to Admin in real time"
    >
      <option value="" disabled>
        Select QA…
      </option>
      {PRICING_QA_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function AssignedToCell({
  assignments,
  onAssign,
  showTakeoff,
  onToggleTakeoff,
  detailed = false,
  onSendPricing,
  showSendPricing = false,
  assignmentFilter = "all",
  showEvaluation = false,
  onSaveEvaluation,
}: {
  assignments: TechnicalAssignment[];
  onAssign: () => void;
  showTakeoff?: boolean;
  onToggleTakeoff?: (estimatorId: string, done: boolean) => void;
  detailed?: boolean;
  onSendPricing?: (estimatorId: string) => void;
  showSendPricing?: boolean;
  assignmentFilter?: "all" | "working" | "takeoff_ready";
  showEvaluation?: boolean;
  onSaveEvaluation?: (estimatorId: string, marks: number, remarks: string) => void;
}) {
  const panelW = 300;
  const { open, toggle, anchorRef, panelRef, style } = useFixedPopover(panelW, 320, "end");
  const [now, setNow] = useState(() => Date.now());

  const visible = assignments.filter((a) => {
    if (assignmentFilter === "working") return isAssignmentWorking(a);
    if (assignmentFilter === "takeoff_ready") return isAssignmentTakeoffReady(a);
    return true;
  });

  const anyLive = visible.some((a) => !!a.timerStartedAt && !a.takeoffDone);
  useEffect(() => {
    if (!open && !anyLive) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [open, anyLive]);

  if (assignments.length === 0) {
    return (
      <button
        type="button"
        onClick={onAssign}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1B6FE8] text-white text-[11px] font-semibold hover:bg-[#a30f27] transition-colors shadow-sm shadow-red-100"
      >
        <UserPlus size={12} />
        Assign
      </button>
    );
  }

  if (visible.length === 0) {
    return <span className="text-[11px] text-gray-400">—</span>;
  }

  const primary = visible[0]!;
  const doneCount = visible.filter((a) => a.takeoffDone).length;
  const canToggle = Boolean((showTakeoff || detailed) && onToggleTakeoff);
  const canPrice = Boolean(showSendPricing && onSendPricing);

  const popup =
    open &&
    createPortal(
      <div
        ref={panelRef}
        style={style}
        className="bg-white border border-gray-200 rounded-xl shadow-xl py-1 max-h-80 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2.5 py-1.5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">
            Estimators ({visible.length})
          </span>
          {detailed && (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md">
              {doneCount}/{visible.length} done
            </span>
          )}
        </div>
        {visible.map((a) => {
          const elapsed = formatElapsed(assignmentElapsedSeconds(a, now));
          const running = !!a.timerStartedAt;
          const showPriceBtn = a.takeoffDone && !a.pricingSent && canPrice;
          return (
            <div
              key={a.estimatorId}
              className="flex flex-col gap-1 min-w-0 px-2.5 py-2 border-b border-gray-50 last:border-0"
            >
              <div className="flex items-start gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#1B6FE8] text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                  {a.estimatorName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-[12px] font-bold text-[#0F172A] truncate leading-tight inline-flex items-center gap-1">
                    {a.estimatorName}
                    {a.assignmentConfirmed ? (
                      <Check size={12} className="text-emerald-600 shrink-0" strokeWidth={3} />
                    ) : null}
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                        a.pricingSent
                          ? "bg-violet-100 text-violet-800"
                          : a.takeoffDone
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {a.pricingSent ? "Pricing" : a.takeoffDone ? "Completed" : "Pending"}
                    </span>
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${
                        running ? "bg-sky-100 text-sky-800" : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      Time {elapsed}
                      {running ? " · Live" : ""}
                    </span>
                    {a.divisions?.length ? (
                      <span className="text-[10px] font-semibold text-gray-600 truncate max-w-[100px]">
                        {formatDivisionSummary(a.divisions)}
                      </span>
                    ) : null}
                  </div>
                  {(canToggle || showPriceBtn) && (
                    <div className="flex flex-wrap items-center gap-1">
                      {canToggle && onToggleTakeoff && !a.pricingSent && (
                        <button
                          type="button"
                          title={a.takeoffDone ? "Set back to pending" : "Mark completed"}
                          onClick={() => onToggleTakeoff(a.estimatorId, !a.takeoffDone)}
                          className={`h-6 w-fit px-2 rounded-md inline-flex items-center justify-center text-[9px] font-bold gap-1 ${
                            a.takeoffDone
                              ? "bg-amber-500 text-white hover:bg-amber-600"
                              : "bg-emerald-600 text-white hover:bg-emerald-700"
                          }`}
                        >
                          {a.takeoffDone ? (
                            <>
                              <RotateCcw size={10} /> Pending
                            </>
                          ) : (
                            <>
                              <Check size={11} /> Done
                            </>
                          )}
                        </button>
                      )}
                      {showPriceBtn && (
                        <button
                          type="button"
                          title="Send this estimator for Pricing"
                          onClick={() => onSendPricing?.(a.estimatorId)}
                          className="h-6 w-fit px-2 rounded-md bg-violet-600 text-white text-[9px] font-bold hover:bg-violet-700 inline-flex items-center justify-center gap-1"
                        >
                          <Calculator size={10} /> Pricing
                        </button>
                      )}
                    </div>
                  )}
                  {showEvaluation && onSaveEvaluation && a.takeoffDone ? (
                    <EstimatorEvalForm
                      key={`${a.estimatorId}-${a.evaluatedAt ?? "new"}`}
                      assignment={a}
                      onSave={(marks, remarks) => onSaveEvaluation(a.estimatorId, marks, remarks)}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        <div className="border-t border-gray-100 px-2.5 py-2">
          <button
            type="button"
            onClick={() => onAssign()}
            className="w-full h-8 rounded-lg bg-[#1B6FE8] text-white text-[11px] font-bold hover:bg-[#a30f27] inline-flex items-center justify-center gap-1.5"
          >
            <UserPlus size={12} />
            Reassign
          </button>
        </div>
      </div>,
      document.body,
    );

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center gap-1 min-w-0 max-w-full">
        <button
          ref={anchorRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className="flex flex-col gap-1 min-w-0 flex-1 w-full rounded-lg bg-[#F8F9FC] border border-gray-200 px-1.5 py-1 hover:border-[#1B6FE8]/40 transition-colors text-left"
          title="View all estimators"
        >
          {visible.map((a) => {
            const running = !!a.timerStartedAt && !a.takeoffDone;
            return (
              <div key={a.estimatorId} className="flex items-center gap-1.5 min-w-0">
                <div className="w-5 h-5 rounded-full bg-[#1B6FE8] text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                  {a.estimatorName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-[#0F172A] leading-tight inline-flex items-center gap-1 max-w-full">
                    <span className="truncate">{a.estimatorName}</span>
                    {a.assignmentConfirmed ? (
                      <Check size={11} className="text-emerald-600 shrink-0" strokeWidth={3} />
                    ) : null}
                  </p>
                  <p className="text-[9px] font-bold tabular-nums text-sky-800 leading-tight">
                    {formatElapsed(assignmentElapsedSeconds(a, now))}
                    {running ? " · Live" : ""}
                  </p>
                </div>
              </div>
            );
          })}
          {detailed ? (
            <p className="text-[9px] font-semibold text-gray-500 leading-tight">
              {doneCount}/{visible.length} done
            </p>
          ) : null}
        </button>
        {canToggle && onToggleTakeoff && visible.length === 1 && !primary.pricingSent && (
          <button
            type="button"
            title={primary.takeoffDone ? "Set back to pending" : "Mark completed"}
            onClick={() => onToggleTakeoff(primary.estimatorId, !primary.takeoffDone)}
            className={`h-6 px-1.5 rounded-md flex items-center justify-center shrink-0 text-[9px] font-bold ${
              primary.takeoffDone
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {primary.takeoffDone ? <RotateCcw size={10} /> : <Check size={11} />}
          </button>
        )}
        <button
          type="button"
          onClick={onAssign}
          className="h-6 px-1.5 rounded-md bg-[#1B6FE8] text-white flex items-center justify-center shrink-0 hover:bg-[#a30f27] text-[9px] font-bold gap-0.5"
          title="Reassign"
        >
          <UserPlus size={11} />
        </button>
      </div>
      {popup}
    </div>
  );
}

function AssignmentHoursCell({ assignments }: { assignments: TechnicalAssignment[] }) {
  const panelW = 260;
  const { open, toggle, anchorRef, panelRef, style } = useFixedPopover(panelW, 280, "start");
  const first = assignments[0];
  const extra = Math.max(0, assignments.length - 1);

  if (!first) return <span className="text-xs text-gray-400">—</span>;

  const popup =
    open &&
    createPortal(
      <div
        ref={panelRef}
        style={style}
        className="bg-white border border-gray-200 rounded-xl shadow-xl py-1 max-h-72 overflow-y-auto z-[80]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2.5 py-1.5 border-b border-gray-100 text-[10px] font-bold text-gray-600 uppercase">
          Man hours ({assignments.length})
        </div>
        {assignments.map((a) => (
          <div
            key={a.estimatorId}
            className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-gray-50 last:border-0"
          >
            <p className="text-[11px] font-bold text-[#0F172A] truncate">{a.estimatorName}</p>
            <p className="text-[11px] font-semibold text-gray-700 tabular-nums shrink-0">
              {a.manHours ? `${a.manHours}h` : "—"}
            </p>
          </div>
        ))}
      </div>,
      document.body,
    );

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (assignments.length > 1) toggle();
        }}
        className={`text-[11px] font-semibold text-gray-700 whitespace-nowrap inline-flex items-center gap-1 rounded-md px-1 py-0.5 ${
          extra > 0 ? "hover:bg-gray-100 cursor-pointer" : "cursor-default"
        }`}
        title={extra > 0 ? "View all man hours" : undefined}
      >
        {first.manHours ? `${first.manHours}h` : "—"}
        {extra > 0 && (
          <span className="text-[9px] font-bold text-[#1B6FE8] bg-[#EAF2FE] px-1 rounded">
            +{extra}
          </span>
        )}
      </button>
      {popup}
    </>
  );
}

function AssignmentDeadlineCell({ assignments }: { assignments: TechnicalAssignment[] }) {
  const panelW = 280;
  const { open, toggle, anchorRef, panelRef, style } = useFixedPopover(panelW, 280, "start");
  const first = assignments[0];
  const extra = Math.max(0, assignments.length - 1);

  if (!first) return <span className="text-xs text-gray-400">—</span>;

  const popup =
    open &&
    createPortal(
      <div
        ref={panelRef}
        style={style}
        className="bg-white border border-gray-200 rounded-xl shadow-xl py-1 max-h-72 overflow-y-auto z-[80]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2.5 py-1.5 border-b border-gray-100 text-[10px] font-bold text-gray-600 uppercase">
          Deadlines ({assignments.length})
        </div>
        {assignments.map((a) => (
          <div
            key={a.estimatorId}
            className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-gray-50 last:border-0"
          >
            <p className="text-[11px] font-bold text-[#0F172A] truncate">{a.estimatorName}</p>
            <p className="text-[11px] font-semibold text-gray-700 shrink-0">{formatDate(a.deadline)}</p>
          </div>
        ))}
      </div>,
      document.body,
    );

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (assignments.length > 1) toggle();
        }}
        className={`text-[11px] font-semibold text-gray-700 inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1 py-0.5 ${
          extra > 0 ? "hover:bg-gray-100 cursor-pointer" : "cursor-default"
        }`}
        title={extra > 0 ? "View all deadlines" : undefined}
      >
        <Calendar size={10} className="text-[#1B6FE8] shrink-0" />
        {formatDate(first.deadline)}
        {extra > 0 && (
          <span className="text-[9px] font-bold text-[#1B6FE8] bg-[#EAF2FE] px-1 rounded">
            +{extra}
          </span>
        )}
      </button>
      {popup}
    </>
  );
}

function ProjectRowActions({
  onEdit,
  onDelete,
  onMove,
  onSendPricing,
  showSendPricing = false,
  onSendFinal,
  showSendFinal = false,
  onReturnPricing,
  showReturnPricing = false,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onMove?: () => void;
  onSendPricing?: () => void;
  showSendPricing?: boolean;
  onSendFinal?: () => void;
  showSendFinal?: boolean;
  onReturnPricing?: () => void;
  showReturnPricing?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1 flex-wrap min-w-0 max-w-full">
      {showSendPricing && onSendPricing && (
        <button
          type="button"
          onClick={onSendPricing}
          className="h-7 px-1.5 rounded-lg bg-violet-600 text-white text-[9px] font-bold hover:bg-violet-700 inline-flex items-center gap-0.5 shrink-0"
          title="Send for Pricing"
        >
          <Calculator size={11} className="shrink-0" />
          <span>Pricing</span>
        </button>
      )}
      {showSendFinal && onSendFinal && (
        <button
          type="button"
          onClick={onSendFinal}
          className="h-7 px-1.5 rounded-lg bg-emerald-600 text-white text-[9px] font-bold hover:bg-emerald-700 inline-flex items-center gap-0.5 shrink-0"
          title="Send for Final Submission"
        >
          <Send size={11} className="shrink-0" />
          <span>Final</span>
        </button>
      )}
      {showReturnPricing && onReturnPricing && (
        <button
          type="button"
          onClick={onReturnPricing}
          className="h-7 px-1.5 rounded-lg bg-amber-500 text-white text-[9px] font-bold hover:bg-amber-600 inline-flex items-center gap-0.5 shrink-0"
          title="Return to Pricing"
        >
          <Calculator size={11} className="shrink-0" />
          <span>Back</span>
        </button>
      )}
      {onMove && (
        <button
          type="button"
          onClick={onMove}
          className="h-7 px-1.5 rounded-lg bg-slate-100 text-slate-700 text-[9px] font-bold hover:bg-slate-200 inline-flex items-center gap-0.5 shrink-0"
          title="Move to another subpage"
        >
          <ArrowRightLeft size={11} className="shrink-0" />
          <span>Move</span>
        </button>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="w-7 h-7 rounded-lg bg-[#EAF5FF] text-[#0B84F3] flex items-center justify-center hover:opacity-80 shrink-0"
        title="Edit project"
      >
        <Eye size={13} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 shrink-0"
        title="Delete project"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function TechnicalActiveProjectsPage() {
  return (
    <Suspense
      fallback={
        <TechnicalPageShell bgClass="bg-[#F5F6FA] dark:bg-crm-bg">
          <div className="p-6">
            <div className="h-10 w-48 bg-crm-muted rounded-xl animate-pulse mb-4" />
            <div className="h-64 bg-crm-surface rounded-2xl border border-crm-border-subtle animate-pulse" />
          </div>
        </TechnicalPageShell>
      }
    >
      <TechnicalActiveProjectsPageInner variant="active" />
    </Suspense>
  );
}

export type TechnicalProjectsVariant = "active" | "revisions";

export function TechnicalActiveProjectsPageInner({
  variant = "active",
}: {
  variant?: TechnicalProjectsVariant;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusProjectId = (searchParams.get("project") || "").trim();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const bimDesk = peekAuthMe()?.role === "bim_manager";
  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [workflowTab, setWorkflowTab] = useState<TechnicalWorkflowTab>("all");
  const [estimators, setEstimators] = useState<TechnicalEstimator[]>([]);
  const [assignProject, setAssignProject] = useState<Project | null>(null);
  const [moveProject, setMoveProject] = useState<Project | null>(null);
  const [moveSaving, setMoveSaving] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const focusHandledRef = useRef<string | null>(null);
  const isRevisions = variant === "revisions";
  const basePath = isRevisions ? "/technical/revisions" : "/technical/active-projects";
  const meId = peekAuthMe()?.id;

  const fetchProjects = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { leads } = await fetchAllAdminProjects<Project>({
        from: dateFrom || undefined,
        to: dateTo || undefined,
        technicalView: true,
        revisionsOnly: isRevisions,
        excludeRevisions: !isRevisions,
      });
      setProjects(Array.isArray(leads) ? leads : []);
    } catch {
      if (!silent) {
        toast.error("Failed to load projects");
        setProjects([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [dateFrom, dateTo, isRevisions]);

  const saveBimProject = async (data: ProjectWorkbenchData) => {
    if (!data.name.trim() || !data.phone.trim() || !data.projectTitle.trim() || !data.interestedService.trim() || !data.projectDeadline) {
      toast.error("Client, phone, title, service, and deadline are required.");
      return;
    }
    setAddSaving(true);
    try {
      await API.post("/admin/project", {
        name: data.name.trim(),
        company: data.company.trim() || undefined,
        phone: data.phone.trim(),
        email: data.email.trim() || undefined,
        ownerName: data.ownerName.trim() || undefined,
        state: data.state.trim() || undefined,
        projectCode: data.projectCode.trim() || undefined,
        projectTitle: data.projectTitle.trim(),
        projectScope: data.projectScope.trim() || undefined,
        interestedService: data.interestedService.trim(),
        projectDeadline: data.projectDeadline,
        deadlineTiming: data.deadlineTiming || "",
        projectBudget: data.projectBudget.trim() || undefined,
        projectNotes: data.projectNotes?.trim() || undefined,
        projectPhase: data.projectPhase,
        takeoffDeadline: data.takeoffDeadline || undefined,
        pricingDeadline: data.pricingDeadline || undefined,
        qaDeadline: data.qaDeadline || undefined,
        projectPayments: data.projectPayments,
        status: "Close Client",
      });
      toast.success("Project added. It is in your list and in Admin Project DB → BIM.");
      setAddOpen(false);
      await fetchProjects();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not add the project."));
    } finally {
      setAddSaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Yield so setLoading is not synchronous inside the effect (react-hooks/set-state-in-effect).
      await Promise.resolve();
      if (cancelled) return;
      await fetchProjects();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchProjects]);

  // Silent refresh every 30s (Admin Morning/COB + workflow stages)
  useEffect(() => {
    const poll = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchProjects(true);
    }, 30000);
    const onFocus = () => void fetchProjects(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchProjects]);

  const loadEstimators = useCallback(() => {
    API.get("/admin/technical-estimators")
      .then((res) => {
        const list = res.data?.estimators;
        if (Array.isArray(list) && list.length > 0) {
          setEstimators(list);
        } else {
          setEstimators([]);
          toast.error("No estimator users found. Add users with role Estimator in Admin → Users.");
        }
      })
      .catch(() => {
        setEstimators([]);
        toast.error("Failed to load estimators from users");
      });
  }, []);

  useEffect(() => {
    loadEstimators();
  }, [loadEstimators]);

  // Deep-link from TM notification bell: /technical/active-projects?project=<id>
  useEffect(() => {
    if (!focusProjectId || loading) return;
    if (focusHandledRef.current === focusProjectId) return;
    focusHandledRef.current = focusProjectId;
    let cancelled = false;

    const openFocused = async () => {
      let project: Project | null = null;
      try {
        const res = await API.get(`/admin/lead/${focusProjectId}`);
        const lead = res.data?.lead as Project | undefined;
        if (lead?.id) project = lead;
      } catch {
        /* fall through */
      }
      if (cancelled) return;
      if (!project) {
        toast.error("Project from notification not found");
        router.replace(basePath);
        return;
      }

      if (isRevisions && !project.needsRevision) {
        toast.error("This project is not in the revision queue");
        router.replace(basePath);
        return;
      }

      setProjects((prev) => (prev.some((p) => p.id === project!.id) ? prev : [project!, ...prev]));
      setWorkflowTab("all");
      setPage(1);
      setSearch(project.projectCode || project.projectTitle || "");
      setHighlightId(project.id);
      setEditProject(project);
      router.replace(basePath);
      window.setTimeout(() => {
        document
          .querySelector(`[data-project-row="${project!.id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    };

    void openFocused();
    return () => {
      cancelled = true;
    };
  }, [focusProjectId, loading, router, basePath, isRevisions]);

  // Refresh roster every time Assign modal opens
  useEffect(() => {
    if (assignProject) loadEstimators();
  }, [assignProject, loadEstimators]);

  const addSirNote = async (id: string, text: string) => {
    const res = await API.post(`/admin/lead/${id}/technical-notes`, { text, thread: "sir" });
    const note = res.data.note as {
      id: string;
      text: string;
      createdAt: string;
      authorId?: string;
      authorRole?: string;
      authorName?: string;
    };
    const bundle = res.data.technicalNotesBundle ?? {
      ...parseTechnicalNotesBundle(projects.find((p) => p.id === id)?.technicalNotes),
      sir: res.data.technicalNotes,
    };
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, technicalNotes: JSON.stringify(bundle) } : p)),
    );
    return {
      id: note.id,
      text: note.text,
      createdAt: note.createdAt,
      authorId: note.authorId,
      authorRole: note.authorRole,
      authorName: note.authorName,
    } as NoteEntry;
  };

  const addEstimatorNote = async (id: string, text: string) => {
    const res = await API.post(`/admin/lead/${id}/technical-notes`, { text, thread: "estimator" });
    const note = res.data.note as {
      id: string;
      text: string;
      createdAt: string;
      authorId?: string;
      authorRole?: string;
      authorName?: string;
    };
    const bundle = res.data.technicalNotesBundle ?? {
      ...parseTechnicalNotesBundle(projects.find((p) => p.id === id)?.technicalNotes),
      estimator: res.data.technicalNotes,
    };
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, technicalNotes: JSON.stringify(bundle) } : p)),
    );
    return {
      id: note.id,
      text: note.text,
      createdAt: note.createdAt,
      authorId: note.authorId,
      authorRole: note.authorRole,
      authorName: note.authorName,
    } as NoteEntry;
  };

  const confirmAssign = async (assignments: TechnicalAssignment[]) => {
    if (!assignProject) return;
    setAssignSaving(true);
    try {
      const res = await API.put(`/admin/project/${assignProject.id}/assign-estimators`, {
        assignments,
      });
      const lead = res.data.lead as Project;
      setProjects((prev) => prev.map((p) => (p.id === lead.id ? { ...p, ...lead } : p)));
      toast.success("Estimators assigned");
      setAssignProject(null);
    } catch {
      toast.error("Failed to assign estimators");
    } finally {
      setAssignSaving(false);
    }
  };

  const saveEvaluation = async (projectId: string, estimatorId: string, marks: number, remarks: string) => {
    try {
      const res = await API.put(`/admin/project/${projectId}/estimator-evaluation`, {
        estimatorId,
        marks,
        remarks,
      });
      const lead = res.data.lead as Project;
      setProjects((prev) => prev.map((p) => (p.id === lead.id ? { ...p, ...lead } : p)));
      toast.success("Evaluation saved");
    } catch {
      toast.error("Failed to save evaluation");
    }
  };

  const saveBidInstruction = async (projectId: string, text: string) => {
    try {
      const res = await API.put(`/admin/project/${projectId}`, { projectNotes: text });
      const lead = res.data.lead as Project | undefined;
      if (lead) {
        setProjects((prev) => prev.map((p) => (p.id === lead.id ? { ...p, ...lead } : p)));
      } else {
        setProjects((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, projectNotes: text } : p)),
        );
      }
      toast.success("Bid instruction updated");
    } catch {
      toast.error("Failed to update bid instruction");
      throw new Error("bid save failed");
    }
  };

  const patchProjectNotes = (
    id: string,
    fn: (
      list: { id: string; text: string; createdAt: string; parentId?: string | null }[],
    ) => { id: string; text: string; createdAt: string; parentId?: string | null }[],
  ) => {
    const apply = (p: Project): Project => ({ ...p, notes: fn(p.notes ?? []) });
    setProjects((prev) => prev.map((p) => (p.id === id ? apply(p) : p)));
    setEditProject((prev) => (prev?.id === id ? apply(prev) : prev));
  };

  const addLeadNote = async (id: string, text: string, parentId?: string) => {
    const res = await API.post(`/admin/lead/${id}/notes`, {
      text,
      ...(parentId ? { parentId } : {}),
    });
    const note = res.data.note as { id: string; text: string; createdAt: string; parentId?: string | null };
    patchProjectNotes(id, (list) => [...list.filter((n) => n.id !== note.id), note]);
    return note;
  };

  const updateLeadNote = (id: string, noteId: string, text: string, createdAt?: string) => {
    patchProjectNotes(id, (list) =>
      list.map((n) => (n.id === noteId ? { ...n, text, createdAt: createdAt ?? n.createdAt } : n)),
    );
  };

  const deleteLeadNote = (id: string, noteId: string) => {
    patchProjectNotes(id, (list) => list.filter((n) => n.id !== noteId && n.parentId !== noteId));
  };

  const moveTechnicalTab = async (tab: TechnicalMoveTarget) => {
    if (!moveProject) return;
    setMoveSaving(true);
    try {
      const res = await API.put(`/admin/project/${moveProject.id}/move-technical-tab`, { tab });
      const lead = res.data.lead as Project;
      if (tab === "revisions") {
        setProjects((prev) =>
          isRevisions
            ? prev.map((p) => (p.id === lead.id ? { ...p, ...lead } : p))
            : prev.filter((p) => p.id !== lead.id),
        );
        setMoveProject(null);
        toast.success("Moved to Revisions");
        return;
      }
      setProjects((prev) => prev.map((p) => (p.id === lead.id ? { ...p, ...lead } : p)));
      setWorkflowTab(tab);
      setMoveProject(null);
      toast.success("Project moved");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Failed to move project";
      toast.error(msg);
    } finally {
      setMoveSaving(false);
    }
  };

  const toggleTakeoff = async (projectId: string, estimatorId: string, takeoffDone: boolean) => {
    try {
      const res = await API.put(`/admin/project/${projectId}/estimator-takeoff`, {
        estimatorId,
        takeoffDone,
      });
      const lead = res.data.lead as Project;
      setProjects((prev) => prev.map((p) => (p.id === lead.id ? { ...p, ...lead } : p)));
      toast.success(
        takeoffDone
          ? "Marked Done — this estimator moved to Take Off Done"
          : "Set back to pending — estimator can work again",
      );
    } catch {
      toast.error("Failed to update task status");
    }
  };

  const sendForPricing = async (projectId: string, estimatorId?: string) => {
    try {
      const res = await API.put(`/admin/project/${projectId}/send-pricing`, {
        ...(estimatorId ? { estimatorId } : {}),
      });
      const lead = res.data.lead as Project;
      setProjects((prev) => prev.map((p) => (p.id === lead.id ? { ...p, ...lead } : p)));
      toast.success(
        estimatorId
          ? "Estimator sent for Pricing — others stay where they are"
          : "Sent for Pricing",
      );
      const stillReady = parseTechnicalAssignments(lead.technicalAssignments).some(
        isAssignmentTakeoffReady,
      );
      const stillWorking = parseTechnicalAssignments(lead.technicalAssignments).some(
        isAssignmentWorking,
      );
      if (stillReady) setWorkflowTab("takeoff_done");
      else if (stillWorking) setWorkflowTab("assigned");
      else setWorkflowTab("pricing");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Failed to send for pricing";
      toast.error(msg);
    }
  };

  const sendForFinalSubmission = async (projectId: string) => {
    // Optimistic: move to Final immediately so UI never feels “stuck”
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, projectPhase: "qa_phase" } : p)),
    );
    try {
      const res = await API.put(`/admin/project/${projectId}/send-final-submission`, {});
      const lead = (res.data?.lead ?? res.data) as Project | undefined;
      if (lead?.id) {
        setProjects((prev) => prev.map((p) => (p.id === lead.id ? { ...p, ...lead } : p)));
      }
      toast.success("Sent for Final Submission");
      setWorkflowTab("final_submission");
      void fetchProjects(true);
    } catch (err: unknown) {
      void fetchProjects(true);
      toast.error(apiErrorMessage(err, "Failed to send for final submission"));
    }
  };

  const returnToPricing = async (projectId: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, projectPhase: "pricing_phase" } : p)),
    );
    try {
      const res = await API.put(`/admin/project/${projectId}/return-pricing`, {});
      const lead = (res.data?.lead ?? res.data) as Project | undefined;
      if (lead?.id) {
        setProjects((prev) => prev.map((p) => (p.id === lead.id ? { ...p, ...lead } : p)));
      }
      toast.success("Returned to Pricing");
      setWorkflowTab("pricing");
      void fetchProjects(true);
    } catch (err: unknown) {
      void fetchProjects(true);
      toast.error(apiErrorMessage(err, "Failed to return to pricing"));
    }
  };

  const setPricingQa = async (projectId: string, mode: PricingQaMode) => {
    try {
      const res = await API.put(`/admin/project/${projectId}/pricing-qa`, { mode });
      const lead = res.data.lead as Project;
      setProjects((prev) => prev.map((p) => (p.id === lead.id ? { ...p, ...lead } : p)));
      toast.success("QA status updated — Admin can see it live");
    } catch {
      toast.error("Failed to update QA status");
    }
  };

  const saveEdit = async (data: ProjectWorkbenchData) => {
    setEditSaving(true);
    try {
      // Technical must not overwrite client identity fields
      const res = await API.put(`/admin/project/${data.id}`, {
        ...(bimDesk
          ? {
              name: data.name.trim(),
              company: data.company.trim() || null,
              phone: data.phone.trim(),
              email: data.email.trim() || null,
              ownerName: data.ownerName.trim() || null,
              projectBudget: data.projectBudget.trim() || null,
              projectPayments: data.projectPayments,
            }
          : {}),
        state: data.state,
        projectCode: data.projectCode,
        projectTitle: data.projectTitle,
        projectScope: data.projectScope,
        interestedService: data.interestedService,
        projectDeadline: data.projectDeadline,
        deadlineTiming: data.deadlineTiming || "",
        projectPhase: data.projectPhase,
        takeoffDeadline: data.takeoffDeadline,
        pricingDeadline: data.pricingDeadline,
        qaDeadline: data.qaDeadline,
        projectNotes: data.projectNotes,
      });
      const lead = res.data.lead as Project;
      setProjects((prev) => prev.map((p) => (
        p.id === lead.id
          ? { ...p, ...lead, ...(bimDesk ? {} : { name: null, ownerName: null }) }
          : p
      )));
      setEditProject(null);
      toast.success("Project updated");
    } catch {
      toast.error("Failed to save project");
    } finally {
      setEditSaving(false);
    }
  };

  const deleteProject = async (p: Project, opts?: { skipConfirm?: boolean }) => {
    const title = p.projectTitle || p.projectCode || p.clientCode || "this project";
    if (
      !opts?.skipConfirm &&
      !window.confirm(`Remove "${title}" from Technical? It will stay in Admin Project DB.`)
    ) {
      return;
    }
    try {
      await API.put(`/admin/project/${p.id}/hide-technical`);
      setProjects((prev) => prev.filter((x) => x.id !== p.id));
      if (editProject?.id === p.id) setEditProject(null);
      toast.success("Removed from Technical");
    } catch {
      toast.error("Failed to remove from Technical");
    }
  };

  const baseFiltered = useMemo(() => {
    const q = search.toLowerCase();
    return projects.filter((p) => {
      const assignments = parseTechnicalAssignments(p.technicalAssignments);
      const assignNames = assignments.map((a) => a.estimatorName).join(" ");
      const matchSearch =
        !q ||
        (p.projectTitle ?? "").toLowerCase().includes(q) ||
        (p.projectCode ?? "").toLowerCase().includes(q) ||
        (p.clientCode ?? "").toLowerCase().includes(q) ||
        (p.projectScope ?? "").toLowerCase().includes(q) ||
        assignNames.toLowerCase().includes(q);
      const matchState = matchesStateLocationFilter(p.state, p.phone, stateFilter);
      const matchPhone = matchesPhoneAreaCodeFilter(p.phone, phoneFilter);
      return matchSearch && matchState && matchPhone;
    });
  }, [projects, search, stateFilter, phoneFilter]);

  const tabCounts = useMemo(() => {
    const counts: Record<TechnicalWorkflowTab, number> = {
      all: baseFiltered.length,
      not_assigned: 0,
      assigned: 0,
      takeoff_done: 0,
      pricing: 0,
      final_submission: 0,
      completed: 0,
    };
    for (const p of baseFiltered) {
      (["not_assigned", "assigned", "takeoff_done", "pricing", "final_submission", "completed"] as const).forEach(
        (tab) => {
          if (matchesTechnicalTab(tab, p)) counts[tab] += 1;
        },
      );
    }
    return counts;
  }, [baseFiltered]);

  const statusPie = useMemo(() => {
    const overdue = baseFiltered.filter((p) => {
      if (!p.projectDeadline) return false;
      const d = new Date(p.projectDeadline);
      if (Number.isNaN(d.getTime())) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return d < today && !matchesTechnicalTab("final_submission", p);
    }).length;
    const finalN = tabCounts.final_submission;
    const onTrack = Math.max(0, baseFiltered.length - overdue - finalN);
    return [
      { name: "On track", value: onTrack, color: "#D97706" },
      { name: "Overdue", value: overdue, color: "#1B6FE8" },
      { name: "Final / Done", value: finalN, color: "#059669" },
    ].filter((d) => d.value > 0);
  }, [baseFiltered, tabCounts.final_submission]);

  const stageBar = useMemo(
    () =>
      [
        { name: "Unassigned", count: tabCounts.not_assigned, fill: "#94A3B8" },
        { name: "Assigned", count: tabCounts.assigned, fill: "#0EA5E9" },
        { name: "Takeoff", count: tabCounts.takeoff_done, fill: "#8B5CF6" },
        { name: "Pricing", count: tabCounts.pricing, fill: "#F59E0B" },
        { name: "Final", count: tabCounts.final_submission, fill: "#6366F1" },
        { name: "Completed", count: tabCounts.completed, fill: "#059669" },
      ].filter((d) => d.count > 0),
    [tabCounts],
  );

  const displayed = useMemo(
    () => baseFiltered.filter((p) => matchesTechnicalTab(workflowTab, p)),
    [baseFiltered, workflowTab],
  );

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const paginated = displayed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const isAssignedView = workflowTab === "assigned" || workflowTab === "takeoff_done";
  const isPricingView = workflowTab === "pricing";
  const isFinalView = workflowTab === "final_submission";
  const isCompletedView = workflowTab === "completed";
  const showAssignColumn = !isAssignedView && !isPricingView && !isFinalView && !isCompletedView;
  const assignmentFilter = "all" as const;
  const isTakeoffDoneView = workflowTab === "takeoff_done";

  const headers = isAssignedView
    ? ["Project Details", "Man Hours", "Deadline", "Bid Instruction", "Notes for Sir", "Notes for Estimator", "Estimators", "Status", "Actions"]
    : isPricingView
      ? ["Project / Scope", "Receive Date", "Deadline", "Bid Instruction", "Notes for Sir", "Notes for Estimator", "QA Status", "Status", "Actions"]
      : isFinalView
        ? ["Project Details", "Receive Date", "Deadline", "Bid Instruction", "Notes for Sir", "Notes for Estimator", "Actions"]
        : [
            "Project Details",
            "Receive Date",
            "Deadline",
            "Bid Instruction",
            "Notes for Sir",
            "Notes for Estimator",
            "Assigned To",
            "Status",
            "Actions",
          ];
  const colWidths = isAssignedView
    ? TECHNICAL_ASSIGNED_COLS
    : isPricingView
      ? TECHNICAL_PRICING_COLS
      : isFinalView
        ? TECHNICAL_FINAL_COLS
        : TECHNICAL_PROJECT_COLS;

  return (
    <TechnicalPageShell bgClass="bg-[#F5F6FA] dark:bg-crm-bg" className={`${STAFF_PAGE_PAD} overflow-x-hidden`}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: "16px", fontSize: "14px" } }} />
        <DashboardNavbar />

        <div className="mb-4 sm:mb-6 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-crm-text">
                {isRevisions ? "Revisions" : "Active Projects"}
              </h1>
              <p className="text-xs sm:text-sm text-crm-text-muted mt-0.5 sm:mt-1">
                {isRevisions
                  ? "Admin-sent revision projects — assign estimators like Active Projects."
                  : bimDesk
                    ? "Upload a BIM project with client, phone, and the rest. It also appears in Admin Project DB → BIM."
                    : "Technical workflow — assign estimators, track takeoff, pricing & submission."}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {bimDesk && !isRevisions && (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl bg-[#0F398A] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2"
                >
                  <Plus size={14} /> Add project
                </button>
              )}
              <button
                type="button"
                onClick={() => void fetchProjects()}
                disabled={loading}
                className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl border border-gray-200 bg-white text-xs sm:text-sm font-semibold text-gray-700 inline-flex items-center justify-center gap-2 hover:border-[#1B6FE8]/40 hover:text-[#1B6FE8] hover:bg-[#F4F8FF] disabled:opacity-60 shadow-sm"
                title="Refresh"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                {loading ? "Refreshing…" : "Refresh"}
              </button>
              <div className="flex items-center gap-2 bg-[#ECFDF5] text-[#065F46] px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-semibold w-fit">
                <div className="w-2 h-2 rounded-full bg-[#12B76A] animate-pulse" />
                Live Data
              </div>
            </div>
          </div>

          {!isRevisions && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className={`${BENTO_CARD} p-3 sm:p-4 min-w-0`}>
                <h2 className="font-bold text-gray-800 text-sm">Project mix</h2>
                <p className="text-[11px] text-gray-400 mt-0.5 mb-2">On track · overdue · final</p>
                {loading ? (
                  <div className="h-[160px] bg-gray-50 rounded-xl animate-pulse" />
                ) : statusPie.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-10">No project data yet</p>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <RechartsBox height={150} className="sm:w-[150px] shrink-0">
                      <PieChart>
                        <Pie
                          data={statusPie}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={36}
                          outerRadius={58}
                          paddingAngle={3}
                          stroke="#fff"
                          strokeWidth={2}
                        >
                          {statusPie.map((s) => (
                            <Cell key={s.name} fill={s.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                      </PieChart>
                    </RechartsBox>
                    <div className="flex-1 w-full grid gap-1.5">
                      {statusPie.map((s) => (
                        <div key={s.name} className="flex items-center gap-2 bg-[#FAFAFA] rounded-lg px-2.5 py-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                          <p className="flex-1 text-xs font-medium text-gray-600 truncate">{s.name}</p>
                          <span className="text-sm font-bold tabular-nums" style={{ color: s.color }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className={`${BENTO_CARD} p-3 sm:p-4 min-w-0`}>
                <h2 className="font-bold text-gray-800 text-sm">By workflow stage</h2>
                <p className="text-[11px] text-gray-400 mt-0.5 mb-2">Counts across tabs</p>
                {loading ? (
                  <div className="h-[160px] bg-gray-50 rounded-xl animate-pulse" />
                ) : stageBar.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-10">No stage data yet</p>
                ) : (
                  <RechartsBox height={160}>
                    <BarChart data={stageBar} barSize={22}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={24} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} cursor={{ fill: "#EAF2FE" }} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {stageBar.map((d) => (
                          <Cell key={d.name} fill={d.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </RechartsBox>
                )}
              </div>
            </div>
          )}
        </div>

        <CapsuleTabs
          className="mb-4 sm:mb-5"
          activeKey={workflowTab}
          onChange={(key) => {
            setWorkflowTab(key);
            setPage(1);
          }}
          tabs={[
            { key: "all", label: "All Projects", shortLabel: "All", count: tabCounts.all, icon: Layers },
            {
              key: "not_assigned",
              label: "Not Assigned",
              shortLabel: "Unassigned",
              count: tabCounts.not_assigned,
              icon: ClipboardList,
            },
            {
              key: "assigned",
              label: "Assigned",
              shortLabel: "Assigned",
              count: tabCounts.assigned,
              icon: Users,
            },
            {
              key: "takeoff_done",
              label: "Take Off Done",
              shortLabel: "Takeoff",
              count: tabCounts.takeoff_done,
              icon: CheckCircle2,
            },
            {
              key: "pricing",
              label: "Pricing",
              shortLabel: "Pricing",
              count: tabCounts.pricing,
              icon: Calculator,
            },
            {
              key: "final_submission",
              label: "Final Submission",
              shortLabel: "Final",
              count: tabCounts.final_submission,
              icon: Send,
            },
            {
              key: "completed",
              label: "Completed",
              shortLabel: "Done",
              count: tabCounts.completed,
              icon: CheckCircle2,
            },
          ]}
        />

        <div className="flex flex-col gap-2 mb-4 sm:mb-5">
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-md">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search code, title, scope..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full h-10 sm:h-[42px] bg-white border border-gray-200 rounded-xl sm:rounded-2xl pl-9 pr-3 text-sm outline-none focus:border-[#1B6FE8]"
              />
            </div>
            <div className="shrink-0 w-full sm:w-auto">
              <StateFilterDropdown
                value={stateFilter}
                onChange={(v) => {
                  setStateFilter(v);
                  setPage(1);
                }}
              />
            </div>
            <div className="w-full sm:w-auto min-w-0">
              <PhoneAreaCodeFilterInput
                value={phoneFilter}
                onChange={(v) => {
                  setPhoneFilter(v);
                  setPage(1);
                }}
                className="w-full sm:w-auto"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Calendar size={14} className="text-gray-400 shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="h-10 sm:h-[42px] flex-1 min-w-[130px] max-w-[160px] bg-white border border-gray-200 rounded-xl px-2 text-xs sm:text-sm outline-none focus:border-[#1B6FE8]"
            />
            <span className="text-[11px] text-gray-400 shrink-0">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="h-10 sm:h-[42px] flex-1 min-w-[130px] max-w-[160px] bg-white border border-gray-200 rounded-xl px-2 text-xs sm:text-sm outline-none focus:border-[#1B6FE8]"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setPage(1);
                }}
                className="h-10 sm:h-[42px] px-3 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition-all shrink-0"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => void fetchProjects()}
              disabled={loading}
              className="h-10 sm:h-[42px] px-3 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 inline-flex items-center gap-1.5 hover:border-[#1B6FE8]/40 hover:text-[#1B6FE8] disabled:opacity-60 shrink-0 ml-auto"
              title="Refresh"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="lg:hidden space-y-3">
          {loading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 h-36 animate-pulse" />
            ))
          ) : paginated.length > 0 ? (
            paginated.map((p) => {
              const assignments = parseTechnicalAssignments(p.technicalAssignments);
              const anyReady = assignments.some(isAssignmentTakeoffReady);
              return (
                <div
                  key={p.id}
                  data-project-row={p.id}
                  className={`bg-white rounded-2xl border p-4 shadow-sm space-y-3 ${
                    highlightId === p.id
                      ? "border-[#1B6FE8] ring-2 ring-[#1B6FE8]/20"
                      : "border-gray-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {isPricingView ? (
                        <PricingProjectDetailCell p={p} assignments={assignments} />
                      ) : (
                        <ProjectDetailCell p={projectAsRow(p)} />
                      )}
                    </div>
                    <div className="flex flex-col items-start gap-2 shrink-0">
                      {!isFinalView && (
                        <ProjectStatusCell p={p} />
                      )}
                      <ProjectRowActions
                        onEdit={() => setEditProject(p)}
                        onDelete={() => void deleteProject(p)}
                        onMove={() => setMoveProject(p)}
                        showSendPricing={isTakeoffDoneView && anyReady}
                        onSendPricing={() => void sendForPricing(p.id)}
                        showSendFinal={isPricingView}
                        onSendFinal={() => void sendForFinalSubmission(p.id)}
                        showReturnPricing={isFinalView}
                        onReturnPricing={() => void returnToPricing(p.id)}
                      />
                    </div>
                  </div>
                  {isAssignedView ? (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Man Hours</p>
                        <AssignmentHoursCell assignments={assignments} />
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Deadline</p>
                        <div className="space-y-1">
                          <AssignmentDeadlineCell assignments={assignments} />
                          <DeadlineTimingBadge timing={p.deadlineTiming} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Receive Date</p>
                        <p className="font-semibold text-gray-700">
                          {formatDate(isPricingView ? pricingReceiveDate(p) : projectReceiveDate(p))}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Deadline</p>
                        <div className="space-y-1">
                          <p className="font-semibold text-gray-700">{formatDate(p.projectDeadline)}</p>
                          <DeadlineTimingBadge timing={p.deadlineTiming} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Bid Instruction</p>
                    <CommentCell
                      id={p.id}
                      apiRole="admin"
                      commentOnly
                      skipNotesFetch
                      comment={p.projectNotes ?? undefined}
                      onSave={(id, text) => saveBidInstruction(id, text)}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Notes for Sir</p>
                    <CommentCell
                      id={p.id}
                      apiRole="admin"
                      skipNotesFetch
                      chatStyle
                      notesKind="technical"
                      currentUserId={meId}
                      badgeLabel="Notes for Sir"
                      noteHistory={threadNotesHistory(parseTechnicalNotes(p.technicalNotes))}
                      onAddNote={async (_id, text) => addSirNote(p.id, text)}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Notes for Estimator</p>
                    <CommentCell
                      id={p.id}
                      apiRole="admin"
                      skipNotesFetch
                      chatStyle
                      notesKind="technical"
                      currentUserId={meId}
                      badgeLabel="Notes for Estimator"
                      noteHistory={threadNotesHistory(parseEstimatorNotes(p.technicalNotes))}
                      onAddNote={async (_id, text) => addEstimatorNote(p.id, text)}
                    />
                  </div>
                  {isPricingView && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">QA Status</p>
                      <PricingQaSelect
                        phase={p.projectPhase}
                        onChange={(mode) => void setPricingQa(p.id, mode)}
                      />
                    </div>
                  )}
                  {showAssignColumn && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Assigned To</p>
                      <AssignedToCell
                        assignments={assignments}
                        onAssign={() => setAssignProject(p)}
                        showTakeoff={false}
                        onToggleTakeoff={(eid, done) => void toggleTakeoff(p.id, eid, done)}
                      />
                    </div>
                  )}
                  {isAssignedView && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Estimators</p>
                      <AssignedToCell
                        assignments={assignments}
                        onAssign={() => setAssignProject(p)}
                        showTakeoff
                        detailed
                        assignmentFilter={assignmentFilter}
                        showSendPricing={isTakeoffDoneView}
                        showEvaluation={isTakeoffDoneView}
                        onSaveEvaluation={(eid, marks, remarks) => void saveEvaluation(p.id, eid, marks, remarks)}
                        onSendPricing={(eid) => void sendForPricing(p.id, eid)}
                        onToggleTakeoff={(eid, done) => void toggleTakeoff(p.id, eid, done)}
                      />
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <FolderKanban size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 font-medium text-sm">No projects found</p>
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div className={`hidden lg:block ${PROJECT_TABLE_CARD} min-w-0`}>
          <div className="min-w-0 w-full overflow-x-hidden">
            <table className="w-full table-fixed border-collapse">
              <CsrColGroup widths={colWidths} />
              <thead className={CSR_THEAD}>
                <tr className="text-left">
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      className={`px-2 xl:px-3 py-3 leading-tight ${PROJECT_TABLE_HEAD}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3, 4, 5].map((i) => (
                    <tr key={i} className="border-b border-[#F3F3F3]">
                      {headers.map((_, j) => (
                        <td key={j} className="px-2 xl:px-3 py-4">
                          <div className="h-4 bg-gray-100 rounded animate-pulse w-16" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : paginated.length > 0 ? (
                  paginated.map((p) => {
                    const assignments = parseTechnicalAssignments(p.technicalAssignments);
                    const anyReady = assignments.some(isAssignmentTakeoffReady);
                    return (
                      <tr
                        key={p.id}
                        data-project-row={p.id}
                        className={`border-b border-[#F3F3F3] hover:bg-[#FAFAFA] transition-all align-top ${
                          highlightId === p.id ? "bg-[#EAF2FE] ring-2 ring-inset ring-[#1B6FE8]/30" : ""
                        }`}
                      >
                        <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0 overflow-hidden">
                          {isPricingView ? (
                            <PricingProjectDetailCell p={p} assignments={assignments} />
                          ) : (
                            <ProjectDetailCell p={projectAsRow(p)} />
                          )}
                        </td>
                        {isAssignedView ? (
                          <>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <AssignmentHoursCell assignments={assignments} />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <div className="space-y-1">
                                <AssignmentDeadlineCell assignments={assignments} />
                                <DeadlineTimingBadge timing={p.deadlineTiming} />
                              </div>
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <CommentCell
                                id={p.id}
                                apiRole="admin"
                                commentOnly
                                skipNotesFetch
                                comment={p.projectNotes ?? undefined}
                                onSave={(id, text) => saveBidInstruction(id, text)}
                              />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <CommentCell
                                id={p.id}
                                apiRole="admin"
                                skipNotesFetch
                                chatStyle
                                notesKind="technical"
                                currentUserId={meId}
                                badgeLabel="Notes for Sir"
                                noteHistory={threadNotesHistory(parseTechnicalNotes(p.technicalNotes))}
                                onAddNote={async (_id, text) => addSirNote(p.id, text)}
                              />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <CommentCell
                                id={p.id}
                                apiRole="admin"
                                skipNotesFetch
                                chatStyle
                                notesKind="technical"
                                currentUserId={meId}
                                badgeLabel="Notes for Estimator"
                                noteHistory={threadNotesHistory(parseEstimatorNotes(p.technicalNotes))}
                                onAddNote={async (_id, text) => addEstimatorNote(p.id, text)}
                              />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0 overflow-visible">
                              <AssignedToCell
                                assignments={assignments}
                                onAssign={() => setAssignProject(p)}
                                detailed
                                showTakeoff
                                assignmentFilter={assignmentFilter}
                                showSendPricing={isTakeoffDoneView}
                                showEvaluation={isTakeoffDoneView}
                                onSaveEvaluation={(eid, marks, remarks) => void saveEvaluation(p.id, eid, marks, remarks)}
                                onSendPricing={(eid) => void sendForPricing(p.id, eid)}
                                onToggleTakeoff={(eid, done) => void toggleTakeoff(p.id, eid, done)}
                              />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0 overflow-hidden align-top">
                              <ProjectStatusCell p={p} />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0 overflow-hidden align-top">
                              <ProjectRowActions
                                onEdit={() => setEditProject(p)}
                                onDelete={() => void deleteProject(p)}
                                onMove={() => setMoveProject(p)}
                                showSendPricing={isTakeoffDoneView && anyReady}
                                onSendPricing={() => void sendForPricing(p.id)}
                              />
                            </td>
                          </>
                        ) : isPricingView ? (
                          <>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <p className="text-[10px] xl:text-xs font-semibold text-gray-700 flex items-center gap-1">
                                <Calendar size={10} className="text-[#1B6FE8] shrink-0" />
                                {formatDate(pricingReceiveDate(p))}
                              </p>
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <div className="space-y-1">
                                <p className="text-[10px] xl:text-xs font-semibold text-gray-700">
                                  {formatDate(p.projectDeadline)}
                                </p>
                                <DeadlineTimingBadge timing={p.deadlineTiming} />
                              </div>
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <CommentCell
                                id={p.id}
                                apiRole="admin"
                                commentOnly
                                skipNotesFetch
                                comment={p.projectNotes ?? undefined}
                                onSave={(id, text) => saveBidInstruction(id, text)}
                              />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <CommentCell
                                id={p.id}
                                apiRole="admin"
                                skipNotesFetch
                                chatStyle
                                notesKind="technical"
                                currentUserId={meId}
                                badgeLabel="Notes for Sir"
                                noteHistory={threadNotesHistory(parseTechnicalNotes(p.technicalNotes))}
                                onAddNote={async (_id, text) => addSirNote(p.id, text)}
                              />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <CommentCell
                                id={p.id}
                                apiRole="admin"
                                skipNotesFetch
                                chatStyle
                                notesKind="technical"
                                currentUserId={meId}
                                badgeLabel="Notes for Estimator"
                                noteHistory={threadNotesHistory(parseEstimatorNotes(p.technicalNotes))}
                                onAddNote={async (_id, text) => addEstimatorNote(p.id, text)}
                              />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <PricingQaSelect
                                phase={p.projectPhase}
                                onChange={(mode) => void setPricingQa(p.id, mode)}
                              />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0 overflow-hidden align-top">
                              <ProjectStatusCell p={p} />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0 overflow-hidden align-top">
                              <ProjectRowActions
                                onEdit={() => setEditProject(p)}
                                onDelete={() => void deleteProject(p)}
                                onMove={() => setMoveProject(p)}
                                showSendFinal
                                onSendFinal={() => void sendForFinalSubmission(p.id)}
                              />
                            </td>
                          </>
                        ) : isFinalView ? (
                          <>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <p className="text-[10px] xl:text-xs font-semibold text-gray-700 flex items-center gap-1">
                                <Calendar size={10} className="text-[#1B6FE8] shrink-0" />
                                {formatDate(projectReceiveDate(p))}
                              </p>
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <div className="space-y-1">
                                <p className="text-[10px] xl:text-xs font-semibold text-gray-700">
                                  {formatDate(p.projectDeadline)}
                                </p>
                                <DeadlineTimingBadge timing={p.deadlineTiming} />
                              </div>
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <CommentCell
                                id={p.id}
                                apiRole="admin"
                                commentOnly
                                skipNotesFetch
                                comment={p.projectNotes ?? undefined}
                                onSave={(id, text) => saveBidInstruction(id, text)}
                              />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <CommentCell
                                id={p.id}
                                apiRole="admin"
                                skipNotesFetch
                                chatStyle
                                notesKind="technical"
                                currentUserId={meId}
                                badgeLabel="Notes for Sir"
                                noteHistory={threadNotesHistory(parseTechnicalNotes(p.technicalNotes))}
                                onAddNote={async (_id, text) => addSirNote(p.id, text)}
                              />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <CommentCell
                                id={p.id}
                                apiRole="admin"
                                skipNotesFetch
                                chatStyle
                                notesKind="technical"
                                currentUserId={meId}
                                badgeLabel="Notes for Estimator"
                                noteHistory={threadNotesHistory(parseEstimatorNotes(p.technicalNotes))}
                                onAddNote={async (_id, text) => addEstimatorNote(p.id, text)}
                              />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0 overflow-hidden align-top">
                              <ProjectRowActions
                                onEdit={() => setEditProject(p)}
                                onDelete={() => void deleteProject(p)}
                                onMove={() => setMoveProject(p)}
                                showReturnPricing
                                onReturnPricing={() => void returnToPricing(p.id)}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <p className="text-[10px] xl:text-xs font-semibold text-gray-700 flex items-center gap-1">
                                <Calendar size={10} className="text-[#1B6FE8] shrink-0" />
                                {formatDate(projectReceiveDate(p))}
                              </p>
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <div className="space-y-1">
                                <p className="text-[10px] xl:text-xs font-semibold text-gray-700">
                                  {formatDate(p.projectDeadline)}
                                </p>
                                <DeadlineTimingBadge timing={p.deadlineTiming} />
                              </div>
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <CommentCell
                                id={p.id}
                                apiRole="admin"
                                commentOnly
                                skipNotesFetch
                                comment={p.projectNotes ?? undefined}
                                onSave={(id, text) => saveBidInstruction(id, text)}
                              />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <CommentCell
                                id={p.id}
                                apiRole="admin"
                                skipNotesFetch
                                chatStyle
                                notesKind="technical"
                                currentUserId={meId}
                                badgeLabel="Notes for Sir"
                                noteHistory={threadNotesHistory(parseTechnicalNotes(p.technicalNotes))}
                                onAddNote={async (_id, text) => addSirNote(p.id, text)}
                              />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <CommentCell
                                id={p.id}
                                apiRole="admin"
                                skipNotesFetch
                                chatStyle
                                notesKind="technical"
                                currentUserId={meId}
                                badgeLabel="Notes for Estimator"
                                noteHistory={threadNotesHistory(parseEstimatorNotes(p.technicalNotes))}
                                onAddNote={async (_id, text) => addEstimatorNote(p.id, text)}
                              />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0">
                              <AssignedToCell
                                assignments={assignments}
                                onAssign={() => setAssignProject(p)}
                                showTakeoff={false}
                                onToggleTakeoff={(eid, done) => void toggleTakeoff(p.id, eid, done)}
                              />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0 overflow-hidden align-top">
                              <ProjectStatusCell p={p} />
                            </td>
                            <td className="px-2 xl:px-3 py-3 xl:py-4 min-w-0 overflow-hidden align-top">
                              <ProjectRowActions
                                onEdit={() => setEditProject(p)}
                                onDelete={() => void deleteProject(p)}
                                onMove={() => setMoveProject(p)}
                              />
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={headers.length} className="py-16 text-center">
                      <FolderKanban size={36} className="text-gray-200 mx-auto mb-3" />
                      <p className="font-semibold text-gray-400 text-sm">No projects found</p>
                      <p className="text-xs text-gray-300 mt-1">
                        {search ? "Try a different search." : "No projects in this section yet."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, displayed.length)} of{" "}
                {displayed.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="w-9 h-9 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center text-lg"
                >
                  ‹
                </button>
                <span className="text-sm font-semibold text-gray-700 min-w-[60px] text-center">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="w-9 h-9 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center text-lg"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>

      <AssignEstimatorsModal
        open={!!assignProject}
        project={assignProject}
        estimators={estimators}
        existingAssignments={assignProject ? parseTechnicalAssignments(assignProject.technicalAssignments) : []}
        suggestedEstimatorIds={previousProjectEstimatorIds(assignProject, projects)}
        saving={assignSaving}
        onClose={() => setAssignProject(null)}
        onConfirm={confirmAssign}
      />

      <MoveTechnicalStageModal
        open={!!moveProject}
        projectTitle={
          moveProject?.projectTitle ||
          moveProject?.projectCode ||
          "Project"
        }
        currentTab={isRevisions || moveProject?.needsRevision ? "revisions" : workflowTab}
        saving={moveSaving}
        onClose={() => setMoveProject(null)}
        onMove={(tab) => void moveTechnicalTab(tab)}
      />

      <ProjectWorkbenchModal
        open={!!editProject}
        onClose={() => setEditProject(null)}
        initial={editProject ? projectToWorkbench(editProject, bimDesk) : emptyWorkbench()}
        mode="admin"
        saving={editSaving}
        onSave={saveEdit}
        onDelete={editProject ? async () => { await deleteProject(editProject, { skipConfirm: true }); } : undefined}
        noteHistory={editProject ? notesToHistory(editProject.notes) : undefined}
        onAddNote={
          editProject
            ? async (text, parentId) => { await addLeadNote(editProject.id, text, parentId); }
            : undefined
        }
        onNoteUpdated={
          editProject
            ? (noteId, text, createdAt) => updateLeadNote(editProject.id, noteId, text, createdAt)
            : undefined
        }
        onNoteDeleted={
          editProject
            ? (noteId) => deleteLeadNote(editProject.id, noteId)
            : undefined
        }
        technicalNoteHistory={
          editProject ? threadNotesHistory(parseTechnicalNotes(editProject.technicalNotes)) : undefined
        }
        onAddTechnicalNote={
          editProject
            ? async (text) => {
                await addSirNote(editProject.id, text);
              }
            : undefined
        }
        hideClientFinanceSections={!bimDesk}
      />
      <ProjectWorkbenchModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        initial={{ ...emptyWorkbench(), interestedService: "BIM" }}
        mode="admin"
        createMode
        saving={addSaving}
        onSave={(data) => saveBimProject(data)}
      />
    </TechnicalPageShell>
  );
}

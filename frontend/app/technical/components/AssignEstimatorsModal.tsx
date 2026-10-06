"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X, Check, CircleCheckBig, Clock, User2, Calendar, Layers, Briefcase, ChevronDown,
} from "lucide-react";
import {
  DIVISION_OPTIONS,
  PROJECT_TYPE_DIVISIONS,
  formatDivisionSummary,
  formatScopeSummary,
  type TechnicalAssignment,
  type TechnicalEstimator,
} from "@/lib/technicalAssignments";

type ProjectBrief = {
  id: string;
  name?: string | null;
  projectCode?: string | null;
  clientCode?: string | null;
  projectTitle?: string | null;
  projectScope?: string | null;
  interestedService?: string | null;
  projectDeadline?: string | null;
};

type Draft = {
  manHours: string;
  deadline: string;
  scopes: string[];
  divisions: string[];
  scopeInput: string;
  workDetail: string;
};

type Step = "pick" | "details";

type Props = {
  open: boolean;
  project: ProjectBrief | null;
  estimators: TechnicalEstimator[];
  /** Current assignees — pre-checked so reassign can keep or drop them. */
  existingAssignments?: TechnicalAssignment[];
  /** Estimators who worked the previous code for this client (shown first). */
  suggestedEstimatorIds?: string[];
  saving?: boolean;
  onClose: () => void;
  onConfirm: (assignments: TechnicalAssignment[]) => void | Promise<void>;
};

function emptyDraft(deadline: string, defaultScope?: string): Draft {
  return {
    manHours: "",
    deadline,
    scopes: defaultScope ? [defaultScope] : [],
    divisions: [],
    scopeInput: "",
    workDetail: "",
  };
}

function DivisionMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm bg-[#FAFAFA] outline-none focus:border-[#1B6FE8] flex items-center justify-between gap-2 text-left"
      >
        <span className={`truncate ${value.length ? "text-[#0F172A] font-semibold" : "text-gray-500 font-medium"}`}>
          {value.length ? formatDivisionSummary(value) : "Select division(s)"}
        </span>
        <ChevronDown size={14} className={`text-gray-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg p-1.5 space-y-0.5">
          <p className="px-2.5 pt-1 pb-0.5 text-[9px] font-extrabold uppercase tracking-wider text-gray-400">
            Project type
          </p>
          {PROJECT_TYPE_DIVISIONS.map((opt) => {
            const active = value.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm transition-colors ${
                  active ? "bg-[#EAF2FE] text-[#1B6FE8] font-bold" : "hover:bg-gray-50 text-[#0F172A] font-medium"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    active ? "bg-[#1B6FE8] border-[#1B6FE8]" : "border-gray-300 bg-white"
                  }`}
                >
                  {active && <Check size={10} className="text-white" />}
                </span>
                {opt}
              </button>
            );
          })}
          <p className="px-2.5 pt-2 pb-0.5 text-[9px] font-extrabold uppercase tracking-wider text-gray-400">
            CSI divisions
          </p>
          {DIVISION_OPTIONS.filter((opt) => !(PROJECT_TYPE_DIVISIONS as readonly string[]).includes(opt)).map((opt) => {
            const active = value.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm transition-colors ${
                  active ? "bg-[#EAF2FE] text-[#1B6FE8] font-bold" : "hover:bg-gray-50 text-[#0F172A] font-medium"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    active ? "bg-[#1B6FE8] border-[#1B6FE8]" : "border-gray-300 bg-white"
                  }`}
                >
                  {active && <Check size={10} className="text-white" />}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScopeMultiField({
  scopes,
  scopeInput,
  onScopesChange,
  onInputChange,
}: {
  scopes: string[];
  scopeInput: string;
  onScopesChange: (next: string[]) => void;
  onInputChange: (v: string) => void;
}) {
  const addScope = () => {
    const v = scopeInput.trim();
    if (!v) return;
    if (scopes.some((s) => s.toLowerCase() === v.toLowerCase())) {
      onInputChange("");
      return;
    }
    onScopesChange([...scopes, v]);
    onInputChange("");
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <input
          type="text"
          value={scopeInput}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addScope();
            }
          }}
          placeholder="Add scope, press Enter"
          className="flex-1 h-10 rounded-xl border border-gray-200 px-3 text-sm text-[#0F172A] font-medium placeholder:text-gray-500 outline-none focus:border-[#1B6FE8] bg-[#FAFAFA]"
        />
        <button
          type="button"
          onClick={addScope}
          className="h-10 px-3 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] text-sm font-bold shrink-0 hover:bg-[#ffe4e8]"
        >
          Add
        </button>
      </div>
      {scopes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 bg-[#1B6FE8]/10 text-[#1B6FE8] text-xs font-bold px-2 py-1 rounded-lg max-w-[65%] truncate">
            {scopes[0]}
            <button
              type="button"
              onClick={() => onScopesChange(scopes.slice(1))}
              className="hover:opacity-70"
              aria-label="Remove scope"
            >
              <X size={10} />
            </button>
          </span>
          {scopes.length > 1 && (
            <span
              className="inline-flex items-center justify-center bg-gray-200 text-gray-700 text-[11px] font-bold px-1.5 h-5 rounded-full"
              title={scopes.slice(1).join(", ")}
            >
              +{scopes.length - 1}
            </span>
          )}
        </div>
      )}
      {scopes.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {scopes.slice(1).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onScopesChange(scopes.filter((x) => x !== s))}
              className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-[11px] font-semibold px-2 py-0.5 rounded-lg hover:bg-[#EAF2FE] hover:text-[#1B6FE8]"
            >
              {s} <X size={9} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EstimatorCheckRow({
  est,
  active,
  hint,
  tone,
  onToggle,
}: {
  est: TechnicalEstimator;
  active: boolean;
  hint: string;
  tone: "assigned" | "suggested" | "plain";
  onToggle: () => void;
}) {
  const border =
    tone === "assigned"
      ? active
        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
        : "border-emerald-200 bg-white dark:bg-crm-surface hover:border-emerald-300"
      : tone === "suggested"
        ? active
          ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
          : "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 hover:border-amber-300"
        : active
          ? "border-[#1B6FE8] bg-[#EAF2FE] dark:bg-[#1B6FE8]/15"
          : "border-gray-100 bg-[#FAFAFA] dark:bg-crm-muted hover:border-gray-200";
  const avatar = active
    ? tone === "assigned"
      ? "bg-emerald-600"
      : tone === "suggested"
        ? "bg-amber-600"
        : "bg-[#1B6FE8]"
    : "bg-gray-400";
  const nameCls = active
    ? tone === "assigned"
      ? "text-emerald-800 dark:text-emerald-200"
      : tone === "suggested"
        ? "text-amber-800 dark:text-amber-200"
        : "text-[#1B6FE8]"
    : "text-[#0F172A] dark:text-crm-text";

  return (
    <label
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl border-2 transition-all text-left cursor-pointer ${border}`}
    >
      <input
        type="checkbox"
        checked={active}
        onChange={onToggle}
        className="w-4 h-4 rounded border-gray-300 text-[#1B6FE8] accent-[#1B6FE8] shrink-0"
      />
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${avatar}`}>
        {est.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold text-sm truncate ${nameCls}`}>{est.name}</p>
        <p className="text-xs text-gray-500 dark:text-crm-text-muted">{hint}</p>
      </div>
      {active ? (
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
          tone === "assigned" ? "bg-emerald-600" : tone === "suggested" ? "bg-amber-600" : "bg-[#1B6FE8]"
        }`}>
          <Check size={11} className="text-white" />
        </div>
      ) : null}
    </label>
  );
}

export default function AssignEstimatorsModal({
  open,
  project,
  estimators,
  existingAssignments = [],
  suggestedEstimatorIds = [],
  saving = false,
  onClose,
  onConfirm,
}: Props) {
  const [step, setStep] = useState<Step>("pick");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const code = (project?.projectCode || project?.clientCode || "").trim() || "—";
  const projectScope = (project?.projectScope || "").trim();
  const divisionLabel = (project?.interestedService || "").trim() || "—";
  const title = (project?.projectTitle || "Project").trim();
  const defaultDeadline = (project?.projectDeadline ?? "").split("T")[0] || "";

  const selectedEstimators = useMemo(
    () => estimators.filter((e) => selectedIds.includes(e.id)),
    [estimators, selectedIds],
  );

  const suggestedSet = useMemo(() => new Set(suggestedEstimatorIds), [suggestedEstimatorIds]);
  const assignedSet = useMemo(
    () => new Set(existingAssignments.map((a) => a.estimatorId)),
    [existingAssignments],
  );
  const assignedList = useMemo(
    () => estimators.filter((e) => assignedSet.has(e.id)),
    [estimators, assignedSet],
  );
  const suggestedList = useMemo(
    () => estimators.filter((e) => suggestedSet.has(e.id) && !assignedSet.has(e.id)),
    [estimators, suggestedSet, assignedSet],
  );
  const otherList = useMemo(
    () => estimators.filter((e) => !assignedSet.has(e.id) && !suggestedSet.has(e.id)),
    [estimators, assignedSet, suggestedSet],
  );
  const assignedKey = existingAssignments.map((a) => a.estimatorId).join(",");
  const existingRef = useRef(existingAssignments);
  existingRef.current = existingAssignments;

  useEffect(() => {
    if (!open || !project) return;
    const existing = existingRef.current;
    const ids = existing.map((a) => a.estimatorId);
    setSelectedIds(ids);
    const next: Record<string, Draft> = {};
    const scope = (project.projectScope || "").trim() || undefined;
    const deadline = (project.projectDeadline ?? "").split("T")[0] || "";
    for (const a of existing) {
      next[a.estimatorId] = {
        manHours: a.manHours ?? "",
        deadline: (a.deadline ?? deadline).split("T")[0] || deadline,
        scopes: a.scopes?.length ? a.scopes : scope ? [scope] : [],
        divisions: a.divisions ?? [],
        scopeInput: "",
        workDetail: a.workDetail ?? "",
      };
    }
    setDrafts(next);
    setStep("pick");
  }, [open, project, assignedKey]);

  if (!open || !project) return null;

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const patchDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((d) => ({
      ...d,
      [id]: { ...(d[id] ?? emptyDraft(defaultDeadline, projectScope || undefined)), ...patch },
    }));
  };

  const goDetails = () => {
    if (selectedIds.length === 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        if (!next[id]) next[id] = emptyDraft(defaultDeadline, projectScope || undefined);
      }
      return next;
    });
    setStep("details");
  };

  const handleConfirm = async () => {
    const assignments: TechnicalAssignment[] = selectedEstimators.map((e) => {
      const d = drafts[e.id] ?? emptyDraft(defaultDeadline, projectScope || undefined);
      const prev = existingAssignments.find((a) => a.estimatorId === e.id);
      return {
        estimatorId: e.id,
        estimatorName: e.name,
        manHours: d.manHours.trim(),
        deadline: d.deadline.trim(),
        scopes: d.scopes,
        divisions: d.divisions,
        workDetail: d.workDetail.trim(),
        takeoffDone: prev?.takeoffDone ?? false,
        pricingSent: prev?.pricingSent ?? false,
        timerSeconds: prev?.timerSeconds ?? 0,
        timerStartedAt: prev?.timerStartedAt ?? null,
        assignmentConfirmed: true,
      };
    });
    if (assignments.some((a) => !a.deadline)) return;
    await onConfirm(assignments);
    setStep("pick");
    setSelectedIds([]);
    setDrafts({});
  };

  const handleClose = () => {
    setStep("pick");
    setSelectedIds([]);
    setDrafts({});
    onClose();
  };

  const detailsValid =
    selectedEstimators.length > 0 &&
    selectedEstimators.every((e) => (drafts[e.id]?.deadline ?? "").trim());

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="w-full sm:max-w-[600px] bg-white dark:bg-crm-surface rounded-t-[24px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "92vh" }}
      >
        <div className="relative bg-gradient-to-br from-[#1B6FE8] to-[#0E4FBE] px-4 sm:px-5 lg:px-6 pt-4 sm:pt-5 pb-3.5 sm:pb-4 shrink-0 overflow-hidden">
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
          <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-3 sm:top-4 right-3 sm:right-4 w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors z-10"
          >
            <X size={13} />
          </button>
          <div className="flex items-center gap-2.5 sm:gap-3 pr-10">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white/20 flex items-center justify-center text-white text-base sm:text-lg font-bold shrink-0">
              {(code !== "—" ? code : title).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg lg:text-xl font-extrabold text-white leading-tight truncate tracking-tight">
                {code}
              </h2>
              <p className="text-white text-[12px] sm:text-sm mt-0.5 truncate font-semibold">
                {title}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] sm:text-[13px] font-semibold text-white leading-snug">
                <span>
                  <span className="text-white/80 font-medium">Scope:</span>{" "}
                  <span className="text-white">{projectScope || "—"}</span>
                </span>
                <span className="text-white/50">·</span>
                <span>
                  <span className="text-white/80 font-medium">Division:</span>{" "}
                  <span className="text-white">{divisionLabel}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 bg-white/20 text-white border border-white/30 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-bold">
              <CircleCheckBig size={11} />
              {step === "pick"
                ? `Select estimators${selectedIds.length ? ` · ${selectedIds.length} selected` : ""}`
                : "Set hours, deadline, work detail & division"}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-4 sm:px-5 lg:px-6 py-4 sm:py-5 space-y-3">
            {step === "pick" ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  All estimators · check to keep or add · uncheck to remove ({selectedIds.length} selected)
                </p>
                {estimators.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <p className="text-sm font-semibold text-gray-600">No estimators available.</p>
                    <p className="text-xs text-gray-500 px-4 leading-relaxed">
                      In Admin → Users, add or activate users with the{" "}
                      <span className="font-bold text-[#1B6FE8]">Estimator</span> role, then open this modal again.
                    </p>
                  </div>
                ) : (
                  <>
                    {assignedList.length > 0 ? (
                      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        Currently assigned
                      </p>
                    ) : null}
                    {assignedList.map((est) => (
                      <EstimatorCheckRow
                        key={est.id}
                        est={est}
                        active={selectedIds.includes(est.id)}
                        hint={`${est.code} · assigned now`}
                        tone="assigned"
                        onToggle={() => toggle(est.id)}
                      />
                    ))}
                    {suggestedList.length > 0 ? (
                      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 pt-1">
                        Worked last time · suggested
                      </p>
                    ) : null}
                    {suggestedList.map((est) => (
                      <EstimatorCheckRow
                        key={est.id}
                        est={est}
                        active={selectedIds.includes(est.id)}
                        hint={`${est.code} · last project`}
                        tone="suggested"
                        onToggle={() => toggle(est.id)}
                      />
                    ))}
                    {otherList.length > 0 ? (
                      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 pt-1">
                        Other estimators
                      </p>
                    ) : null}
                    {otherList.map((est) => (
                      <EstimatorCheckRow
                        key={est.id}
                        est={est}
                        active={selectedIds.includes(est.id)}
                        hint={est.code}
                        tone="plain"
                        onToggle={() => toggle(est.id)}
                      />
                    ))}
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {selectedEstimators.map((est) => {
                  const d = drafts[est.id] ?? emptyDraft(defaultDeadline, projectScope || undefined);
                  return (
                    <div
                      key={est.id}
                      className="rounded-2xl border border-gray-100 bg-white p-3.5 space-y-2.5 shadow-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#1B6FE8] text-white flex items-center justify-center text-sm font-bold">
                          {est.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#0F172A] truncate flex items-center gap-1.5">
                            <User2 size={12} className="text-[#1B6FE8]" />
                            {est.name}
                          </p>
                          <p className="text-[11px] text-gray-400">{est.code}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <label className="block space-y-1">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-600 flex items-center gap-1">
                            <Clock size={11} /> Man Hours
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="e.g. 8"
                            value={d.manHours}
                            onChange={(e) => patchDraft(est.id, { manHours: e.target.value })}
                            className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#1B6FE8] bg-[#FAFAFA]"
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-600 flex items-center gap-1">
                            <Calendar size={11} /> Deadline <span className="text-[#1B6FE8]">*required</span>
                          </span>
                          <input
                            type="date"
                            value={d.deadline}
                            onChange={(e) => patchDraft(est.id, { deadline: e.target.value })}
                            className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#1B6FE8] bg-[#FAFAFA]"
                          />
                        </label>
                        <label className="block space-y-1 sm:col-span-2">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-600">
                            Work Detail
                          </span>
                          <textarea
                            value={d.workDetail}
                            onChange={(e) => patchDraft(est.id, { workDetail: e.target.value })}
                            placeholder="Describe the work for this estimator…"
                            rows={3}
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#1B6FE8] bg-[#FAFAFA] resize-none"
                          />
                        </label>
                        <div className="block space-y-1">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-600 flex items-center gap-1">
                            <Briefcase size={11} /> Scope
                            {d.scopes.length > 1 && (
                              <span className="ml-1 bg-gray-100 text-gray-600 text-[9px] font-bold px-1.5 rounded-full">
                                {formatScopeSummary(d.scopes)}
                              </span>
                            )}
                          </span>
                          <ScopeMultiField
                            scopes={d.scopes}
                            scopeInput={d.scopeInput}
                            onScopesChange={(scopes) => patchDraft(est.id, { scopes })}
                            onInputChange={(scopeInput) => patchDraft(est.id, { scopeInput })}
                          />
                        </div>
                        <label className="block space-y-1">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-600 flex items-center gap-1">
                            <Layers size={11} /> Division
                            {d.divisions.length > 1 && (
                              <span className="ml-1 bg-gray-100 text-gray-600 text-[9px] font-bold px-1.5 rounded-full">
                                +{d.divisions.length - 1}
                              </span>
                            )}
                          </span>
                          <DivisionMultiSelect
                            value={d.divisions}
                            onChange={(divisions) => patchDraft(est.id, { divisions })}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2 sm:gap-3 pb-1 pt-1">
              {step === "details" ? (
                <button
                  type="button"
                  onClick={() => setStep("pick")}
                  className="flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors"
                >
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              )}
              {step === "pick" ? (
                <button
                  type="button"
                  onClick={goDetails}
                  disabled={selectedIds.length === 0}
                  className={`flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl font-semibold text-xs sm:text-sm text-white flex items-center justify-center gap-2 transition-all ${
                    selectedIds.length > 0
                      ? "bg-gradient-to-r from-[#1B6FE8] to-[#d4173a] shadow-md shadow-red-200"
                      : "bg-gray-200 cursor-not-allowed text-gray-400"
                  }`}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={!detailsValid || saving}
                  className={`flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl font-semibold text-xs sm:text-sm text-white flex items-center justify-center gap-2 transition-all ${
                    detailsValid && !saving
                      ? "bg-gradient-to-r from-[#1B6FE8] to-[#d4173a] shadow-md shadow-red-200"
                      : "bg-gray-200 cursor-not-allowed text-gray-400"
                  }`}
                >
                  {saving ? "Assigning…" : "Confirm Assignment"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

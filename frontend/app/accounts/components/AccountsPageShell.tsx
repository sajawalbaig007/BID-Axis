"use client";

import { useRef, useState } from "react";
import {
  CalendarDays, Filter, Save, Upload, Plus, Loader2, FileText, ExternalLink, X,
} from "lucide-react";
import type { AccountsUpload } from "../types";
import { todayIso } from "../types";
import {
  formatPeriodSummary,
  PERIOD_PRESET_LABELS,
  QUICK_PERIOD_PRESETS,
  normalizePeriodPreset,
  type AccountsPeriodPreset,
} from "../utils/accountsPeriodFilters";
import { STAFF_PAGE_PAD } from "@/lib/staffPageLayout";
import { useAccountsVisualPdf } from "../utils/useAccountsVisualPdf";
import LatePolicyProvider from "./LatePolicyProvider";

type AccountsPageShellProps = {
  title: string;
  subtitle: string;
  recordDate: string;
  onRecordDateChange?: (v: string) => void;
  onSelectSavedDate?: (v: string) => void;
  filterFrom: string;
  filterTo: string;
  onFilterFromChange: (v: string) => void;
  onFilterToChange: (v: string) => void;
  periodPreset: AccountsPeriodPreset;
  onPeriodPresetChange: (v: AccountsPeriodPreset) => void;
  filterYear: number;
  onFilterYearChange: (v: number) => void;
  filterMonth: string;
  onFilterMonthChange: (v: string) => void;
  savedDates: string[];
  onSave: () => void;
  onAddNew?: () => void;
  addNewLabel?: string;
  onUpload: (file: File) => void;
  saving?: boolean;
  uploading?: boolean;
  loading?: boolean;
  dirty?: boolean;
  uploads?: AccountsUpload[];
  /** Last same-month saved day this view was filled from (empty today). */
  copiedFrom?: string | null;
  /** Dashboard: "Accounts Dashboard" on one line */
  inlineTitle?: boolean;
  /** Hide Upload File + Save (dashboard is live totals) */
  hideFileActions?: boolean;
  /** Extra controls on the title row (e.g. All Formulas) */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
};

const inputCls =
  "mt-1 h-10 w-full rounded-xl border border-crm-border bg-crm-input px-3 text-sm text-crm-text outline-none transition-shadow focus:ring-2 focus:ring-[#1B6FE8]/20 focus:border-[#1B6FE8]/40";

export default function AccountsPageShell({
  title,
  subtitle,
  recordDate,
  onRecordDateChange,
  onSelectSavedDate,
  filterFrom,
  filterTo,
  onFilterFromChange,
  onFilterToChange,
  periodPreset,
  onPeriodPresetChange,
  filterMonth,
  onFilterMonthChange,
  savedDates = [],
  onSave,
  onAddNew,
  addNewLabel = "Add New Row",
  onUpload,
  saving,
  uploading,
  loading,
  dirty,
  uploads = [],
  copiedFrom = null,
  inlineTitle = false,
  hideFileActions = false,
  headerActions,
  children,
}: AccountsPageShellProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const activePreset = normalizePeriodPreset(periodPreset);
  const periodSummary = formatPeriodSummary(periodPreset, filterFrom, filterTo, filterMonth, recordDate);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";
  const monthKey = /^\d{4}-\d{2}/.test(filterMonth) ? filterMonth.slice(0, 7) : recordDate.slice(0, 7);
  useAccountsVisualPdf({
    ready: !loading,
    rootRef: exportRef,
    fileName: `Accounts-${slug}-${monthKey}.pdf`,
    footer: `BEM Solutions CRM · ${title} · ${periodSummary || monthKey}`,
  });
  const sortedSavedDays = [...savedDates].sort().reverse();
  const recentSavedDays = sortedSavedDays.slice(0, 7);
  const pickSavedDate = onSelectSavedDate ?? onRecordDateChange;
  const periodInHeader = hideFileActions;
  const showActions = !hideFileActions || !!onAddNew || periodInHeader || !!headerActions;

  const periodTrigger = (
    <>
      <button
        type="button"
        onClick={() => setFilterOpen(true)}
        className="w-10 h-10 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] inline-flex items-center justify-center hover:bg-[#FFE4E8] transition-colors shrink-0"
        title={periodSummary || "Open period filter"}
      >
        <Filter size={16} />
      </button>
      {!periodInHeader && (
        <button type="button" onClick={() => setFilterOpen(true)} className="flex-1 min-w-0 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-crm-text-faint">Period</p>
          <p className="text-sm font-semibold text-crm-text truncate">{periodSummary || "Choose a period"}</p>
        </button>
      )}
      <button
        type="button"
        onClick={() => setFilterOpen(true)}
        className={`${periodInHeader ? "inline-flex" : "hidden sm:inline-flex"} text-[11px] font-semibold text-[#1B6FE8] bg-[#EAF2FE] px-2.5 py-1 rounded-full shrink-0`}
      >
        {PERIOD_PRESET_LABELS[activePreset]}
      </button>
    </>
  );

  return (
    <LatePolicyProvider month={monthKey}>
    <div className={STAFF_PAGE_PAD}>
      <header className="rounded-2xl border border-gray-100 dark:border-crm-border bg-crm-surface px-5 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            {inlineTitle ? (
              <h1 className="text-xl sm:text-2xl font-extrabold text-crm-text tracking-tight">
                <span className="text-[#1B6FE8]">Accounts</span>
                <span className="text-crm-text-faint font-semibold mx-2">·</span>
                {title}
              </h1>
            ) : (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1B6FE8] mb-0.5">Accounts</p>
                <h1 className="text-xl sm:text-2xl font-extrabold text-crm-text tracking-tight">{title}</h1>
              </>
            )}
            {subtitle ? (
              <p className="text-xs text-crm-text-muted mt-1 max-w-2xl leading-relaxed">{subtitle}</p>
            ) : null}
          </div>
          {showActions && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {periodInHeader && periodTrigger}
              {headerActions}
              {onAddNew && (
                <button
                  type="button"
                  onClick={onAddNew}
                  className="h-9 px-3 rounded-xl bg-[#EAF5FF] dark:bg-sky-500/20 text-[#0B84F3] text-sm font-semibold inline-flex items-center gap-2"
                >
                  <Plus size={15} />
                  {addNewLabel}
                </button>
              )}
              {!hideFileActions && (
                <>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading || loading}
                    className="h-9 px-3 rounded-xl bg-[#F3EEFF] dark:bg-violet-500/20 text-[#7C3AED] text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                    Upload File
                  </button>
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={saving || loading}
                    className="h-9 px-3 rounded-xl bg-[#1B6FE8] text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    Save{dirty ? " *" : ""}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv,.pdf,.txt,.json"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) onUpload(f);
                      e.target.value = "";
                    }}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {!periodInHeader && (
        <section className="rounded-2xl border border-gray-100 dark:border-crm-border bg-crm-surface px-4 sm:px-5 py-3">
          <div className="flex items-center gap-3">
            {periodTrigger}
          </div>
        </section>
      )}

      {filterOpen && (
        <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white dark:bg-crm-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-crm-border-subtle">
              <div>
                <h2 className="text-sm font-bold text-crm-text">Filter period</h2>
                <p className="text-[11px] text-crm-text-faint mt-0.5">All Time, Daily, Monthly, or Date Range</p>
              </div>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 inline-flex items-center justify-center"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {QUICK_PERIOD_PRESETS.map(key => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onPeriodPresetChange(key)}
                    className={`h-10 rounded-xl text-xs font-semibold border transition-colors ${
                      activePreset === key
                        ? "bg-[#1B6FE8] text-white border-[#1B6FE8]"
                        : "bg-crm-muted text-crm-text-secondary border-transparent hover:border-[#1B6FE8]/30"
                    }`}
                  >
                    {PERIOD_PRESET_LABELS[key]}
                  </button>
                ))}
              </div>

              {activePreset === "daily" && onRecordDateChange && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-crm-text-secondary block">
                    <span className="inline-flex items-center gap-1 mb-0.5"><CalendarDays size={12} /> Day</span>
                    <input
                      type="date"
                      value={recordDate}
                      onChange={e => onRecordDateChange(e.target.value)}
                      className={inputCls}
                    />
                  </label>
                  {recentSavedDays.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {recentSavedDays.map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => onRecordDateChange(d)}
                          className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold ${
                            d === recordDate ? "bg-[#1B6FE8] text-white" : "bg-crm-muted text-crm-text-secondary"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activePreset === "month" && (
                <label className="text-xs font-semibold text-crm-text-secondary block">
                  <span className="inline-flex items-center gap-1 mb-0.5"><CalendarDays size={12} /> Month</span>
                  <input
                    type="month"
                    value={filterMonth}
                    onChange={e => onFilterMonthChange(e.target.value)}
                    className={inputCls}
                  />
                </label>
              )}

              {activePreset === "date_range" && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-crm-text-secondary">
                    From
                    <input
                      type="date"
                      value={filterFrom}
                      onChange={e => onFilterFromChange(e.target.value)}
                      className={inputCls}
                    />
                  </label>
                  <label className="text-xs font-semibold text-crm-text-secondary">
                    To
                    <input
                      type="date"
                      value={filterTo}
                      onChange={e => onFilterToChange(e.target.value)}
                      className={inputCls}
                    />
                  </label>
                </div>
              )}

              {activePreset === "all_time" && (
                <p className="text-[11px] text-crm-text-muted">
                  Totals through <span className="font-semibold text-crm-text-secondary">{todayIso()}</span>
                  {" "}— each month’s final currency formula once.
                </p>
              )}

              {pickSavedDate && (activePreset === "month" || activePreset === "date_range") && sortedSavedDays.length > 0 && (
                <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1.5">
                  {sortedSavedDays.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => pickSavedDate(d)}
                      className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold ${
                        d === recordDate ? "bg-[#1B6FE8] text-white" : "bg-crm-muted text-crm-text-secondary"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="w-full h-10 rounded-xl bg-[#1B6FE8] text-white text-sm font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {copiedFrom && copiedFrom !== recordDate && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-950">
          Showing last saved figures from <span className="font-semibold">{copiedFrom}</span> for this
          month. Click Save to keep them on {recordDate}.
        </div>
      )}

      {uploads.length > 0 && !hideFileActions && (
        <section className="rounded-2xl border border-crm-border-subtle bg-crm-surface shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-7 h-7 rounded-lg bg-[#F3EEFF] text-[#7C3AED] inline-flex items-center justify-center">
              <FileText size={14} />
            </span>
            <h3 className="font-bold text-sm text-crm-text">Files for {recordDate}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {uploads.map(u => (
              <a
                key={u.id}
                href={u.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-crm-muted border border-crm-border-subtle text-xs font-semibold text-[#0B84F3]"
              >
                {u.fileName}
                <ExternalLink size={12} />
              </a>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="rounded-2xl border border-crm-border-subtle bg-crm-surface p-14 flex flex-col items-center justify-center gap-3">
          <Loader2 size={28} className="animate-spin text-[#1B6FE8]" />
          <p className="text-xs font-semibold text-crm-text-faint">Loading record...</p>
        </div>
      ) : (
        <div ref={exportRef} data-report-block>
          {children}
        </div>
      )}
    </div>
    </LatePolicyProvider>
  );
}

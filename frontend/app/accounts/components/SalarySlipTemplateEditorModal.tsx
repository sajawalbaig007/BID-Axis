"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  DEFAULT_SECTION_TITLES,
  DEFAULT_SLIP_TEMPLATES,
  SLIP_AMOUNT_SOURCE_OPTIONS,
  SLIP_EMPLOYEE_KEY_OPTIONS,
  emptyAmountField,
  emptyCustomSection,
  emptyEmployeeField,
  getSlipTemplateForKind,
  resetSlipTemplateForKind,
  saveSlipTemplateForKind,
  type SlipAmountSource,
  type SlipCustomSection,
  type SlipEmployeeFieldKey,
  type SlipEmployeeFieldLine,
  type SlipFieldLine,
  type SlipKindTemplate,
  type SlipPayrollKind,
} from "../utils/salarySlipFieldConfig";
import { salarySlipCompanyForKind, SALARY_SLIP_COMPANIES } from "../utils/salarySlipCompanies";

type Props = {
  open: boolean;
  kind: SlipPayrollKind | null;
  onClose: () => void;
};

type SectionTab = "employee" | "earnings" | "deductions" | "footer" | string;

function AmountFieldsEditor({
  fields,
  onChange,
  accent,
}: {
  fields: SlipFieldLine[];
  onChange: (next: SlipFieldLine[]) => void;
  accent: string;
}) {
  const update = (id: string, patch: Partial<SlipFieldLine>) => {
    onChange(fields.map(f => (f.id === id ? { ...f, ...patch } : f)));
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...fields];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j]!, next[index]!];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {fields.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-crm-text-faint">No fields in this section.</p>
      ) : (
        fields.map((f, index) => (
          <div
            key={f.id}
            className="rounded-xl border border-crm-border-subtle bg-[#FAFBFC] px-2.5 py-2 flex flex-wrap items-center gap-2"
          >
            <label className="inline-flex items-center gap-1.5 shrink-0">
              <input
                type="checkbox"
                checked={f.enabled}
                onChange={e => update(f.id, { enabled: e.target.checked })}
                className="rounded border-crm-border"
              />
              <span className="text-[10px] font-bold text-crm-text-faint uppercase">On</span>
            </label>
            <input
              value={f.label}
              onChange={e => update(f.id, { label: e.target.value })}
              className="flex-1 min-w-[120px] h-8 px-2 rounded-lg border border-crm-border bg-crm-surface text-xs font-semibold text-crm-text"
              placeholder="Field label"
            />
            <select
              value={f.source}
              onChange={e => update(f.id, { source: e.target.value as SlipAmountSource })}
              className="h-8 px-2 rounded-lg border border-crm-border bg-crm-surface text-[11px] text-crm-text-secondary min-w-[140px]"
            >
              {SLIP_AMOUNT_SOURCE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {f.source === "custom" && (
              <input
                type="number"
                value={f.defaultAmount ?? 0}
                onChange={e => update(f.id, { defaultAmount: Number(e.target.value) || 0 })}
                className="w-24 h-8 px-2 rounded-lg border border-crm-border bg-crm-surface text-xs tabular-nums"
                placeholder="Amount"
                title="Fixed amount"
              />
            )}
            <div className="inline-flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="w-7 h-7 rounded-lg text-crm-text-faint hover:bg-crm-surface-raised disabled:opacity-30 inline-flex items-center justify-center"
                title="Move up"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === fields.length - 1}
                className="w-7 h-7 rounded-lg text-crm-text-faint hover:bg-crm-surface-raised disabled:opacity-30 inline-flex items-center justify-center"
                title="Move down"
              >
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => onChange(fields.filter(x => x.id !== f.id))}
                className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 inline-flex items-center justify-center"
                title="Delete field"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))
      )}
      <button
        type="button"
        onClick={() => onChange([...fields, emptyAmountField()])}
        className="h-9 w-full rounded-xl border border-dashed border-crm-border text-xs font-bold text-crm-text-secondary hover:bg-crm-surface-raised inline-flex items-center justify-center gap-1.5"
        style={{ borderColor: `${accent}55`, color: accent }}
      >
        <Plus size={14} /> Add field
      </button>
    </div>
  );
}

function EmployeeFieldsEditor({
  fields,
  onChange,
  accent,
}: {
  fields: SlipEmployeeFieldLine[];
  onChange: (next: SlipEmployeeFieldLine[]) => void;
  accent: string;
}) {
  const update = (id: string, patch: Partial<SlipEmployeeFieldLine>) => {
    onChange(fields.map(f => (f.id === id ? { ...f, ...patch } : f)));
  };

  return (
    <div className="space-y-2">
      {fields.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-crm-text-faint">No employee fields.</p>
      ) : (
        fields.map(f => (
          <div
            key={f.id}
            className="rounded-xl border border-crm-border-subtle bg-[#FAFBFC] px-2.5 py-2 flex flex-wrap items-center gap-2"
          >
            <label className="inline-flex items-center gap-1.5 shrink-0">
              <input
                type="checkbox"
                checked={f.enabled}
                onChange={e => update(f.id, { enabled: e.target.checked })}
                className="rounded border-crm-border"
              />
              <span className="text-[10px] font-bold text-crm-text-faint uppercase">On</span>
            </label>
            <input
              value={f.label}
              onChange={e => update(f.id, { label: e.target.value })}
              className="flex-1 min-w-[120px] h-8 px-2 rounded-lg border border-crm-border bg-crm-surface text-xs font-semibold"
              placeholder="Label"
            />
            <select
              value={f.key}
              onChange={e => update(f.id, { key: e.target.value as SlipEmployeeFieldKey })}
              className="h-8 px-2 rounded-lg border border-crm-border bg-crm-surface text-[11px] min-w-[140px]"
            >
              {SLIP_EMPLOYEE_KEY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {f.key === "custom" && (
              <input
                value={f.defaultValue ?? ""}
                onChange={e => update(f.id, { defaultValue: e.target.value })}
                className="flex-1 min-w-[120px] h-8 px-2 rounded-lg border border-crm-border bg-crm-surface text-xs"
                placeholder="Static value"
              />
            )}
            <button
              type="button"
              onClick={() => onChange(fields.filter(x => x.id !== f.id))}
              className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 inline-flex items-center justify-center"
              title="Delete field"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))
      )}
      <button
        type="button"
        onClick={() => onChange([...fields, emptyEmployeeField()])}
        className="h-9 w-full rounded-xl border border-dashed text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-crm-surface-raised"
        style={{ borderColor: `${accent}55`, color: accent }}
      >
        <Plus size={14} /> Add field
      </button>
    </div>
  );
}

export default function SalarySlipTemplateEditorModal({ open, kind, onClose }: Props) {
  const [draft, setDraft] = useState<SlipKindTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<SectionTab>("employee");

  useEffect(() => {
    if (!open || !kind) {
      setDraft(null);
      return;
    }
    const tpl = getSlipTemplateForKind(kind);
    setDraft({
      ...tpl,
      customSections: tpl.customSections ?? [],
      sectionTitles: { ...DEFAULT_SECTION_TITLES, ...(tpl.sectionTitles ?? {}) },
    });
    setActiveTab("employee");
  }, [open, kind]);

  const customSections = draft?.customSections ?? [];

  const tabs = useMemo(() => {
    if (!draft) return [];
    return [
      { id: "employee" as const, label: draft.sectionTitles.employee || "Employee" },
      { id: "earnings" as const, label: draft.sectionTitles.earnings || "Earnings" },
      { id: "deductions" as const, label: draft.sectionTitles.deductions || "Deductions" },
      ...customSections.map(s => ({ id: s.id, label: s.title || "Custom" })),
      { id: "footer" as const, label: draft.sectionTitles.footer || "Footer" },
    ];
  }, [draft, customSections]);

  if (!open || !kind || !draft) return null;

  const companyKey = salarySlipCompanyForKind(kind);
  const company = SALARY_SLIP_COMPANIES[companyKey];
  const accent = companyKey === "GPS" ? "#0F398A" : "#1B6FE8";

  const patchSectionTitle = (key: keyof typeof DEFAULT_SECTION_TITLES, value: string) => {
    setDraft({
      ...draft,
      sectionTitles: { ...draft.sectionTitles, [key]: value },
    });
  };

  const updateCustomSection = (id: string, patch: Partial<SlipCustomSection>) => {
    setDraft({
      ...draft,
      customSections: customSections.map(s => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const addCustomSection = () => {
    const sec = emptyCustomSection(`Extra section ${(customSections.length || 0) + 1}`);
    setDraft({ ...draft, customSections: [...customSections, sec] });
    setActiveTab(sec.id);
    toast.success("New section added");
  };

  const deleteCustomSection = (id: string) => {
    setDraft({ ...draft, customSections: customSections.filter(s => s.id !== id) });
    setActiveTab("earnings");
    toast.success("Section deleted");
  };

  const save = () => {
    try {
      saveSlipTemplateForKind(kind, draft);
      toast.success(`${draft.title} salary-slip template saved.`);
      onClose();
    } catch {
      toast.error("Could not save salary-slip template. Try again.");
    }
  };

  const reset = () => {
    try {
      const fresh = resetSlipTemplateForKind(kind);
      setDraft(fresh);
      setActiveTab("employee");
      toast.success(`${DEFAULT_SLIP_TEMPLATES[kind].title} template reset to defaults.`);
    } catch {
      toast.error("Could not reset salary-slip template. Try again.");
    }
  };

  const activeCustom = customSections.find(s => s.id === activeTab);

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-3xl max-h-[92vh] overflow-hidden rounded-t-3xl sm:rounded-3xl bg-[#F8FAFC] shadow-2xl border border-white/80 flex flex-col">
        <header className="px-4 sm:px-5 py-4 border-b border-crm-border-subtle bg-crm-surface flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-crm-text-faint">Editable salary slip</p>
            <h2 className="text-base sm:text-lg font-extrabold text-crm-text tracking-tight truncate">
              {draft.title} template
            </h2>
            <p className="text-[11px] text-crm-text-muted mt-0.5">
              {company.label} · edit sections & fields without code changes
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-crm-text-faint hover:bg-crm-muted inline-flex items-center justify-center shrink-0"
          >
            <X size={18} />
          </button>
        </header>

        <div className="px-4 sm:px-5 pt-3 pb-2 bg-crm-surface border-b border-crm-border-subtle shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {tabs.map(tab => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`h-8 px-2.5 rounded-lg text-[11px] font-bold transition-colors ${
                    active ? "text-white shadow-sm" : "bg-crm-muted text-crm-text-secondary hover:bg-crm-surface-raised"
                  }`}
                  style={active ? { backgroundColor: accent } : undefined}
                >
                  {tab.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={addCustomSection}
              className="h-8 px-2.5 rounded-lg text-[11px] font-bold border border-dashed border-crm-border text-crm-text-muted hover:bg-crm-surface-muted inline-flex items-center gap-1"
            >
              <Plus size={12} /> Section
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeTab === "employee" && (
            <section className="rounded-2xl border border-crm-border-subtle bg-crm-surface p-3 sm:p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wide text-crm-text-faint flex-1 min-w-[140px]">
                  Section name
                  <input
                    value={draft.sectionTitles.employee}
                    onChange={e => patchSectionTitle("employee", e.target.value)}
                    className="mt-1 w-full h-8 px-2 rounded-lg border border-crm-border text-xs font-semibold text-crm-text"
                  />
                </label>
              </div>
              <EmployeeFieldsEditor
                fields={draft.employeeFields}
                accent={accent}
                onChange={employeeFields => setDraft({ ...draft, employeeFields })}
              />
            </section>
          )}

          {activeTab === "earnings" && (
            <section className="rounded-2xl border border-crm-border-subtle bg-crm-surface p-3 sm:p-4 space-y-3">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-faint">
                Section name
                <input
                  value={draft.sectionTitles.earnings}
                  onChange={e => patchSectionTitle("earnings", e.target.value)}
                  className="mt-1 w-full h-8 px-2 rounded-lg border border-crm-border text-xs font-semibold text-crm-text"
                />
              </label>
              <AmountFieldsEditor
                fields={draft.earnings}
                accent={accent}
                onChange={earnings => setDraft({ ...draft, earnings })}
              />
            </section>
          )}

          {activeTab === "deductions" && (
            <section className="rounded-2xl border border-crm-border-subtle bg-crm-surface p-3 sm:p-4 space-y-3">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-faint">
                Section name
                <input
                  value={draft.sectionTitles.deductions}
                  onChange={e => patchSectionTitle("deductions", e.target.value)}
                  className="mt-1 w-full h-8 px-2 rounded-lg border border-crm-border text-xs font-semibold text-crm-text"
                />
              </label>
              <AmountFieldsEditor
                fields={draft.deductions}
                accent={accent}
                onChange={deductions => setDraft({ ...draft, deductions })}
              />
            </section>
          )}

          {activeCustom && (
            <section className="rounded-2xl border border-crm-border-subtle bg-crm-surface p-3 sm:p-4 space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-faint flex-1 min-w-[160px]">
                  Section name
                  <input
                    value={activeCustom.title}
                    onChange={e => updateCustomSection(activeCustom.id, { title: e.target.value })}
                    className="mt-1 w-full h-8 px-2 rounded-lg border border-crm-border text-xs font-semibold text-crm-text"
                  />
                </label>
                <label className="inline-flex items-center gap-2 h-8 text-xs text-crm-text-secondary">
                  <input
                    type="checkbox"
                    checked={activeCustom.enabled}
                    onChange={e => updateCustomSection(activeCustom.id, { enabled: e.target.checked })}
                    className="rounded border-crm-border"
                  />
                  Show on slip
                </label>
                <button
                  type="button"
                  onClick={() => deleteCustomSection(activeCustom.id)}
                  className="h-8 px-3 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 inline-flex items-center gap-1"
                >
                  <Trash2 size={13} /> Delete section
                </button>
              </div>
              <AmountFieldsEditor
                fields={activeCustom.fields}
                accent={accent}
                onChange={fields => updateCustomSection(activeCustom.id, { fields })}
              />
            </section>
          )}

          {activeTab === "footer" && (
            <section className="rounded-2xl border border-crm-border-subtle bg-crm-surface p-3 sm:p-4 space-y-3">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-faint">
                Section name
                <input
                  value={draft.sectionTitles.footer}
                  onChange={e => patchSectionTitle("footer", e.target.value)}
                  className="mt-1 w-full h-8 px-2 rounded-lg border border-crm-border text-xs font-semibold text-crm-text"
                />
              </label>
              <div className="grid sm:grid-cols-2 gap-2">
                <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-faint">
                  Thank-you prefix
                  <input
                    value={draft.footer.thankYouPrefix}
                    onChange={e =>
                      setDraft({ ...draft, footer: { ...draft.footer, thankYouPrefix: e.target.value } })
                    }
                    className="mt-1 w-full h-8 px-2 rounded-lg border border-crm-border text-xs text-crm-text"
                  />
                </label>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-faint">
                  Accent word
                  <input
                    value={draft.footer.thankYouAccent}
                    onChange={e =>
                      setDraft({ ...draft, footer: { ...draft.footer, thankYouAccent: e.target.value } })
                    }
                    className="mt-1 w-full h-8 px-2 rounded-lg border border-crm-border text-xs font-bold"
                    style={{ color: accent }}
                  />
                </label>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-faint sm:col-span-2">
                  Approved-by label
                  <input
                    value={draft.footer.approvedByLabel}
                    onChange={e =>
                      setDraft({ ...draft, footer: { ...draft.footer, approvedByLabel: e.target.value } })
                    }
                    className="mt-1 w-full h-8 px-2 rounded-lg border border-crm-border text-xs"
                  />
                </label>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-faint sm:col-span-2">
                  Social / contact line
                  <input
                    value={draft.footer.socialLine}
                    onChange={e =>
                      setDraft({ ...draft, footer: { ...draft.footer, socialLine: e.target.value } })
                    }
                    className="mt-1 w-full h-8 px-2 rounded-lg border border-crm-border text-xs"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-4 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-crm-text-secondary">
                  <input
                    type="checkbox"
                    checked={draft.footer.showApprovedBy}
                    onChange={e =>
                      setDraft({ ...draft, footer: { ...draft.footer, showApprovedBy: e.target.checked } })
                    }
                    className="rounded border-crm-border"
                  />
                  Show approved-by + signature box
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-crm-text-secondary">
                  <input
                    type="checkbox"
                    checked={draft.footer.showContactBar}
                    onChange={e =>
                      setDraft({ ...draft, footer: { ...draft.footer, showContactBar: e.target.checked } })
                    }
                    className="rounded border-crm-border"
                  />
                  Show contact footer bar
                </label>
              </div>
            </section>
          )}
        </div>

        <footer className="px-4 sm:px-5 py-3 border-t border-crm-border-subtle bg-crm-surface flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={reset}
            className="h-9 px-3 rounded-xl border border-crm-border text-crm-text-secondary text-xs font-bold inline-flex items-center gap-1.5 hover:bg-crm-surface-muted"
          >
            <RotateCcw size={14} /> Reset defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 rounded-xl text-xs font-bold text-crm-text-muted hover:bg-crm-surface-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="h-9 px-4 rounded-xl text-xs font-bold text-white inline-flex items-center gap-1.5 shadow-sm"
              style={{ backgroundColor: accent }}
            >
              <Save size={14} /> Save template
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

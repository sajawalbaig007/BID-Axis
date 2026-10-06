"use client";

import { useState } from "react";
import { Pencil, Plus, RotateCcw, Save, Sigma, Trash2, X } from "lucide-react";
import { BUILTIN_FORMULAS, FORMULA_SECTIONS, type FormulaDef } from "../utils/formulaRegistry";
import type { CustomFormula, FormulasState } from "../types";
import { newRowId } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  value: FormulasState;
  /** Parent persists to the dashboard record right away. */
  onChange: (next: FormulasState) => void;
  /** Live current values per builtin formula id (optional chips). */
  liveNotes?: Record<string, string>;
};

type Draft = {
  title: string;
  expression: string;
  appliesTo: string;
  note: string;
};

const emptyDraft: Draft = { title: "", expression: "", appliesTo: "", note: "" };

function Badge({ kind }: { kind: "builtin" | "edited" | "custom" }) {
  const map = {
    builtin: "bg-crm-muted text-crm-text-muted border-crm-border",
    edited: "bg-amber-50 text-amber-700 border-amber-200",
    custom: "bg-blue-50 text-blue-600 border-blue-200",
  } as const;
  const label = { builtin: "Built-in", edited: "Edited", custom: "Custom" } as const;
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border ${map[kind]}`}>
      {label[kind]}
    </span>
  );
}

export default function FormulaBookModal({ open, onClose, value, onChange, liveNotes = {} }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [adding, setAdding] = useState(false);
  const [newSection, setNewSection] = useState<string>(FORMULA_SECTIONS[0] ?? "");
  const [customSectionName, setCustomSectionName] = useState("");
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);

  if (!open) return null;

  const overrides = value.overrides ?? {};
  const custom = value.custom ?? [];

  const sections = [...FORMULA_SECTIONS];
  for (const c of custom) {
    if (!sections.includes(c.section)) sections.push(c.section);
  }

  const startEditBuiltin = (f: FormulaDef) => {
    setEditingId(f.id);
    setDraft({
      title: f.title,
      expression: overrides[f.id]?.expression ?? f.expression,
      appliesTo: f.appliesTo,
      note: overrides[f.id]?.note ?? "",
    });
  };

  const saveBuiltin = (f: FormulaDef) => {
    const isDefault = draft.expression.trim() === f.expression && !draft.note.trim();
    const nextOverrides = { ...overrides };
    if (isDefault) delete nextOverrides[f.id];
    else nextOverrides[f.id] = { expression: draft.expression.trim(), note: draft.note.trim() };
    onChange({ ...value, overrides: nextOverrides });
    setEditingId(null);
  };

  const resetBuiltin = (id: string) => {
    const nextOverrides = { ...overrides };
    delete nextOverrides[id];
    onChange({ ...value, overrides: nextOverrides });
    if (editingId === id) setEditingId(null);
  };

  const startEditCustom = (c: CustomFormula) => {
    setEditingId(c.id);
    setDraft({ title: c.title, expression: c.expression, appliesTo: c.appliesTo ?? "", note: c.note ?? "" });
  };

  const saveCustom = (c: CustomFormula) => {
    onChange({
      ...value,
      custom: custom.map(x =>
        x.id === c.id
          ? { ...x, title: draft.title.trim() || x.title, expression: draft.expression.trim(), appliesTo: draft.appliesTo.trim(), note: draft.note.trim() }
          : x,
      ),
    });
    setEditingId(null);
  };

  const deleteCustom = (id: string) => {
    onChange({ ...value, custom: custom.filter(x => x.id !== id) });
    if (editingId === id) setEditingId(null);
  };

  const addCustom = () => {
    const section = (customSectionName.trim() || newSection).trim();
    if (!section || !newDraft.title.trim() || !newDraft.expression.trim()) return;
    const entry: CustomFormula = {
      id: newRowId("formula"),
      section,
      title: newDraft.title.trim(),
      expression: newDraft.expression.trim(),
      appliesTo: newDraft.appliesTo.trim(),
      note: newDraft.note.trim(),
    };
    onChange({ ...value, custom: [...custom, entry] });
    setNewDraft(emptyDraft);
    setCustomSectionName("");
    setAdding(false);
  };

  const editForm = (onSave: () => void, showTitle: boolean) => (
    <div className="space-y-2 mt-2">
      {showTitle && (
        <input
          value={draft.title}
          onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
          placeholder="Formula title"
          className="w-full h-9 rounded-lg border border-crm-border px-2.5 text-xs font-semibold outline-none focus:border-[#1B6FE8]"
        />
      )}
      <textarea
        value={draft.expression}
        onChange={e => setDraft(d => ({ ...d, expression: e.target.value }))}
        rows={2}
        placeholder="Formula…"
        className="w-full rounded-lg border border-crm-border px-2.5 py-2 text-xs font-mono outline-none resize-none focus:border-[#1B6FE8]"
      />
      {showTitle && (
        <input
          value={draft.appliesTo}
          onChange={e => setDraft(d => ({ ...d, appliesTo: e.target.value }))}
          placeholder="Where it applies (e.g. Income Statement → Team Salaries)"
          className="w-full h-9 rounded-lg border border-crm-border px-2.5 text-xs outline-none focus:border-[#1B6FE8]"
        />
      )}
      <textarea
        value={draft.note}
        onChange={e => setDraft(d => ({ ...d, note: e.target.value }))}
        rows={1}
        placeholder="Note (optional)…"
        className="w-full rounded-lg border border-crm-border px-2.5 py-2 text-xs outline-none resize-none focus:border-[#1B6FE8]"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setEditingId(null)} className="h-8 px-3 rounded-lg text-[11px] font-bold text-crm-text-muted hover:bg-crm-muted">
          Cancel
        </button>
        <button type="button" onClick={onSave} className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[11px] font-bold inline-flex items-center gap-1 hover:bg-emerald-700">
          <Save size={12} /> Save
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-85 flex items-center justify-center p-3 sm:p-4 bg-black/45" onClick={onClose}>
      <div
        className="bg-crm-surface rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b bg-[#F8FAFC] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#1B6FE8] text-white inline-flex items-center justify-center shrink-0">
              <Sigma size={16} />
            </span>
            <div className="min-w-0">
              <h3 className="font-extrabold text-crm-text text-sm">Formula Book — All Accounts Formulas</h3>
              <p className="text-[10px] text-crm-text-faint">
                Section-wise · edit built-in formulas (text override) · add your own formula
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setAdding(a => !a)}
              className="h-9 px-3 rounded-xl bg-[#0B84F3] text-white text-[11px] font-bold inline-flex items-center gap-1.5 hover:bg-[#0a6fce]"
            >
              <Plus size={13} /> Add Formula
            </button>
            <button type="button" onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-crm-muted flex items-center justify-center">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {adding && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-2">
              <p className="text-[11px] font-extrabold text-blue-700 uppercase tracking-wide">New Formula</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={newSection}
                  onChange={e => setNewSection(e.target.value)}
                  className="h-9 rounded-lg border border-crm-border bg-crm-surface px-2 text-xs font-semibold outline-none"
                >
                  {sections.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input
                  value={customSectionName}
                  onChange={e => setCustomSectionName(e.target.value)}
                  placeholder="…or type a new section name"
                  className="h-9 rounded-lg border border-crm-border bg-crm-surface px-2.5 text-xs outline-none focus:border-[#0B84F3]"
                />
              </div>
              <input
                value={newDraft.title}
                onChange={e => setNewDraft(d => ({ ...d, title: e.target.value }))}
                placeholder="Formula title (e.g. Cash Runway)"
                className="w-full h-9 rounded-lg border border-crm-border bg-crm-surface px-2.5 text-xs font-semibold outline-none focus:border-[#0B84F3]"
              />
              <textarea
                value={newDraft.expression}
                onChange={e => setNewDraft(d => ({ ...d, expression: e.target.value }))}
                rows={2}
                placeholder="Formula (e.g. Runway = Net Cash ÷ Daily Burn Rate)"
                className="w-full rounded-lg border border-crm-border bg-crm-surface px-2.5 py-2 text-xs font-mono outline-none resize-none focus:border-[#0B84F3]"
              />
              <input
                value={newDraft.appliesTo}
                onChange={e => setNewDraft(d => ({ ...d, appliesTo: e.target.value }))}
                placeholder="Where it should apply (e.g. Reports page → Cash section)"
                className="w-full h-9 rounded-lg border border-crm-border bg-crm-surface px-2.5 text-xs outline-none focus:border-[#0B84F3]"
              />
              <textarea
                value={newDraft.note}
                onChange={e => setNewDraft(d => ({ ...d, note: e.target.value }))}
                rows={1}
                placeholder="Note (optional)"
                className="w-full rounded-lg border border-crm-border bg-crm-surface px-2.5 py-2 text-xs outline-none resize-none focus:border-[#0B84F3]"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAdding(false)} className="h-8 px-3 rounded-lg text-[11px] font-bold text-crm-text-muted hover:bg-crm-surface-raised">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addCustom}
                  disabled={!newDraft.title.trim() || !newDraft.expression.trim()}
                  className="h-8 px-3 rounded-lg bg-[#0B84F3] text-white text-[11px] font-bold inline-flex items-center gap-1 hover:bg-[#0a6fce] disabled:opacity-50"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
            </div>
          )}

          {sections.map(section => {
            const builtins = BUILTIN_FORMULAS.filter(f => f.section === section);
            const customs = custom.filter(c => c.section === section);
            if (!builtins.length && !customs.length) return null;
            return (
              <div key={section}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-1 h-5 rounded-full bg-[#1B6FE8] shrink-0" />
                  <h4 className="text-xs font-extrabold text-crm-text tracking-tight">{section}</h4>
                  <span className="text-[10px] text-crm-text-faint font-semibold">{builtins.length + customs.length} formula(s)</span>
                </div>
                <div className="space-y-2">
                  {builtins.map(f => {
                    const ov = overrides[f.id];
                    const isEditing = editingId === f.id;
                    return (
                      <div key={f.id} className="rounded-xl border border-crm-border-subtle bg-[#FAFBFC] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-crm-text flex items-center gap-2 flex-wrap">
                              {f.title}
                              <Badge kind={ov ? "edited" : "builtin"} />
                            </p>
                            <p className="text-[10px] text-crm-text-faint mt-0.5">{f.appliesTo}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {ov && (
                              <button
                                type="button"
                                onClick={() => resetBuiltin(f.id)}
                                className="w-7 h-7 rounded-lg text-amber-600 hover:bg-amber-50 inline-flex items-center justify-center"
                                title="Reset to code default"
                              >
                                <RotateCcw size={13} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => (isEditing ? setEditingId(null) : startEditBuiltin(f))}
                              className="w-7 h-7 rounded-lg text-[#0B84F3] hover:bg-[#EAF5FF] inline-flex items-center justify-center"
                              title="Edit formula text"
                            >
                              <Pencil size={13} />
                            </button>
                          </div>
                        </div>
                        {isEditing ? (
                          editForm(() => saveBuiltin(f), false)
                        ) : (
                          <>
                            <p className="mt-2 text-[11px] font-mono text-crm-text-secondary bg-crm-surface border border-crm-border-subtle rounded-lg px-2.5 py-2 leading-relaxed">
                              {ov?.expression ?? f.expression}
                            </p>
                            {ov?.note && <p className="mt-1.5 text-[10px] text-amber-700 font-medium">Note: {ov.note}</p>}
                            {liveNotes[f.id] && (
                              <p className="mt-1.5 inline-flex px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-100 text-[10px] font-semibold text-emerald-700">
                                {liveNotes[f.id]}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}

                  {customs.map(c => {
                    const isEditing = editingId === c.id;
                    return (
                      <div key={c.id} className="rounded-xl border border-blue-100 bg-blue-50/30 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-crm-text flex items-center gap-2 flex-wrap">
                              {c.title}
                              <Badge kind="custom" />
                            </p>
                            {c.appliesTo && <p className="text-[10px] text-crm-text-faint mt-0.5">{c.appliesTo}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => (isEditing ? setEditingId(null) : startEditCustom(c))}
                              className="w-7 h-7 rounded-lg text-[#0B84F3] hover:bg-[#EAF5FF] inline-flex items-center justify-center"
                              title="Edit"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteCustom(c.id)}
                              className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 inline-flex items-center justify-center"
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        {isEditing ? (
                          editForm(() => saveCustom(c), true)
                        ) : (
                          <>
                            <p className="mt-2 text-[11px] font-mono text-crm-text-secondary bg-crm-surface border border-blue-100 rounded-lg px-2.5 py-2 leading-relaxed">
                              {c.expression}
                            </p>
                            {c.note && <p className="mt-1.5 text-[10px] text-crm-text-muted">Note: {c.note}</p>}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-2.5 border-t bg-[#FAFAFA] flex items-center justify-between">
          <p className="text-[10px] text-crm-text-faint">
            Built-in formulas run from code — edits here only override text/documentation. Values (rates, %) stay editable in their own editors.
          </p>
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-xl text-xs font-bold bg-[#1B6FE8] text-white hover:bg-[#9a0e26] shrink-0 ml-3">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

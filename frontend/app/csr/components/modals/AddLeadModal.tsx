"use client";

import { useCallback, useState } from "react";
import { Plus, X, User2, Loader2, CheckCircle2, Briefcase } from "lucide-react";
import API, { apiErrorMessage } from "@/lib/api";
import ServicePicker from "../shared/ServicePicker";
import { useClientPhoneLookup } from "../../hooks/useClientPhoneLookup";
import { decomposeInterestedServices, formatInterestedServices } from "../../utils/parseInterestedServices";
import toast from "react-hot-toast";

const emptyForm = { name: "", phone: "", email: "", company: "", website: "", state: "", comments: "" };

interface AddLeadModalProps {
  open: boolean;
  onClose: () => void;
  onAdded?: () => void;
}

export default function AddLeadModal({ open, onClose, onAdded }: AddLeadModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [services, setServices] = useState<string[]>([]);
  const [serviceSubtypes, setServiceSubtypes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const applyLookup = useCallback((client: {
    name: string;
    company: string;
    email: string;
    state: string;
    interestedService: string;
  }) => {
    setForm(f => ({
      ...f,
      name:    client.name    || f.name,
      company: client.company || f.company,
      email:   client.email   || f.email,
      state:   client.state   || f.state,
    }));
    const { services: parsed, subtypes } = decomposeInterestedServices(client.interestedService);
    if (parsed.length === 0) return;
    setServices(prev => (prev.length > 0 ? prev : parsed));
    setServiceSubtypes(prev => (Object.keys(prev).length > 0 ? prev : subtypes));
  }, []);

  const { phoneLookupLoading, returningClient, resetLookup, onPhoneValueChange, onPhoneBlur, onPhonePaste } =
    useClientPhoneLookup(applyLookup);

  const close = () => {
    setForm(emptyForm);
    setServices([]);
    setServiceSubtypes({});
    setError("");
    resetLookup();
    onClose();
  };

  const setSubtype = (svc: string, text: string) => {
    setServiceSubtypes(prev => ({ ...prev, [svc]: text }));
  };

  const scopePreview = formatInterestedServices(services, serviceSubtypes);

  const submit = async () => {
    if (!form.name.trim()) { setError("Client name is required."); return; }
    setSaving(true);
    setError("");
    try {
      await API.post("/csr/lead", {
        name:              form.name.trim(),
        phone:             form.phone.trim()   || undefined,
        email:             form.email.trim()   || undefined,
        company:           form.company.trim() || undefined,
        website:           form.website.trim() || undefined,
        state:             form.state.trim()   || undefined,
        interestedService: scopePreview || undefined,
        comments:          form.comments.trim() || undefined,
      });
      toast.success("Lead added");
      onAdded?.();
      close();
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to add lead."));
    }
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-[520px] bg-white rounded-t-[24px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        <div className="relative bg-gradient-to-br from-[#1B6FE8] to-[#0E4FBE] px-5 pt-5 pb-4 shrink-0">
          <button onClick={close} className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white">
            <X size={14} />
          </button>
          <div className="flex items-center gap-2.5 pr-10">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center">
              <Plus size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Add New Lead</h2>
              <p className="text-white/65 text-xs">Client name required — scope optional</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-xl">{error}</div>}

          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Phone</label>
            <div className="relative">
              <input type="tel" value={form.phone} placeholder="Phone number" autoComplete="tel"
                onChange={e => { setForm(f => ({ ...f, phone: e.target.value })); onPhoneValueChange(e.target.value); }}
                onBlur={e => onPhoneBlur(e.target.value)} onPaste={onPhonePaste}
                className="w-full h-10 rounded-xl border-2 border-gray-200 px-3 pr-9 text-sm outline-none focus:border-[#1B6FE8]"
              />
              {phoneLookupLoading && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1B6FE8] animate-spin" />}
            </div>
          </div>

          {returningClient && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-xl">
              <User2 size={12} /> Returning client — details auto-filled
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Client Name *</label>
              <input type="text" value={form.name} placeholder="Client name"
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full h-10 rounded-xl border-2 border-gray-200 px-3 text-sm outline-none focus:border-[#1B6FE8]"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Client Company</label>
              <input type="text" value={form.company} placeholder="Client's company"
                onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                className="w-full h-10 rounded-xl border-2 border-gray-200 px-3 text-sm outline-none focus:border-[#1B6FE8]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Email Address</label>
              <input type="email" value={form.email} placeholder="Email" autoComplete="email"
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full h-10 rounded-xl border-2 border-gray-200 px-3 text-sm outline-none focus:border-[#1B6FE8]"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">State</label>
              <input type="text" value={form.state} placeholder="State"
                onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                className="w-full h-10 rounded-xl border-2 border-gray-200 px-3 text-sm outline-none focus:border-[#1B6FE8]"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Website Link</label>
            <input type="url" value={form.website} placeholder="https://example.com"
              onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
              className="w-full h-10 rounded-xl border-2 border-gray-200 px-3 text-sm outline-none focus:border-[#1B6FE8]"
            />
          </div>

          <div className="space-y-2.5">
            <label className="text-[10px] font-semibold text-gray-500 uppercase block">
              Scope <span className="normal-case font-normal text-gray-400">(optional)</span>
            </label>
            <ServicePicker multi values={services} onValuesChange={setServices} />

            {services.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Subtype <span className="normal-case font-normal text-gray-400">(optional)</span>
                </p>
                {services.map(svc => (
                  <div key={svc} className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-[#1B6FE8]">{svc}</label>
                    <input
                      type="text"
                      value={serviceSubtypes[svc] ?? ""}
                      onChange={e => setSubtype(svc, e.target.value)}
                      placeholder={`e.g. ${svc === "IT" ? "Networking" : svc === "Estimating" ? "HVAC" : "detail"}`}
                      className="h-10 px-3 rounded-xl border-2 border-gray-200 bg-[#FAFAFA] text-sm outline-none focus:border-[#1B6FE8]"
                    />
                  </div>
                ))}
                <div className="p-3 bg-[#FFF4E5] rounded-xl flex items-center gap-2">
                  <Briefcase size={14} className="text-[#D97706] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-gray-500">Will save as</p>
                    <p className="text-[13px] font-bold text-[#D97706] truncate">{scopePreview}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Notes</label>
            <textarea value={form.comments} rows={2} placeholder="Optional notes"
              onChange={e => setForm(f => ({ ...f, comments: e.target.value }))}
              className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#1B6FE8] resize-none"
            />
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 flex gap-3">
          <button onClick={close} className="flex-1 h-11 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm">Cancel</button>
          <button onClick={() => void submit()} disabled={saving}
            className="flex-1 h-11 rounded-xl bg-[#1B6FE8] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <><CheckCircle2 size={14} /> Add Lead</>}
          </button>
        </div>
      </div>
    </div>
  );
}

import { Briefcase, X } from "lucide-react";
import ServicePicker from "../shared/ServicePicker";

interface InterestedModalProps {
  service?: string;
  onServiceChange?: (v: string) => void;
  /** Optional subtype for single-select mode → saved as Service-subtype */
  serviceSubtype?: string;
  onServiceSubtypeChange?: (v: string) => void;
  services?: string[];
  onServicesChange?: (v: string[]) => void;
  /** Per-service subtype text → saved as Estimating-HVAC, IT-Networking */
  serviceSubtypes?: Record<string, string>;
  onServiceSubtypesChange?: (v: Record<string, string>) => void;
  onClose: () => void;
  onSave: () => void;
  /** Edit existing scope (vs first-time mark) */
  mode?: "create" | "edit";
  /** Create-mode labels — important uses same scope picker */
  variant?: "interested" | "important";
}

function formatPreview(services: string[], subtypes: Record<string, string>) {
  return services
    .map(s => {
      const sub = (subtypes[s] ?? "").trim();
      return sub ? `${s}-${sub}` : s;
    })
    .join(", ");
}

export default function InterestedModal({
  service = "", onServiceChange,
  serviceSubtype = "", onServiceSubtypeChange,
  services = [], onServicesChange,
  serviceSubtypes = {}, onServiceSubtypesChange,
  onClose, onSave,
  mode = "create",
  variant = "interested",
}: InterestedModalProps) {
  const multi = !!onServicesChange;
  const selected = multi ? services : (service ? [service] : []);
  const canSave = selected.length > 0;
  const isEdit = mode === "edit";
  const isImportant = variant === "important" && !isEdit;

  const setSubtype = (svc: string, text: string) => {
    if (multi && onServiceSubtypesChange) {
      onServiceSubtypesChange({ ...serviceSubtypes, [svc]: text });
    } else {
      onServiceSubtypeChange?.(text);
    }
  };

  const subtypeOf = (svc: string) =>
    multi ? (serviceSubtypes[svc] ?? "") : serviceSubtype;

  const preview = multi
    ? formatPreview(selected, serviceSubtypes)
    : formatPreview(selected, service ? { [service]: serviceSubtype } : {});

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-gray-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-[32px] p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 sm:gap-4 mb-4 sm:mb-0">
          <div>
            <h2 className="text-xl sm:text-[26px] font-bold text-[#0F172A] dark:text-gray-100">
              {isEdit ? "Edit Scope" : isImportant ? "Important — Scope" : "Client Interested In"}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-1 sm:mt-2">
              {isEdit
                ? "Update service(s) and optional subtypes for this client."
                : isImportant
                  ? "Select what this client is interested in before marking important."
                  : "Select service(s), then optionally type a subtype (shows as IT-Networking)."}
            </p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[#F5F6FA] dark:bg-gray-800 flex items-center justify-center text-gray-500 shrink-0">
            <X size={15} className="sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
        <div className="mt-4 sm:mt-7 space-y-4">
          {multi ? (
            <ServicePicker multi values={services} onValuesChange={onServicesChange} />
          ) : (
            <ServicePicker value={service} onChange={v => {
              onServiceChange?.(v);
              onServiceSubtypeChange?.("");
            }} />
          )}

          {selected.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[11px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Subtype <span className="normal-case font-normal text-gray-400">(optional — e.g. HVAC, Networking)</span>
              </p>
              {selected.map(svc => (
                <div key={svc} className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[#1B6FE8]">{svc}</label>
                  <input
                    type="text"
                    value={subtypeOf(svc)}
                    onChange={e => setSubtype(svc, e.target.value)}
                    placeholder={`e.g. ${svc === "IT" ? "Networking" : svc === "Estimating" ? "HVAC" : "detail"}`}
                    className="h-10 sm:h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-[#FAFAFA] dark:bg-gray-800 text-sm text-[#0F172A] dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B6FE8]/30 focus:border-[#1B6FE8]"
                  />
                </div>
              ))}
            </div>
          )}

          {canSave && (
            <div className="p-3 sm:p-4 bg-[#FFF4E5] dark:bg-amber-950/30 rounded-xl sm:rounded-2xl flex items-center gap-2 sm:gap-3">
              <Briefcase size={15} className="text-[#D97706] shrink-0 sm:w-[18px] sm:h-[18px]" />
              <div className="min-w-0">
                <p className="text-[11px] sm:text-[12px] font-medium text-gray-500 dark:text-gray-400">Will show as</p>
                <p className="text-[13px] sm:text-[15px] font-bold text-[#D97706] truncate">{preview}</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 sm:gap-3 mt-4 sm:mt-7">
          <button onClick={onClose}
            className="flex-1 h-11 sm:h-[52px] rounded-xl sm:rounded-2xl bg-[#F5F6FA] dark:bg-gray-800 font-semibold text-gray-600 dark:text-gray-300 text-sm">Cancel</button>
          <button onClick={onSave} disabled={!canSave}
            className={`flex-1 h-11 sm:h-[52px] rounded-xl sm:rounded-2xl font-semibold text-white text-sm transition-all ${canSave ? "bg-[#1B6FE8]" : "bg-gray-300 cursor-not-allowed"}`}>
            {isEdit ? "Update Scope" : isImportant ? "Mark Important" : "Save Interest"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { CircleCheckBig } from "lucide-react";
import { serviceOptions } from "../../constants/services";

interface ServicePickerProps {
  value?: string;
  onChange?: (v: string) => void;
  /** Multi-select mode — toggles services; stored comma-separated via caller */
  values?: string[];
  onValuesChange?: (v: string[]) => void;
  multi?: boolean;
}

export default function ServicePicker({
  value = "", onChange, values = [], onValuesChange, multi = false,
}: ServicePickerProps) {
  const toggleMulti = (v: string) => {
    if (!onValuesChange) return;
    onValuesChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  };

  return (
    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
      {serviceOptions.map(({ value: v, label, Icon }) => {
        const sel = multi ? values.includes(v) : value === v;
        const pick = () => (multi ? toggleMulti(v) : onChange?.(v));
        return (
          <button key={v} type="button" onClick={pick}
            className={`relative py-2.5 sm:py-3 px-1 rounded-xl sm:rounded-2xl border-2 flex flex-col items-center justify-center gap-1 sm:gap-1.5 transition-all text-[10px] sm:text-[11px] font-semibold ${
              sel ? "border-[#1B6FE8] bg-[#EAF2FE] text-[#1B6FE8] dark:bg-red-950/30 dark:text-red-200" : "border-gray-100 bg-[#FAFAFA] text-gray-500 hover:border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
            }`}>
            {sel && (
              <span className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 w-3 h-3 sm:w-3.5 sm:h-3.5 bg-[#1B6FE8] rounded-full flex items-center justify-center">
                <CircleCheckBig size={8} className="text-white sm:w-[9px] sm:h-[9px]" />
              </span>
            )}
            <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center ${sel ? "bg-[#1B6FE8]/10" : "bg-white dark:bg-gray-900 shadow-sm"}`}>
              <Icon size={13} className={`sm:w-[15px] sm:h-[15px] ${sel ? "text-[#1B6FE8]" : "text-gray-400"}`} />
            </div>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

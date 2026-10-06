import { Globe, X, AlignLeft } from "lucide-react";
import ScheduleCallForm from "../shared/ScheduleCallForm";
import { getCurrentTimeInTimezone, usTimezones } from "../../constants/timezones";

interface ImportantCallModalProps {
  date: string; onDateChange: (v: string) => void;
  time: string; onTimeChange: (v: string) => void;
  timezone: string; onTimezoneChange: (v: string) => void;
  note?: string; onNoteChange?: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export default function ImportantCallModal({
  date, onDateChange, time, onTimeChange, timezone, onTimezoneChange,
  note = "", onNoteChange, onClose, onSave,
}: ImportantCallModalProps) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-[32px] p-5 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3 sm:gap-4 mb-4 sm:mb-0">
          <div>
            <h2 className="text-xl sm:text-[26px] font-bold text-[#0F172A]">Important Call</h2>
            <p className="text-gray-500 text-xs sm:text-sm mt-1 sm:mt-2">Schedule next follow-up call with timezone.</p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[#F5F6FA] flex items-center justify-center text-gray-500 shrink-0">
            <X size={15} className="sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
        <div className="mt-4 sm:mt-7 space-y-3 sm:space-y-5">
          <ScheduleCallForm
            date={date} onDateChange={onDateChange}
            time={time} onTimeChange={onTimeChange}
            timezone={timezone} onTimezoneChange={onTimezoneChange}
          />

          {/* Notes */}
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#1B6FE8] uppercase tracking-wider mb-2">
              <AlignLeft size={11} /> Notes <span className="text-gray-400 normal-case font-normal">(optional)</span>
            </label>
            <textarea
              value={note} onChange={e => onNoteChange?.(e.target.value)} rows={3}
              placeholder="Any additional notes..."
              className="w-full rounded-2xl border border-gray-200 bg-[#F5F6FA] px-4 py-3 text-sm outline-none resize-none text-[#0F172A] placeholder:text-gray-400 focus:border-[#1B6FE8] transition-colors"
            />
          </div>
        </div>
        {date && time && (
          <div className="mt-4 sm:mt-5 p-3 sm:p-4 bg-[#F5F6FA] rounded-xl sm:rounded-2xl">
            <p className="text-[11px] sm:text-[12px] font-medium text-gray-500 mb-1.5 sm:mb-2">Scheduled (Client Local Time)</p>
            <p className="text-[13px] sm:text-[15px] font-semibold text-[#0F172A]">
              {date} at {time} {usTimezones.find(tz => tz.value === timezone)?.abbreviation}
            </p>
            <p className="text-[10px] sm:text-[11px] text-gray-400 mt-1.5 sm:mt-2 flex items-center gap-1">
              <Globe size={10} />Current: <span className="font-mono font-medium text-gray-600 ml-1">{getCurrentTimeInTimezone(timezone)}</span>
            </p>
          </div>
        )}
        <div className="flex gap-2 sm:gap-3 mt-4 sm:mt-7">
          <button onClick={onClose} className="flex-1 h-11 sm:h-[52px] rounded-xl sm:rounded-2xl bg-[#F5F6FA] font-semibold text-gray-600 text-sm">Cancel</button>
          <button onClick={onSave} className="flex-1 h-11 sm:h-[52px] rounded-xl sm:rounded-2xl bg-[#1B6FE8] text-white font-semibold shadow-sm text-sm">Schedule Call</button>
        </div>
      </div>
    </div>
  );
}

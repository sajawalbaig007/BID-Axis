import { CalendarDays, ChevronDown, Clock3, Globe } from "lucide-react";
import { usTimezones } from "../../constants/timezones";

interface ScheduleCallFormProps {
  date: string; onDateChange: (v: string) => void;
  time: string; onTimeChange: (v: string) => void;
  timezone: string; onTimezoneChange: (v: string) => void;
  dateLabel?: string;
  timeLabel?: string;
}

export default function ScheduleCallForm({
  date, onDateChange, time, onTimeChange, timezone, onTimezoneChange,
  dateLabel = "Next Schedule Date", timeLabel = "Next Call Time",
}: ScheduleCallFormProps) {
  return (
    <>
      <div>
        <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
          <CalendarDays size={10} className="text-[#1B6FE8] sm:w-[11px] sm:h-[11px]" />{dateLabel}
        </label>
        <input
          type="date" value={date} onChange={e => onDateChange(e.target.value)}
          className="w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] px-3 sm:px-4 text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors"
        />
      </div>
      <div>
        <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
          <Clock3 size={10} className="text-[#1B6FE8] sm:w-[11px] sm:h-[11px]" />{timeLabel}
        </label>
        <input
          type="time" value={time} onChange={e => onTimeChange(e.target.value)}
          className="w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] px-3 sm:px-4 text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors"
        />
      </div>
      <div className="relative">
        <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 sm:mb-2">
          <Globe size={10} className="text-[#1B6FE8] sm:w-[11px] sm:h-[11px]" />Client Timezone (US)
        </label>
        <select
          value={timezone} onChange={e => onTimezoneChange(e.target.value)}
          className="w-full h-10 sm:h-11 rounded-xl sm:rounded-2xl border-2 border-gray-200 bg-[#FAFAFA] px-3 sm:px-4 pr-9 sm:pr-10 text-sm outline-none appearance-none focus:border-[#1B6FE8] focus:bg-white transition-colors"
        >
          {usTimezones.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
        </select>
        <div className="absolute right-3 sm:right-4 top-[34px] sm:top-[38px] pointer-events-none text-gray-400">
          <ChevronDown size={16} className="sm:w-[18px] sm:h-[18px]" />
        </div>
      </div>
    </>
  );
}

import { Mail } from "lucide-react";

interface EmailFieldProps {
  email: string;
  onEmailChange: (v: string) => void;
}

export default function EmailField({ email, onEmailChange }: EmailFieldProps) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 bg-[#F8F9FC] rounded-xl sm:rounded-2xl p-3 sm:p-3.5">
      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#EAF5FF] text-[#0B84F3] flex items-center justify-center shrink-0">
        <Mail size={13} className="sm:w-3.75 sm:h-3.75" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-gray-400 text-[10px] sm:text-[11px]">Email</p>
        <input
          type="email"
          placeholder="client@example.com"
          value={email}
          onChange={e => onEmailChange(e.target.value)}
          className="w-full bg-transparent text-[#0F172A] text-xs sm:text-[13px] font-semibold outline-none placeholder:text-gray-300 placeholder:font-normal"
        />
      </div>
    </div>
  );
}

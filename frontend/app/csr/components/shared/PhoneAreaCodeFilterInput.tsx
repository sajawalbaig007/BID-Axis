"use client";

import { Phone, X } from "lucide-react";

interface PhoneAreaCodeFilterInputProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  fullWidth?: boolean;
}

export default function PhoneAreaCodeFilterInput({
  value,
  onChange,
  className = "",
  fullWidth = false,
}: PhoneAreaCodeFilterInputProps) {
  return (
    <div className={`relative ${fullWidth ? "w-full min-w-0" : "shrink-0"} ${className}`}>
      <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Area code..."
        title="Search by phone area code (e.g. 214, 416)"
        className={`h-10 sm:h-[42px] pl-8 pr-8 rounded-xl sm:rounded-2xl border text-xs sm:text-sm outline-none w-full min-w-0 ${fullWidth ? "" : "sm:w-[150px]"} ${
          value
            ? "border-[#1B6FE8] bg-[#EAF2FE] text-[#1B6FE8]"
            : "border-gray-200 dark:border-crm-border bg-[#FAFAFA] dark:bg-crm-input text-gray-600 dark:text-crm-text-secondary"
        }`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1B6FE8]"
          aria-label="Clear area code filter"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

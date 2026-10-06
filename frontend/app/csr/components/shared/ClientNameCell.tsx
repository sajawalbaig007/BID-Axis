"use client";

import { Eye } from "lucide-react";
import { getCompanyTimezoneAbbr, tzBadgeClass } from "../../constants/timezoneAbbr";
import { clientCompany, ourCompany } from "../../utils/leadFieldLabels";
import { parseEmails } from "../../utils/parseEmails";
import type { Lead } from "../../types/lead";
import EmailWithExtraCell from "./EmailWithExtraCell";

interface ClientNameCellProps {
  lead: Lead;
  index?: number;
  showIndex?: boolean;
  showEye?: boolean;
  onView?: () => void;
  subtitle?: string;
  hideOurCompany?: boolean;
}

export default function ClientNameCell({
  lead, index, showIndex = false, showEye = false, onView, subtitle, hideOurCompany = false,
}: ClientNameCellProps) {
  const tz = getCompanyTimezoneAbbr(lead);
  const co = clientCompany(lead);
  const emails = parseEmails(lead.email !== "N/A" ? lead.email : "");

  return (
    <div className="flex items-start gap-2 sm:gap-3 min-w-0">
      {showIndex && index !== undefined && (
        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#F3F4F6] text-[#0F172A] flex items-center justify-center text-[10px] font-bold shrink-0 mt-1">
          {index}
        </div>
      )}
      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#1B6FE8] text-white flex items-center justify-center font-bold text-xs sm:text-sm shrink-0">
        {lead.client.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <h4 className="font-semibold text-[#0F172A] dark:text-gray-100 text-[13px] sm:text-[14px] leading-tight truncate">
            {lead.client}
          </h4>
          {tz && (
            <span
              title={`Company location · ${lead.state || "state"}`}
              className={`inline-flex px-1.5 py-0.5 rounded-md text-[9px] font-bold border shrink-0 ${tzBadgeClass(tz)}`}
            >
              {tz}
            </span>
          )}
          {showEye && onView && (
            <button
              type="button"
              onClick={onView}
              className="w-5 h-5 rounded-lg bg-[#EAF5FF] text-[#0B84F3] flex items-center justify-center shrink-0 hover:opacity-80"
              title="View details"
            >
              <Eye size={10} />
            </button>
          )}
        </div>
        {subtitle && (
          <p className="text-[10px] text-gray-400 mt-0.5 truncate">{subtitle}</p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 items-center">
          {co !== "—" && (
            <p className="text-[10px] sm:text-[11px] text-gray-500 truncate max-w-[140px] sm:max-w-[200px]">
              <span className="text-gray-400">Co:</span> {co}
            </p>
          )}
          {emails.length > 0 && (
            <div className="flex items-center gap-1 min-w-0 max-w-full overflow-visible">
              <span className="text-[10px] sm:text-[11px] text-gray-400 shrink-0">Email:</span>
              <EmailWithExtraCell
                email={emails[0]}
                allEmails={emails}
                variant="plain"
                className="text-[10px] sm:text-[11px] text-gray-500"
                emptyLabel=""
                clientName={lead.client}
                company={co !== "—" ? co : undefined}
              />
            </div>
          )}
          {emails.length === 0 && lead.state && (
            <p className="text-[10px] sm:text-[11px] text-gray-400 truncate">{lead.state}</p>
          )}
        </div>
        {!hideOurCompany && ourCompany(lead) !== "—" && (
          <p className="text-[9px] sm:text-[10px] text-emerald-600 dark:text-emerald-400 truncate mt-0.5 max-w-[200px]">
            Our co: {ourCompany(lead)}
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import { Mail } from "lucide-react";
import { useOpenCrmMail } from "@/app/components/mail/CrmMailProvider";

interface SendEmailButtonProps {
  email?: string | null;
  subject?: string;
  body?: string;
  className?: string;
  clientName?: string;
  company?: string;
  allEmails?: string[];
}

export default function SendEmailButton({
  email,
  className = "",
  clientName,
  company,
  allEmails,
}: SendEmailButtonProps) {
  const openCompose = useOpenCrmMail();
  if (!email) return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (!openCompose) return;
        openCompose({
          to: email,
          toOptions: allEmails?.length ? allEmails : [email],
          clientName,
          company,
        });
      }}
      className={`inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-3 sm:px-4 rounded-xl sm:rounded-2xl bg-[#EAF5FF] text-[#0B84F3] text-xs sm:text-sm font-semibold hover:bg-[#dcecff] transition-colors shrink-0 ${className}`}
    >
      <Mail size={13} className="sm:w-[15px] sm:h-[15px]" />Send Email
    </button>
  );
}

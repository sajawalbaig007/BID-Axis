"use client";

import { SubContact } from "@/app/csr/hooks/useLeadsData";

interface SubContactsCellProps {
  contacts?: SubContact[];
}

/** Show primary contact + "+N" when more than one sub-contact exists */
export default function SubContactsCell({ contacts = [] }: SubContactsCellProps) {
  if (contacts.length === 0) return <span className="text-gray-300 text-xs">—</span>;

  const first = contacts[0];
  const extra = contacts.length - 1;

  return (
    <div className="min-w-0 overflow-hidden">
      <p className="text-[10px] sm:text-[11px] font-medium text-gray-800 truncate">{first.name}</p>
      {extra > 0 && (
        <span className="text-[9px] font-bold text-[#1B6FE8]">+{extra}</span>
      )}
    </div>
  );
}

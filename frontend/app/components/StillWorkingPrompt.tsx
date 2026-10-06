"use client";

import { useEffect, useState } from "react";

export default function StillWorkingPrompt({
  promptEvent,
  confirmEvent,
}: {
  promptEvent: string;
  confirmEvent: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      setOpen(!!(event as CustomEvent<{ show?: boolean }>).detail?.show);
    };
    window.addEventListener(promptEvent, onPrompt);
    return () => window.removeEventListener(promptEvent, onPrompt);
  }, [promptEvent]);

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[90] border-b border-amber-300 bg-amber-50 px-4 py-3 shadow-lg">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-amber-950">Still working?</p>
          <p className="text-xs text-amber-900">
            The CRM has been in the background. Click I'm here, or bring this window back, to stay checked in.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(confirmEvent))}
          className="h-10 shrink-0 rounded-xl bg-[#0F172A] px-4 text-sm font-bold text-white"
        >
          I'm here
        </button>
      </div>
    </div>
  );
}

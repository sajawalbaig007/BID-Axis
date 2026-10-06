import { useEffect } from "react";

export function useOpenLeadFromQuery<T extends { id: string }>(
  leads: T[],
  openLead: (lead: T) => void,
  ready = true,
) {
  useEffect(() => {
    if (!ready || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get("leadId");
    if (!id) return;

    const lead = leads.find(l => l.id === id);
    if (!lead) return;

    openLead(lead);
    params.delete("leadId");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [leads, ready, openLead]);
}

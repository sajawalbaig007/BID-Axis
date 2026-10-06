"use client";

import { useEffect, type RefObject } from "react";
import { captureReportVisualPdf, triggerLocalDownload } from "./reportVisualExport";

export const ACCOUNTS_PDF_DONE = "crm-accounts-pdf";

export const ACCOUNTS_ASSISTANT_PAGES: Record<string, { path: string; label: string; file: string }> = {
  reports: { path: "/accounts/reports", label: "Accounts Reports", file: "Accounts-Report" },
  dashboard: { path: "/accounts", label: "Accounts Dashboard", file: "Accounts-Dashboard" },
  "income-statement": { path: "/accounts/income-statement", label: "Income Statement", file: "Income-Statement" },
  "balance-sheet": { path: "/accounts/balance-sheet", label: "Balance Sheet", file: "Balance-Sheet" },
  "cash-flow-statement": { path: "/accounts/cash-flow-statement", label: "Cash Flow Statement", file: "Cash-Flow" },
  "total-assets": { path: "/accounts/total-assets", label: "Total Assets", file: "Total-Assets" },
  "sales-team-payroll": { path: "/accounts/sales-team-payroll", label: "Sales Team Payroll", file: "Sales-Payroll" },
  "sales-team-lead-payroll": { path: "/accounts/sales-team-lead-payroll", label: "Sales Team Lead Payroll", file: "Sales-Lead-Payroll" },
  "technical-team-payroll": { path: "/accounts/technical-team-payroll", label: "Technical Payroll", file: "Technical-Payroll" },
  "csr-payroll": { path: "/accounts/csr-payroll", label: "CSR Payroll", file: "CSR-Payroll" },
};

export function notifyAccountsPdfDone(ok: boolean, error = "") {
  try {
    window.parent?.postMessage({ type: ACCOUNTS_PDF_DONE, ok, error }, window.location.origin);
  } catch {
    /* ignore */
  }
}

/** Hidden iframe capture — no preview. Same visual PDF as Save as PDF. */
export function downloadAccountsPageViaFrame(page: string, month: string): Promise<void> {
  const meta = ACCOUNTS_ASSISTANT_PAGES[page] ?? ACCOUNTS_ASSISTANT_PAGES.reports;
  const qs = new URLSearchParams({ download: "1" });
  if (month && /^\d{4}-\d{2}$/.test(month)) qs.set("month", month);
  const src = `${meta.path}?${qs.toString()}`;

  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("title", "Accounts PDF");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText =
      "position:fixed;left:0;top:0;width:1400px;height:2400px;z-index:1;opacity:0.01;pointer-events:none;border:0;";
    let settled = false;
    const finish = (ok: boolean, err?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      frame.remove();
      if (ok) resolve();
      else reject(new Error(err || "PDF capture failed."));
    };
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; ok?: boolean; error?: string };
      if (data?.type !== ACCOUNTS_PDF_DONE) return;
      finish(!!data.ok, data.ok ? undefined : data.error || "PDF capture failed.");
    };
    const timer = window.setTimeout(
      () => finish(false, "PDF timed out. Try Download again."),
      120_000,
    );
    window.addEventListener("message", onMsg);
    frame.src = src;
    document.body.appendChild(frame);
  });
}

export function useAccountsVisualPdf(opts: {
  ready: boolean;
  rootRef: RefObject<HTMLElement | null>;
  fileName: string;
  footer: string;
  exportFn?: () => Promise<void>;
}) {
  const { ready, rootRef, fileName, footer, exportFn } = opts;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("download") !== "1") return;
    if (!ready) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          if (cancelled) return;
          if (exportFn) {
            await exportFn();
          } else {
            const root = rootRef.current;
            if (!root) throw new Error("Page is not ready.");
            const blob = await captureReportVisualPdf(root, { footer });
            triggerLocalDownload(blob, fileName);
          }
          if (!cancelled) notifyAccountsPdfDone(true);
        } catch (err) {
          if (!cancelled) {
            notifyAccountsPdfDone(false, err instanceof Error ? err.message : "PDF capture failed.");
          }
        }
      })();
    }, 1800);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [ready, rootRef, fileName, footer, exportFn]);
}

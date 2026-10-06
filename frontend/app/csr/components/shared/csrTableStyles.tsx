/** Shared CSR lead-table layout — prevents column overlap on dense rows */

export const CSR_TABLE_CLASS = "w-full table-fixed border-collapse";
/** Full-width tables when columns show/hide by breakpoint (no fixed colgroup) */
export const CSR_TABLE_FLUID = "w-full border-collapse table-fixed";
export const CSR_TD_FLUID = "py-2 px-1.5 sm:px-2 align-middle";
export const CSR_THEAD =
  "crm-thead sticky top-0 z-20 bg-[#1B6FE8]";
export const CSR_TH =
  "text-left py-2.5 px-1.5 sm:px-2 text-[10px] sm:text-[11px] font-bold text-white/80 uppercase tracking-[0.14em]";
export const CSR_TD = "py-3 px-1.5 sm:px-2 align-middle max-w-0 overflow-hidden";
/** Phone / email cells — allow +N badge and popover menus to show */
export const CSR_TD_POPOVER = "py-3 px-1.5 sm:px-2 align-middle max-w-0 overflow-visible";
export const CSR_TD_TOP = "py-3 px-1.5 sm:px-2 align-top max-w-0 overflow-hidden";
/** Top-aligned + allow +N / popover overflow (Client column with contact/email chips) */
export const CSR_TD_TOP_POPOVER = "py-3 px-1.5 sm:px-2 align-top max-w-0 overflow-visible";
/** Shrink-wrap action column so buttons sit under the header */
export const CSR_TH_ACTION = `${CSR_TH} w-[1%] whitespace-nowrap`;
export const CSR_TD_ACTION = `${CSR_TD_FLUID} w-[1%] whitespace-nowrap`;

export const COL_8_FOLLOWUP = ["22%", "14%", "18%", "12%", "14%", "20%"] as const;
export const COL_9_FOLLOWUP = ["14%", "10%", "11%", "9%", "10%", "9%", "7%", "9%", "21%"] as const;
export const COL_8_IMPORTANT = ["16%", "11%", "12%", "11%", "10%", "9%", "10%", "21%"] as const;
/** Potential Important / Interested: Client, Phone, Scope, Notes, Status, Action */
export const COL_7_IMPORTANT_SUB = ["22%", "13%", "15%", "24%", "12%", "14%"] as const;
export const COL_6_POTENTIAL = ["22%", "13%", "14%", "22%", "12%", "17%"] as const;
/** Potential Schedule: Client, Phone, When, Notes, Status, Action */
export const COL_9_SCHEDULE = ["20%", "12%", "18%", "22%", "12%", "16%"] as const;
export const COL_8_INTERESTED_SUB = ["22%", "13%", "15%", "24%", "12%", "14%"] as const;
export const COL_8_SCHEDULE = COL_9_SCHEDULE;
export const COL_7_INTERESTED_SUB = COL_8_INTERESTED_SUB;
export const COL_5_POTENTIAL = COL_6_POTENTIAL;
export const COL_9_BIN = ["4%", "14%", "11%", "10%", "9%", "10%", "12%", "9%", "21%"] as const;
export const COL_7_INTERESTED = ["18%", "13%", "14%", "14%", "12%", "10%", "19%"] as const;
export const COL_6_DASHBOARD = ["20%", "13%", "13%", "12%", "12%", "30%"] as const;
export const COL_7_DASHBOARD = ["15%", "11%", "11%", "11%", "10%", "12%", "30%"] as const;
export const COL_8_ADMIN = ["22%", "10%", "10%", "10%", "8%", "8%", "20%", "12%"] as const;
/** Admin leads — Contact folded into Client column */
export const COL_7_ADMIN = ["28%", "12%", "12%", "8%", "8%", "20%", "12%"] as const;
/** Admin leads — Company + Contact folded into Client */
export const COL_6_ADMIN = ["34%", "14%", "9%", "9%", "22%", "12%"] as const;
export const COL_9_CLOSED = ["20%", "10%", "8%", "10%", "10%", "9%", "8%", "14%", "11%"] as const;
export const COL_8_CLOSED = ["24%", "12%", "8%", "12%", "8%", "8%", "16%", "12%"] as const;
export const COL_7_CLOSED = ["30%", "10%", "14%", "9%", "9%", "16%", "12%"] as const;
export const COL_9_SCHEDULE_ADMIN = ["20%", "10%", "10%", "10%", "8%", "8%", "8%", "15%", "11%"] as const;
export const COL_8_SCHEDULE_ADMIN = ["26%", "12%", "12%", "10%", "8%", "8%", "14%", "10%"] as const;
export const COL_7_SCHEDULE_ADMIN = ["32%", "14%", "12%", "9%", "9%", "14%", "10%"] as const;

export function CsrColGroup({ widths }: { widths: readonly string[] }) {
  return (
    <colgroup>
      {widths.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  );
}

/** Desktop client list grid — min widths stop overlap (full class strings for Tailwind) */
export const CLIENT_GRID_HEAD =
  "grid-cols-[minmax(52px,64px)_minmax(150px,1.4fr)_minmax(110px,1fr)_minmax(120px,0.95fr)_minmax(90px,0.75fr)_minmax(130px,1fr)_minmax(90px,0.8fr)_minmax(120px,1fr)_minmax(124px,124px)]";

export const CLIENT_GRID_ROW =
  "lg:grid-cols-[minmax(52px,64px)_minmax(150px,1.4fr)_minmax(110px,1fr)_minmax(120px,0.95fr)_minmax(90px,0.75fr)_minmax(130px,1fr)_minmax(90px,0.8fr)_minmax(120px,1fr)_minmax(124px,124px)]";

export const CRM_GRID_HEAD_ROW =
  "crm-grid-head border-b border-[#1B6FE8] bg-[#1B6FE8] [&>*]:!text-white/80";

export const PROJECT_GRID_HEAD =
  "grid-cols-[minmax(160px,1.4fr)_minmax(160px,1.3fr)_minmax(88px,88px)_minmax(130px,1fr)_minmax(120px,1fr)_minmax(110px,1fr)_minmax(72px,72px)]";

export const PROJECT_GRID_ROW =
  "lg:grid-cols-[minmax(160px,1.4fr)_minmax(160px,1.3fr)_minmax(88px,88px)_minmax(130px,1fr)_minmax(120px,1fr)_minmax(110px,1fr)_minmax(72px,72px)]";

/** Admin Project DB — Client…CSR, Bid, Notes from TM, Status, Actions */
export const ADMIN_PROJECT_COLS = [
  "16%", "17%", "6%", "10%", "9%", "5%", "7%", "7%", "13%", "10%",
] as const;

/** Technical Active Projects — detail, receive, deadline, bid, notes sir, notes est, assign, status, actions */
export const TECHNICAL_PROJECT_COLS = [
  "15%", "7%", "7%", "11%", "11%", "11%", "12%", "12%", "14%",
] as const;

/** Final Submission — detail, receive, deadline, bid, notes sir, notes est, actions */
export const TECHNICAL_FINAL_COLS = [
  "22%", "10%", "10%", "16%", "16%", "16%", "10%",
] as const;

/** Pricing — detail, receive, deadline, bid, notes sir, notes est, QA, status, actions */
export const TECHNICAL_PRICING_COLS = [
  "14%", "7%", "7%", "10%", "10%", "10%", "10%", "12%", "10%",
] as const;

/** Technical Assigned tab — detail, hours, deadline, bid, notes sir, notes est, estimators, status, actions */
export const TECHNICAL_ASSIGNED_COLS = [
  "13%", "6%", "7%", "10%", "10%", "10%", "12%", "12%", "10%",
] as const;

/** Admin Project DB when opened under /technical (compact) */
export const ADMIN_TECH_VIEW_COLS = [
  "24%", "14%", "18%", "18%", "14%", "12%",
] as const;

/** Full-bleed CSR pages — no leftover side gutters on wide screens */
export const CSR_PAGE_MAIN =
  "w-full max-w-none p-3 sm:p-4 md:p-5 lg:p-6 xl:px-8 2xl:px-10";
export const CSR_PAGE_GUTTER =
  "w-full px-3 sm:px-4 md:px-5 lg:px-6 xl:px-8 2xl:px-10";

/** Table card — no inner vertical scroll; page scrolls instead */
export const CSR_TABLE_CARD =
  "crm-table-card rounded-2xl sm:rounded-[28px] border border-slate-200/80 shadow-[0_12px_40px_rgba(15,23,42,0.06)] mt-4 sm:mt-7 min-w-0 overflow-hidden";

/** Table fits viewport — no inner horizontal scroll */
export const CSR_TABLE_WRAP = "w-full min-w-0 overflow-x-hidden px-1.5 sm:px-3 lg:px-4 pb-3 sm:pb-4";

export function matchesLeadSearch(
  q: string,
  fields: {
    name?: string;
    company?: string;
    phone?: string;
    email?: string;
    service?: string;
    state?: string;
  }
): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;

  const qDigits = query.replace(/\D/g, "");
  const parts = [fields.name, fields.company, fields.phone, fields.email, fields.service, fields.state]
    .filter((v): v is string => !!v && v !== "N/A")
    .map(v => v.toLowerCase());

  if (parts.some(p => p.includes(query))) return true;
  if (qDigits.length >= 3) {
    const phoneDigits = (fields.phone ?? "").replace(/\D/g, "");
    if (phoneDigits.includes(qDigits)) return true;
  }
  return false;
}

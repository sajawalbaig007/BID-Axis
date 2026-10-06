/** Brand-aligned accents for accounts tables & cards (light + dark tokens) */
export type AccountsTableVariant = "assets" | "equity" | "liability" | "cashflow" | "neutral";

export const TABLE_VARIANT: Record<
  AccountsTableVariant,
  {
    card: string;
    header: string;
    headerText: string;
    rowHover: string;
    footer: string;
    input: string;
    badge: string;
    accent: string;
  }
> = {
  assets: {
    card: "border-[#0B84F3]/25 dark:border-sky-500/30 shadow-[0_4px_24px_-4px_rgba(11,132,243,0.15)] bg-crm-surface",
    header: "bg-gradient-to-r from-[#EAF5FF] to-[#F0F9FF] dark:from-sky-500/15 dark:to-crm-surface",
    headerText: "text-[#0369A1] dark:text-sky-300",
    rowHover: "hover:bg-[#F8FBFF] dark:hover:bg-crm-surface-raised",
    footer: "bg-[#EAF5FF]/80 dark:bg-sky-500/10 border-t-2 border-[#0B84F3]/30 dark:border-sky-500/30",
    input: "focus:ring-[#0B84F3]/25 focus:border-[#0B84F3] bg-crm-input text-crm-text border-crm-border",
    badge: "bg-[#0B84F3]",
    accent: "#0B84F3",
  },
  equity: {
    card: "border-[#0D9488]/25 dark:border-teal-500/30 shadow-[0_4px_24px_-4px_rgba(13,148,136,0.15)] bg-crm-surface",
    header: "bg-gradient-to-r from-[#F0FDFA] to-[#F0F9FF] dark:from-teal-500/15 dark:to-crm-surface",
    headerText: "text-[#0F766E] dark:text-teal-300",
    rowHover: "hover:bg-[#F8FFFE] dark:hover:bg-crm-surface-raised",
    footer: "bg-[#F0FDFA]/80 dark:bg-teal-500/10 border-t-2 border-[#0D9488]/30 dark:border-teal-500/30",
    input: "focus:ring-[#0D9488]/25 focus:border-[#0D9488] bg-crm-input text-crm-text border-crm-border",
    badge: "bg-[#0D9488]",
    accent: "#0D9488",
  },
  liability: {
    card: "border-[#1B6FE8]/25 dark:border-rose-500/30 shadow-[0_4px_24px_-4px_rgba(184,17,45,0.12)] bg-crm-surface",
    header: "bg-gradient-to-r from-[#EAF2FE] to-[#FFF8F9] dark:from-rose-500/15 dark:to-crm-surface",
    headerText: "text-[#1B6FE8] dark:text-rose-300",
    rowHover: "hover:bg-[#FFFBFC] dark:hover:bg-crm-surface-raised",
    footer: "bg-[#EAF2FE]/80 dark:bg-rose-500/10 border-t-2 border-[#1B6FE8]/30 dark:border-rose-500/30",
    input: "focus:ring-[#1B6FE8]/25 focus:border-[#1B6FE8] bg-crm-input text-crm-text border-crm-border",
    badge: "bg-[#1B6FE8]",
    accent: "#1B6FE8",
  },
  cashflow: {
    card: "border-[#1B6FE8]/20 dark:border-rose-500/25 shadow-[0_4px_24px_-4px_rgba(184,17,45,0.1)] bg-crm-surface",
    header: "bg-gradient-to-r from-[#FFF8F9] to-[#FFFBFC] dark:from-rose-500/12 dark:to-crm-surface",
    headerText: "text-[#1B6FE8] dark:text-rose-300",
    rowHover: "hover:bg-[#FFFBFC] dark:hover:bg-crm-surface-raised",
    footer: "bg-[#FFF8F2] dark:bg-rose-500/10 border-t-2 border-[#1B6FE8]/25 dark:border-rose-500/25",
    input: "focus:ring-[#1B6FE8]/25 focus:border-[#1B6FE8] bg-crm-input text-crm-text border-crm-border",
    badge: "bg-[#1B6FE8]",
    accent: "#1B6FE8",
  },
  neutral: {
    card: "border-crm-border shadow-sm bg-crm-surface",
    header: "bg-crm-muted",
    headerText: "text-crm-text-secondary",
    rowHover: "hover:bg-crm-surface-raised",
    footer: "bg-crm-surface-muted border-t border-crm-border",
    input: "focus:ring-[#1B6FE8]/20 focus:border-[#1B6FE8]/40 bg-crm-input text-crm-text border-crm-border",
    badge: "bg-crm-text-muted",
    accent: "#64748B",
  },
};

export const BANK_COLORS = ["#0B84F3", "#1B6FE8", "#12B76A", "#F59E0B", "#0D9488", "#EA580C"];

export function bankColor(index: number): string {
  return BANK_COLORS[index % BANK_COLORS.length];
}

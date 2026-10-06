import type { EmployeeSalaryDetail } from "./utils/payrollFormula";
import type { SalesPayrollEmployee } from "./utils/salesPayrollFormula";
import { estMonthStartYmd, estNowYmd } from "@/lib/estTime";

export type AccountsPageKey =
  | "dashboard"
  | "balance_sheet"
  | "income_statement"
  | "cash_flow"
  | "total_assets"
  | "sales_payroll"
  | "technical_payroll"
  | "income_budget";

export type AccountsUpload = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string | null;
  createdAt: string;
};

/** Individual fillable line under a parent head. */
export type SubHeadEntry = {
  id: string;
  label: string;
  /** Net / total for charts — for salary people = computed totalSalary */
  amount: number;
  /** Date this individual entry was filled (YYYY-MM-DD). */
  filledAt: string;
  /** Optional payment-proof / screenshot URL (OPEX lines). */
  proofUrl?: string;
  proofName?: string;
  /** Rich payroll fields (Team Salaries people). */
  salary?: EmployeeSalaryDetail;
  /** Sales team commission payroll (no overtime, 6 PM shift). */
  salesPayroll?: SalesPayrollEmployee;
  /** Asset inventory: quantity (TOTAL = qty × unitPrice). */
  qty?: number;
  /** Asset inventory: unit price. */
  unitPrice?: number;
  /** Asset inventory category (IT / Electrical / Furniture). */
  inventoryCategory?: string;
  /** Display-only: PF for the selected period (income statement). */
  periodAmount?: number;
  /** Display-only: PF across all saved records. */
  allTimeAmount?: number;
  /** User-added PF line — keep even if the person is not in Team Salaries. */
  manual?: boolean;
  /** User typed this PF amount — sync will not overwrite it from salary formula. */
  userEdited?: boolean;
};

/** Date-tagged note on a table row / head. */
export type DatedNote = {
  id: string;
  text: string;
  date: string;
};

export type BalanceLineItem = {
  id: string;
  label: string;
  /** @deprecated use notes[] — kept for old saves */
  note?: string;
  amount: number;
  filledAt?: string;
  subHeads?: SubHeadEntry[];
  notes?: DatedNote[];
};

export type BalanceSection = {
  id: string;
  title: string;
  items: BalanceLineItem[];
};

export type BalanceSheetData = {
  assetSections: BalanceSection[];
  equityLiabilitySections: BalanceSection[];
};

export type TeamSalaryRow = {
  id: string;
  team: string;
  /** @deprecated migrated into subHeads */
  headLabels?: string[];
  totalSalary: number;
  filledAt?: string;
  subHeads?: SubHeadEntry[];
  notes?: DatedNote[];
};

export type OpexRow = {
  id: string;
  label: string;
  amount: number;
  filledAt?: string;
  subHeads?: SubHeadEntry[];
  notes?: DatedNote[];
};

export type IncomeStatementData = {
  totalRevenue: number;
  teamSalaries: TeamSalaryRow[];
  opexHeads: OpexRow[];
  loanHeads?: OpexRow[];
  providentFundHeads?: OpexRow[];
  /** PF people the user removed from the table — stay gone until added back. */
  pfDroppedNames?: string[];
};

export type CashFlowRow = {
  id: string;
  date: string;
  description: string;
  bankAmounts: Record<string, { debit: number; credit: number }>;
  netAmount: number;
  notes?: DatedNote[];
};

export type CashFlowMonth = {
  id: string;
  month: string;
  rows: CashFlowRow[];
};

export type CashFlowData = {
  bankHeads: string[];
  months: CashFlowMonth[];
};

export type AssetSectionRow = {
  id: string;
  title: string;
  heads: string[];
  total: number;
  filledAt?: string;
  subHeads?: SubHeadEntry[];
  notes?: DatedNote[];
};

/** Company keys for Total Assets register. */
export type AssetsCompanyKey = "BEM" | "GPS" | "BDS";

export const ASSETS_COMPANIES: { key: AssetsCompanyKey; label: string; accent: string }[] = [
  { key: "BEM", label: "BEM", accent: "#0D9488" },
  { key: "GPS", label: "GPS", accent: "#0B84F3" },
  { key: "BDS", label: "BDS", accent: "#1B6FE8" },
];

export type TotalAssetsData = {
  /** Company-wise asset registers */
  companies?: Record<AssetsCompanyKey, AssetSectionRow[]>;
  /** @deprecated legacy flat list — migrated into companies.BEM */
  sections?: AssetSectionRow[];
  /** Once true, inventory lines live under IT / Electrical / Furniture (not BEM Asset). */
  bemInventoryHeadsSeeded?: boolean;
  /** @deprecated use bemInventoryHeadsSeeded */
  bemAssetSeeded?: boolean;
};

/** AH/SN = FX; CHQ = cheque 25% tax; HM = Habib Metro direct 1% tax */
export type CurrencyTabKey = "SN" | "AH" | "CHQ" | "HM";

export const CURRENCY_TAB_LABELS: Record<CurrencyTabKey | "ALL", string> = {
  AH: "Ahmed Hamza",
  SN: "Sharjeel Nasir",
  CHQ: "Cheque Payment",
  HM: "Direct Habib Metro",
  ALL: "All",
};

export const CURRENCY_TAB_SHORT: Record<CurrencyTabKey | "ALL", string> = {
  AH: "Ahmed",
  SN: "Sharjeel",
  CHQ: "Cheque",
  HM: "Habib",
  ALL: "All",
};

export type DashboardCurrencyTab = {
  usdAmount: number;
  cadAmount: number;
  pkrAmount: number;
  usdToPkrRate: number;
  cadToPkrRate: number;
  usdTaxFactor: number;
  cadTaxFactor: number;
  /**
   * Local PKR payment tax deduction rate (e.g. 0.25 cheque, 0.01 Habib Metro).
   * When set, `pkrAmount` is treated as gross and net = gross × (1 − rate).
   */
  taxDeductionRate?: number;
};

export type DashboardCurrency = {
  usdAmount?: number;
  cadAmount?: number;
  pkrAmount?: number;
  usdToPkrRate?: number;
  cadToPkrRate?: number;
  tabs: Record<CurrencyTabKey, DashboardCurrencyTab>;
};

/** User edit on a built-in (code-defined) formula — text/note override only. */
export type FormulaOverride = {
  expression?: string;
  note?: string;
};

/** User-defined custom formula. */
export type CustomFormula = {
  id: string;
  section: string;
  title: string;
  expression: string;
  appliesTo?: string;
  note?: string;
};

export type FormulasState = {
  overrides?: Record<string, FormulaOverride>;
  custom?: CustomFormula[];
};

export type DashboardData = {
  currency: DashboardCurrency;
  /** Formula Book — overrides + custom formulas (saved with the dashboard record) */
  formulas?: FormulasState;
};

export function isLocalPaymentTab(tab: CurrencyTabKey): boolean {
  return tab === "CHQ" || tab === "HM";
}

export function todayIso(): string {
  return estNowYmd();
}

export function monthStartIso(): string {
  return estMonthStartYmd();
}

export function newRowId(prefix = "row"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function currency(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** qty × unitPrice when inventory fields are set; otherwise stored amount. */
export function inventoryLineTotal(qty?: number, unitPrice?: number, fallbackAmount = 0): number {
  if (qty != null && unitPrice != null) {
    return Math.round((Number(qty) || 0) * (Number(unitPrice) || 0) * 100) / 100;
  }
  return Number(fallbackAmount) || 0;
}

export function subHeadLineAmount(s: SubHeadEntry): number {
  if (s.qty != null && s.unitPrice != null) {
    return inventoryLineTotal(s.qty, s.unitPrice, s.amount);
  }
  return Number(s.amount) || 0;
}

export function sumSubHeads(subHeads?: SubHeadEntry[]): number {
  return (subHeads ?? []).reduce((a, s) => a + subHeadLineAmount(s), 0);
}

export function lineAmount(item: { amount?: number; totalSalary?: number; subHeads?: SubHeadEntry[] }): number {
  if (item.subHeads && item.subHeads.length > 0) return sumSubHeads(item.subHeads);
  return Number(item.amount ?? item.totalSalary) || 0;
}

export function isInventoryAssetHead(title: string, subHeads?: SubHeadEntry[]): boolean {
  const t = title.trim().toLowerCase();
  if (
    t === "it inventory" ||
    t === "electrical inventory" ||
    t === "furniture inventory" ||
    /bem\s*asset/i.test(t)
  ) {
    return true;
  }
  return (subHeads ?? []).some(
    s => !!s.inventoryCategory || (s.qty != null && s.unitPrice != null),
  );
}

/** Normalize legacy string note + notes[] into a dated list. */
export function normalizeNotes(
  notes?: DatedNote[],
  legacyNote?: string,
  fallbackDate?: string,
): DatedNote[] {
  if (notes && notes.length > 0) return notes;
  const text = legacyNote?.trim();
  if (!text) return [];
  return [{ id: "legacy-note", text, date: fallbackDate || todayIso() }];
}

/** Latest note by date (then id). */
export function latestNote(
  notes?: DatedNote[],
  legacyNote?: string,
  fallbackDate?: string,
): DatedNote | null {
  const list = normalizeNotes(notes, legacyNote, fallbackDate);
  if (!list.length) return null;
  return [...list].sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    return d !== 0 ? d : b.id.localeCompare(a.id);
  })[0];
}

/**
 * Per-head salary-slip field templates (Sales, Sales Lead, Technical, Admin, Executive).
 * Stored in localStorage so accounts users can add / rename / remove lines without code changes.
 */

import type { PayrollKind } from "./salesPayrollBridge";
import type { SalarySlipTemplate } from "./salarySlipShared";

/** Same set as payroll kinds used on Team Salaries heads. */
export type SlipPayrollKind = PayrollKind;

export type SlipAmountSource =
  | "basic"
  | "allowance"
  | "homeAllowance"
  | "fuelAllowance"
  | "medicalAllowance"
  | "travelAllowance"
  | "utilityAllowance"
  | "grossSalary"
  | "allowancesCombined"
  | "weekdayOt"
  | "weekendOt"
  | "overtimeTotal"
  | "projectComm"
  | "fixComm"
  | "teamLeadComm"
  | "commission"
  | "incomeTax"
  | "unpaidLeaves"
  | "lateDeduction"
  | "employeePf"
  | "loanDeduction"
  | "occasional"
  | "custom";

export type SlipEmployeeFieldKey =
  | "employeeName"
  | "employeeId"
  | "address"
  | "phone"
  | "cnic"
  | "projectCount"
  | "custom";

export type SlipFieldLine = {
  id: string;
  label: string;
  source: SlipAmountSource;
  /** Only used when source === "custom" */
  defaultAmount?: number;
  enabled: boolean;
};

export type SlipEmployeeFieldLine = {
  id: string;
  key: SlipEmployeeFieldKey;
  label: string;
  enabled: boolean;
  /** Static text for custom employee rows */
  defaultValue?: string;
};

export type SlipFooterConfig = {
  thankYouPrefix: string;
  thankYouAccent: string;
  showApprovedBy: boolean;
  approvedByLabel: string;
  showContactBar: boolean;
  socialLine: string;
};

/** Extra amount blocks the user can add (e.g. Bonuses, Other). */
export type SlipCustomSection = {
  id: string;
  title: string;
  enabled: boolean;
  fields: SlipFieldLine[];
};

export type SlipKindTemplate = {
  kind: SlipPayrollKind;
  /** Display name in the editor */
  title: string;
  layout: SalarySlipTemplate;
  /** Renamable built-in section titles */
  sectionTitles: {
    employee: string;
    earnings: string;
    deductions: string;
    footer: string;
  };
  employeeFields: SlipEmployeeFieldLine[];
  earnings: SlipFieldLine[];
  deductions: SlipFieldLine[];
  customSections: SlipCustomSection[];
  footer: SlipFooterConfig;
};

export const SLIP_TEMPLATE_STORAGE_KEY = "accounts.salarySlipTemplates.v2";

export const SLIP_EMPLOYEE_KEY_OPTIONS: { value: SlipEmployeeFieldKey; label: string }[] = [
  { value: "employeeName", label: "Employee name (auto)" },
  { value: "employeeId", label: "Employee ID (auto)" },
  { value: "address", label: "Address (auto)" },
  { value: "phone", label: "Phone (auto)" },
  { value: "cnic", label: "CNIC (auto)" },
  { value: "projectCount", label: "Project count (auto)" },
  { value: "custom", label: "Custom text" },
];

export const DEFAULT_SECTION_TITLES = {
  employee: "Employee details",
  earnings: "Earnings",
  deductions: "Deductions",
  footer: "Footer",
} as const;

export const SLIP_AMOUNT_SOURCE_OPTIONS: { value: SlipAmountSource; label: string }[] = [
  { value: "basic", label: "Basic salary" },
  { value: "allowance", label: "Misc / allowance" },
  { value: "homeAllowance", label: "Home allowance" },
  { value: "fuelAllowance", label: "Fuel allowance" },
  { value: "medicalAllowance", label: "Medical allowance" },
  { value: "travelAllowance", label: "Travel allowance" },
  { value: "utilityAllowance", label: "Utility allowance" },
  { value: "grossSalary", label: "Gross salary (tech manager)" },
  { value: "allowancesCombined", label: "Allowances (home + fuel + med + misc)" },
  { value: "weekdayOt", label: "Weekday overtime" },
  { value: "weekendOt", label: "Weekend overtime" },
  { value: "overtimeTotal", label: "Total overtime" },
  { value: "projectComm", label: "Project commission" },
  { value: "fixComm", label: "Fixed client commission" },
  { value: "teamLeadComm", label: "Team lead commission" },
  { value: "commission", label: "Executive commission" },
  { value: "incomeTax", label: "Income tax" },
  { value: "unpaidLeaves", label: "Unpaid leaves" },
  { value: "lateDeduction", label: "Late arrival" },
  { value: "employeePf", label: "Employee PF" },
  { value: "loanDeduction", label: "Loan deduction" },
  { value: "occasional", label: "Occasional amount (net only)" },
  { value: "custom", label: "Custom (fixed / zero)" },
];

const bemFooter = (): SlipFooterConfig => ({
  thankYouPrefix: "THANK YOU SO MUCH FOR YOUR ",
  thankYouAccent: "EFFORTS!",
  showApprovedBy: true,
  approvedByLabel: "Approved by: Account Officer",
  showContactBar: true,
  socialLine: "YouTube · Facebook · Instagram · LinkedIn",
});

const gpsFooter = (): SlipFooterConfig => ({
  thankYouPrefix: "THANK YOU FOR YOUR ",
  thankYouAccent: "DEDICATION!",
  showApprovedBy: true,
  approvedByLabel: "Approved by: Account Officer",
  showContactBar: true,
  socialLine: "LinkedIn · Website · Email",
});

function emp(
  key: SlipEmployeeFieldKey,
  label: string,
  enabled = true,
): SlipEmployeeFieldLine {
  return { id: `emp-${key}`, key, label, enabled };
}

function line(id: string, label: string, source: SlipAmountSource, enabled = true): SlipFieldLine {
  return { id, label, source, enabled };
}

const standardDeductions = (): SlipFieldLine[] => [
  line("d-tax", "Income Tax", "incomeTax"),
  line("d-unpaid", "Unpaid Leaves", "unpaidLeaves"),
  line("d-late", "Late Arrival Deduction", "lateDeduction"),
  line("d-pf", "Employee PF Share", "employeePf"),
  line("d-loan", "Loan Deduction", "loanDeduction"),
];

const standardEmployee = (withProjects = false): SlipEmployeeFieldLine[] => [
  emp("employeeName", "Employee Name"),
  emp("employeeId", "Employee ID"),
  emp("address", "Employee address"),
  emp("phone", "Phone"),
  emp("cnic", "CNIC"),
  emp("projectCount", "No. of projects", withProjects),
];

function baseTemplate(
  partial: Omit<SlipKindTemplate, "sectionTitles" | "customSections"> &
    Partial<Pick<SlipKindTemplate, "sectionTitles" | "customSections">>,
): SlipKindTemplate {
  return {
    sectionTitles: { ...DEFAULT_SECTION_TITLES },
    customSections: [],
    ...partial,
  };
}

export const DEFAULT_SLIP_TEMPLATES: Record<SlipPayrollKind, SlipKindTemplate> = {
  sales: baseTemplate({
    kind: "sales",
    title: "Sales",
    layout: "bem_sales",
    employeeFields: standardEmployee(true),
    earnings: [
      line("e-basic", "Basic Salary", "basic"),
      line("e-all", "Allowances", "allowancesCombined"),
      line("e-home", "Home Allowance", "homeAllowance"),
      line("e-fuel", "Fuel Allowance", "fuelAllowance"),
      line("e-med", "Medical Allowance", "medicalAllowance"),
      line("e-proj", "Project Based Comm", "projectComm"),
      line("e-fix", "Fixed Client Comm", "fixComm"),
    ],
    deductions: standardDeductions(),
    footer: bemFooter(),
  }),
  sales_lead: baseTemplate({
    kind: "sales_lead",
    title: "Sales Lead",
    layout: "bem_csr_full",
    employeeFields: standardEmployee(true),
    earnings: [
      line("e-basic", "Basic Salary", "basic"),
      line("e-misc", "Misc Allowance", "allowance"),
      line("e-home", "Home Allowance", "homeAllowance"),
      line("e-proj", "Project Based Comm", "projectComm"),
      line("e-fix", "Fixed Client Comm", "fixComm"),
      line("e-tl", "Team Lead Commission", "teamLeadComm"),
    ],
    deductions: standardDeductions(),
    footer: bemFooter(),
  }),
  technical: baseTemplate({
    kind: "technical",
    title: "Technical",
    layout: "gps_technical",
    employeeFields: standardEmployee(false),
    earnings: [
      line("e-basic", "Basic Salary", "basic"),
      line("e-all", "Allowances", "allowancesCombined"),
      line("e-wot", "Weekday Overtime (1.5x)", "weekdayOt"),
      line("e-weot", "Weekend Overtime (2x)", "weekendOt"),
    ],
    deductions: standardDeductions(),
    footer: gpsFooter(),
  }),
  technical_manager: baseTemplate({
    kind: "technical_manager",
    title: "Technical Manager",
    layout: "gps_technical",
    employeeFields: standardEmployee(false),
    earnings: [
      line("e-basic", "Basic Salary", "basic"),
      line("e-all", "Allowances", "allowancesCombined"),
      line("e-wot", "Weekday Overtime (1.5x)", "weekdayOt"),
      line("e-weot", "Weekend Overtime (2x)", "weekendOt"),
    ],
    deductions: standardDeductions(),
    footer: gpsFooter(),
  }),
  admin: baseTemplate({
    kind: "admin",
    title: "Administration",
    layout: "bem_sales",
    employeeFields: standardEmployee(false),
    earnings: [
      line("e-basic", "Basic Salary", "basic"),
      line("e-misc", "Misc Allowance", "allowance"),
      line("e-home", "Home Allowance", "homeAllowance"),
      line("e-ot", "Overtime", "overtimeTotal"),
    ],
    deductions: standardDeductions(),
    footer: bemFooter(),
  }),
  executive: baseTemplate({
    kind: "executive",
    title: "Executive",
    layout: "bem_sales",
    employeeFields: standardEmployee(false),
    earnings: [
      line("e-basic", "Basic Salary", "basic"),
      line("e-misc", "Misc Allowance", "allowance"),
      line("e-home", "Home Allowance", "homeAllowance"),
      line("e-comm", "Commission", "commission"),
    ],
    deductions: standardDeductions(),
    footer: bemFooter(),
  }),
};

export const EDITABLE_SLIP_KINDS: SlipPayrollKind[] = [
  "sales",
  "sales_lead",
  "technical",
  "admin",
  "executive",
];

export function slipKindTitle(kind: SlipPayrollKind | PayrollKind): string {
  return DEFAULT_SLIP_TEMPLATES[kind as SlipPayrollKind]?.title ?? kind;
}

function cloneTemplate(t: SlipKindTemplate): SlipKindTemplate {
  return JSON.parse(JSON.stringify(t)) as SlipKindTemplate;
}

function mergeStored(
  defaults: Record<SlipPayrollKind, SlipKindTemplate>,
  stored: Partial<Record<SlipPayrollKind, SlipKindTemplate>> | null,
): Record<SlipPayrollKind, SlipKindTemplate> {
  const out = { ...defaults };
  if (!stored) return out;
  for (const key of Object.keys(defaults) as SlipPayrollKind[]) {
    const s = stored[key];
    if (!s) continue;
    out[key] = {
      ...cloneTemplate(defaults[key]),
      ...s,
      kind: key,
      title: defaults[key].title,
      layout: s.layout || defaults[key].layout,
      sectionTitles: {
        ...DEFAULT_SECTION_TITLES,
        ...(defaults[key].sectionTitles ?? {}),
        ...(s.sectionTitles ?? {}),
      },
      employeeFields: Array.isArray(s.employeeFields) ? s.employeeFields : defaults[key].employeeFields,
      earnings: Array.isArray(s.earnings) ? s.earnings : defaults[key].earnings,
      deductions: Array.isArray(s.deductions) ? s.deductions : defaults[key].deductions,
      customSections: Array.isArray(s.customSections) ? s.customSections : defaults[key].customSections ?? [],
      footer: { ...defaults[key].footer, ...(s.footer ?? {}) },
    };
  }
  return out;
}

export function loadAllSlipTemplates(): Record<SlipPayrollKind, SlipKindTemplate> {
  const defaults = Object.fromEntries(
    (Object.keys(DEFAULT_SLIP_TEMPLATES) as SlipPayrollKind[]).map(k => [k, cloneTemplate(DEFAULT_SLIP_TEMPLATES[k])]),
  ) as Record<SlipPayrollKind, SlipKindTemplate>;

  if (typeof window === "undefined") return defaults;
  try {
    const raw =
      window.localStorage.getItem(SLIP_TEMPLATE_STORAGE_KEY) ??
      window.localStorage.getItem("accounts.salarySlipTemplates.v1");
    if (!raw) return defaults;
    return mergeStored(defaults, JSON.parse(raw) as Partial<Record<SlipPayrollKind, SlipKindTemplate>>);
  } catch {
    return defaults;
  }
}

export function getSlipTemplateForKind(kind: SlipPayrollKind): SlipKindTemplate {
  return loadAllSlipTemplates()[kind] ?? cloneTemplate(DEFAULT_SLIP_TEMPLATES[kind]);
}

export function saveSlipTemplateForKind(kind: SlipPayrollKind, template: SlipKindTemplate): void {
  if (typeof window === "undefined") return;
  const all = loadAllSlipTemplates();
  all[kind] = {
    ...template,
    kind,
    title: DEFAULT_SLIP_TEMPLATES[kind].title,
    customSections: template.customSections ?? [],
    sectionTitles: { ...DEFAULT_SECTION_TITLES, ...(template.sectionTitles ?? {}) },
  };
  window.localStorage.setItem(SLIP_TEMPLATE_STORAGE_KEY, JSON.stringify(all));
}

export function resetSlipTemplateForKind(kind: SlipPayrollKind): SlipKindTemplate {
  const fresh = cloneTemplate(DEFAULT_SLIP_TEMPLATES[kind]);
  saveSlipTemplateForKind(kind, fresh);
  return fresh;
}

export function newFieldId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyCustomSection(title = "New section"): SlipCustomSection {
  return {
    id: newFieldId("sec"),
    title,
    enabled: true,
    fields: [
      {
        id: newFieldId("f"),
        label: "New line",
        source: "custom",
        defaultAmount: 0,
        enabled: true,
      },
    ],
  };
}

export function emptyAmountField(): SlipFieldLine {
  return {
    id: newFieldId("f"),
    label: "New line",
    source: "custom",
    defaultAmount: 0,
    enabled: true,
  };
}

export function emptyEmployeeField(): SlipEmployeeFieldLine {
  return {
    id: newFieldId("emp"),
    key: "custom",
    label: "New field",
    enabled: true,
    defaultValue: "",
  };
}

export type SlipAmountBag = Partial<Record<SlipAmountSource, number>> & {
  qty?: Partial<Record<SlipAmountSource, string>>;
};

export function linesFromTemplate(
  fields: SlipFieldLine[],
  bag: SlipAmountBag,
): { label: string; amount: number; qty?: string }[] {
  return fields
    .filter(f => f.enabled)
    .map(f => {
      const amount =
        f.source === "custom"
          ? Number(f.defaultAmount) || 0
          : Number(bag[f.source]) || 0;
      const qty = bag.qty?.[f.source];
      return { label: f.label, amount, ...(qty ? { qty } : {}) };
    });
}

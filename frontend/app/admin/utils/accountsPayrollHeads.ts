/** Mirrors Accounts Income Statement → Team Salaries heads. */
export const ACCOUNTS_PAYROLL_HEADS = [
  "Technical Team Salaries",
  "Sales Team Salaries",
  "Sales Team Lead Salaries",
  "Technical Manager Salaries",
  "Email Marketing Team Salaries",
  "BIM Modeler Salaries",
  "Administration Salaries",
  "Dev Salaries",
  "Executive Salaries",
] as const;

export type AccountsPayrollHead = (typeof ACCOUNTS_PAYROLL_HEADS)[number];

export function payrollHeadShortLabel(head: string): string {
  return head.replace(/\s+Salaries$/i, "").trim() || head;
}

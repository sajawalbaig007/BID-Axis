/**
 * Central formula registry — every code-defined formula is registered here.
 * Add a new formula in code, then add an entry to this list; it will show up
 * automatically in Formula Book (Dashboard → All Formulas).
 */

export type FormulaDef = {
  id: string;
  section: string;
  title: string;
  /** Canonical formula text (editable override is saved on the dashboard record) */
  expression: string;
  /** Where / which calculation it applies to */
  appliesTo: string;
};

export const BUILTIN_FORMULAS: FormulaDef[] = [
  // ---- Dashboard — Currency Payments ----
  {
    id: "fx-ah",
    section: "Dashboard — Currency Payments",
    title: "Ahmed Hamza (PayPal)",
    expression: "USD × 0.89 (after tax) × USD→PKR rate = PKR · CAD × 0.89 × CAD→PKR rate = PKR",
    appliesTo: "Dashboard → Currency Payment Formula → Ahmed tab (values editable via the eye button)",
  },
  {
    id: "fx-sn",
    section: "Dashboard — Currency Payments",
    title: "Sharjeel Nasir (PayPal)",
    expression: "CAD × 0.945 (after tax) × CAD→PKR rate (record: 196) = PKR received",
    appliesTo: "Dashboard → Currency Payment Formula → Sharjeel tab",
  },
  {
    id: "fx-chq",
    section: "Dashboard — Currency Payments",
    title: "Cheque Payment",
    expression: "Net = Gross PKR − 25% tax",
    appliesTo: "Dashboard → Currency Payment Formula → Cheque tab",
  },
  {
    id: "fx-hm",
    section: "Dashboard — Currency Payments",
    title: "Direct Habib Metro",
    expression: "Net = Gross PKR − 1% tax",
    appliesTo: "Dashboard → Currency Payment Formula → Habib Metro tab",
  },

  // ---- Income Statement ----
  {
    id: "is-net-profit",
    section: "Income Statement",
    title: "Net Profit",
    expression: "Net Profit = Total Revenue − (Team Salaries + OPEX + Loans + Provident Fund)",
    appliesTo: "Income Statement → KPI cards & Revenue·Expense·Profit chart",
  },
  {
    id: "is-margin",
    section: "Income Statement",
    title: "Net Margin %",
    expression: "Net Margin = Net Profit ÷ Revenue × 100",
    appliesTo: "Income Statement → footer line below the tables",
  },

  // ---- Payroll — Common ----
  {
    id: "pay-day",
    section: "Payroll — Common",
    title: "Day / Hour Salary",
    expression: "1 Day Salary = Basic ÷ 30 · 1 Hour Salary = Day ÷ 8 (allowances excluded)",
    appliesTo: "All payroll calculations (late, unpaid leave, overtime)",
  },
  {
    id: "pay-pf",
    section: "Payroll — Common",
    title: "Provident Fund",
    expression: "PF = 8% of Basic (auto) — manual override possible",
    appliesTo: "Every employee deduction (Technical / Admin / Sales)",
  },
  {
    id: "pay-deduction",
    section: "Payroll — Common",
    title: "Total Deduction & Net",
    expression:
      "Net Salary = (Total Earning − Total Deduction) + Occasional Amount · Occasional never enters PF / tax / late / unpaid bases",
    appliesTo: "Every employee net salary",
  },
  {
    id: "pay-occasional",
    section: "Payroll — Common",
    title: "Occasional Amount",
    expression:
      "If Occasional Amount is filled → add it to Net Salary only · zero deductions of any kind on this amount · keep Occasion remark for why it was paid",
    appliesTo: "Every salary sub-head editor (Technical / Admin / Sales / Executive)",
  },

  // ---- Payroll — Technical Team ----
  {
    id: "tech-earning",
    section: "Payroll — Technical Team",
    title: "Total Earning",
    expression: "Total Earning = Basic + Allowance + Overtime",
    appliesTo: "Income Statement → Team Salaries → Technical Team / Email Marketing",
  },
  {
    id: "tech-ot",
    section: "Payroll — Technical Team",
    title: "Overtime",
    expression:
      "Hourly = (Basic + Allowances) ÷ 30 ÷ 8 · Weekday OT = hours × hourly × 1.5 · Weekend OT = hours × hourly × 2",
    appliesTo: "Technical team employee editor → Overtime section",
  },
  {
    id: "tech-late",
    section: "Payroll — Technical Team",
    title: "Late Arrival (7 AM shift)",
    expression:
      "Shift 07:00–16:00 · relief ≤ 07:30 · 07:30–08:00 = ¼ day · 08:00–09:00 = ⅓ day · 09:00+ = ½ day · late but worked ≥ 9h → waived",
    appliesTo: "Technical team late deduction",
  },

  // ---- Payroll — Technical Manager ----
  {
    id: "tech-mgr-same-as-tech",
    section: "Payroll — Technical Manager",
    title: "Same as Technical Team (9 AM late)",
    expression:
      "Same as Technical Team, unless the CEO saved Chief Estimator deduction ranges for this month. Then per day = selected parts (basic, commission, overtime, allowance) ÷ 30, and the matching time range cuts that percent. Otherwise late shift 09:00 · relief ≤ 09:30 · 09:30–10:00 = ¼ day · 10:00–11:00 = ⅓ day · 11:00+ = ½ day · ≥9h worked → waived.",
    appliesTo: "Income Statement → Team Salaries → Technical Manager",
  },

  // ---- Payroll — Administration ----
  {
    id: "admin-earning",
    section: "Payroll — Administration",
    title: "Total Earning",
    expression: "Total Earning = Basic + Allowance (no overtime)",
    appliesTo: "Income Statement → Team Salaries → Administration Salaries",
  },
  {
    id: "admin-late",
    section: "Payroll — Administration",
    title: "Late Arrival (6 PM shift)",
    expression:
      "If the CEO saved Admin deduction ranges for this month, per day = selected parts ÷ 30 and the matching range cuts that percent. Otherwise shift 18:00 · relief ≤ 18:15 · 18:15–18:30 = ⅕ day · 18:30–19:00 = ¼ day · 19:00–20:00 = ⅓ day · 20:00+ = ½ day",
    appliesTo: "Administration late deduction",
  },

  // ---- Payroll — Sales Team ----
  {
    id: "sales-comm",
    section: "Payroll — Sales Team",
    title: "Project Commission",
    expression:
      "From Aug 2026: pick commission range, enter project count + total amount → selected range % × 0.89 × live FX. Assign to Lead sends 0.5% × 0.89 of that final total (PKR) to the team lead. Through Jul 2026: Old = 1,000/project · New = 3,000/project · Fix = 2.5%.",
    appliesTo: "Sales team member commissions",
  },
  {
    id: "sales-earning",
    section: "Payroll — Sales Team",
    title: "Total Earning",
    expression: "Total Earning = Basic + Allowance + Total Commission · no overtime. Late cut uses the CEO’s CSR ranges for this month when they are saved; otherwise the 6 PM slabs.",
    appliesTo: "Income Statement → Team Salaries → Sales Team Salaries",
  },
  {
    id: "sales-tl",
    section: "Payroll — Sales Team",
    title: "Team Lead Commission",
    expression:
      "Through Jul 2026: assigned projects × 1,000 + 0.5% of fix-client pay. From Aug 2026: 0.5% × 0.89 of the assigned rep’s final total (sum of each range’s total amount × FX).",
    appliesTo: "Sales Team Lead Salaries (Hammad)",
  },

  // ---- Payroll — Executive ----
  {
    id: "exec-total",
    section: "Payroll — Executive",
    title: "Total Salary",
    expression: "Total Salary = Basic Salary + Commission",
    appliesTo: "Income Statement → Team Salaries → Executive Salaries",
  },
  {
    id: "exec-due",
    section: "Payroll — Executive",
    title: "Total Due (Head Amount)",
    expression:
      "Amount due = Basic + Commission + Loan+ve − Loan−ve + Occasional − PF (Apply PF 8% of basic, default ON)",
    appliesTo: "Income Statement → Team Salaries → Executive (head amount / Total Due)",
  },
  {
    id: "exec-comm",
    section: "Payroll — Executive",
    title: "Commission (from Net Profit)",
    expression:
      "Commission = % of Net Profit · Mohsin 15% · Sharjeel 7.5% · Talha 7.5% · Irtaza 7.5% · commission is 0 on a loss · remaining profit stays with the company",
    appliesTo: "Executive employee commissions",
  },
  {
    id: "exec-base",
    section: "Payroll — Executive",
    title: "Commission Base",
    expression:
      "Base = Revenue − (all expenses except Executive Salaries) — avoids circular calculation",
    appliesTo: "Net profit base for executive commission",
  },
];

/** Section order — unique sections from builtins, in registry order. */
export const FORMULA_SECTIONS: string[] = [...new Set(BUILTIN_FORMULAS.map(f => f.section))];

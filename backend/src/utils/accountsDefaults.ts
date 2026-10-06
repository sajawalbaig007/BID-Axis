import { defaultSalesPayrollData } from "./salesPayrollDefaults";
import { defaultTechnicalPayrollData } from "./technicalPayrollDefaults";

export type AccountsPageKey =
  | "dashboard"
  | "balance_sheet"
  | "income_statement"
  | "cash_flow"
  | "total_assets"
  | "sales_payroll"
  | "technical_payroll"
  | "income_budget";

export function isAccountsPageKey(v: string): v is AccountsPageKey {
  return (
    v === "dashboard" ||
    v === "balance_sheet" ||
    v === "income_statement" ||
    v === "cash_flow" ||
    v === "total_assets" ||
    v === "sales_payroll" ||
    v === "technical_payroll" ||
    v === "income_budget"
  );
}

export function toPrismaAccountsPage(key: AccountsPageKey): AccountsPageKey {
  return key;
}

function rid(prefix: string, n: number) {
  return `${prefix}-${n}`;
}

export function defaultAccountsData(page: AccountsPageKey): Record<string, unknown> {
  switch (page) {
    case "dashboard":
      return {
        currency: {
          tabs: {
            AH: {
              usdAmount: 0,
              cadAmount: 0,
              pkrAmount: 0,
              usdToPkrRate: 285,
              cadToPkrRate: 204,
              usdTaxFactor: 0.89,
              cadTaxFactor: 0.89,
            },
            SN: {
              usdAmount: 0,
              cadAmount: 0,
              pkrAmount: 0,
              usdToPkrRate: 285,
              cadToPkrRate: 196,
              usdTaxFactor: 0.89,
              cadTaxFactor: 0.945,
            },
            CHQ: {
              usdAmount: 0,
              cadAmount: 0,
              pkrAmount: 0,
              usdToPkrRate: 1,
              cadToPkrRate: 1,
              usdTaxFactor: 1,
              cadTaxFactor: 1,
              taxDeductionRate: 0.25,
            },
            HM: {
              usdAmount: 0,
              cadAmount: 0,
              pkrAmount: 0,
              usdToPkrRate: 1,
              cadToPkrRate: 1,
              usdTaxFactor: 1,
              cadTaxFactor: 1,
              taxDeductionRate: 0.01,
            },
          },
        },
        formulas: { overrides: {}, custom: [] },
      };

    case "balance_sheet":
      return {
        assetSections: [
          {
            id: rid("as", 1),
            title: "Non-Current Assets",
            items: [
              { id: rid("a", 1), label: "Property, Plant & Equipment", note: "1", amount: 0 },
              { id: rid("a", 2), label: "Intangible Assets", note: "2", amount: 0 },
              { id: rid("a", 3), label: "Investments", note: "3", amount: 0 },
              { id: rid("a", 4), label: "Other Non-Current Assets", note: "4", amount: 0 },
            ],
          },
          {
            id: rid("as", 2),
            title: "Current Assets",
            items: [
              { id: rid("a", 5), label: "Inventories", note: "5", amount: 0 },
              { id: rid("a", 6), label: "Investments", note: "6", amount: 0 },
              { id: rid("a", 7), label: "Trade Receivables", note: "7", amount: 0 },
              { id: rid("a", 8), label: "Cash and Cash Equivalents", note: "8", amount: 0 },
              { id: rid("a", 9), label: "Other Current Assets", note: "9", amount: 0 },
            ],
          },
        ],
        equityLiabilitySections: [
          {
            id: rid("es", 1),
            title: "Equity",
            items: [
              { id: rid("e", 1), label: "Share Capital", note: "10", amount: 0 },
              { id: rid("e", 2), label: "Retained Earnings", note: "11", amount: 0 },
              { id: rid("e", 3), label: "Other Equity", note: "12", amount: 0 },
            ],
          },
          {
            id: rid("es", 2),
            title: "Non-Current Liabilities",
            items: [
              { id: rid("e", 4), label: "Long-Term Borrowings", note: "13", amount: 0 },
              { id: rid("e", 5), label: "Long-Term Provisions", note: "14", amount: 0 },
              { id: rid("e", 6), label: "Deferred Tax Liabilities (Net)", note: "15", amount: 0 },
              { id: rid("e", 7), label: "Other Non-Current Liabilities", note: "16", amount: 0 },
            ],
          },
          {
            id: rid("es", 3),
            title: "Current Liabilities",
            items: [
              { id: rid("e", 8), label: "Short-Term Borrowings", note: "17", amount: 0 },
              { id: rid("e", 9), label: "Trade Payables", note: "18", amount: 0 },
              { id: rid("e", 10), label: "Other Current Liabilities", note: "19", amount: 0 },
              { id: rid("e", 11), label: "Short-Term Provisions", note: "20", amount: 0 },
            ],
          },
        ],
      };

    case "income_statement": {
      const sub = (prefix: string, n: number, label: string, amount: number) => ({
        id: rid(prefix, n),
        label,
        amount,
        filledAt: "",
      });
      const execSub = (prefix: string, n: number, label: string, commissionPct: number) => ({
        id: rid(prefix, n),
        label,
        amount: 0,
        filledAt: "",
        salary: {
          basic: 0,
          commissionPct,
          loanPositive: 0,
          loanNegative: 0,
          remarks: "",
        },
      });
      return {
        totalRevenue: 0,
        teamSalaries: [
          {
            id: rid("t", 1),
            team: "Technical Team Salaries",
            totalSalary: 0,
            subHeads: [
              sub("ts", 1, "Noman Khan", 0),
              sub("ts", 2, "Muhammad Abdullah", 0),
              sub("ts", 3, "Rizwan Sabir", 0),
              sub("ts", 4, "Usama Jameel", 0),
              sub("ts", 5, "Khaldoon Abrar", 0),
              sub("ts", 6, "Muhammad Zaid", 0),
              sub("ts", 7, "Muhammad Bariq", 0),
              sub("ts", 8, "Afaq", 0),
            ],
          },
          {
            id: rid("t", 2),
            team: "Sales Team Salaries",
            totalSalary: 0,
            subHeads: [
              sub("ss", 2, "Huraira", 0),
              sub("ss", 3, "Faris", 0),
              sub("ss", 4, "Ali", 0),
              sub("ss", 5, "Faizan", 0),
              sub("ss", 6, "Asim", 0),
              sub("ss", 7, "Anam", 0),
            ],
          },
          {
            id: rid("t", 6),
            team: "Sales Team Lead Salaries",
            totalSalary: 0,
            subHeads: [],
          },
          {
            id: rid("t", 3),
            team: "Email Marketing Team Salaries",
            totalSalary: 0,
            subHeads: [
              sub("es", 1, "Aftab", 0),
            ],
          },
          {
            id: rid("t", 4),
            team: "Administration Salaries",
            totalSalary: 0,
            subHeads: [
              sub("as", 1, "Qasim (Admin)", 0),
              sub("as", 2, "Shakeela (HR)", 0),
              sub("as", 3, "Attiq Rehman (Account Officer)", 0),
              sub("as", 4, "Muhammad Bilal (Accounts Officer)", 0),
              sub("as", 5, "Mr. Noreed (Chartered)", 0),
              sub("as", 6, "Hamza (Floor Manager)", 0),
              sub("as", 7, "Mahnoor", 0),
              sub("as", 8, "Office Boy", 0),
              sub("as", 9, "Guard", 0),
            ],
          },
          {
            id: rid("t", 7),
            team: "BIM Modeler Salaries",
            totalSalary: 0,
            subHeads: [
              sub("bm", 1, "Ahmad Nadeem", 0),
            ],
          },
          {
            id: rid("t", 8),
            team: "Dev Salaries",
            totalSalary: 0,
            subHeads: [
              sub("dv", 1, "Ahmer Shah", 0),
              sub("dv", 2, "Sajawal", 0),
            ],
          },
          {
            id: rid("t", 5),
            team: "Executive Salaries",
            totalSalary: 0,
            subHeads: [
              execSub("xs", 1, "Mr. Mohsin Qayyum", 15),
              execSub("xs", 2, "Mr. Sharjeel Nasir", 7.5),
              execSub("xs", 3, "Mr. Talha Ahmed", 7.5),
              execSub("xs", 4, "Irtaza Hassan", 7.5),
            ],
          },
        ],
        opexHeads: [
          {
            id: rid("o", 1),
            label: "Office Management Expenses",
            amount: 0,
            subHeads: [
              sub("om", 1, "BEM Rent & Electricity Bill", 0),
            ],
          },
          {
            id: rid("o", 2),
            label: "IT Equipments Expenses",
            amount: 0,
            subHeads: [],
          },
          {
            id: rid("o", 3),
            label: "Regular IT Expenses",
            amount: 0,
            subHeads: [
              sub("it", 1, "Ptcl Bill payment", 0),
              sub("it", 2, "Claude payment hamza bhai", 0),
              sub("it", 3, "Devcon server", 0),
              sub("it", 4, "Zoom payment devcon", 0),
              sub("it", 5, "Zoom payment of two dialer", 0),
              sub("it", 6, "Storm fibre bill payment", 0),
              sub("it", 7, "LLC Tax Payment", 0),
              sub("it", 8, "100 CAD shopdrawing structure review", 0),
              sub("it", 9, "Gmails monthly payments", 0),
            ],
          },
          {
            id: rid("o", 4),
            label: "Outsourcing Expenses",
            amount: 0,
            subHeads: [],
          },
          {
            id: rid("o", 5),
            label: "Asset Purchasing Expenses",
            amount: 0,
            subHeads: [],
          },
          {
            id: rid("o", 6),
            label: "Miscellaneous Expenses",
            amount: 0,
            subHeads: [
              sub("misc", 1, "Kitchen Grocery", 0),
              sub("misc", 2, "Notepad, Ballpen", 0),
              sub("misc", 3, "Hand wash", 0),
              sub("misc", 4, "Tissue boxes and rolls", 0),
            ],
          },
        ],
        loanHeads: [
          {
            id: rid("ln", 1),
            label: "Loan Issued",
            amount: 0,
            subHeads: [],
          },
        ],
        providentFundHeads: [
          {
            id: rid("pf", 1),
            label: "Sales Team PF",
            amount: 0,
            subHeads: [
              sub("pfs", 1, "Hammad", 0),
              sub("pfs", 2, "Huraira", 0),
              sub("pfs", 3, "Faris", 0),
              sub("pfs", 4, "Ali", 0),
              sub("pfs", 5, "Faizan", 0),
              sub("pfs", 6, "Asim", 0),
              sub("pfs", 7, "Anam", 0),
            ],
          },
          {
            id: rid("pf", 2),
            label: "Administration PF",
            amount: 0,
            subHeads: [
              sub("pfa", 1, "Qasim (Admin)", 0),
              sub("pfa", 2, "Shakeela (HR)", 0),
              sub("pfa", 3, "Attiq Rehman (Account Officer)", 0),
              sub("pfa", 4, "Muhammad Bilal (Accounts Officer)", 0),
              sub("pfa", 5, "Hamza (Floor Manager)", 0),
              sub("pfa", 6, "Sajawal", 0),
              sub("pfa", 7, "Ahmer", 0),
              sub("pfa", 8, "Mahnoor", 0),
              sub("pfa", 9, "Office Boy", 0),
              sub("pfa", 10, "Guard", 0),
            ],
          },
          {
            id: rid("pf", 3),
            label: "Technical Team PF",
            amount: 0,
            subHeads: [
              sub("pft", 1, "Muhammad Abdullah", 0),
              sub("pft", 2, "Rizwan Sabir", 0),
              sub("pft", 3, "Usama Jameel", 0),
              sub("pft", 4, "Muhammad Afaq Amin", 0),
              sub("pft", 5, "Khaldoon Abrar", 0),
              sub("pft", 6, "Muhammad Bariq", 0),
              sub("pft", 7, "Ayesha Ashraf", 0),
              sub("pft", 8, "Manal Younas", 0),
              sub("pft", 9, "Zainab Khalil", 0),
            ],
          },
        ],
      };
    }

    case "cash_flow":
      return {
        bankHeads: ["AH Paypal", "SN Paypal", "CO. Habib Metro", "Qasim Habib Metro"],
        months: [],
      };

    case "total_assets":
      return {
        companies: {
          BEM: [
            { id: rid("bem", 1), title: "IT Inventory", heads: [], total: 0, subHeads: [] },
            { id: rid("bem", 2), title: "Electrical Inventory", heads: [], total: 0, subHeads: [] },
            { id: rid("bem", 3), title: "Furniture Inventory", heads: [], total: 0, subHeads: [] },
          ],
          GPS: [
            { id: rid("gps", 1), title: "IT Inventory", heads: [], total: 0, subHeads: [] },
            { id: rid("gps", 2), title: "Global Pre-Construction Services", heads: [], total: 0, subHeads: [] },
          ],
          BDS: [
            { id: rid("bds", 1), title: "BIM Designing Studio", heads: [], total: 0, subHeads: [] },
            { id: rid("bds", 2), title: "Office Renovation & Security", heads: [], total: 0, subHeads: [] },
          ],
        },
        sections: [],
      };

    case "sales_payroll":
      return defaultSalesPayrollData() as unknown as Record<string, unknown>;

    case "technical_payroll":
      return defaultTechnicalPayrollData() as unknown as Record<string, unknown>;

    case "income_budget":
      return { quarters: [] };

    default:
      return {};
  }
}

export function isValidRecordDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

/**
 * Fast, accurate multi-page PDF for Accounts monthly executive summary.
 * Uses report JSON + autoTable (no html2canvas) so download does not hang.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatEstDateTime } from "@/lib/estTime";
import { currency } from "../types";

type SalaryFieldTable = {
  name: string;
  kind: string;
  total: number;
  filledAt?: string;
  columns: string[];
  rows: { employee: string; cells: (string | number)[] }[];
};

type OpexFieldTable = {
  name: string;
  amount: number;
  filledAt: string;
  notes: string;
  lines: { label: string; amount: number; filledAt: string; proofName: string }[];
};

export type AccountsReportPdfInput = {
  month: string;
  sourceDate?: string | null;
  daysRecorded: number;
  totals: {
    revenue: number;
    payroll: number;
    opex: number;
    loans: number;
    pf: number;
    totalCost: number;
    netProfit: number;
  };
  revenueChannels?: {
    key: string;
    label: string;
    usd: number;
    cad: number;
    pkr: number;
    netPkr: number;
  }[];
  history: { month: string; revenue: number; cost: number; net: number }[];
  salaryTables?: SalaryFieldTable[];
  opexTables?: OpexFieldTable[];
  loanTables?: OpexFieldTable[];
  pfTables?: OpexFieldTable[];
  cash: {
    banks: { bank: string; balance: number; debit?: number; credit?: number }[];
    monthNet: number;
    closingNet: number;
    monthEntries?: number;
    asOf: string | null;
  };
  csr: {
    totalProjects: number;
    rows: {
      name: string;
      projects: number;
      share: number;
      status?: string;
      note?: string;
    }[];
  };
  budgetCompare?: {
    hasBudget: boolean;
    rows: { name: string; budget: number; actual: number; variance: number }[];
    totals: {
      budgetRevenue: number;
      actualRevenue: number;
      budgetExpense: number;
      actualExpense: number;
      variance: number;
    };
  };
};

const RED: [number, number, number] = [184, 17, 45];
const NAVY: [number, number, number] = [11, 18, 32];
const MUTED: [number, number, number] = [100, 116, 139];

const pkr = (n: number) => `PKR ${currency(n)}`;
const signed = (n: number) => `${n >= 0 ? "+" : "-"}PKR ${currency(Math.abs(n))}`;

function monthLabel(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  if (!y || !mm) return m;
  return new Date(Date.UTC(y, mm - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthShort(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  if (!y || !mm) return m;
  const name = new Date(Date.UTC(y, mm - 1, 1)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `${name} '${String(y).slice(2)}`;
}

function channelForBank(bank: string): "AH" | "SN" | "QHM" | "HM" | null {
  const t = bank.trim().toLowerCase();
  if (t.includes("qasim") || t.includes("qhm")) return "QHM";
  if (/\bah\b/.test(t) || t.includes("ahmed") || t.includes("ah paypal")) return "AH";
  if (/\bsn\b/.test(t) || t.includes("sharjeel")) return "SN";
  if (t.includes("habib") || t.includes("metro")) return "HM";
  return null;
}

function cashChannelReceived(report: AccountsReportPdfInput) {
  const sums = { AH: 0, SN: 0, QHM: 0, HM: 0 };
  for (const b of report.cash.banks ?? []) {
    const key = channelForBank(b.bank);
    if (!key) continue;
    sums[key] += Number(b.debit) || 0;
  }
  return sums;
}

function buildInsights(report: AccountsReportPdfInput) {
  const idx = report.history.findIndex(h => h.month === report.month);
  const prev = idx > 0 ? report.history[idx - 1] : null;
  const net = report.totals.netProfit;
  let lossStreak = 0;
  for (let i = idx - 1; i >= 0; i--) {
    if (report.history[i].net < 0) lossStreak++;
    else break;
  }
  let profitStreak = 0;
  for (let i = idx - 1; i >= 0; i--) {
    if (report.history[i].net >= 0) profitStreak++;
    else break;
  }
  const profitNote =
    net >= 0
      ? lossStreak > 0
        ? `1st profit month after ${lossStreak} straight loss${lossStreak > 1 ? "es" : ""}`
        : "Profit month"
      : profitStreak > 0
        ? `Loss after ${profitStreak} profitable month${profitStreak > 1 ? "s" : ""}`
        : "Loss month";
  return {
    profitNote,
    revenueVsPrev: prev ? report.totals.revenue - prev.revenue : null,
    costVsPrev: prev ? report.totals.totalCost - prev.cost : null,
  };
}

function ensureSpace(doc: jsPDF, y: number, need = 28): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + need > pageH - 14) {
    doc.addPage();
    return 16;
  }
  return y;
}

function sectionTitle(doc: jsPDF, title: string, y: number): number {
  y = ensureSpace(doc, y, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(title, 14, y);
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.6);
  doc.line(14, y + 1.5, 196, y + 1.5);
  return y + 8;
}

function tableOpts(startY: number) {
  return {
    startY,
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8, cellPadding: 1.6, textColor: NAVY as [number, number, number] },
    headStyles: {
      fillColor: NAVY as [number, number, number],
      textColor: 255 as const,
      fontStyle: "bold" as const,
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
  };
}

function opexBlock(doc: jsPDF, title: string, tables: OpexFieldTable[], total: number, y: number): number {
  y = sectionTitle(doc, title, y);
  const body: (string | number)[][] = [];
  if (!tables.length) {
    body.push(["—", "—", "—", "—", "No entries this month."]);
  } else {
    for (const h of tables) {
      body.push([h.name, "", h.filledAt || "—", h.notes || "—", currency(h.amount)]);
      for (const l of h.lines) {
        body.push(["", l.label, l.filledAt || "—", l.proofName || "—", currency(l.amount)]);
      }
    }
  }
  body.push(["TOTAL", "", "", "", currency(total)]);
  autoTable(doc, {
    ...tableOpts(y),
    head: [["Head", "Individual", "Filled date", "Notes / Image", "Amount (PKR)"]],
    body,
    columnStyles: { 4: { halign: "right" } },
  });
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
}

/** Build a multi-page PDF blob with the same figures as the Reports page / Word export. */
export function buildAccountsMonthlyReportPdf(report: AccountsReportPdfInput): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const label = monthLabel(report.month);
  const ins = buildInsights(report);
  const bc = report.budgetCompare;
  const ch = cashChannelReceived(report);
  const generatedAt = formatEstDateTime(new Date());

  let y = 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...RED);
  doc.text("Executive Summary", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    `Accounts Team · ${label} · ${report.daysRecorded} day(s) recorded${
      report.sourceDate ? ` · last ${report.sourceDate}` : ""
    } · Generated ${generatedAt} · BEM Solutions CRM`,
    14,
    y,
  );
  y += 8;

  const kpiRows = [
    [
      "Targeted Revenue",
      pkr(bc?.totals.budgetRevenue ?? 0),
      bc?.hasBudget ? "Income Statement budget" : "No budget plan saved",
    ],
    [
      "Actual Revenue",
      pkr(report.totals.revenue),
      ins.revenueVsPrev != null ? `${signed(ins.revenueVsPrev)} vs prev month` : "Month collections",
    ],
    [
      "Total cost",
      pkr(report.totals.totalCost),
      report.sourceDate
        ? `Matches IS Total Expense · ${report.sourceDate}`
        : ins.costVsPrev != null
          ? `${signed(ins.costVsPrev)} vs prev month`
          : `Payroll ${pkr(report.totals.payroll)}`,
    ],
    ["Profit / Loss", signed(report.totals.netProfit), ins.profitNote],
    [
      "Net balance",
      pkr(report.cash.closingNet),
      report.cash.asOf ? `As of ${report.cash.asOf}` : "Closing cash position",
    ],
  ];
  autoTable(doc, {
    ...tableOpts(y),
    head: [["Metric", "Value", "Note"]],
    body: kpiRows,
    columnStyles: { 1: { fontStyle: "bold", halign: "right" } },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  y = sectionTitle(doc, "Company Balance — cash received", y);
  autoTable(doc, {
    ...tableOpts(y),
    head: [["Channel", "Received (PKR)"]],
    body: [
      ["AH · Ahmed Hamza", currency(ch.AH)],
      ["SN · Sharjeel Nasir", currency(ch.SN)],
      ["Qasim Habib Metro", currency(ch.QHM)],
      ["Habib Metro", currency(ch.HM)],
    ],
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  y = sectionTitle(doc, `Budget plan vs actual — ${label}`, y);
  if (!bc?.hasBudget) {
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("No Income Statement budget saved for this month.", 14, y);
    y += 8;
  } else {
    autoTable(doc, {
      ...tableOpts(y),
      head: [["Head", "Planned", "Actual", "Variance", "Status"]],
      body: [
        ...bc.rows.map(r => [
          r.name,
          currency(r.budget),
          currency(r.actual),
          signed(r.variance),
          r.variance > 0 ? "OVER" : r.variance < 0 ? "UNDER" : "ON PLAN",
        ]),
        [
          "EXPENSE TOTAL",
          currency(bc.totals.budgetExpense),
          currency(bc.totals.actualExpense),
          signed(bc.totals.variance),
          bc.totals.variance > 0 ? "OVER" : bc.totals.variance < 0 ? "UNDER" : "ON PLAN",
        ],
      ],
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "center" },
      },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  const hist3 = report.history.slice(-3);
  const histTotal = report.history.reduce(
    (a, h) => ({ revenue: a.revenue + h.revenue, cost: a.cost + h.cost, net: a.net + h.net }),
    { revenue: 0, cost: 0, net: 0 },
  );
  const hist3Total = hist3.reduce(
    (a, h) => ({ revenue: a.revenue + h.revenue, cost: a.cost + h.cost, net: a.net + h.net }),
    { revenue: 0, cost: 0, net: 0 },
  );

  y = sectionTitle(doc, "Financial performance — last 3 months", y);
  autoTable(doc, {
    ...tableOpts(y),
    head: [["Month", "Revenue", "Total Cost", "Net P/L", "Status"]],
    body: [
      ...hist3.map(h => [
        monthShort(h.month) + (h.month === report.month ? " ●" : ""),
        currency(h.revenue),
        currency(h.cost),
        signed(h.net),
        h.net >= 0 ? "Profit" : "Loss",
      ]),
      ["TOTAL", currency(hist3Total.revenue), currency(hist3Total.cost), signed(hist3Total.net), hist3Total.net >= 0 ? "Profit" : "Loss"],
    ],
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "center" },
    },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  y = sectionTitle(doc, "Financial performance — last 6 months", y);
  autoTable(doc, {
    ...tableOpts(y),
    head: [["Month", "Revenue", "Total Cost", "Net P/L", "Status"]],
    body: [
      ...report.history.map(h => [
        monthShort(h.month) + (h.month === report.month ? " ●" : ""),
        currency(h.revenue),
        currency(h.cost),
        signed(h.net),
        h.net >= 0 ? "Profit" : "Loss",
      ]),
      ["TOTAL", currency(histTotal.revenue), currency(histTotal.cost), signed(histTotal.net), histTotal.net >= 0 ? "Profit" : "Loss"],
    ],
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "center" },
    },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  y = sectionTitle(doc, "Revenue — currency channels", y);
  const channels = report.revenueChannels ?? [];
  autoTable(doc, {
    ...tableOpts(y),
    head: [["Channel", "USD", "CAD", "PKR", "Net PKR"]],
    body: [
      ...channels.map(c => [c.label, currency(c.usd), currency(c.cad), currency(c.pkr), currency(c.netPkr)]),
      [
        "TOTAL REVENUE",
        currency(channels.reduce((a, c) => a + c.usd, 0)),
        currency(channels.reduce((a, c) => a + c.cad, 0)),
        currency(channels.reduce((a, c) => a + c.pkr, 0)),
        currency(report.totals.revenue),
      ],
    ],
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right", fontStyle: "bold" },
    },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  y = sectionTitle(doc, `Cash flow statement${report.cash.asOf ? ` — as of ${report.cash.asOf}` : ""}`, y);
  autoTable(doc, {
    ...tableOpts(y),
    head: [["Item", "Amount"]],
    body: [
      [`Net Cash Flow (${report.cash.monthEntries ?? 0} entries · ${label})`, currency(report.cash.monthNet)],
      ["AH received", currency(ch.AH)],
      ["SN received", currency(ch.SN)],
      ["Qasim Habib Metro received", currency(ch.QHM)],
      ["Habib Metro received", currency(ch.HM)],
      ["Closing net balance", currency(report.cash.closingNet)],
    ],
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  y = sectionTitle(doc, `CSR team performance — ${label}`, y);
  autoTable(doc, {
    ...tableOpts(y),
    head: [["CSR", "Projects", "Share %", "Status", "Note"]],
    body: [
      ...(report.csr.rows.length
        ? report.csr.rows.map(r => [
            r.name,
            String(r.projects),
            `${r.share.toFixed(1)}%`,
            r.status || (r.projects > 0 ? "Active" : "Below Expectation"),
            r.note || "—",
          ])
        : [["—", "0", "—", "—", "No sales / team-lead CSRs recorded this month."]]),
      ["TOTAL", String(report.csr.totalProjects), "100%", "", ""],
    ],
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "center" },
    },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  const salaryTables = report.salaryTables ?? [];
  if (!salaryTables.length) {
    y = sectionTitle(doc, `Team salaries (${pkr(report.totals.payroll)})`, y);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("No employees on the latest Income Statement for this month.", 14, y);
    y += 8;
  } else {
    for (const t of salaryTables) {
      y = sectionTitle(doc, `${t.name} (${pkr(t.total)})`, y);
      autoTable(doc, {
        ...tableOpts(y),
        head: [t.columns],
        body: [
          ...t.rows.map(r =>
            r.cells.map((c, i) => {
              const col = t.columns[i] ?? "";
              if (typeof c === "number") return /%/.test(col) ? `${c}%` : currency(c);
              return String(c);
            }),
          ),
          [
            "TOTAL",
            ...Array.from({ length: Math.max(t.columns.length - 2, 0) }, () => ""),
            currency(t.total),
          ].slice(0, t.columns.length),
        ],
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
  }

  y = opexBlock(doc, `Operating expenses (${pkr(report.totals.opex)})`, report.opexTables ?? [], report.totals.opex, y);
  y = opexBlock(doc, `Loans (${pkr(report.totals.loans)})`, report.loanTables ?? [], report.totals.loans, y);
  y = opexBlock(doc, `Provident fund (${pkr(report.totals.pf)})`, report.pfTables ?? [], report.totals.pf, y);

  y = ensureSpace(doc, y, 12);
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(
    `Auto-generated from CRM accounts daily records, cash flow & payroll. ${report.daysRecorded} income-statement day(s) in ${label}.`,
    14,
    y,
  );

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`BEM Solutions CRM · Accounts Report · ${label} · Page ${i} of ${pageCount}`, 14, 287);
  }

  return doc.output("blob");
}

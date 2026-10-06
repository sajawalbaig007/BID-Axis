/**
 * Premium salary-slip PDF layouts:
 * - gps_technical  → GPS / technical team
 * - bem_sales      → BEM sales + team lead
 * - bem_csr_full   → BEM CSR / admin / executive
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { SalarySlipCompany } from "./salarySlipCompanies";
import { formatEstDateShort } from "@/lib/estTime";
import {
  BEM_NAVY,
  BEM_RED,
  earningsTotal,
  fitLogoBox,
  formatSlipSignedAt,
  loadLogoForPdf,
  money,
  slipNetPayment,
  type JsPdfWithAutoTable,
  type SalarySlipPayload,
} from "./salarySlipShared";

const M = 12;
const FOOTER_H = 20;
const SIG_H = 32;
const SLIP_FOOTER_TEL = "Tel: 0323-6431991";
const SLIP_FOOTER_ADDRESS = "425, J-03 Block, Phase 2 Johar Town, Lahore";

type Rgb = [number, number, number];

type SlipTheme = {
  id: "bem" | "gps";
  header: Rgb;
  headerInk: Rgb;
  /** Top of header + top of footer — same color */
  bar: Rgb;
  accent: Rgb;
  accentSoft: Rgb;
  ink: Rgb;
  muted: Rgb;
  paper: Rgb;
  card: Rgb;
  line: Rgb;
  tableHead: Rgb;
  tableHeadText: Rgb | 255;
  deductHead: Rgb;
  zebra: Rgb;
  netBg: Rgb;
  netInk: Rgb;
  thankYou: boolean;
  showApproval: boolean;
  fieldBoxes: boolean;
};

const BEM_THEME: SlipTheme = {
  id: "bem",
  header: BEM_NAVY,
  headerInk: [255, 255, 255],
  bar: BEM_RED,
  accent: BEM_RED,
  accentSoft: [255, 241, 243],
  ink: [22, 22, 24],
  muted: [100, 100, 108],
  paper: [252, 251, 249],
  card: [255, 255, 255],
  line: [228, 224, 220],
  tableHead: BEM_NAVY,
  tableHeadText: 255,
  deductHead: BEM_RED,
  zebra: [250, 247, 245],
  netBg: BEM_RED,
  netInk: [255, 255, 255],
  thankYou: true,
  showApproval: false,
  fieldBoxes: false,
};

const BEM_CSR_THEME: SlipTheme = {
  ...BEM_THEME,
  showApproval: true,
  fieldBoxes: true,
};

const GPS_NAVY: Rgb = [0, 27, 68];

const GPS_THEME: SlipTheme = {
  id: "gps",
  header: GPS_NAVY,
  headerInk: [255, 255, 255],
  bar: [43, 87, 151],
  accent: [43, 87, 151],
  accentSoft: [235, 244, 255],
  ink: [15, 23, 42],
  muted: [71, 85, 105],
  paper: [248, 250, 252],
  card: [255, 255, 255],
  line: [203, 213, 225],
  tableHead: [219, 234, 254],
  tableHeadText: [15, 57, 138],
  deductHead: GPS_NAVY,
  zebra: [241, 245, 249],
  netBg: GPS_NAVY,
  netInk: [255, 255, 255],
  thankYou: false,
  showApproval: false,
  fieldBoxes: false,
};

function pkr(n: number): string {
  return `PKR ${money(n)}`;
}

function slipRef(payload: SalarySlipPayload): string {
  const code = String(payload.employeeId || "")
    .trim()
    .replace(/[^\w./-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fromName = (payload.employeeName || "EMP")
    .trim()
    .replace(/[^\w]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const id = (code || fromName || "EMP").toUpperCase();
  const period = (payload.monthCompact || payload.monthLabel).replace(/\s+/g, "-");
  return `SL-${period}-${id}`;
}

function issuedOn(): string {
  return formatEstDateShort(new Date());
}

function drawWatermark(doc: JsPdfWithAutoTable, theme: SlipTheme) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  try {
    const GState = (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState;
    const setGState = (doc as unknown as { setGState: (g: unknown) => void }).setGState;
    if (GState && setGState) {
      setGState(new GState({ opacity: 0.045 }));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(52);
      doc.setTextColor(...theme.accent);
      doc.text("CONFIDENTIAL", pageW / 2, pageH / 2 + 8, { align: "center", angle: 32 });
      setGState(new GState({ opacity: 1 }));
    }
  } catch {
    /* older jsPDF — skip watermark */
  }
}

function drawFooterBar(doc: JsPdfWithAutoTable, company: SalarySlipCompany, theme: SlipTheme) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const footerY = pageH - FOOTER_H;
  doc.setFillColor(...theme.header);
  doc.rect(0, footerY, pageW, FOOTER_H, "F");
  doc.setFillColor(...theme.bar);
  doc.rect(0, footerY, pageW, 2.4, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(company.legalName || "Salary Slip", M, footerY + 6.2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(230, 230, 230);
  doc.text(SLIP_FOOTER_TEL, M, footerY + 11);
  doc.text(SLIP_FOOTER_ADDRESS, M, footerY + 15.8);

  const rightBits = [company.website, company.email].filter(Boolean);
  if (rightBits.length) {
    doc.setFontSize(6.8);
    doc.text(rightBits.join("  ·  "), pageW - M, footerY + 11, { align: "right" });
  }
  doc.setFontSize(6.2);
  doc.setTextColor(190, 190, 196);
  doc.text("Computer generated payslip", pageW - M, footerY + 15.8, { align: "right" });
}

function drawPageChrome(
  doc: JsPdfWithAutoTable,
  company: SalarySlipCompany,
  theme: SlipTheme,
  continued = false,
) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Full paper fill only on a blank page — never after autoTable has drawn rows.
  if (!continued) {
    doc.setFillColor(...theme.paper);
    doc.rect(0, 0, pageW, pageH, "F");
    drawWatermark(doc, theme);
  }

  doc.setFillColor(...theme.bar);
  doc.rect(0, 0, pageW, 2.4, "F");

  if (continued) {
    doc.setFillColor(...theme.header);
    doc.rect(0, 2.4, pageW, 10, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("PAYSLIP  ·  continued", M, 9);
  }

  drawFooterBar(doc, company, theme);
}

function dropExtraPages(doc: JsPdfWithAutoTable) {
  while (doc.getNumberOfPages() > 1) {
    doc.deletePage(doc.getNumberOfPages());
  }
}

async function drawHeaderBand(
  doc: JsPdfWithAutoTable,
  payload: SalarySlipPayload,
  company: SalarySlipCompany,
  theme: SlipTheme,
): Promise<number> {
  const pageW = doc.internal.pageSize.getWidth();
  const headerH = 32;
  doc.setFillColor(...theme.header);
  doc.rect(0, 2.4, pageW, headerH, "F");

  const maxLogoW = theme.id === "gps" ? 54 : 38;
  const maxLogoH = 18;
  let logoW = 0;
  let logoH = 0;
  if (company.logoUrl) {
    const fitted = await (async () => {
      const logo = await loadLogoForPdf(company.logoUrl!, { stripWhite: true });
      if (!logo) return { w: 0, h: 0, dataUrl: "", format: "PNG" as const };
      const box = fitLogoBox(logo.width, logo.height, maxLogoW, maxLogoH);
      return { ...box, dataUrl: logo.dataUrl, format: logo.format };
    })();
    logoW = fitted.w;
    logoH = fitted.h;
    if (logoW > 0) {
      const plateX = M - 1.2;
      const plateY = 6.2;
      const plateW = logoW + 4.4;
      const plateH = Math.max(logoH + 4, 20);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(plateX, plateY, plateW, plateH, 1.4, 1.4, "F");
      doc.addImage(fitted.dataUrl, fitted.format, M + 1, plateY + (plateH - logoH) / 2, logoW, logoH);
      logoW = plateW;
    }
  }

  const textX = M + (logoW > 0 ? logoW + 6 : 0);
  const title = company.legalName.toUpperCase();
  const maxTitleW = Math.max(36, pageW - M - textX - 62);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(title.length > 28 ? 7.6 : 10);
  doc.setTextColor(...theme.headerInk);
  const titleLines = doc.splitTextToSize(title, maxTitleW);
  doc.text(titleLines, textX, titleLines.length > 1 ? 14.6 : 18.4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...theme.headerInk);
  doc.text("PAYSLIP", pageW - M, 13, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(theme.id === "bem" ? 255 : 191, theme.id === "bem" ? 200 : 219, theme.id === "bem" ? 205 : 254);
  doc.text("CONFIDENTIAL  ·  FOR EMPLOYEE USE", pageW - M, 19, { align: "right" });

  const pill = payload.monthLabel;
  const pillW = Math.max(32, doc.getTextWidth(pill) + 10);
  const pillX = pageW - M - pillW;
  doc.setFillColor(...theme.accent);
  doc.roundedRect(pillX, 22.4, pillW, 7.6, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.8);
  doc.setTextColor(255, 255, 255);
  doc.text(pill, pillX + pillW / 2, 27.4, { align: "center" });

  return 2.4 + headerH + 3.5;
}

function drawMetaRow(
  doc: JsPdfWithAutoTable,
  payload: SalarySlipPayload,
  theme: SlipTheme,
  y: number,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const w = pageW - M * 2;
  const h = 12;
  doc.setFillColor(...theme.card);
  doc.setDrawColor(...theme.line);
  doc.setLineWidth(0.25);
  doc.roundedRect(M, y, w, h, 1.8, 1.8, "FD");

  const cells: [string, string][] = [
    ["Document No.", slipRef(payload)],
    ["Pay period", payload.monthLabel],
    ["Issued", issuedOn()],
    ["Currency", "PKR"],
  ];
  const cellW = w / cells.length;
  cells.forEach(([label, value], i) => {
    const x = M + i * cellW;
    if (i > 0) {
      doc.setDrawColor(...theme.line);
      doc.line(x, y + 2, x, y + h - 2);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(...theme.muted);
    doc.text(label.toUpperCase(), x + 4, y + 4.2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...theme.ink);
    doc.text(value, x + 4, y + 9);
  });
  return y + h + 3.5;
}

function drawEmployeeCard(
  doc: JsPdfWithAutoTable,
  payload: SalarySlipPayload,
  theme: SlipTheme,
  y: number,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const w = pageW - M * 2;
  const rows: [string, string][] = [
    ["Employee name", payload.employeeName || "—"],
    ["Employee ID", payload.employeeId || "—"],
    ["Phone", payload.phone || "—"],
    ["CNIC", payload.cnic || "—"],
    ["Address", payload.address || "—"],
  ];
  if (payload.projectCount != null) {
    rows.push(["No. of projects", `${Math.max(0, Number(payload.projectCount) || 0)}`]);
  }

  const cols = 2;
  const rowH = 10.5;
  const gridRows = Math.ceil(rows.length / cols);
  const h = 8 + gridRows * rowH + (theme.fieldBoxes ? 1 : 0);

  doc.setFillColor(...theme.card);
  doc.setDrawColor(...theme.line);
  doc.setLineWidth(0.25);
  doc.roundedRect(M, y, w, h, 2, 2, "FD");
  doc.setFillColor(...theme.accent);
  doc.rect(M, y, 1.6, h, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...theme.accent);
  doc.text("EMPLOYEE DETAILS", M + 6, y + 5.2);

  rows.forEach(([label, value], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = M + 6 + col * (w / cols);
    const yy = y + 8.6 + row * rowH;
    const maxW = w / cols - 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(...theme.muted);
    doc.text(label.toUpperCase(), x, yy);
    if (theme.fieldBoxes) {
      doc.setFillColor(...theme.accentSoft);
      doc.roundedRect(x - 1, yy + 1.1, maxW, 6.2, 0.8, 0.8, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(...theme.ink);
    const lines = doc.splitTextToSize(value, maxW);
    doc.text(Array.isArray(lines) ? lines[0] : lines, x, yy + 5.2);
  });

  return y + h + 4;
}

function earningsDeductionTables(
  doc: JsPdfWithAutoTable,
  payload: SalarySlipPayload,
  y: number,
  theme: SlipTheme,
) {
  const pageW = doc.internal.pageSize.getWidth();
  const earningsSum = earningsTotal(payload.earnings);
  const deductionsTotalAmt = payload.deductions.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const mid = pageW / 2;
  const colW = mid - M - 2;
  const bottom = FOOTER_H + 2;
  const tablePad = { font: "helvetica" as const, lineColor: theme.line, lineWidth: 0.2, cellPadding: 1.85 };

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: mid + 2, bottom },
    tableWidth: colW,
    pageBreak: "avoid",
    head: [
      [{ content: "EARNINGS", colSpan: 3, styles: { halign: "center" } }],
      ["Description", "Qty / Days", "Amount (PKR)"],
    ],
    body: [
      ...payload.earnings.map(r => [
        r.indent ? `    ${r.label}` : r.label,
        r.indent ? "" : r.qty || "—",
        money(r.amount),
      ]),
      [{ content: "Total earnings", colSpan: 2, styles: { fontStyle: "bold" } }, money(earningsSum)],
    ],
    theme: "grid",
    styles: tablePad,
    headStyles: {
      fillColor: theme.tableHead,
      textColor: theme.tableHeadText,
      fontSize: 7.4,
      fontStyle: "bold",
      halign: "center",
    },
    bodyStyles: { fontSize: 7.6, textColor: theme.ink },
    alternateRowStyles: { fillColor: theme.zebra },
    columnStyles: {
      0: { cellWidth: colW * 0.48, halign: "left" },
      1: { cellWidth: colW * 0.22, halign: "center" },
      2: { cellWidth: colW * 0.3, halign: "right" },
    },
    didParseCell: data => {
      if (data.section === "body" && data.row.index === payload.earnings.length) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = theme.accentSoft;
        data.cell.styles.textColor = theme.ink;
      }
      const earn = payload.earnings[data.row.index];
      if (data.section === "body" && earn?.indent) {
        data.cell.styles.fontSize = 6.8;
        data.cell.styles.textColor = theme.muted;
        if (data.column.index === 0) data.cell.styles.fontStyle = "italic";
      }
    },
  });

  const leftY = doc.lastAutoTable?.finalY ?? y;

  autoTable(doc, {
    startY: y,
    margin: { left: mid + 2, right: M, bottom },
    tableWidth: colW,
    pageBreak: "avoid",
    head: [
      [{ content: "DEDUCTIONS", colSpan: 2, styles: { halign: "center" } }],
      ["Description", "Amount (PKR)"],
    ],
    body: [
      ...payload.deductions.map(r => [r.label, money(r.amount)]),
      [{ content: "Total deductions", styles: { fontStyle: "bold" } }, money(deductionsTotalAmt)],
    ],
    theme: "grid",
    styles: tablePad,
    headStyles: {
      fillColor: theme.deductHead,
      textColor: 255,
      fontSize: 7.4,
      fontStyle: "bold",
      halign: "center",
    },
    bodyStyles: { fontSize: 7.6, textColor: theme.ink },
    alternateRowStyles: { fillColor: theme.zebra },
    columnStyles: {
      0: { cellWidth: colW * 0.64, halign: "left" },
      1: { cellWidth: colW * 0.36, halign: "right" },
    },
    didParseCell: data => {
      if (data.section === "body" && data.row.index === payload.deductions.length) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = theme.accentSoft;
        data.cell.styles.textColor = theme.ink;
      }
    },
  });

  const rightY = doc.lastAutoTable?.finalY ?? y;
  return { y: Math.max(leftY, rightY) + 5, earningsSum, deductionsTotalAmt };
}

function drawKpiStrip(
  doc: JsPdfWithAutoTable,
  y: number,
  earningsSum: number,
  deductionsTotalAmt: number,
  netPay: number,
  occasional: number,
  theme: SlipTheme,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const gap = 3;
  const w = (pageW - M * 2 - gap * 2) / 3;
  const h = 16;
  const cards: { label: string; value: string; bg: Rgb; ink: Rgb }[] = [
    { label: "Total earnings", value: pkr(earningsSum), bg: theme.accentSoft, ink: theme.ink },
    { label: "Total deductions", value: pkr(deductionsTotalAmt), bg: [254, 242, 242], ink: BEM_RED },
    { label: occasional > 0 ? "Net payment (incl. occasional)" : "Net payment", value: pkr(netPay), bg: theme.netBg, ink: theme.netInk },
  ];

  cards.forEach((c, i) => {
    const x = M + i * (w + gap);
    doc.setFillColor(...c.bg);
    doc.roundedRect(x, y, w, h, 2, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    doc.setTextColor(...(c.ink[0] > 200 ? ([230, 230, 230] as Rgb) : theme.muted));
    doc.text(c.label.toUpperCase(), x + 4, y + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...c.ink);
    doc.text(c.value, x + 4, y + 11.6);
  });
  return y + h + 4;
}

function drawPfAndOccasional(
  doc: JsPdfWithAutoTable,
  payload: SalarySlipPayload,
  y: number,
  theme: SlipTheme,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const empPf = Number(payload.employeePf) || 0;
  const erPf = payload.employerPf != null ? Number(payload.employerPf) : empPf;
  const occasional = Math.max(0, Number(payload.occasionalAmount) || 0);
  const bits: string[] = [
    `Employee PF  ${pkr(empPf)}`,
    `Employer PF  ${pkr(erPf)}`,
  ];
  if (occasional > 0) {
    const note = payload.occasionalRemark?.trim();
    bits.push(`Occasional (added to net, no deduction)  ${pkr(occasional)}${note ? `  ·  ${note}` : ""}`);
  }

  doc.setFillColor(...theme.card);
  doc.setDrawColor(...theme.line);
  doc.roundedRect(M, y, pageW - M * 2, 9, 1.6, 1.6, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(...theme.muted);
  doc.text(bits.join("     ·     "), M + 4, y + 5.6);
  return y + 13;
}

function drawComments(
  doc: JsPdfWithAutoTable,
  payload: SalarySlipPayload,
  y: number,
  theme: SlipTheme,
  extraH = 0,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const text = payload.comments?.trim() || "No comments for this period.";
  const lines = doc.splitTextToSize(text, pageW - M * 2 - 10) as string[];
  const h = Math.max(16, 9 + lines.length * 4.2) + extraH;

  doc.setFillColor(...theme.card);
  doc.setDrawColor(...theme.line);
  doc.roundedRect(M, y, pageW - M * 2, h, 1.8, 1.8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...theme.accent);
  doc.text("REMARKS", M + 4, y + 4.8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...theme.ink);
  doc.text(lines, M + 4, y + 10);
  return y + h + 4;
}

async function drawSignatures(
  doc: JsPdfWithAutoTable,
  payload: SalarySlipPayload,
  y: number,
  theme: SlipTheme,
  h = SIG_H,
): Promise<number> {
  const pageW = doc.internal.pageSize.getWidth();
  const boxW = Math.min(96, pageW - M * 2);
  const x = pageW - M - boxW;
  const sig = await loadLogoForPdf("/images/hr-signature.png", { stripWhite: true });
  const stamp = formatSlipSignedAt(payload.signedAt);

  doc.setDrawColor(...theme.line);
  doc.setFillColor(...theme.card);
  doc.roundedRect(x, y, boxW, h, 1.8, 1.8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...theme.muted);
  doc.text("FOR THE COMPANY", x + 4, y + 5.2);

  if (sig) {
    const box = fitLogoBox(sig.width, sig.height, boxW - 20, Math.max(10, h - 18));
    const imgX = x + (boxW - box.w) / 2;
    const imgY = y + 7 + Math.max(0, (h - 18 - box.h) / 2);
    doc.addImage(sig.dataUrl, sig.format, imgX, imgY, box.w, box.h);
  } else {
    doc.setDrawColor(...theme.ink);
    doc.setLineWidth(0.3);
    doc.line(x + 10, y + h - 11, x + boxW - 10, y + h - 11);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...theme.ink);
  doc.text("HR", x + boxW / 2, y + h - 6.4, { align: "center" });
  if (stamp) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(...theme.muted);
    doc.text(stamp, x + boxW / 2, y + h - 2.4, { align: "center" });
  }
  return y + h;
}

async function renderPremiumSlip(
  doc: JsPdfWithAutoTable,
  payload: SalarySlipPayload,
  company: SalarySlipCompany,
  theme: SlipTheme,
): Promise<void> {
  drawPageChrome(doc, company, theme);
  let y = await drawHeaderBand(doc, payload, company, theme);
  y = drawMetaRow(doc, payload, theme, y);
  y = drawEmployeeCard(doc, payload, theme, y);

  const { y: tableY, earningsSum, deductionsTotalAmt } = earningsDeductionTables(
    doc,
    payload,
    y,
    theme,
  );
  y = tableY;

  const occasional = Math.max(0, Number(payload.occasionalAmount) || 0);
  const netPay = slipNetPayment(payload);
  y = drawKpiStrip(doc, y, earningsSum, deductionsTotalAmt, netPay, occasional, theme);
  y = drawPfAndOccasional(doc, payload, y, theme);

  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const floor = pageH - FOOTER_H - 2.4;
  const remarksMin = 16;
  const thankH = theme.thankYou ? 10 : 0;
  const leftover = floor - y - remarksMin - thankH - SIG_H - 4;
  const extra = Math.max(0, leftover);
  const remarksExtra = extra * 0.48;
  const sigExtra = extra * 0.4;
  y += extra * 0.12;

  y = drawComments(doc, payload, y, theme, remarksExtra);

  if (theme.thankYou) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...theme.ink);
    const a = "THANK YOU SO MUCH FOR YOUR ";
    const b = "EFFORTS!";
    const totalW = doc.getTextWidth(a) + doc.getTextWidth(b);
    const start = (pageW - totalW) / 2;
    const thankY = y + 4;
    doc.text(a, start, thankY);
    doc.setTextColor(...theme.accent);
    doc.text(b, start + doc.getTextWidth(a), thankY);
    y += thankH;
  }

  const sigH = SIG_H + sigExtra;
  const ySig = Math.min(y, floor - sigH);
  await drawSignatures(doc, payload, ySig, theme, Math.max(24, floor - ySig));
  dropExtraPages(doc);
}

/** Global / GPS — technical team */
export async function renderGpsTechnicalSlip(
  doc: JsPdfWithAutoTable,
  payload: SalarySlipPayload,
  company: SalarySlipCompany,
): Promise<void> {
  await renderPremiumSlip(doc, payload, company, GPS_THEME);
}

/** BEM — sales team + sales team lead */
export async function renderBemSalesSlip(
  doc: JsPdfWithAutoTable,
  payload: SalarySlipPayload,
  company: SalarySlipCompany,
): Promise<void> {
  await renderPremiumSlip(doc, payload, company, BEM_THEME);
}

/** BEM — CSR / admin / executive */
export async function renderBemCsrFullSlip(
  doc: JsPdfWithAutoTable,
  payload: SalarySlipPayload,
  company: SalarySlipCompany,
): Promise<void> {
  await renderPremiumSlip(doc, payload, company, BEM_CSR_THEME);
}

export async function renderSalarySlipByTemplate(
  payload: SalarySlipPayload,
  company: SalarySlipCompany,
  _key: string,
): Promise<JsPdfWithAutoTable> {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as JsPdfWithAutoTable;
  const template = payload.template ?? "bem_sales";

  if (template === "gps_technical") {
    await renderGpsTechnicalSlip(doc, payload, company);
  } else if (template === "bem_csr_full") {
    await renderBemCsrFullSlip(doc, payload, company);
  } else {
    await renderBemSalesSlip(doc, payload, company);
  }

  return doc;
}

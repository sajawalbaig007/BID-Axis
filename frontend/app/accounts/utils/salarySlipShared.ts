/** Shared salary-slip PDF helpers and types. */

import {
  DEFAULT_SALARY_SLIP_COMPANY,
  SALARY_SLIP_COMPANIES,
  type SalarySlipCompanyKey,
} from "./salarySlipCompanies";

export type SalarySlipLine = {
  label: string;
  amount: number;
  qty?: string;
  includeInTotal?: boolean;
  indent?: boolean;
};

export type SalarySlipTemplate = "gps_technical" | "bem_sales" | "bem_csr_full";

export type SalarySlipPayload = {
  companyKey?: SalarySlipCompanyKey;
  template?: SalarySlipTemplate;
  monthLabel: string;
  monthCompact?: string;
  employeeName: string;
  employeeId?: string;
  address?: string;
  phone?: string;
  cnic?: string;
  earnings: SalarySlipLine[];
  deductions: SalarySlipLine[];
  /**
   * Occasional pay — added to Net Payment only.
   * Never included in Total Earnings (so PF / tax / late formulas stay unchanged).
   */
  occasionalAmount?: number;
  occasionalRemark?: string;
  comments?: string;
  employeePf?: number;
  employerPf?: number;
  projectCount?: number;
  /** ISO timestamp captured at download — printed on HR digital signature. */
  signedAt?: string;
};

export type JsPdfWithAutoTable = import("jspdf").jsPDF & { lastAutoTable?: { finalY: number } };

export const BEM_NAVY: [number, number, number] = [34, 51, 75];
/** BEM salary slips — red + black scheme */
export const BEM_RED: [number, number, number] = [184, 17, 45];
export const BEM_BLACK: [number, number, number] = [20, 20, 20];
export const GPS_PURPLE: [number, number, number] = [201, 226, 255];
export const GPS_INK: [number, number, number] = [15, 57, 138];
export const FIELD_BLUE: [number, number, number] = [214, 235, 255];
export const FIELD_LIGHT: [number, number, number] = [245, 245, 245];
export const FOOTER_BG: [number, number, number] = [245, 242, 235];

export function money(n: number): string {
  return (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

export function salarySlipMonthLabel(recordDate: string): string {
  const d = new Date(`${recordDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return recordDate;
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function formatSlipSignedAt(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    timeZone: "America/New_York",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function salarySlipMonthCompact(recordDate: string): string {
  const d = new Date(`${recordDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return recordDate;
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  return `${month}-${String(d.getFullYear()).slice(-2)}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function earningsTotal(lines: SalarySlipLine[]): number {
  return lines.reduce(
    (a, r) => a + (r.includeInTotal === false ? 0 : Number(r.amount) || 0),
    0,
  );
}

export function deductionsTotal(lines: SalarySlipLine[]): number {
  return lines.reduce((a, r) => a + (Number(r.amount) || 0), 0);
}

/** Net = Total Earnings − Total Deduction + Occasional (occasional has zero deductions). */
export function slipNetPayment(payload: SalarySlipPayload): number {
  return (
    earningsTotal(payload.earnings) -
    deductionsTotal(payload.deductions) +
    Math.max(0, Number(payload.occasionalAmount) || 0)
  );
}

export async function loadLogoForPdf(
  url: string,
  opts?: { stripWhite?: boolean },
): Promise<{ dataUrl: string; format: "PNG" | "JPEG"; width: number; height: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = objectUrl;
    });
    URL.revokeObjectURL(objectUrl);

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);

    const shouldStrip =
      opts?.stripWhite ?? (blob.type.includes("jpeg") || blob.type.includes("jpg"));
    if (shouldStrip) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
        const spread = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
        if (avg > 248 && spread < 18) d[i + 3] = 0;
        else if (avg > 228 && spread < 28) d[i + 3] = Math.min(d[i + 3], Math.round((255 - avg) * 10));
      }
      ctx.putImageData(imageData, 0, 0);
    }

    const format: "PNG" | "JPEG" = shouldStrip || blob.type.includes("png") ? "PNG" : "JPEG";
    return {
      dataUrl: canvas.toDataURL(format === "PNG" ? "image/png" : "image/jpeg"),
      format,
      width: canvas.width,
      height: canvas.height,
    };
  } catch {
    return null;
  }
}

export function fitLogoBox(imgW: number, imgH: number, maxW: number, maxH: number): { w: number; h: number } {
  if (imgW <= 0 || imgH <= 0) return { w: maxW, h: maxH };
  const ratio = imgW / imgH;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { w, h };
}

export function slipTemplateForKind(kind: string): SalarySlipTemplate {
  if (kind === "technical" || kind === "technical_manager") return "gps_technical";
  if (kind === "sales_lead") return "bem_sales";
  return "bem_sales";
}

export function resolveSlipCompany(payload: SalarySlipPayload) {
  const key = payload.companyKey ?? DEFAULT_SALARY_SLIP_COMPANY;
  return { key, company: SALARY_SLIP_COMPANIES[key] };
}

export function safeSlipFileName(payload: SalarySlipPayload, companyLabel: string): string {
  const safeName = (payload.employeeName || "Employee").replace(/[^\w\s-]/g, "").trim() || "Employee";
  return `${safeName} Salary Slip ${payload.monthLabel} — ${companyLabel}.pdf`;
}

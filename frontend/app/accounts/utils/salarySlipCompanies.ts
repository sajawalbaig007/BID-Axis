/** Company profiles for salary-slip downloads. Add formats here as more companies go live. */

export type SalarySlipCompanyKey = "BEM" | "GPS" | "BDS";

export type SalarySlipCompany = {
  key: SalarySlipCompanyKey;
  /** Button / UI label */
  label: string;
  legalName: string;
  brandLine: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  hrManager: string;
  accountOfficer: string;
  accent: string;
  /** When set, PDF header shows logo instead of brand text */
  logoUrl?: string;
  /** When false, download shows “format coming soon” */
  slipReady: boolean;
};

export const SALARY_SLIP_COMPANIES: Record<SalarySlipCompanyKey, SalarySlipCompany> = {
  BEM: {
    key: "BEM",
    label: "BEM Solutions",
    legalName: "BEM Solutions",
    brandLine: "BEM SOLUTION",
    address: "425, J-03 Block, Phase 2 Johar Town, Lahore",
    phone: "0323-6431991",
    email: "hr@bemsolutions.io",
    website: "bemsolutions.io",
    hrManager: "Shakeela Tabassum",
    accountOfficer: "Muhammad Bilal",
    accent: "#1B6FE8",
    logoUrl: "/images/logo.jpeg",
    slipReady: true,
  },
  GPS: {
    key: "GPS",
    label: "GPS",
    legalName: "Global Pre Construction Solution",
    brandLine: "GLOBAL PRE CONSTRUCTION SOLUTION",
    address: "Growth Co Working Space, Johar Town, Lahore",
    phone: "0323-6431991",
    email: "info@globalpreconstructionsolutions.com",
    website: "www.globalpreconstructionsolutions.com",
    hrManager: "",
    accountOfficer: "Muhammad Bilal",
    accent: "#0F398A",
    logoUrl: "/images/global-logo.png",
    slipReady: true,
  },
  BDS: {
    key: "BDS",
    label: "BDS",
    legalName: "BDS",
    brandLine: "BDS",
    address: "",
    phone: "",
    email: "",
    website: "",
    hrManager: "",
    accountOfficer: "",
    accent: "#0D9488",
    slipReady: false,
  },
};

export const DEFAULT_SALARY_SLIP_COMPANY: SalarySlipCompanyKey = "BEM";

/** Technical payroll (team + manager) is billed under GPS. */
export function salarySlipCompanyForKind(
  kind: string,
  fallback: SalarySlipCompanyKey = DEFAULT_SALARY_SLIP_COMPANY,
): SalarySlipCompanyKey {
  if (kind === "technical" || kind === "technical_manager") return "GPS";
  return fallback;
}

export function isGpsSalarySlipKind(kind: string): boolean {
  return kind === "technical" || kind === "technical_manager";
}

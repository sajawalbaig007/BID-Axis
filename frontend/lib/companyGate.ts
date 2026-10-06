import type { PortalRole } from "@/lib/loginRole";

export type PortalCompany = "BEM" | "GPS";

export type CompanyMeta = {
  key: PortalCompany;
  slug: string;
  name: string;
  legalName: string;
  tagline: string;
  accent: string;
  accentSoft: string;
  logoSrc: string;
  portalsLabel: string;
};

export const COMPANY_META: Record<PortalCompany, CompanyMeta> = {
  BEM: {
    key: "BEM",
    slug: "bem",
    name: "BidAxis",
    legalName: "BidAxis",
    tagline: "Estimating, scheduling, shop drawings and design support",
    accent: "#1B6FE8",
    accentSoft: "#5B9BFF",
    logoSrc: "/images/LOGO.png",
    portalsLabel: "CEO · Admin · CSR · Accounts",
  },
  GPS: {
    key: "GPS",
    slug: "gps",
    name: "BidAxis",
    legalName: "BidAxis",
    tagline: "Estimating, scheduling, shop drawings and design support",
    accent: "#1B6FE8",
    accentSoft: "#3B82F6",
    logoSrc: "/images/global-logo.png",
    portalsLabel: "Chief Estimator · Estimator · BIM Manager · BIM",
  },
};

export const COMPANY_PORTAL_ROLES: Record<PortalCompany, PortalRole[]> = {
  BEM: ["admin", "manager", "csr", "accounts"],
  GPS: ["technical_manager", "estimator", "bim_manager", "bim"],
};

const STORAGE_KEY = "crm_company_gate";

export function parseCompanyParam(raw: string | undefined | null): PortalCompany | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "bem") return "BEM";
  if (v === "gps") return "GPS";
  return null;
}

export function companyForPortal(role: PortalRole): PortalCompany {
  return COMPANY_PORTAL_ROLES.GPS.includes(role) ? "GPS" : "BEM";
}

export type CompanyGateSession = {
  company: PortalCompany;
  token: string;
};

function parseGateRaw(raw: string | null): CompanyGateSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { company?: string; token?: string };
    const company = parsed.company === "GPS" ? "GPS" : parsed.company === "BEM" ? "BEM" : null;
    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    if (!company || !token) return null;
    return { company, token };
  } catch {
    return null;
  }
}

function readRaw(): CompanyGateSession | null {
  if (typeof window === "undefined") return null;
  const fromSession = parseGateRaw(sessionStorage.getItem(STORAGE_KEY));
  if (fromSession) return fromSession;
  const fromLocal = parseGateRaw(localStorage.getItem(STORAGE_KEY));
  if (fromLocal) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fromLocal));
    return fromLocal;
  }
  return null;
}

export function getCompanyGate(): CompanyGateSession | null {
  return readRaw();
}

export function setCompanyGate(company: PortalCompany, token: string) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({ company, token });
  sessionStorage.setItem(STORAGE_KEY, payload);
  localStorage.setItem(STORAGE_KEY, payload);
}

export function clearCompanyGate() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY);
}

export function hasCompanyGate(company: PortalCompany): boolean {
  const s = readRaw();
  return !!s && s.company === company && s.token.length > 0;
}

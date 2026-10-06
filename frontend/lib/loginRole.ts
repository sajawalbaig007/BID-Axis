export type PortalRole = "admin" | "csr" | "manager" | "technical_manager" | "accounts" | "estimator" | "bim_manager" | "bim";

export const PORTAL_OPTIONS: { value: PortalRole; label: string; hint: string }[] = [
  { value: "admin", label: "CEO", hint: "Full CEO dashboard" },
  { value: "csr", label: "CSR", hint: "Client calls & leads" },
  { value: "manager", label: "Admin", hint: "Leads, reports & projects" },
  { value: "technical_manager", label: "Chief Estimator", hint: "Projects, KPI & team" },
  { value: "estimator", label: "Estimator", hint: "Assigned takeoffs & deadlines" },
  { value: "bim_manager", label: "BIM Manager", hint: "BIM projects, KPI & team" },
  { value: "bim", label: "BIM", hint: "Assigned BIM work & deadlines" },
  { value: "accounts", label: "Accounts", hint: "Statements, payroll & assets" },
];

export function portalLabel(role: PortalRole) {
  return PORTAL_OPTIONS.find(o => o.value === role)?.label ?? role;
}

export type PortalLoginSlide = { title: string; subtitle: string };

/** Left-panel copy on `/login/[portal]` — matched to the selected dashboard. */
export const PORTAL_LOGIN_COPY: Record<
  PortalRole,
  {
    eyebrow: string;
    heading: string;
    subheading: string;
    slides: PortalLoginSlide[];
  }
> = {
  admin: {
    eyebrow: "CEO Portal",
    heading: "CEO Sign In",
    subheading: "Manage users, leads, uploads, and company-wide reports.",
    slides: [
      { title: "CEO Dashboard", subtitle: "Full control across users, data, and reporting." },
      { title: "Team & Access", subtitle: "Create accounts, assign roles, and keep access secure." },
      { title: "Company Overview", subtitle: "Leads, projects, and performance in one place." },
    ],
  },
  manager: {
    eyebrow: "Admin Portal",
    heading: "Admin Sign In",
    subheading: "Oversee leads, reports, and active projects for your team.",
    slides: [
      { title: "Admin Dashboard", subtitle: "Track leads, reports, and project health." },
      { title: "Team Visibility", subtitle: "See progress across CSR and delivery pipelines." },
      { title: "Faster Decisions", subtitle: "Reports and filters built for day-to-day management." },
    ],
  },
  csr: {
    eyebrow: "CSR Portal",
    heading: "CSR Sign In",
    subheading: "Handle calls, follow-ups, and client pipeline updates.",
    slides: [
      { title: "CSR Dashboard", subtitle: "Your daily calls, leads, and follow-ups." },
      { title: "Client Pipeline", subtitle: "Move prospects from first contact to closed." },
      { title: "Stay Organized", subtitle: "Notes, status, and tasks in one secure workspace." },
    ],
  },
  technical_manager: {
    eyebrow: "Chief Estimator Portal",
    heading: "Chief Estimator Sign In",
    subheading: "Monitor projects, revisions, KPI, and delivery teams.",
    slides: [
      { title: "Estimation Dashboard", subtitle: "Projects, revisions, and delivery status." },
      { title: "Team & KPI", subtitle: "Track capacity, quality, and milestones." },
      { title: "Delivery Focus", subtitle: "Keep active work and revisions under control." },
    ],
  },
  estimator: {
    eyebrow: "Estimator Portal",
    heading: "Estimator Sign In",
    subheading: "View assigned projects, man hours, deadlines, and takeoff progress.",
    slides: [
      { title: "Estimator Dashboard", subtitle: "Your assigned projects and takeoff queue." },
      { title: "Deadlines & Hours", subtitle: "See man hours and due dates for every job." },
      { title: "Mark Progress", subtitle: "Update takeoff done and add project notes." },
    ],
  },
  bim_manager: {
    eyebrow: "BIM Manager Portal",
    heading: "BIM Manager Sign In",
    subheading: "Upload BIM projects, assign the BIM team, and review their reports.",
    slides: [
      { title: "BIM Projects", subtitle: "Your projects stay on the BIM desk." },
      { title: "Team & KPI", subtitle: "Assign BIM staff and track delivery." },
      { title: "Reports", subtitle: "BIM project reports and check-in history." },
    ],
  },
  bim: {
    eyebrow: "BIM Portal",
    heading: "BIM Sign In",
    subheading: "View assigned BIM projects, hours, deadlines, and check in for the day.",
    slides: [
      { title: "BIM Dashboard", subtitle: "Projects assigned by the BIM manager." },
      { title: "Deadlines & Hours", subtitle: "See man hours and due dates for every job." },
      { title: "Check In", subtitle: "Check in and check out from this desk." },
    ],
  },
  accounts: {
    eyebrow: "Accounts Portal",
    heading: "Accounts Sign In",
    subheading: "Income statement, balance sheet, cash flow, payroll & assets.",
    slides: [
      { title: "Accounts Dashboard", subtitle: "Statements, currency formula, and live FX." },
      { title: "Finance Clarity", subtitle: "Payroll, OPEX, loans, and monthly reports." },
      { title: "Month-End Ready", subtitle: "Balance sheet, cash flow, and asset registers." },
    ],
  },
};

import {
  LayoutDashboard,
  Headphones,
  BarChart3,
  Wrench,
  Wallet,
  Ruler,
} from "lucide-react";
import type { PortalRole } from "@/lib/loginRole";

export type LandingPortal = {
  value: PortalRole;
  label: string;
  hint: string;
  icon: typeof LayoutDashboard;
  accent: string;
};

export const LANDING_PORTALS: LandingPortal[] = [
  {
    value: "admin",
    label: "CEO",
    hint: "Users, leads, uploads & company reports",
    icon: LayoutDashboard,
    accent: "#1B6FE8",
  },
  {
    value: "manager",
    label: "Admin",
    hint: "Leads, reports & project oversight",
    icon: BarChart3,
    accent: "#0F766E",
  },
  {
    value: "csr",
    label: "CSR",
    hint: "Calls, follow-ups & client pipeline",
    icon: Headphones,
    accent: "#0B84F3",
  },
  {
    value: "accounts",
    label: "Accounts",
    hint: "Statements, payroll, cash flow & assets",
    icon: Wallet,
    accent: "#12B76A",
  },
  {
    value: "technical_manager",
    label: "Chief Estimator",
    hint: "Projects, revisions, KPI & delivery",
    icon: Wrench,
    accent: "#D97706",
  },
  {
    value: "estimator",
    label: "Estimator",
    hint: "Assigned takeoffs, man hours & deadlines",
    icon: Ruler,
    accent: "#7C3AED",
  },
  {
    value: "bim_manager",
    label: "BIM Manager",
    hint: "BIM projects, reports & team",
    icon: Wrench,
    accent: "#0F398A",
  },
  {
    value: "bim",
    label: "BIM",
    hint: "Assigned BIM work, hours & check-in",
    icon: Ruler,
    accent: "#1D4ED8",
  },
];

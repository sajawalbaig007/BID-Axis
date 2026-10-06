import { Role } from "@prisma/client";

/**
 * Demo accounts created by prisma/seed.ts.
 * Admin → Users never lists these, however many are added here.
 */
export const SEED_USERS: {
  name: string;
  email: string;
  role: Role;
  csrCode?: string;
}[] = [
  { name: "Admin User", email: "admin@gmail.com", role: Role.admin },
  { name: "CSR User", email: "csr@gmail.com", role: Role.csr, csrCode: "CSR001" },
  { name: "Manager User", email: "manager@gmail.com", role: Role.manager },
  { name: "Chief Estimator", email: "technical@gmail.com", role: Role.technical_manager },
  { name: "Estimator User", email: "estimator@gmail.com", role: Role.estimator, csrCode: "EST001" },
  { name: "BIM Manager", email: "bimmanager@gmail.com", role: Role.bim_manager },
  { name: "BIM User", email: "bim@gmail.com", role: Role.bim, csrCode: "BIM001" },
  { name: "Accounts User", email: "accounts@gmail.com", role: Role.accounts },
];

export const SEED_USER_EMAILS: string[] = SEED_USERS.map((u) => u.email);

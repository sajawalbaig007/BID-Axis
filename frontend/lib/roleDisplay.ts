/** UI labels for portal roles. DB role keys stay unchanged. */
export const ROLE_DISPLAY: Record<string, string> = {
  admin: "CEO",
  manager: "Admin",
  technical_manager: "Chief Estimator",
  csr: "CSR",
  estimator: "Estimator",
  bim_manager: "BIM Manager",
  bim: "BIM",
  accounts: "Accounts",
};

export function roleDisplayLabel(role: string | null | undefined): string {
  const key = String(role ?? "").trim().toLowerCase();
  if (!key) return "User";
  return ROLE_DISPLAY[key] ?? key.replace(/_/g, " ");
}

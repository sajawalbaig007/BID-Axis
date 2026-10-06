export type AssistantActor = {
  id: string;
  role: string;
  name: string;
};

const CLIENT_ROLES = new Set(["admin", "manager", "technical_manager", "csr"]);
const PROJECT_ROLES = new Set(["admin", "manager", "technical_manager", "csr", "estimator"]);
const ACCOUNTS_ROLES = new Set(["admin", "accounts"]);
const STATS_ROLES = new Set(["admin", "manager", "technical_manager", "csr", "estimator", "accounts"]);
const EMAIL_ROLES = new Set(["admin", "manager", "technical_manager", "csr"]);
const TECHNICAL_ROLES = new Set(["admin", "manager", "technical_manager"]);
const PAYMENTS_ROLES = new Set(["admin", "manager", "accounts"]);
const STAFF_ROLES = new Set(["admin", "manager"]);

export function canSearchClients(role: string) {
  return CLIENT_ROLES.has(role) || role === "estimator";
}
export function canReadAccounts(role: string) {
  return ACCOUNTS_ROLES.has(role);
}
export function canReadStats(role: string) {
  return STATS_ROLES.has(role);
}
export function canEmailClients(role: string) {
  return EMAIL_ROLES.has(role);
}
export function canReadProjects(role: string) {
  return PROJECT_ROLES.has(role);
}
export function canReadTechnical(role: string) {
  return TECHNICAL_ROLES.has(role);
}
export function canReadPayments(role: string) {
  return PAYMENTS_ROLES.has(role);
}
export function canReadStaff(role: string) {
  return STAFF_ROLES.has(role);
}

export function deny(message: string) {
  return { ok: false as const, error: message };
}

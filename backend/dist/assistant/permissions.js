"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canSearchClients = canSearchClients;
exports.canReadAccounts = canReadAccounts;
exports.canReadStats = canReadStats;
exports.canEmailClients = canEmailClients;
exports.canReadProjects = canReadProjects;
exports.canReadTechnical = canReadTechnical;
exports.canReadPayments = canReadPayments;
exports.canReadStaff = canReadStaff;
exports.deny = deny;
const CLIENT_ROLES = new Set(["admin", "manager", "technical_manager", "csr"]);
const PROJECT_ROLES = new Set(["admin", "manager", "technical_manager", "csr", "estimator"]);
const ACCOUNTS_ROLES = new Set(["admin", "accounts"]);
const STATS_ROLES = new Set(["admin", "manager", "technical_manager", "csr", "estimator", "accounts"]);
const EMAIL_ROLES = new Set(["admin", "manager", "technical_manager", "csr"]);
const TECHNICAL_ROLES = new Set(["admin", "manager", "technical_manager"]);
const PAYMENTS_ROLES = new Set(["admin", "manager", "accounts"]);
const STAFF_ROLES = new Set(["admin", "manager"]);
function canSearchClients(role) {
    return CLIENT_ROLES.has(role) || role === "estimator";
}
function canReadAccounts(role) {
    return ACCOUNTS_ROLES.has(role);
}
function canReadStats(role) {
    return STATS_ROLES.has(role);
}
function canEmailClients(role) {
    return EMAIL_ROLES.has(role);
}
function canReadProjects(role) {
    return PROJECT_ROLES.has(role);
}
function canReadTechnical(role) {
    return TECHNICAL_ROLES.has(role);
}
function canReadPayments(role) {
    return PAYMENTS_ROLES.has(role);
}
function canReadStaff(role) {
    return STAFF_ROLES.has(role);
}
function deny(message) {
    return { ok: false, error: message };
}

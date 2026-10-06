"use strict";
/** Shared potential-client bucket rules (matches CSR frontend). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasSchedule = hasSchedule;
exports.isImportantLead = isImportantLead;
exports.isInterestedLead = isInterestedLead;
exports.isImportantOnlyLead = isImportantOnlyLead;
exports.isScheduledCallLead = isScheduledCallLead;
exports.isPotentialClientLead = isPotentialClientLead;
function hasSchedule(nextSchedule) {
    return !!(nextSchedule && String(nextSchedule).trim());
}
/** Status is source of truth — ignore stale important/interested flags. */
function isImportantLead(lead) {
    return (lead.status ?? "").trim().toLowerCase() === "important";
}
function isInterestedLead(lead) {
    return (lead.status ?? "").trim().toLowerCase() === "interested";
}
function isImportantOnlyLead(lead) {
    return isImportantLead(lead) && !hasSchedule(lead.nextSchedule);
}
function isScheduledCallLead(lead) {
    return isImportantLead(lead) && hasSchedule(lead.nextSchedule);
}
function isPotentialClientLead(lead) {
    return isInterestedLead(lead) || isImportantLead(lead);
}

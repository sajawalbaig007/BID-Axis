"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPLOAD_CATEGORY_LABELS = exports.UPLOAD_CATEGORIES = void 0;
exports.resolveUploadCategory = resolveUploadCategory;
exports.isUploadCategory = isUploadCategory;
exports.inferUploadCategoryFromLead = inferUploadCategoryFromLead;
exports.UPLOAD_CATEGORIES = [
    "call-data",
    "new-client",
    "old-client",
    "interested",
    "important",
    "active-projects",
];
exports.UPLOAD_CATEGORY_LABELS = {
    "call-data": "Call Data",
    "new-client": "New Client",
    "old-client": "Old Client",
    "interested": "Interested",
    "important": "Important",
    "active-projects": "Active Projects",
};
function resolveUploadCategory(leadType, initialStatuses) {
    const status = (initialStatuses[0] ?? "").toLowerCase();
    if (leadType === "active")
        return "active-projects";
    if (status === "important")
        return "important";
    if (status === "interested")
        return "interested";
    if (status === "pending")
        return "call-data";
    if (leadType === "old")
        return "old-client";
    if (leadType === "new")
        return "new-client";
    return "call-data";
}
function isUploadCategory(value) {
    return exports.UPLOAD_CATEGORIES.includes(value);
}
/** Infer category from a linked lead when uploadCategory was not stored (older uploads) */
function inferUploadCategoryFromLead(lead) {
    const status = lead.status.toLowerCase();
    if (status === "pending")
        return "call-data";
    if (status === "important")
        return "important";
    if (status === "interested")
        return "interested";
    if (lead.projectTitle && lead.isOldClient)
        return "active-projects";
    if (lead.isOldClient)
        return "old-client";
    if (status.includes("close"))
        return "new-client";
    return "call-data";
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLeadFieldsFromUploadRow = buildLeadFieldsFromUploadRow;
const masterFormatTrades_1 = require("./masterFormatTrades");
/** Map parsed upload row → lead fields (upload type controls status + isOldClient). */
function buildLeadFieldsFromUploadRow(r, uploadedFileId, hideOnMain) {
    const status = (r.status ?? "").toLowerCase();
    return {
        name: r.name,
        company: r.company || null,
        phone: r.phone || null,
        email: r.email || null,
        state: r.state || null,
        interestedService: r.interestedService || null,
        clientCode: r.clientCode || null,
        projectTitle: r.projectTitle,
        projectBudget: r.projectBudget,
        comments: r.comments || null,
        status: r.status,
        important: status === "important",
        interested: status === "interested",
        isOldClient: r.isOldClient,
        assignedTo: r.csrId,
        uploadedFileId,
        hiddenOnMain: hideOnMain(r.status),
        inBin: false,
        trade: (0, masterFormatTrades_1.parseTradeList)(r.trade).join(", ") || null,
        subTrades: (0, masterFormatTrades_1.parseSubTradeList)(r.subTrades).join(", ") || null,
    };
}

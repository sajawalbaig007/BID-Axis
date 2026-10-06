"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateCsrLeadCaches = invalidateCsrLeadCaches;
const cache_1 = require("./cache");
const report_controller_1 = require("../controllers/report.controller");
/** Clear all server-side caches for one CSR after lead mutations or admin reset. */
function invalidateCsrLeadCaches(csrId, ...extra) {
    (0, cache_1.flushAdminClientsCache)();
    (0, report_controller_1.flushReportCache)();
    (0, cache_1.invalidateCache)(`csr:dashboard:${csrId}`, `csr:stats:${csrId}`, `csr:potential:${csrId}`, `csr:leads:${csrId}`, `csr:clients:${csrId}`, `csr:projects:${csrId}`, `csr:not-interested:${csrId}`, `csr:bin:${csrId}`, "admin:bin", "admin:csrs", ...extra);
    (0, cache_1.invalidatePattern)(`csr:tab:${csrId}:`);
}

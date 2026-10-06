"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceAdminIpAllowlist = enforceAdminIpAllowlist;
const env_1 = require("../config/env");
const requestMeta_1 = require("../utils/requestMeta");
/** Block admin login/API from IPs not in ADMIN_ALLOWED_IPS (when configured). */
function enforceAdminIpAllowlist(req, res, next) {
    const allowed = (0, env_1.getAdminAllowedIps)();
    if (allowed.length === 0)
        return next();
    const ip = (0, requestMeta_1.getClientIp)(req);
    if (!allowed.includes(ip)) {
        return res.status(403).json({
            success: false,
            code: "IP_NOT_ALLOWED",
            message: "Admin access is restricted to approved networks.",
        });
    }
    next();
}

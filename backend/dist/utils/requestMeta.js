"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientIp = getClientIp;
exports.getUserAgent = getUserAgent;
function getClientIp(req) {
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd.length > 0) {
        return fwd.split(",")[0].trim();
    }
    return req.ip ?? req.socket.remoteAddress ?? "unknown";
}
function getUserAgent(req) {
    const ua = req.headers["user-agent"];
    return typeof ua === "string" ? ua.slice(0, 512) : "";
}

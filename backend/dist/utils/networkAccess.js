"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientMacAddress = getClientMacAddress;
exports.isValidIp = isValidIp;
exports.sanitizeIpList = sanitizeIpList;
exports.evaluateNetworkAccess = evaluateNetworkAccess;
const requestMeta_1 = require("./requestMeta");
function getClientMacAddress(req) {
    const header = req.headers["x-client-mac"];
    if (typeof header === "string")
        return header.trim();
    if (Array.isArray(header) && header.length > 0)
        return String(header[0]).trim();
    return "";
}
function normalizedIp(ip) {
    return ip.trim();
}
function isValidIp(ip) {
    const v4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
    // Accept a broad IPv6 format.
    const v6 = /^[0-9a-fA-F:]+$/;
    return v4.test(ip) || (ip.includes(":") && v6.test(ip));
}
function sanitizeIpList(raw) {
    const arr = Array.isArray(raw) ? raw : [];
    const uniq = new Set();
    for (const item of arr) {
        const ip = normalizedIp(String(item ?? ""));
        if (!ip)
            continue;
        if (!isValidIp(ip))
            continue;
        uniq.add(ip);
        if (uniq.size >= 5)
            break;
    }
    return [...uniq];
}
function evaluateNetworkAccess(user, req) {
    const ip = (0, requestMeta_1.getClientIp)(req);
    const mac = getClientMacAddress(req);
    const now = Date.now();
    const tempUntil = user.temporaryAccessUntil ? user.temporaryAccessUntil.getTime() : 0;
    const tempActive = tempUntil > now;
    const inHouseIpAllowed = (user.allowedIps ?? []).length === 0 || (user.allowedIps ?? []).includes(ip);
    const hasInHouseMac = !!(user.allowedMacAddress && user.allowedMacAddress.trim());
    const inHouseMacAllowed = !hasInHouseMac || !mac || user.allowedMacAddress === mac;
    if (inHouseIpAllowed && inHouseMacAllowed)
        return null;
    if (tempActive) {
        const tempIpOk = !user.temporaryAccessIp || user.temporaryAccessIp === ip;
        const tempMacOk = !user.temporaryAccessMac || !mac || user.temporaryAccessMac === mac;
        if (tempIpOk && tempMacOk)
            return null;
    }
    return "This account is restricted to approved network/device.";
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPasswordBreached = isPasswordBreached;
exports.assertPasswordNotBreached = assertPasswordNotBreached;
const crypto_1 = __importDefault(require("crypto"));
/** Have I Been Pwned k-anonymity range API — returns true if password found in breaches */
async function isPasswordBreached(password) {
    if (!password || password.length < 8)
        return false;
    try {
        const sha1 = crypto_1.default.createHash("sha1").update(password).digest("hex").toUpperCase();
        const prefix = sha1.slice(0, 5);
        const suffix = sha1.slice(5);
        const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
            headers: { "User-Agent": "CRM-Dashboard-Security" },
            signal: AbortSignal.timeout(4000),
        });
        if (!res.ok)
            return false;
        const text = await res.text();
        return text.split("\n").some((line) => line.startsWith(suffix));
    }
    catch {
        return false;
    }
}
async function assertPasswordNotBreached(password) {
    const breached = await isPasswordBreached(password);
    if (breached) {
        return "This password has appeared in a data breach. Please choose a different password.";
    }
    return null;
}

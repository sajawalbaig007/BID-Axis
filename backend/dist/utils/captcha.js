"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyCaptchaToken = verifyCaptchaToken;
const env_1 = require("../config/env");
async function verifyCaptchaToken(token) {
    if (!(0, env_1.isCaptchaConfigured)())
        return true;
    if (!token?.trim())
        return false;
    const secret = process.env.TURNSTILE_SECRET_KEY.trim();
    try {
        const body = new URLSearchParams({
            secret,
            response: token.trim(),
        });
        const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok)
            return false;
        const data = (await res.json());
        return !!data.success;
    }
    catch {
        return false;
    }
}

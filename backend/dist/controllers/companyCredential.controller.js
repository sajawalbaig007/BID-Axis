"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPANY_KEYS = void 0;
exports.listCompanyCredentials = listCompanyCredentials;
exports.upsertCompanyCredential = upsertCompanyCredential;
exports.deleteCompanyCredential = deleteCompanyCredential;
const db_1 = __importDefault(require("../config/db"));
const hash_1 = require("../utils/hash");
const companyCredentials_1 = require("../utils/companyCredentials");
Object.defineProperty(exports, "COMPANY_KEYS", { enumerable: true, get: function () { return companyCredentials_1.COMPANY_KEYS; } });
async function listCompanyCredentials(_req, res) {
    try {
        await (0, companyCredentials_1.seedDefaultCompanyCredentials)();
        const rows = await db_1.default.companyCredential.findMany({
            orderBy: { company: "asc" },
        });
        return res.json({
            success: true,
            credentials: rows.map(companyCredentials_1.publicCredential),
        });
    }
    catch (err) {
        console.error("[listCompanyCredentials]", err);
        return res.status(500).json({ success: false, message: "Failed to load company access." });
    }
}
async function upsertCompanyCredential(req, res) {
    try {
        const company = (0, companyCredentials_1.normalizeCompanyKey)(req.params.company ?? req.body?.company);
        if (!company) {
            return res.status(400).json({ success: false, message: "Company must be BEM or GPS." });
        }
        const username = String(req.body?.username ?? "").trim();
        const password = String(req.body?.password ?? "");
        const existing = await db_1.default.companyCredential.findUnique({ where: { company } });
        if (!username) {
            return res.status(400).json({ success: false, message: "Username is required." });
        }
        if (username.length > 64) {
            return res.status(400).json({ success: false, message: "Username is too long." });
        }
        if (!existing && !password) {
            return res.status(400).json({ success: false, message: "Password is required." });
        }
        if (password && password.length < 4) {
            return res.status(400).json({ success: false, message: "Password must be at least 4 characters." });
        }
        const data = { username };
        if (password)
            data.password = await (0, hash_1.hashPassword)(password);
        const row = existing
            ? await db_1.default.companyCredential.update({
                where: { company },
                data,
            })
            : await db_1.default.companyCredential.create({
                data: {
                    company,
                    username,
                    password: data.password,
                },
            });
        return res.json({
            success: true,
            credential: (0, companyCredentials_1.publicCredential)(row),
            message: existing ? "Company access updated." : "Company access created.",
        });
    }
    catch (err) {
        console.error("[upsertCompanyCredential]", err);
        return res.status(500).json({ success: false, message: "Failed to save company access." });
    }
}
async function deleteCompanyCredential(req, res) {
    try {
        const company = (0, companyCredentials_1.normalizeCompanyKey)(req.params.company);
        if (!company) {
            return res.status(400).json({ success: false, message: "Company must be BEM or GPS." });
        }
        const existing = await db_1.default.companyCredential.findUnique({ where: { company } });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Company access not found." });
        }
        await db_1.default.companyCredential.delete({ where: { company } });
        return res.json({ success: true, message: `${company} company access removed.` });
    }
    catch (err) {
        console.error("[deleteCompanyCredential]", err);
        return res.status(500).json({ success: false, message: "Failed to delete company access." });
    }
}

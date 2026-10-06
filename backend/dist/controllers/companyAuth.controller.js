"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.companyLogin = companyLogin;
exports.verifyCompanySession = verifyCompanySession;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = __importDefault(require("../config/db"));
const hash_1 = require("../utils/hash");
const security_1 = require("../config/security");
const companyCredentials_1 = require("../utils/companyCredentials");
const JWT_SECRET = (0, security_1.getJwtSecret)();
async function companyLogin(req, res) {
    try {
        await (0, companyCredentials_1.seedDefaultCompanyCredentials)();
        const company = (0, companyCredentials_1.normalizeCompanyKey)(req.body?.company);
        const username = String(req.body?.username ?? "").trim();
        const password = String(req.body?.password ?? "");
        if (!company) {
            return res.status(400).json({ success: false, message: "Select BEM or GPS." });
        }
        if (!username || !password) {
            return res.status(400).json({ success: false, message: "Username and password are required." });
        }
        const row = await db_1.default.companyCredential.findUnique({ where: { company } });
        if (!row) {
            return res.status(403).json({
                success: false,
                code: "COMPANY_ACCESS_MISSING",
                message: "Company access is not set up. Ask admin to create it from Users.",
            });
        }
        const userOk = row.username.trim().toLowerCase() === username.toLowerCase();
        const passOk = await (0, hash_1.comparePassword)(password, row.password);
        if (!userOk || !passOk) {
            return res.status(401).json({ success: false, message: "Invalid company username or password." });
        }
        const token = jsonwebtoken_1.default.sign({ typ: "company_gate", company }, JWT_SECRET, { expiresIn: "12h" });
        return res.json({
            success: true,
            token,
            company,
            username: row.username,
        });
    }
    catch (err) {
        console.error("[companyLogin]", err);
        return res.status(500).json({ success: false, message: "Company login failed." });
    }
}
async function verifyCompanySession(req, res) {
    try {
        const header = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
        const token = String(req.body?.token ?? "").trim() || header;
        if (!token) {
            return res.status(401).json({ success: false, message: "No company session." });
        }
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (decoded.typ !== "company_gate") {
            return res.status(401).json({ success: false, message: "Invalid company session." });
        }
        const company = (0, companyCredentials_1.normalizeCompanyKey)(decoded.company);
        if (!company) {
            return res.status(401).json({ success: false, message: "Invalid company session." });
        }
        const row = await db_1.default.companyCredential.findUnique({ where: { company } });
        if (!row) {
            return res.status(401).json({
                success: false,
                code: "COMPANY_ACCESS_MISSING",
                message: "Company access was removed.",
            });
        }
        return res.json({ success: true, company, username: row.username });
    }
    catch {
        return res.status(401).json({ success: false, message: "Company session expired." });
    }
}

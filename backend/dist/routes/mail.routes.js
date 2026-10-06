"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_middleware_1 = require("../middleware/role.middleware");
const clientMail_1 = require("../utils/clientMail");
const router = express_1.default.Router();
const MAIL_ROLES = ["csr", "admin", "manager", "technical_manager"];
const sendLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many emails. Please wait a few minutes." },
});
router.use(auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)(...MAIL_ROLES));
router.get("/from-accounts", (_req, res) => {
    return res.json({ success: true, senders: (0, clientMail_1.publicSenders)() });
});
router.post("/draft", async (req, res) => {
    try {
        const fromId = String(req.body?.fromId ?? "").trim();
        const to = String(req.body?.to ?? "").trim();
        const intent = String(req.body?.intent ?? "").trim();
        const clientName = String(req.body?.clientName ?? "").trim();
        const company = String(req.body?.company ?? "").trim();
        const notes = String(req.body?.notes ?? "").trim();
        if (!intent) {
            return res.status(400).json({ success: false, message: "Tell the assistant what the email should say." });
        }
        if (!(0, clientMail_1.isValidEmail)(to)) {
            return res.status(400).json({ success: false, message: "Client email is invalid." });
        }
        const sender = (0, clientMail_1.findSender)(fromId);
        if (!sender) {
            return res.status(400).json({ success: false, message: "Select a company email first." });
        }
        const draft = await (0, clientMail_1.draftClientMail)({
            fromName: sender.name,
            fromEmail: sender.email,
            to,
            clientName,
            company,
            intent,
            notes,
        });
        return res.json({ success: true, ...draft });
    }
    catch (err) {
        console.error("[mail/draft]", err);
        return res.status(500).json({ success: false, message: "Could not draft the email." });
    }
});
router.post("/send", sendLimiter, async (req, res) => {
    try {
        const fromId = String(req.body?.fromId ?? "").trim();
        const to = String(req.body?.to ?? "").trim();
        const subject = String(req.body?.subject ?? "").trim();
        const body = String(req.body?.body ?? "").trim();
        if (!(0, clientMail_1.isValidEmail)(to)) {
            return res.status(400).json({ success: false, message: "Client email is invalid." });
        }
        if (!subject || !body) {
            return res.status(400).json({ success: false, message: "Subject and message are required." });
        }
        if (body.length > 20000 || subject.length > 200) {
            return res.status(400).json({ success: false, message: "Message is too long." });
        }
        const sender = (0, clientMail_1.findSender)(fromId);
        if (!sender) {
            return res.status(400).json({
                success: false,
                message: "That company email is not configured yet. Add CRM_FROM_EMAIL / CRM_FROM_PASS in the server env (Hostinger mailbox password, or Gmail app password).",
            });
        }
        await (0, clientMail_1.sendClientMail)({ sender, to, subject, body });
        console.info(`[mail/send] user=${req.user?.id} from=${sender.email} to=${to}`);
        return res.json({ success: true, message: `Sent from ${sender.email} to ${to}` });
    }
    catch (err) {
        console.error("[mail/send]", err);
        return res.status(500).json({
            success: false,
            message: "Send failed. Hostinger login was rejected — confirm the selected From email matches that mailbox app password, then try again.",
        });
    }
});
exports.default = router;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_middleware_1 = require("../middleware/role.middleware");
const chatService_1 = require("../assistant/chatService");
function parseHistory(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const item of raw.slice(-8)) {
        if (!item || typeof item !== "object")
            continue;
        const role = String(item.role ?? "");
        const text = String(item.text ?? "").trim();
        if ((role !== "user" && role !== "assistant") || !text)
            continue;
        out.push({ role, text: text.slice(0, 2000) });
    }
    return out;
}
const router = express_1.default.Router();
const STAFF = ["admin"];
const chatLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many assistant requests. Slow down." },
});
router.use(auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)(...STAFF));
router.use(chatLimiter);
router.post("/chat", async (req, res) => {
    try {
        const message = String(req.body?.message ?? "").trim();
        if (!message) {
            return res.status(400).json({ success: false, message: "Type a question first." });
        }
        if (message.length > 2000) {
            return res.status(400).json({ success: false, message: "Message is too long." });
        }
        if (!req.user?.id || !req.user.role) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }
        const result = await (0, chatService_1.runAssistantChat)({
            userId: req.user.id,
            role: req.user.role,
            message,
            history: parseHistory(req.body?.history),
        });
        return res.json({ success: true, ...result });
    }
    catch (err) {
        console.error("[assistant/chat]", err);
        return res.status(500).json({ success: false, message: "Assistant failed. Try again." });
    }
});
exports.default = router;

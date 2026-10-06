"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const helmet_1 = __importDefault(require("helmet"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const csr_routes_1 = __importDefault(require("./routes/csr.routes"));
const upload_routes_1 = __importDefault(require("./routes/upload.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const report_routes_1 = __importDefault(require("./routes/report.routes"));
const reportUpload_routes_1 = __importDefault(require("./routes/reportUpload.routes"));
const chat_routes_1 = __importDefault(require("./routes/chat.routes"));
const accounts_routes_1 = __importDefault(require("./routes/accounts.routes"));
const estimator_routes_1 = __importDefault(require("./routes/estimator.routes"));
const staffEmployees_routes_1 = __importDefault(require("./routes/staffEmployees.routes"));
const mail_routes_1 = __importDefault(require("./routes/mail.routes"));
const assistant_routes_1 = __importDefault(require("./routes/assistant.routes"));
const rateLimit_middleware_1 = require("./middleware/rateLimit.middleware");
const env_1 = require("./config/env");
dotenv_1.default.config();
(0, env_1.validateEnv)();
const app = (0, express_1.default)();
app.set("trust proxy", 1);
const isProd = process.env.NODE_ENV === "production";
const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://crm-blond-theta.vercel.app",
    "https://dashboard.bemsolutions.io",
    process.env.FRONTEND_URL?.replace(/\/$/, ""),
].filter(Boolean);
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: isProd ? {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
            frameSrc: ["'self'", "https://challenges.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", process.env.FRONTEND_URL ?? ""].filter(Boolean),
        },
    } : false,
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin))
            return callback(null, true);
        if (/^https:\/\/([a-z0-9-]+\.)?bemsolutions\.io$/i.test(origin))
            return callback(null, true);
        if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin))
            return callback(null, true);
        callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    maxAge: 86400,
}));
app.use(express_1.default.json({ limit: "1mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "1mb" }));
app.use((0, cookie_parser_1.default)());
app.use("/api", rateLimit_middleware_1.apiLimiter);
app.use("/api/auth", auth_routes_1.default);
app.use("/api/admin", admin_routes_1.default);
app.use("/api/csr", csr_routes_1.default);
app.use("/api/users", user_routes_1.default);
app.use("/api/uploads", upload_routes_1.default);
app.use("/api/reports", report_routes_1.default);
app.use("/api/report-uploads", reportUpload_routes_1.default);
app.use("/api/chat", chat_routes_1.default);
app.use("/api/accounts", accounts_routes_1.default);
app.use("/api/estimator", estimator_routes_1.default);
app.use("/api/admin/staff-employees", staffEmployees_routes_1.default);
app.use("/api/mail", mail_routes_1.default);
app.use("/api/assistant", assistant_routes_1.default);
app.use((err, _req, res, next) => {
    if (err instanceof SyntaxError && "body" in err) {
        return res.status(400).json({ success: false, message: "Invalid JSON body." });
    }
    if (err.message?.includes("file") || err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ success: false, message: err.message || "File upload error." });
    }
    next(err);
});
exports.default = app;

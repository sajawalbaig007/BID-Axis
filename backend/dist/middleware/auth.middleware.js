"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = __importDefault(require("../config/db"));
const security_1 = require("../config/security");
const sessions_1 = require("../utils/sessions");
const networkAccess_1 = require("../utils/networkAccess");
const JWT_SECRET = (0, security_1.getJwtSecret)();
const verifyToken = async (req, res, next) => {
    try {
        const token = req.cookies?.token ??
            req.headers.authorization?.replace("Bearer ", "");
        if (!token) {
            return res.status(401).json({ success: false, message: "No token provided" });
        }
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (!decoded.sid) {
            return res.status(401).json({
                success: false,
                code: "SESSION_INVALID",
                message: "Session expired. Please log in again.",
            });
        }
        const user = await db_1.default.user.findUnique({
            where: { id: decoded.id },
            select: {
                activeSessionId: true,
                tokenVersion: true,
                isActive: true,
                role: true,
                allowedIps: true,
                allowedMacAddress: true,
                temporaryAccessIp: true,
                temporaryAccessMac: true,
                temporaryAccessUntil: true,
            },
        });
        if (!user?.isActive) {
            return res.status(403).json({ success: false, message: "Account is deactivated" });
        }
        if (!user.activeSessionId ||
            user.activeSessionId !== decoded.sid ||
            user.tokenVersion !== decoded.tv) {
            return res.status(401).json({
                success: false,
                code: "SESSION_INVALID",
                message: "Session expired. Please log in again.",
            });
        }
        if (user.role !== decoded.role) {
            return res.status(401).json({
                success: false,
                code: "SESSION_INVALID",
                message: "Session expired. Please log in again.",
            });
        }
        const networkError = (0, networkAccess_1.evaluateNetworkAccess)(user, req);
        if (networkError) {
            return res.status(403).json({
                success: false,
                code: "NETWORK_POLICY_DENIED",
                message: networkError,
            });
        }
        void (0, sessions_1.touchActiveSession)(decoded.id);
        req.user = {
            id: decoded.id,
            role: decoded.role,
            iat: decoded.iat,
            tv: decoded.tv,
            sid: decoded.sid,
        };
        next();
    }
    catch {
        return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
};
exports.verifyToken = verifyToken;

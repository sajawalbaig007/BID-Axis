"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.adminLogoutAllDevices = exports.adminSetUserPassword = exports.updateUser = exports.getUsers = void 0;
const db_1 = __importDefault(require("../config/db"));
const cache_1 = require("../utils/cache");
const purgeCsrLeads_1 = require("../utils/purgeCsrLeads");
const chatSocket_1 = require("../chat/chatSocket");
const report_controller_1 = require("./report.controller");
const hash_1 = require("../utils/hash");
const security_1 = require("../config/security");
const passwordBreach_1 = require("../utils/passwordBreach");
const auditLog_1 = require("../utils/auditLog");
const accessHistory_1 = require("../utils/accessHistory");
const requestMeta_1 = require("../utils/requestMeta");
const sessions_1 = require("../utils/sessions");
const networkAccess_1 = require("../utils/networkAccess");
function parseTemporaryHours(raw) {
    if (raw === undefined || raw === null || raw === "")
        return null;
    const n = Number(raw);
    if (n === 9 || n === 10)
        return n;
    return null;
}
const getUsers = async (req, res) => {
    try {
        const users = await db_1.default.user.findMany();
        res.json(users);
    }
    catch {
        res.status(500).json({ message: "Server error" });
    }
};
exports.getUsers = getUsers;
const updateUser = async (req, res) => {
    try {
        const id = req.params.id;
        const { name, email, role, isActive, csrCode, employeeCode, fatherName, currentAddress, contactNo, cnic, cnicPdfUrl, profilePic, allowedIps, allowedMacAddress, temporaryAccessIp, temporaryAccessMac, temporaryAccessHours, chatEnabled, chatAllowedUserIds, chatVisibleToUserIds, } = req.body;
        const data = {};
        if (name !== undefined)
            data.name = name;
        if (email !== undefined)
            data.email = email;
        if (role !== undefined)
            data.role = role;
        if (isActive !== undefined)
            data.isActive = isActive;
        if (csrCode !== undefined)
            data.csrCode = csrCode || null;
        if (employeeCode !== undefined) {
            const code = typeof employeeCode === "string" ? employeeCode.trim() : "";
            if (code) {
                const empTaken = await db_1.default.user.findFirst({
                    where: { employeeCode: code, NOT: { id } },
                    select: { id: true },
                });
                if (empTaken) {
                    return res.status(400).json({ message: `Employee Code "${code}" is already in use.` });
                }
            }
            data.employeeCode = code || null;
        }
        if (fatherName !== undefined)
            data.fatherName = typeof fatherName === "string" && fatherName.trim() ? fatherName.trim() : null;
        if (currentAddress !== undefined) {
            data.currentAddress =
                typeof currentAddress === "string" && currentAddress.trim() ? currentAddress.trim() : null;
        }
        if (contactNo !== undefined) {
            data.contactNo = typeof contactNo === "string" && contactNo.trim() ? contactNo.trim() : null;
        }
        if (cnic !== undefined)
            data.cnic = cnic || null;
        if (cnicPdfUrl !== undefined)
            data.cnicPdfUrl = cnicPdfUrl || null;
        if (profilePic !== undefined)
            data.profilePic = profilePic || null;
        if (allowedIps !== undefined)
            data.allowedIps = (0, networkAccess_1.sanitizeIpList)(allowedIps);
        if (allowedMacAddress !== undefined)
            data.allowedMacAddress = allowedMacAddress?.trim() || null;
        if (temporaryAccessIp !== undefined)
            data.temporaryAccessIp = temporaryAccessIp?.trim() || null;
        if (temporaryAccessMac !== undefined)
            data.temporaryAccessMac = temporaryAccessMac?.trim() || null;
        if (temporaryAccessHours !== undefined || temporaryAccessIp !== undefined || temporaryAccessMac !== undefined) {
            const h = parseTemporaryHours(temporaryAccessHours);
            data.temporaryAccessUntil =
                h && (temporaryAccessIp?.trim() || temporaryAccessMac?.trim())
                    ? new Date(Date.now() + h * 60 * 60 * 1000)
                    : null;
        }
        if (chatEnabled !== undefined)
            data.chatEnabled = Boolean(chatEnabled);
        if (chatAllowedUserIds !== undefined) {
            const ids = Array.isArray(chatAllowedUserIds)
                ? chatAllowedUserIds.filter((x) => typeof x === "string" && x.trim().length > 0)
                : [];
            data.chatAllowedUserIds = Array.from(new Set(ids.filter((uid) => uid !== id)));
        }
        if (chatVisibleToUserIds !== undefined) {
            const ids = Array.isArray(chatVisibleToUserIds)
                ? chatVisibleToUserIds.filter((x) => typeof x === "string" && x.trim().length > 0)
                : [];
            data.chatVisibleToUserIds = Array.from(new Set(ids.filter((uid) => uid !== id)));
        }
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ message: "No fields to update" });
        }
        const user = await db_1.default.user.update({
            where: { id },
            data,
            select: {
                id: true, name: true, email: true, role: true, csrCode: true,
                employeeCode: true, fatherName: true, currentAddress: true, contactNo: true,
                cnic: true, cnicPdfUrl: true, profilePic: true, isActive: true,
                allowedIps: true, allowedMacAddress: true, temporaryAccessIp: true, temporaryAccessMac: true, temporaryAccessUntil: true,
                chatEnabled: true, chatAllowedUserIds: true, chatVisibleToUserIds: true,
            },
        });
        (0, cache_1.invalidateCache)("users:list", "users:list:admin", "users:list:csr", "users:list:manager", "admin:csrs", `auth:me:${id}`);
        if (chatEnabled !== undefined || chatAllowedUserIds !== undefined || chatVisibleToUserIds !== undefined) {
            (0, cache_1.invalidatePattern)("chat:convs:");
        }
        return res.json(user);
    }
    catch (err) {
        console.error("[users] updateUser", err);
        return res.status(500).json({ message: "Update failed" });
    }
};
exports.updateUser = updateUser;
const adminSetUserPassword = async (req, res) => {
    try {
        const id = req.params.id;
        const { newPassword } = req.body;
        if (!newPassword) {
            return res.status(400).json({ success: false, message: "New password is required." });
        }
        const pwdError = (0, security_1.validatePassword)(newPassword);
        if (pwdError) {
            return res.status(400).json({ success: false, message: pwdError });
        }
        const breachError = await (0, passwordBreach_1.assertPasswordNotBreached)(newPassword);
        if (breachError) {
            return res.status(400).json({ success: false, message: breachError });
        }
        const target = await db_1.default.user.findUnique({ where: { id }, select: { id: true, email: true } });
        if (!target) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        const hashed = await (0, hash_1.hashPassword)(newPassword);
        await db_1.default.user.update({
            where: { id },
            data: { password: hashed, tokenVersion: { increment: 1 } },
        });
        await (0, sessions_1.clearActiveSession)(id);
        await (0, auditLog_1.writeAuditLog)({
            action: "admin_password_reset",
            userId: id,
            email: target.email,
            ip: (0, requestMeta_1.getClientIp)(req),
            userAgent: (0, requestMeta_1.getUserAgent)(req),
            meta: { resetBy: req.user?.id },
        });
        (0, cache_1.invalidateCache)("users:list", "users:list:admin", "users:list:csr", "admin:csrs");
        return res.json({ success: true, message: "Password updated. User must sign in again." });
    }
    catch {
        return res.status(500).json({ success: false, message: "Failed to update password." });
    }
};
exports.adminSetUserPassword = adminSetUserPassword;
const adminLogoutAllDevices = async (req, res) => {
    try {
        const id = req.params.id;
        const target = await db_1.default.user.findUnique({
            where: { id },
            select: { id: true, email: true, name: true },
        });
        if (!target) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        await db_1.default.user.update({
            where: { id },
            data: {
                tokenVersion: { increment: 1 },
                isOnline: false,
                activeSessionId: null,
            },
        });
        await (0, sessions_1.clearActiveSession)(id);
        sessions_1.userBrowserMap.delete(id);
        (0, chatSocket_1.forceLogoutUser)(id);
        const ip = (0, requestMeta_1.getClientIp)(req);
        const ua = (0, requestMeta_1.getUserAgent)(req);
        await (0, auditLog_1.writeAuditLog)({
            action: "admin_logout_all",
            userId: id,
            email: target.email,
            ip,
            userAgent: ua,
            meta: { resetBy: req.user?.id },
        });
        await (0, accessHistory_1.recordAccessHistory)({
            userId: id,
            email: target.email,
            ip,
            userAgent: ua,
            event: "logout_all",
        });
        (0, cache_1.invalidateCache)(`auth:me:${id}`, "users:list", "users:list:admin", "users:list:csr", "users:list:manager", "admin:csrs");
        return res.json({
            success: true,
            message: `${target.name} was logged out from all devices.`,
            self: req.user?.id === id,
        });
    }
    catch {
        return res.status(500).json({ success: false, message: "Failed to log user out." });
    }
};
exports.adminLogoutAllDevices = adminLogoutAllDevices;
const deleteUser = async (req, res) => {
    try {
        const id = req.params.id;
        /* 1. Permanently remove all lead data assigned to this user */
        await (0, purgeCsrLeads_1.purgeCsrLeads)(id);
        /* 2. CSR-level call logs (safety net — purgeCsrLeads already clears these) */
        await db_1.default.callLog.deleteMany({ where: { csrId: id } });
        /* 3. Chat messages — nullify replyToId before deleting to avoid dangling refs */
        const userMsgs = await db_1.default.message.findMany({ where: { senderId: id }, select: { id: true } });
        if (userMsgs.length > 0) {
            const msgIds = userMsgs.map(m => m.id);
            await db_1.default.message.updateMany({ where: { replyToId: { in: msgIds } }, data: { replyToId: null } });
            await db_1.default.message.deleteMany({ where: { senderId: id } });
        }
        /* 4. Conversation memberships */
        await db_1.default.conversationMember.deleteMany({ where: { userId: id } });
        /* 5. Reports — just nullify the FK, keep the report */
        await db_1.default.report.updateMany({ where: { generatedBy: id }, data: { generatedBy: null } });
        /* 6. Session / audit / access rows that block User delete (required FKs) */
        await db_1.default.accessHistory.deleteMany({ where: { userId: id } });
        await db_1.default.csrWorkSession.deleteMany({ where: { userId: id } });
        await db_1.default.securityAuditLog.updateMany({ where: { userId: id }, data: { userId: null } });
        await db_1.default.loginAttemptAlert.deleteMany({ where: { userId: id } });
        await db_1.default.staffEmployee.updateMany({ where: { userId: id }, data: { userId: null } });
        /* 7. Delete the user */
        await db_1.default.user.delete({ where: { id } });
        (0, cache_1.flushAdminClientsCache)();
        (0, report_controller_1.flushReportCache)();
        (0, chatSocket_1.notifyAdminSummaryStale)();
        (0, cache_1.invalidateCache)("users:list", "users:list:admin", "users:list:csr", "admin:csrs", `csr:dashboard:${id}`, `csr:leads:${id}`);
        res.json({ success: true, message: "User deleted" });
    }
    catch (err) {
        console.log("[deleteUser]", err);
        const detail = err && typeof err === "object" && "message" in err
            ? String(err.message ?? "")
            : "";
        res.status(500).json({
            message: detail.includes("Foreign key") || detail.includes("constraint")
                ? "Delete failed — linked records could not be cleared. Try again or contact support."
                : "Delete failed",
        });
    }
};
exports.deleteUser = deleteUser;

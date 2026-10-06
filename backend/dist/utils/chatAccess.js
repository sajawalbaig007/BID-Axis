"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BEM_CHAT_ROLES = exports.GPS_CHAT_ROLES = void 0;
exports.canSeeRoleByOrg = canSeeRoleByOrg;
exports.getChatAccess = getChatAccess;
exports.isChatEnabled = isChatEnabled;
exports.canMessageUser = canMessageUser;
exports.isVisibleToUser = isVisibleToUser;
exports.assertSenderCanChat = assertSenderCanChat;
exports.assertCanMessageTarget = assertCanMessageTarget;
exports.chatDisplayName = chatDisplayName;
const db_1 = __importDefault(require("../config/db"));
/** GPS company chat pool */
exports.GPS_CHAT_ROLES = ["technical_manager", "estimator"];
/** BEM company chat pool (admin is visible to both orgs) */
exports.BEM_CHAT_ROLES = ["csr", "manager", "accounts", "admin"];
/**
 * Who can see whom in Messages:
 * - Admin → everyone
 * - GPS (technical_manager, estimator) → GPS + admin + accounts
 * - Accounts → BEM + GPS + admin (bridge both orgs)
 * - BEM (csr, manager) → BEM employees (+ admin)
 */
function canSeeRoleByOrg(viewerRole, targetRole) {
    const viewer = String(viewerRole || "").toLowerCase();
    const target = String(targetRole || "").toLowerCase();
    if (!viewer || !target)
        return false;
    if (viewer === "admin")
        return true;
    if (viewer === "technical_manager" || viewer === "estimator") {
        return (target === "admin" ||
            target === "technical_manager" ||
            target === "estimator" ||
            target === "accounts");
    }
    if (viewer === "accounts") {
        return (target === "admin" ||
            target === "csr" ||
            target === "manager" ||
            target === "accounts" ||
            target === "technical_manager" ||
            target === "estimator");
    }
    // BEM pool (csr, manager)
    return target === "admin" || target === "csr" || target === "manager" || target === "accounts";
}
async function getChatAccess(userId) {
    const user = await db_1.default.user.findUnique({
        where: { id: userId },
        select: { role: true, chatEnabled: true, chatAllowedUserIds: true, chatVisibleToUserIds: true },
    });
    if (!user)
        return null;
    return {
        role: String(user.role),
        chatEnabled: user.chatEnabled !== false,
        chatAllowedUserIds: Array.isArray(user.chatAllowedUserIds) ? user.chatAllowedUserIds : [],
        chatVisibleToUserIds: Array.isArray(user.chatVisibleToUserIds) ? user.chatVisibleToUserIds : [],
    };
}
/** True when this user may use chat at all. */
function isChatEnabled(access) {
    return !!access && access.chatEnabled !== false;
}
/**
 * Can `me` start/message `target`?
 * - chat must be enabled for me
 * - empty allowlist = unrestricted
 * - otherwise target must be in allowlist
 */
function canMessageUser(access, targetUserId) {
    if (!isChatEnabled(access))
        return false;
    const list = access.chatAllowedUserIds;
    if (!list.length)
        return true;
    return list.includes(targetUserId);
}
/** Whether `viewerUserId` is allowed to discover/message this target account. */
function isVisibleToUser(targetAccess, viewerUserId) {
    if (!targetAccess || targetAccess.chatEnabled === false)
        return false;
    const list = targetAccess.chatVisibleToUserIds ?? [];
    return !list.length || list.includes(viewerUserId);
}
async function assertSenderCanChat(userId) {
    const access = await getChatAccess(userId);
    if (!access)
        return { ok: false, status: 401, message: "Unauthorized" };
    if (!isChatEnabled(access)) {
        return { ok: false, status: 403, message: "Chat is disabled for your account. Contact admin." };
    }
    return { ok: true, access };
}
async function assertCanMessageTarget(meId, targetId) {
    const gate = await assertSenderCanChat(meId);
    if (!gate.ok)
        return gate;
    if (!canMessageUser(gate.access, targetId)) {
        return { ok: false, status: 403, message: "You are not allowed to message this user." };
    }
    const target = await db_1.default.user.findUnique({
        where: { id: targetId },
        select: {
            role: true,
            chatEnabled: true,
            chatAllowedUserIds: true,
            chatVisibleToUserIds: true,
            isActive: true,
        },
    });
    if (!target?.isActive) {
        return { ok: false, status: 404, message: "User not found." };
    }
    if (target.chatEnabled === false) {
        return { ok: false, status: 403, message: "This user cannot receive messages." };
    }
    if (!canSeeRoleByOrg(gate.access.role, String(target.role))) {
        return { ok: false, status: 403, message: "You can only message people in your company." };
    }
    if (!isVisibleToUser(target, meId)) {
        return { ok: false, status: 403, message: "This user is hidden from your messages." };
    }
    return { ok: true };
}
const ROLE_DISPLAY = {
    admin: "CEO",
    csr: "CSR",
    manager: "Admin",
    technical_manager: "Chief Estimator",
    estimator: "Estimator",
    accounts: "Accounts",
};
/** Never show literal "Unknown" — prefer name, then email, then role label. */
function chatDisplayName(user) {
    const name = String(user?.name ?? "").trim();
    if (name && name.toLowerCase() !== "unknown")
        return name;
    const email = String(user?.email ?? "").trim();
    if (email)
        return email.includes("@") ? email.split("@")[0] : email;
    const code = String(user?.csrCode ?? "").trim();
    if (code)
        return code;
    const role = String(user?.role ?? "").toLowerCase();
    if (role && ROLE_DISPLAY[role])
        return ROLE_DISPLAY[role];
    if (role)
        return role.replace(/_/g, " ");
    return "User";
}

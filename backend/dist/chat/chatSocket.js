"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initChatSocket = initChatSocket;
exports.emitTyping = emitTyping;
exports.emitNewMessage = emitNewMessage;
exports.emitMessageEdit = emitMessageEdit;
exports.emitMessageDelete = emitMessageDelete;
exports.emitMessageReaction = emitMessageReaction;
exports.emitConversationRead = emitConversationRead;
exports.emitPinnedMessage = emitPinnedMessage;
exports.emitPresence = emitPresence;
exports.notifyCsrDataReset = notifyCsrDataReset;
exports.forceLogoutUser = forceLogoutUser;
exports.notifyLoginAttempt = notifyLoginAttempt;
exports.notifyAdminSummaryStale = notifyAdminSummaryStale;
exports.isChatSocketReady = isChatSocketReady;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ws_1 = require("ws");
const db_1 = __importDefault(require("../config/db"));
const security_1 = require("../config/security");
const chatMessageFormat_1 = require("./chatMessageFormat");
const chatAccess_1 = require("../utils/chatAccess");
const clients = new Map();
const userSockets = new Map();
let wss = null;
function send(ws, payload) {
    if (ws.readyState === ws_1.WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}
function sendToUser(userId, payload) {
    const set = userSockets.get(userId);
    if (!set)
        return;
    for (const ws of set)
        send(ws, payload);
}
function broadcastPresence(userId, isOnline) {
    for (const [ws] of clients) {
        send(ws, { type: "presence", userId, isOnline });
    }
}
async function verifyWsToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, (0, security_1.getJwtSecret)());
        if (!decoded.sid)
            return null;
        const user = await db_1.default.user.findUnique({
            where: { id: decoded.id },
            select: {
                activeSessionId: true, tokenVersion: true, isActive: true, role: true, name: true,
                chatEnabled: true,
            },
        });
        if (!user?.isActive)
            return null;
        if (user.chatEnabled === false)
            return null;
        if (!user.activeSessionId ||
            user.activeSessionId !== decoded.sid ||
            user.tokenVersion !== decoded.tv ||
            user.role !== decoded.role)
            return null;
        return { id: decoded.id, role: decoded.role };
    }
    catch {
        return null;
    }
}
function registerClient(ws, userId, role, name) {
    clients.set(ws, { userId, role, name, watchingConvId: null });
    if (!userSockets.has(userId))
        userSockets.set(userId, new Set());
    userSockets.get(userId).add(ws);
}
function unregisterClient(ws) {
    const meta = clients.get(ws);
    if (!meta)
        return;
    clients.delete(ws);
    const set = userSockets.get(meta.userId);
    if (set) {
        set.delete(ws);
        if (set.size === 0) {
            userSockets.delete(meta.userId);
            void setUserOffline(meta.userId);
        }
    }
}
async function setUserOnline(userId) {
    await db_1.default.user.update({
        where: { id: userId },
        data: { isOnline: true, lastActive: new Date() },
    }).catch(() => { });
    broadcastPresence(userId, true);
}
async function setUserOffline(userId) {
    await db_1.default.user.update({
        where: { id: userId },
        data: { isOnline: false },
    }).catch(() => { });
    broadcastPresence(userId, false);
}
function isUserWatchingConv(userId, conversationId) {
    for (const [, meta] of clients) {
        if (meta.userId === userId && meta.watchingConvId === conversationId)
            return true;
    }
    return false;
}
function initChatSocket(server) {
    wss = new ws_1.WebSocketServer({ server, path: "/ws/chat" });
    wss.on("connection", async (ws, req) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        const token = url.searchParams.get("token") ?? "";
        const auth = await verifyWsToken(token);
        if (!auth) {
            ws.close(4401, "Unauthorized");
            return;
        }
        const user = await db_1.default.user.findUnique({
            where: { id: auth.id },
            select: { name: true },
        });
        const name = user?.name ?? "User";
        registerClient(ws, auth.id, auth.role, name);
        await setUserOnline(auth.id);
        send(ws, { type: "connected", userId: auth.id });
        ws.on("message", (raw) => {
            void handleClientMessage(ws, raw.toString());
        });
        ws.on("close", () => {
            unregisterClient(ws);
        });
        ws.on("error", () => {
            unregisterClient(ws);
        });
    });
    console.log("[Chat WS] WebSocket server ready at /ws/chat");
}
async function handleClientMessage(ws, raw) {
    const meta = clients.get(ws);
    if (!meta)
        return;
    let msg;
    try {
        msg = JSON.parse(raw);
    }
    catch {
        return;
    }
    switch (msg.type) {
        case "ping":
            send(ws, { type: "pong" });
            await db_1.default.user.update({
                where: { id: meta.userId },
                data: { lastActive: new Date(), isOnline: true },
            }).catch(() => { });
            break;
        case "presence": {
            const online = Boolean(msg.online);
            await db_1.default.user.update({
                where: { id: meta.userId },
                data: { isOnline: online, lastActive: new Date() },
            }).catch(() => { });
            broadcastPresence(meta.userId, online);
            break;
        }
        case "watch":
            meta.watchingConvId = msg.conversationId ?? null;
            break;
        case "typing":
            if (!msg.conversationId)
                break;
            emitTyping(msg.conversationId, meta.userId, meta.name);
            break;
        default:
            break;
    }
}
function emitTyping(conversationId, userId, name) {
    void (async () => {
        const members = await db_1.default.conversationMember.findMany({
            where: { conversationId },
            select: { userId: true },
        });
        for (const m of members) {
            if (m.userId === userId)
                continue;
            sendToUser(m.userId, { type: "typing", conversationId, userId, name });
        }
    })();
}
function emitNewMessage(conversationId, senderId, message, members) {
    const preview = (0, chatMessageFormat_1.messagePreviewText)(message.type, message.text);
    const lastMessageAt = message.createdAt instanceof Date
        ? message.createdAt.toISOString()
        : String(message.createdAt);
    for (const member of members) {
        const uid = member.userId;
        const formatted = (0, chatMessageFormat_1.formatMessage)(message, uid, members);
        sendToUser(uid, { type: "message:new", conversationId, message: formatted });
        const watching = isUserWatchingConv(uid, conversationId);
        const incrementUnread = uid !== senderId && !watching;
        sendToUser(uid, {
            type: "conversation:update",
            conversationId,
            lastMessage: preview,
            lastMessageAt,
            senderName: (0, chatAccess_1.chatDisplayName)(message.sender),
            incrementUnread,
        });
    }
}
function emitMessageEdit(conversationId, message, members) {
    for (const member of members) {
        sendToUser(member.userId, {
            type: "message:edit",
            conversationId,
            message: (0, chatMessageFormat_1.formatMessage)(message, member.userId, members),
        });
    }
}
function emitMessageDelete(conversationId, messageId, memberIds) {
    for (const uid of memberIds) {
        sendToUser(uid, { type: "message:delete", conversationId, messageId });
    }
}
function emitMessageReaction(conversationId, messageId, reactions, memberIds) {
    for (const uid of memberIds) {
        sendToUser(uid, { type: "message:reaction", conversationId, messageId, reactions });
    }
}
function emitConversationRead(conversationId, userId, readAt, memberIds) {
    for (const uid of memberIds) {
        sendToUser(uid, { type: "read", conversationId, userId, readAt });
    }
}
function emitPinnedMessage(conversationId, pinnedMessage, memberIds) {
    for (const uid of memberIds) {
        sendToUser(uid, { type: "message:pinned", conversationId, pinnedMessage });
    }
}
function emitPresence(userId, isOnline) {
    broadcastPresence(userId, isOnline);
}
/** Tell a CSR browser to drop cached lists after admin reset. */
function notifyCsrDataReset(csrId) {
    sendToUser(csrId, { type: "csr-data-reset" });
}
/** Drop every live socket for this user and tell their browser to sign out. */
function forceLogoutUser(userId) {
    sendToUser(userId, {
        type: "auth:force_logout",
        message: "You were logged out from all devices by an administrator.",
    });
    setTimeout(() => {
        const set = userSockets.get(userId);
        if (!set)
            return;
        for (const ws of [...set]) {
            try {
                ws.close(4401, "Logged out");
            }
            catch { /* ignore */ }
        }
    }, 150);
    broadcastPresence(userId, false);
}
/** Notify the active session that another device tried to log in. */
function notifyLoginAttempt(userId, attemptId) {
    sendToUser(userId, {
        type: "auth:login_attempt",
        attemptId,
        message: "Someone is trying to login to your account from another device.",
    });
}
/** Tell admin/manager browsers to refresh dashboard summary counts. */
function notifyAdminSummaryStale() {
    for (const [ws, meta] of clients) {
        if (meta.role === "admin" || meta.role === "manager") {
            send(ws, { type: "admin-summary-stale" });
        }
    }
}
function isChatSocketReady() {
    return wss !== null;
}

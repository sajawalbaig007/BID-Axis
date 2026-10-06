"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const db_1 = __importDefault(require("../config/db"));
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_middleware_1 = require("../middleware/role.middleware");
const cache_1 = require("../utils/cache");
const chatMessageFormat_1 = require("../chat/chatMessageFormat");
const chatSocket_1 = require("../chat/chatSocket");
const chatAccess_1 = require("../utils/chatAccess");
const router = express_1.default.Router();
/* ── multer: 200 MB in-memory ── */
const chatUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 },
});
/* ── In-memory typing map: convId → userId → { name, expiresAt } ── */
const typingMap = new Map();
/* helper — Express 5 params are string | string[], extract the string */
function p(val) {
    return Array.isArray(val) ? val[0] : val;
}
function notDeletedMessageWhere() {
    return {
        OR: [
            { deletedAt: null },
            { deletedAt: { isSet: false } },
        ],
    };
}
async function getConversationMemberIds(conversationId) {
    const rows = await db_1.default.conversationMember.findMany({
        where: { conversationId },
        select: { userId: true },
    });
    return rows.map(r => r.userId);
}
async function fetchConversationsForUser(viewUserId, showArchived, opts) {
    const includeEmpty = opts?.includeEmpty === true;
    const includeCleared = opts?.includeCleared === true;
    const viewerAccess = await (0, chatAccess_1.getChatAccess)(viewUserId);
    if (!viewerAccess?.chatEnabled)
        return [];
    const memberships = await db_1.default.conversationMember.findMany({
        where: { userId: viewUserId },
        include: {
            conversation: {
                include: {
                    members: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    role: true,
                                    csrCode: true,
                                    profilePic: true,
                                    isOnline: true,
                                    isActive: true,
                                    chatEnabled: true,
                                    chatAllowedUserIds: true,
                                    chatVisibleToUserIds: true,
                                },
                            },
                        },
                    },
                    messages: {
                        // Admin peek: include soft-deleted so empty/cleared threads still have preview context
                        ...(includeEmpty ? {} : { where: notDeletedMessageWhere() }),
                        orderBy: { createdAt: "desc" },
                        take: 15,
                        select: { text: true, type: true, createdAt: true, senderId: true, hiddenForUserIds: true, deletedAt: true },
                    },
                },
            },
        },
        orderBy: { conversation: { updatedAt: "desc" } },
    });
    const filteredMemberships = memberships.filter(m => {
        if (!includeCleared && m.clearedAt)
            return false;
        if (showArchived ? !m.archivedAt : Boolean(m.archivedAt))
            return false;
        const otherMembers = m.conversation.members.filter(member => member.userId !== viewUserId);
        return otherMembers.every(member => member.user.isActive &&
            (0, chatAccess_1.canMessageUser)(viewerAccess, member.userId) &&
            (0, chatAccess_1.canSeeRoleByOrg)(viewerAccess.role, String(member.user.role)) &&
            (0, chatAccess_1.isVisibleToUser)(member.user, viewUserId));
    });
    const withPreview = filteredMemberships.map((m) => {
        const conv = m.conversation;
        const lastMsg = includeEmpty
            ? (conv.messages.find(msg => messageVisibleForUser(msg, viewUserId))
                ?? conv.messages[0]
                ?? null)
            : (conv.messages.find(msg => messageVisibleForUser(msg, viewUserId)) ?? null);
        const hasVisible = conv.messages.some(msg => messageVisibleForUser(msg, viewUserId));
        return { m, lastMsg, hasVisible };
    }).filter(({ hasVisible }) => includeEmpty || hasVisible);
    const unreadCounts = await Promise.all(withPreview.map(({ m }) => db_1.default.message.count({
        where: {
            conversationId: m.conversationId,
            senderId: { not: viewUserId },
            ...notDeletedMessageWhere(),
            ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
    })));
    return withPreview.map(({ m, lastMsg }, idx) => {
        const conv = m.conversation;
        const otherMember = conv.type === "direct"
            ? conv.members.find(mem => mem.userId !== viewUserId)
            : null;
        const preview = lastMsg
            ? (lastMsg.deletedAt
                ? "Deleted message"
                : lastMsg.type !== "text"
                    ? `Sent a ${lastMsg.type}`
                    : lastMsg.text)
            : null;
        return {
            id: conv.id,
            type: conv.type,
            name: conv.type === "direct"
                ? (0, chatAccess_1.chatDisplayName)(otherMember?.user)
                : (conv.name ?? "Group"),
            otherUserId: otherMember?.userId ?? null,
            lastMessage: preview,
            lastMessageAt: lastMsg?.createdAt ?? null,
            unreadCount: unreadCounts[idx],
            memberCount: conv.members.length,
            isOnline: otherMember?.user?.isOnline ?? false,
            profilePic: otherMember?.user?.profilePic ?? null,
            pinnedMessageId: conv.pinnedMessageId ?? null,
            archived: Boolean(m.archivedAt),
            cleared: Boolean(m.clearedAt),
        };
    });
}
function messageVisibleForUser(m, viewUserId) {
    if (m.deletedAt)
        return false;
    return !(m.hiddenForUserIds ?? []).includes(viewUserId);
}
/** If the user has no visible messages left, soft-hide the chat from their recent list. */
async function clearConversationIfEmptyForUser(conversationId, userId) {
    const anyVisible = await db_1.default.message.findFirst({
        where: {
            conversationId,
            deletedAt: null,
            NOT: { hiddenForUserIds: { has: userId } },
        },
        select: { id: true },
    });
    if (anyVisible)
        return false;
    await db_1.default.conversationMember.updateMany({
        where: { conversationId, userId },
        data: { clearedAt: new Date(), archivedAt: null },
    });
    return true;
}
async function fetchMessagesForUser(conversationId, viewUserId, opts) {
    const members = await db_1.default.conversationMember.findMany({
        where: { conversationId },
        include: { user: { select: { id: true, name: true, email: true, role: true, profilePic: true } } },
    });
    const raw = await db_1.default.message.findMany({
        where: { conversationId },
        include: {
            sender: { select: { id: true, name: true, email: true, role: true, profilePic: true } },
            replyTo: {
                select: {
                    id: true, text: true, type: true,
                    sender: { select: { name: true, email: true, role: true } },
                },
            },
        },
        orderBy: { createdAt: "asc" },
        take: 200,
    });
    const auditMode = Boolean(opts?.includeDeleted);
    const visible = auditMode
        ? raw
        : raw.filter(m => messageVisibleForUser(m, viewUserId));
    const messages = visible.map(m => (0, chatMessageFormat_1.formatMessage)(m, viewUserId, members, auditMode));
    const conv = await db_1.default.conversation.findUnique({
        where: { id: conversationId },
        select: { pinnedMessageId: true },
    });
    let pinnedMessage = null;
    if (conv?.pinnedMessageId) {
        const pin = raw.find(m => m.id === conv.pinnedMessageId);
        if (pin)
            pinnedMessage = (0, chatMessageFormat_1.formatMessage)(pin, viewUserId, members, auditMode);
    }
    return { messages, pinnedMessage };
}
/* ═══════════════════════════════════════════════════════
   GET /chat/conversations
═══════════════════════════════════════════════════════ */
router.get("/conversations", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const showArchived = req.query.archived === "1";
        const cacheKey = `chat:convs:${userId}:${showArchived ? "arch" : "active"}`;
        const cached = (0, cache_1.getCache)(cacheKey);
        if (cached)
            return res.json(cached);
        const conversations = await fetchConversationsForUser(userId, showArchived);
        const payload = { conversations };
        (0, cache_1.setCache)(cacheKey, payload, 3000);
        return res.json(payload);
    }
    catch (err) {
        console.error("[chat] GET /conversations", err);
        return res.status(500).json({ message: "Failed to fetch conversations" });
    }
});
/* ═══════════════════════════════════════════════════════
   POST /chat/conversations
═══════════════════════════════════════════════════════ */
router.post("/conversations", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const meId = req.user.id;
        const body = req.body;
        const { type, userId: targetId, name, memberIds = [] } = body;
        const chatGate = await (0, chatAccess_1.assertSenderCanChat)(meId);
        if (!chatGate.ok)
            return res.status(chatGate.status).json({ message: chatGate.message });
        if (type === "direct") {
            if (!targetId)
                return res.status(400).json({ message: "userId required" });
            const allowed = await (0, chatAccess_1.assertCanMessageTarget)(meId, targetId);
            if (!allowed.ok)
                return res.status(allowed.status).json({ message: allowed.message });
            const targetUser = await db_1.default.user.findUnique({
                where: { id: targetId },
                select: { name: true, email: true, role: true, csrCode: true, isOnline: true, profilePic: true },
            });
            const convId = await db_1.default.$transaction(async (tx) => {
                const myConvIds = (await tx.conversationMember.findMany({
                    where: { userId: meId, conversation: { type: "direct" } },
                    select: { conversationId: true },
                })).map(c => c.conversationId);
                const shared = await tx.conversationMember.findFirst({
                    where: { userId: targetId, conversationId: { in: myConvIds } },
                    select: { conversationId: true },
                });
                if (shared)
                    return shared.conversationId;
                const conv = await tx.conversation.create({
                    data: {
                        type: "direct",
                        members: { create: [{ userId: meId }, { userId: targetId }] },
                    },
                });
                return conv.id;
            });
            return res.json({
                id: convId,
                conversation: {
                    id: convId, type: "direct",
                    name: (0, chatAccess_1.chatDisplayName)(targetUser),
                    otherUserId: targetId,
                    unreadCount: 0, isOnline: targetUser?.isOnline ?? false,
                    profilePic: targetUser?.profilePic ?? null,
                    lastMessageAt: new Date().toISOString(),
                },
            });
        }
        if (type === "group") {
            if (!name?.trim())
                return res.status(400).json({ message: "name required" });
            const uniqueMembers = Array.from(new Set(memberIds.filter(id => id && id !== meId)));
            for (const mid of uniqueMembers) {
                const allowed = await (0, chatAccess_1.assertCanMessageTarget)(meId, mid);
                if (!allowed.ok) {
                    return res.status(allowed.status).json({ message: allowed.message });
                }
            }
            const allIds = Array.from(new Set([meId, ...uniqueMembers]));
            const conv = await db_1.default.conversation.create({
                data: {
                    type: "group",
                    name: name.trim(),
                    members: { create: allIds.map((uid) => ({ userId: uid })) },
                },
            });
            return res.json({
                id: conv.id,
                conversation: {
                    id: conv.id, type: "group", name: conv.name,
                    unreadCount: 0, memberCount: allIds.length,
                    lastMessageAt: new Date().toISOString(),
                },
            });
        }
        return res.status(400).json({ message: "type must be direct or group" });
    }
    catch (err) {
        console.error("[chat] POST /conversations", err);
        return res.status(500).json({ message: "Failed to create conversation" });
    }
    finally {
        (0, cache_1.invalidatePattern)("chat:convs:");
    }
});
/* ═══════════════════════════════════════════════════════
   DELETE /chat/conversations/:id — soft-hide from recent chats
   Membership stays so admin peek can still open the thread.
═══════════════════════════════════════════════════════ */
router.delete("/conversations/:id", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const convId = p(req.params.id);
        await db_1.default.conversationMember.updateMany({
            where: { conversationId: convId, userId },
            data: { clearedAt: new Date(), archivedAt: null },
        });
        (0, cache_1.invalidatePattern)("chat:convs:");
        return res.json({ success: true });
    }
    catch {
        return res.json({ success: true });
    }
});
/* ═══════════════════════════════════════════════════════
   GET /chat/conversations/:id/messages
═══════════════════════════════════════════════════════ */
router.get("/conversations/:id/messages", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const conversationId = p(req.params.id);
        const member = await db_1.default.conversationMember.findUnique({
            where: { conversationId_userId: { conversationId, userId } },
        });
        if (!member)
            return res.status(403).json({ message: "Not a member" });
        const otherMembers = await db_1.default.conversationMember.findMany({
            where: { conversationId, userId: { not: userId } },
            select: { userId: true },
        });
        for (const other of otherMembers) {
            const allowed = await (0, chatAccess_1.assertCanMessageTarget)(userId, other.userId);
            if (!allowed.ok) {
                return res.status(allowed.status).json({ message: allowed.message });
            }
        }
        const { messages, pinnedMessage } = await fetchMessagesForUser(conversationId, userId);
        return res.json({ messages, pinnedMessage });
    }
    catch (err) {
        console.error("[chat] GET messages", err);
        return res.status(500).json({ message: "Failed to fetch messages" });
    }
});
/* ═══════════════════════════════════════════════════════
   POST /chat/conversations/:id/messages
═══════════════════════════════════════════════════════ */
router.post("/conversations/:id/messages", auth_middleware_1.verifyToken, chatUpload.single("file"), async (req, res) => {
    try {
        const userId = req.user.id;
        const conversationId = p(req.params.id);
        const body = req.body;
        const text = (body.text ?? "").trim();
        const msgType = (body.type ?? "text");
        const replyToId = body.replyToId;
        const mentionIds = Array.isArray(body.mentionIds)
            ? body.mentionIds.filter(id => typeof id === "string")
            : [];
        const chatGate = await (0, chatAccess_1.assertSenderCanChat)(userId);
        if (!chatGate.ok)
            return res.status(chatGate.status).json({ message: chatGate.message });
        const member = await db_1.default.conversationMember.findUnique({
            where: { conversationId_userId: { conversationId, userId } },
        });
        if (!member)
            return res.status(403).json({ message: "Not a member" });
        /* Existing DMs/groups must also respect current admin restrictions. */
        const otherMembers = await db_1.default.conversationMember.findMany({
            where: { conversationId, userId: { not: userId } },
            select: { userId: true },
        });
        for (const other of otherMembers) {
            const allowed = await (0, chatAccess_1.assertCanMessageTarget)(userId, other.userId);
            if (!allowed.ok) {
                return res.status(allowed.status).json({ message: allowed.message });
            }
        }
        let fileUrl;
        let fileName;
        let fileSize;
        let fileMimeType;
        if (req.file) {
            const mime = req.file.mimetype;
            const resourceType = mime.startsWith("image/") ? "image"
                : mime.startsWith("video/") ? "video"
                    : "raw";
            const uploaded = await new Promise((resolve, reject) => {
                cloudinary_1.default.uploader
                    .upload_stream({ resource_type: resourceType, folder: "crm_chat" }, (err, result) => {
                    if (err || !result)
                        reject(err);
                    else
                        resolve({ secure_url: result.secure_url });
                })
                    .end(req.file.buffer);
            });
            fileUrl = uploaded.secure_url;
            fileName = req.file.originalname !== "blob"
                ? req.file.originalname
                : (msgType === "voice" ? "Voice message" : req.file.originalname);
            fileSize = req.file.size;
            fileMimeType = mime;
        }
        if (!text && !fileUrl) {
            return res.status(400).json({ message: "Message cannot be empty" });
        }
        /* verify replyToId belongs to same conversation */
        let validReplyToId;
        if (replyToId) {
            const rMsg = await db_1.default.message.findFirst({
                where: { id: replyToId, conversationId },
            });
            if (rMsg)
                validReplyToId = replyToId;
        }
        const message = await db_1.default.message.create({
            data: {
                conversationId,
                senderId: userId,
                text,
                type: req.file ? msgType : "text",
                fileUrl,
                fileName,
                fileSize,
                fileMimeType,
                replyToId: validReplyToId,
                mentions: mentionIds,
            },
            include: {
                sender: { select: { id: true, name: true, email: true, role: true, profilePic: true } },
                replyTo: {
                    select: {
                        id: true, text: true, type: true,
                        sender: { select: { name: true, email: true, role: true } },
                    },
                },
            },
        });
        await db_1.default.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        });
        // New activity restores the thread on everyone's recent list
        await db_1.default.conversationMember.updateMany({
            where: { conversationId },
            data: { clearedAt: null },
        });
        (0, cache_1.invalidatePattern)("chat:convs:");
        const members = await db_1.default.conversationMember.findMany({
            where: { conversationId },
            include: { user: { select: { id: true, name: true, email: true, role: true, profilePic: true } } },
        });
        (0, chatSocket_1.emitNewMessage)(conversationId, userId, message, members);
        return res.json({
            message: (0, chatMessageFormat_1.formatMessage)(message, userId, members),
        });
    }
    catch (err) {
        console.error("[chat] POST message", err);
        return res.status(500).json({ message: "Failed to send message" });
    }
});
/* ═══════════════════════════════════════════════════════
   DELETE /chat/messages/:id
   for_me — hidden for requester only; for_everyone — soft-delete for all CSRs.
   Admin peek still sees content + delete type.
═══════════════════════════════════════════════════════ */
router.delete("/messages/:id", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const msgId = p(req.params.id);
        const mode = String(req.body?.mode ?? "for_everyone").toLowerCase();
        const msg = await db_1.default.message.findUnique({ where: { id: msgId } });
        if (!msg)
            return res.json({ success: true });
        const member = await db_1.default.conversationMember.findUnique({
            where: { conversationId_userId: { conversationId: msg.conversationId, userId } },
        });
        if (!member) {
            return res.status(403).json({ message: "Not in this conversation" });
        }
        if (mode === "for_me") {
            const hidden = msg.hiddenForUserIds ?? [];
            if (!hidden.includes(userId)) {
                await db_1.default.message.update({
                    where: { id: msgId },
                    data: { hiddenForUserIds: [...hidden, userId] },
                });
            }
            const cleared = await clearConversationIfEmptyForUser(msg.conversationId, userId);
            (0, cache_1.invalidatePattern)("chat:convs:");
            return res.json({ success: true, mode: "for_me", conversationCleared: cleared });
        }
        if (msg.deletedAt)
            return res.json({ success: true, mode: "for_everyone" });
        const role = req.user.role;
        if (role === "csr" && msg.senderId !== userId) {
            return res.status(403).json({ message: "You can only delete your own messages for everyone" });
        }
        if (role !== "admin" && role !== "csr" && msg.senderId !== userId) {
            return res.status(403).json({ message: "Cannot delete this message" });
        }
        await db_1.default.message.update({
            where: { id: msgId },
            data: {
                deletedAt: new Date(),
                deletedById: userId,
                deletedReason: "for_everyone",
            },
        });
        const memberIds = await getConversationMemberIds(msg.conversationId);
        (0, chatSocket_1.emitMessageDelete)(msg.conversationId, msgId, memberIds);
        // Soft-hide for each member who no longer has any visible messages
        for (const mid of memberIds) {
            await clearConversationIfEmptyForUser(msg.conversationId, mid);
        }
        (0, cache_1.invalidatePattern)("chat:convs:");
        return res.json({ success: true, mode: "for_everyone" });
    }
    catch {
        return res.json({ success: true });
    }
});
/* ═══════════════════════════════════════════════════════
   POST /chat/conversations/:id/read
═══════════════════════════════════════════════════════ */
router.post("/conversations/:id/read", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const conversationId = p(req.params.id);
        const readAt = new Date();
        await db_1.default.conversationMember.updateMany({
            where: { conversationId, userId },
            data: { lastReadAt: readAt },
        });
        const memberIds = await getConversationMemberIds(conversationId);
        (0, chatSocket_1.emitConversationRead)(conversationId, userId, readAt.toISOString(), memberIds);
        return res.json({ success: true });
    }
    catch {
        return res.json({ success: true });
    }
});
/* ═══════════════════════════════════════════════════════
   POST /chat/conversations/:id/typing
═══════════════════════════════════════════════════════ */
router.post("/conversations/:id/typing", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const convId = p(req.params.id);
        const userId = req.user.id;
        const user = await db_1.default.user.findUnique({ where: { id: userId }, select: { name: true } });
        const name = user?.name ?? "Someone";
        if (!typingMap.has(convId))
            typingMap.set(convId, new Map());
        typingMap.get(convId).set(userId, { name, expiresAt: Date.now() + 4000 });
        (0, chatSocket_1.emitTyping)(convId, userId, name);
        return res.json({ success: true });
    }
    catch {
        return res.json({ success: true });
    }
});
/* ═══════════════════════════════════════════════════════
   GET /chat/conversations/:id/typing
═══════════════════════════════════════════════════════ */
router.get("/conversations/:id/typing", auth_middleware_1.verifyToken, async (req, res) => {
    const convId = p(req.params.id);
    const userId = req.user.id;
    const now = Date.now();
    const conv = typingMap.get(convId);
    const names = [];
    if (conv) {
        for (const [uid, { name, expiresAt }] of conv.entries()) {
            if (expiresAt <= now) {
                conv.delete(uid);
                continue;
            }
            if (uid !== userId)
                names.push(name);
        }
    }
    return res.json({ names });
});
/* ═══════════════════════════════════════════════════════
   POST /chat/status  — heartbeat
═══════════════════════════════════════════════════════ */
router.post("/status", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const body = req.body;
        const online = Boolean(body.online);
        await db_1.default.user.update({
            where: { id: userId },
            data: { isOnline: online, lastActive: new Date() },
        });
        (0, chatSocket_1.emitPresence)(userId, online);
        return res.json({ success: true });
    }
    catch {
        return res.json({ success: true });
    }
});
/* ═══════════════════════════════════════════════════════
   GET /chat/users — admin + csr + manager (for DMs)
═══════════════════════════════════════════════════════ */
router.get("/users", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const meId = req.user.id;
        const access = await (0, chatAccess_1.getChatAccess)(meId);
        if (!access || access.chatEnabled === false) {
            return res.json({ users: [] });
        }
        const allow = access.chatAllowedUserIds.filter(id => id !== meId);
        const users = await db_1.default.user.findMany({
            where: allow.length
                ? { isActive: true, id: { in: allow } }
                : { isActive: true, id: { not: meId } },
            select: {
                id: true, name: true, email: true, role: true, csrCode: true, isOnline: true, profilePic: true,
                chatEnabled: true, chatAllowedUserIds: true, chatVisibleToUserIds: true,
            },
            orderBy: [{ name: "asc" }],
        });
        return res.json({
            users: users
                .filter(u => (0, chatAccess_1.isVisibleToUser)(u, meId) && (0, chatAccess_1.canSeeRoleByOrg)(access.role, String(u.role)))
                .map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                csrCode: u.csrCode,
                isOnline: u.isOnline,
                profilePic: u.profilePic ?? null,
            })),
        });
    }
    catch (err) {
        console.error("[chat] GET /users", err);
        return res.status(500).json({ message: "Failed to fetch users" });
    }
});
/* ═══════════════════════════════════════════════════════
   GET /chat/conversations/:id/members
═══════════════════════════════════════════════════════ */
router.get("/conversations/:id/members", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const conversationId = p(req.params.id);
        const member = await db_1.default.conversationMember.findUnique({
            where: { conversationId_userId: { conversationId, userId } },
        });
        if (!member)
            return res.status(403).json({ message: "Not a member" });
        const members = await db_1.default.conversationMember.findMany({
            where: { conversationId },
            include: { user: { select: { id: true, name: true, role: true, csrCode: true, isOnline: true, profilePic: true } } },
        });
        return res.json({
            members: members.map(m => ({
                id: m.user.id,
                name: m.user.name,
                role: m.user.role,
                csrCode: m.user.csrCode,
                isOnline: m.user.isOnline,
                profilePic: m.user.profilePic ?? null,
            })),
        });
    }
    catch {
        return res.status(500).json({ message: "Failed to fetch members" });
    }
});
/* ═══════════════════════════════════════════════════════
   PATCH /chat/messages/:id — edit within 10 minutes
═══════════════════════════════════════════════════════ */
router.patch("/messages/:id", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const msgId = p(req.params.id);
        const text = (req.body.text ?? "").trim();
        if (!text)
            return res.status(400).json({ message: "Text required" });
        const msg = await db_1.default.message.findUnique({ where: { id: msgId } });
        if (!msg || msg.senderId !== userId || msg.type !== "text") {
            return res.status(403).json({ message: "Cannot edit this message" });
        }
        if (Date.now() - msg.createdAt.getTime() > chatMessageFormat_1.EDIT_WINDOW_MS) {
            return res.status(400).json({ message: "Edit window expired (10 minutes)" });
        }
        const updated = await db_1.default.message.update({
            where: { id: msgId },
            data: { text, editedAt: new Date() },
            include: {
                sender: { select: { id: true, name: true, email: true, role: true, profilePic: true } },
                replyTo: { select: { id: true, text: true, type: true, sender: { select: { name: true, email: true, role: true } } } },
            },
        });
        const members = await db_1.default.conversationMember.findMany({
            where: { conversationId: msg.conversationId },
            include: { user: { select: { id: true, name: true, email: true, role: true, profilePic: true } } },
        });
        (0, cache_1.invalidatePattern)("chat:convs:");
        (0, chatSocket_1.emitMessageEdit)(msg.conversationId, updated, members);
        return res.json({ message: (0, chatMessageFormat_1.formatMessage)(updated, userId, members) });
    }
    catch {
        return res.status(500).json({ message: "Failed to edit message" });
    }
});
/* ═══════════════════════════════════════════════════════
   POST /chat/messages/:id/reactions — toggle emoji
═══════════════════════════════════════════════════════ */
router.post("/messages/:id/reactions", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const msgId = p(req.params.id);
        const emoji = (req.body.emoji ?? "").trim();
        if (!emoji)
            return res.status(400).json({ message: "emoji required" });
        const msg = await db_1.default.message.findUnique({ where: { id: msgId } });
        if (!msg)
            return res.status(404).json({ message: "Message not found" });
        const member = await db_1.default.conversationMember.findUnique({
            where: { conversationId_userId: { conversationId: msg.conversationId, userId } },
        });
        if (!member)
            return res.status(403).json({ message: "Not a member" });
        const reactions = (0, chatMessageFormat_1.parseReactions)(msg.reactions);
        const list = reactions[emoji] ?? [];
        if (list.includes(userId)) {
            reactions[emoji] = list.filter(id => id !== userId);
            if (reactions[emoji].length === 0)
                delete reactions[emoji];
        }
        else {
            reactions[emoji] = [...list, userId];
        }
        await db_1.default.message.update({
            where: { id: msgId },
            data: { reactions },
        });
        const memberIds = await getConversationMemberIds(msg.conversationId);
        (0, chatSocket_1.emitMessageReaction)(msg.conversationId, msgId, reactions, memberIds);
        return res.json({ reactions });
    }
    catch {
        return res.status(500).json({ message: "Failed to update reaction" });
    }
});
/* ═══════════════════════════════════════════════════════
   POST /chat/conversations/:id/pin
═══════════════════════════════════════════════════════ */
router.post("/conversations/:id/pin", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const conversationId = p(req.params.id);
        const messageId = req.body.messageId ?? null;
        const member = await db_1.default.conversationMember.findUnique({
            where: { conversationId_userId: { conversationId, userId } },
        });
        if (!member)
            return res.status(403).json({ message: "Not a member" });
        if (messageId) {
            const msg = await db_1.default.message.findFirst({ where: { id: messageId, conversationId } });
            if (!msg)
                return res.status(404).json({ message: "Message not found" });
        }
        await db_1.default.conversation.update({
            where: { id: conversationId },
            data: { pinnedMessageId: messageId },
        });
        (0, cache_1.invalidatePattern)("chat:convs:");
        const members = await db_1.default.conversationMember.findMany({
            where: { conversationId },
            include: { user: { select: { id: true, name: true, email: true, role: true, profilePic: true } } },
        });
        let pinnedMessage = null;
        if (messageId) {
            const pin = await db_1.default.message.findFirst({
                where: { id: messageId, conversationId },
                include: {
                    sender: { select: { id: true, name: true, email: true, role: true, profilePic: true } },
                    replyTo: { select: { id: true, text: true, type: true, sender: { select: { name: true, email: true, role: true } } } },
                },
            });
            if (pin)
                pinnedMessage = (0, chatMessageFormat_1.formatMessage)(pin, userId, members);
        }
        const memberIds = members.map(m => m.userId);
        (0, chatSocket_1.emitPinnedMessage)(conversationId, pinnedMessage, memberIds);
        return res.json({ success: true, pinnedMessageId: messageId });
    }
    catch {
        return res.status(500).json({ message: "Failed to pin message" });
    }
});
/* ═══════════════════════════════════════════════════════
   POST /chat/conversations/:id/archive | unarchive
═══════════════════════════════════════════════════════ */
router.post("/conversations/:id/archive", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const conversationId = p(req.params.id);
        await db_1.default.conversationMember.updateMany({
            where: { conversationId, userId },
            data: { archivedAt: new Date() },
        });
        (0, cache_1.invalidatePattern)("chat:convs:");
        return res.json({ success: true });
    }
    catch {
        return res.json({ success: true });
    }
});
router.post("/conversations/:id/unarchive", auth_middleware_1.verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const conversationId = p(req.params.id);
        await db_1.default.conversationMember.updateMany({
            where: { conversationId, userId },
            data: { archivedAt: null },
        });
        (0, cache_1.invalidatePattern)("chat:convs:");
        return res.json({ success: true });
    }
    catch {
        return res.json({ success: true });
    }
});
/* ═══════════════════════════════════════════════════════
   Admin stealth — list of users whose chats admin can open
═══════════════════════════════════════════════════════ */
router.get("/admin/viewable-users", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), async (req, res) => {
    try {
        const meId = req.user.id;
        const users = await db_1.default.user.findMany({
            where: {
                isActive: true,
                id: { not: meId },
                role: { in: ["csr", "manager", "accounts", "technical_manager", "estimator", "admin"] },
            },
            select: { id: true, name: true, email: true, role: true, csrCode: true, isOnline: true },
            orderBy: [{ role: "asc" }, { name: "asc" }],
        });
        return res.json({
            users: users.map((u) => ({
                id: u.id,
                name: (0, chatAccess_1.chatDisplayName)(u),
                role: u.role,
                csrCode: u.csrCode,
                isOnline: u.isOnline,
            })),
        });
    }
    catch (err) {
        console.error("[chat] admin viewable-users", err);
        return res.status(500).json({ message: "Failed to fetch users" });
    }
});
/* ═══════════════════════════════════════════════════════
   Admin stealth view — read any staff chats without notifying them
═══════════════════════════════════════════════════════ */
router.get("/admin/view/:userId/conversations", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), async (req, res) => {
    try {
        const userId = p(req.params.userId);
        const showArchived = req.query.archived === "1";
        const target = await db_1.default.user.findFirst({
            where: { id: userId, isActive: true },
            select: { id: true },
        });
        if (!target)
            return res.status(404).json({ message: "User not found" });
        const conversations = await fetchConversationsForUser(userId, showArchived, {
            includeEmpty: true,
            includeCleared: true,
        });
        return res.json({ conversations });
    }
    catch (err) {
        console.error("[chat] admin view conversations", err);
        return res.status(500).json({ message: "Failed to fetch conversations" });
    }
});
router.get("/admin/view/:userId/conversations/:convId/messages", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin"), async (req, res) => {
    try {
        const userId = p(req.params.userId);
        const conversationId = p(req.params.convId);
        const target = await db_1.default.user.findFirst({
            where: { id: userId, isActive: true },
            select: { id: true },
        });
        if (!target)
            return res.status(404).json({ message: "User not found" });
        const member = await db_1.default.conversationMember.findUnique({
            where: { conversationId_userId: { conversationId, userId } },
        });
        if (!member)
            return res.status(403).json({ message: "User is not in this conversation" });
        const { messages, pinnedMessage } = await fetchMessagesForUser(conversationId, userId, { includeDeleted: true });
        return res.json({ messages, pinnedMessage });
    }
    catch (err) {
        console.error("[chat] admin view messages", err);
        return res.status(500).json({ message: "Failed to fetch messages" });
    }
});
exports.default = router;

import express from "express";
import multer from "multer";
import prisma from "../config/db";
import cloudinary from "../config/cloudinary";
import { verifyToken, AuthRequest } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { getCache, setCache, invalidatePattern } from "../utils/cache";
import {
  formatMessage,
  parseReactions,
} from "../chat/chatMessageFormat";
import {
  emitConversationRead,
  emitMessageDelete,
  emitMessageEdit,
  emitMessageReaction,
  emitNewMessage,
  emitPinnedMessage,
  emitPresence,
  emitTyping,
} from "../chat/chatSocket";
import {
  assertCanMessageTarget,
  assertSenderCanChat,
  canMessageUser,
  chatDisplayName,
  getChatAccess,
  isVisibleToUser,
  canSeeRoleByOrg,
} from "../utils/chatAccess";

const router = express.Router();

/* ── multer: 200 MB in-memory ── */
const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

/* ── In-memory typing map: convId → userId → { name, expiresAt } ── */
const typingMap = new Map<string, Map<string, { name: string; expiresAt: number }>>();

/* helper — Express 5 params are string | string[], extract the string */
function p(val: string | string[]): string {
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

async function getConversationMemberIds(conversationId: string): Promise<string[]> {
  const rows = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  return rows.map(r => r.userId);
}

async function fetchConversationsForUser(
  viewUserId: string,
  showArchived: boolean,
  opts?: { includeEmpty?: boolean; includeCleared?: boolean },
) {
  const includeEmpty = opts?.includeEmpty === true;
  const includeCleared = opts?.includeCleared === true;
  const viewerAccess = await getChatAccess(viewUserId);
  if (!viewerAccess?.chatEnabled) return [];

  const memberships = await prisma.conversationMember.findMany({
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
    if (!includeCleared && m.clearedAt) return false;
    if (showArchived ? !m.archivedAt : Boolean(m.archivedAt)) return false;
    const otherMembers = m.conversation.members.filter(member => member.userId !== viewUserId);
    return otherMembers.every(member =>
      member.user.isActive &&
      canMessageUser(viewerAccess, member.userId) &&
      canSeeRoleByOrg(viewerAccess.role, String(member.user.role)) &&
      isVisibleToUser(member.user, viewUserId)
    );
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

  const unreadCounts = await Promise.all(
    withPreview.map(({ m }) =>
      prisma.message.count({
        where: {
          conversationId: m.conversationId,
          senderId: { not: viewUserId },
          ...notDeletedMessageWhere(),
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      })
    )
  );

  return withPreview.map(({ m, lastMsg }, idx) => {
    const conv        = m.conversation;
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
      id:            conv.id,
      type:          conv.type,
      name:          conv.type === "direct"
                         ? chatDisplayName(otherMember?.user)
                         : (conv.name ?? "Group"),
      otherUserId:   otherMember?.userId ?? null,
      lastMessage:   preview,
      lastMessageAt: lastMsg?.createdAt ?? null,
      unreadCount:   unreadCounts[idx],
      memberCount:   conv.members.length,
      isOnline:      otherMember?.user?.isOnline ?? false,
      profilePic:    otherMember?.user?.profilePic ?? null,
      pinnedMessageId: conv.pinnedMessageId ?? null,
      whoCanSend:    conv.type === "group" ? (conv.whoCanSend || "everyone") : "everyone",
      createdById:   conv.createdById ?? null,
      myMemberRole:  m.memberRole || "member",
      canManageGroup: conv.type === "group" && (
        conv.createdById === viewUserId
        || m.memberRole === "admin"
        || (!conv.createdById && viewerAccess?.role === "admin")
      ),
      archived:      Boolean(m.archivedAt),
      cleared:       Boolean(m.clearedAt),
    };
  });
}

async function assertCanMessageTargets(meId: string, targetIds: string[]) {
  if (targetIds.length === 0) return { ok: true as const };
  const gate = await assertSenderCanChat(meId);
  if (!gate.ok) return gate;
  const targets = await prisma.user.findMany({
    where: { id: { in: targetIds } },
    select: {
      id: true,
      role: true,
      chatEnabled: true,
      chatAllowedUserIds: true,
      chatVisibleToUserIds: true,
      isActive: true,
    },
  });
  const byId = new Map(targets.map((t) => [t.id, t]));
  for (const id of targetIds) {
    if (!canMessageUser(gate.access, id)) {
      return { ok: false as const, status: 403, message: "You are not allowed to message this user." };
    }
    const target = byId.get(id);
    if (!target?.isActive) {
      return { ok: false as const, status: 404, message: "User not found." };
    }
    if (target.chatEnabled === false) {
      return { ok: false as const, status: 403, message: "This user cannot receive messages." };
    }
    if (!canSeeRoleByOrg(gate.access.role, String(target.role))) {
      return { ok: false as const, status: 403, message: "You can only message people in your company." };
    }
    if (!isVisibleToUser(target, meId)) {
      return { ok: false as const, status: 403, message: "This user is hidden from your messages." };
    }
  }
  return { ok: true as const };
}

function messageVisibleForUser(
  m: { deletedAt: Date | null; hiddenForUserIds?: string[] },
  viewUserId: string,
) {
  if (m.deletedAt) return false;
  return !(m.hiddenForUserIds ?? []).includes(viewUserId);
}

/** If the user has no visible messages left, soft-hide the chat from their recent list. */
async function clearConversationIfEmptyForUser(conversationId: string, userId: string) {
  const anyVisible = await prisma.message.findFirst({
    where: {
      conversationId,
      deletedAt: null,
      NOT: { hiddenForUserIds: { has: userId } },
    },
    select: { id: true },
  });
  if (anyVisible) return false;
  await prisma.conversationMember.updateMany({
    where: { conversationId, userId },
    data:  { clearedAt: new Date(), archivedAt: null },
  });
  return true;
}

async function fetchMessagesForUser(
  conversationId: string,
  viewUserId: string,
  opts?: { includeDeleted?: boolean },
) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId },
    include: { user: { select: { id: true, name: true, email: true, role: true, profilePic: true } } },
  });

  const raw = await prisma.message.findMany({
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

  const messages = visible.map(m => formatMessage(m, viewUserId, members, auditMode));

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { pinnedMessageId: true },
  });
  let pinnedMessage = null;
  if (conv?.pinnedMessageId) {
    const pin = raw.find(m => m.id === conv.pinnedMessageId);
    if (pin) pinnedMessage = formatMessage(pin, viewUserId, members, auditMode);
  }

  return { messages, pinnedMessage };
}

/* ═══════════════════════════════════════════════════════
   GET /chat/conversations
═══════════════════════════════════════════════════════ */
router.get("/conversations", verifyToken, async (req: AuthRequest, res) => {
  try {
    const userId       = req.user!.id;
    const showArchived = req.query.archived === "1";
    const cacheKey     = `chat:convs:${userId}:${showArchived ? "arch" : "active"}`;
    const cached       = getCache<object>(cacheKey);
    if (cached) return res.json(cached);

    const conversations = await fetchConversationsForUser(userId, showArchived);

    const payload = { conversations };
    setCache(cacheKey, payload, 3_000);
    return res.json(payload);
  } catch (err) {
    console.error("[chat] GET /conversations", err);
    return res.status(500).json({ message: "Failed to fetch conversations" });
  }
});

/* ═══════════════════════════════════════════════════════
   POST /chat/conversations
═══════════════════════════════════════════════════════ */
router.post("/conversations", verifyToken, async (req: AuthRequest, res) => {
  try {
    const meId = req.user!.id;
    const body = req.body as { type?: string; userId?: string; name?: string; memberIds?: string[] };
    const { type, userId: targetId, name, memberIds = [] } = body;

    const chatGate = await assertSenderCanChat(meId);
    if (!chatGate.ok) return res.status(chatGate.status).json({ message: chatGate.message });

    if (type === "direct") {
      if (!targetId) return res.status(400).json({ message: "userId required" });

      const allowed = await assertCanMessageTarget(meId, targetId);
      if (!allowed.ok) return res.status(allowed.status).json({ message: allowed.message });

      const targetUser = await prisma.user.findUnique({
        where: { id: targetId },
        select: { name: true, email: true, role: true, csrCode: true, isOnline: true, profilePic: true },
      });

      const convId = await prisma.$transaction(async (tx) => {
        const myConvIds = (await tx.conversationMember.findMany({
          where: { userId: meId, conversation: { type: "direct" } },
          select: { conversationId: true },
        })).map(c => c.conversationId);

        const shared = await tx.conversationMember.findFirst({
          where: { userId: targetId, conversationId: { in: myConvIds } },
          select: { conversationId: true },
        });

        if (shared) return shared.conversationId;

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
          name: chatDisplayName(targetUser),
          otherUserId: targetId,
          unreadCount: 0, isOnline: targetUser?.isOnline ?? false,
          profilePic: targetUser?.profilePic ?? null,
          lastMessageAt: new Date().toISOString(),
        },
      });
    }

    if (type === "group") {
      if (!name?.trim()) return res.status(400).json({ message: "name required" });

      const uniqueMembers = Array.from(new Set(memberIds.filter(id => id && id !== meId)));
      for (const mid of uniqueMembers) {
        const allowed = await assertCanMessageTarget(meId, mid);
        if (!allowed.ok) {
          return res.status(allowed.status).json({ message: allowed.message });
        }
      }

      const allIds: string[] = Array.from(new Set([meId, ...uniqueMembers]));
      const adminIds = Array.isArray((body as { adminIds?: string[] }).adminIds)
        ? (body as { adminIds?: string[] }).adminIds!.filter((id) => allIds.includes(id))
        : [];
      const adminSet = new Set([meId, ...adminIds]);
      const whoCanSend = (body as { whoCanSend?: string }).whoCanSend === "admins" ? "admins" : "everyone";
      const conv = await prisma.conversation.create({
        data: {
          type: "group",
          name: name.trim(),
          whoCanSend,
          createdById: meId,
          members: {
            create: allIds.map((uid: string) => ({
              userId: uid,
              memberRole: adminSet.has(uid) ? "admin" : "member",
            })),
          },
        },
      });

      return res.json({
        id: conv.id,
        conversation: {
          id: conv.id, type: "group", name: conv.name,
          unreadCount: 0, memberCount: allIds.length,
          whoCanSend, myMemberRole: "admin", canManageGroup: true,
          lastMessageAt: new Date().toISOString(),
        },
      });
    }

    return res.status(400).json({ message: "type must be direct or group" });
  } catch (err) {
    console.error("[chat] POST /conversations", err);
    return res.status(500).json({ message: "Failed to create conversation" });
  } finally {
    invalidatePattern("chat:convs:");
  }
});

/* ═══════════════════════════════════════════════════════
   DELETE /chat/conversations/:id — soft-hide from recent chats
   Membership stays so admin peek can still open the thread.
═══════════════════════════════════════════════════════ */
router.delete("/conversations/:id", verifyToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const convId = p(req.params.id);

    await prisma.conversationMember.updateMany({
      where: { conversationId: convId, userId },
      data:  { clearedAt: new Date(), archivedAt: null },
    });

    invalidatePattern("chat:convs:");
    return res.json({ success: true });
  } catch {
    return res.json({ success: true });
  }
});

/* ═══════════════════════════════════════════════════════
   GET /chat/conversations/:id/messages
═══════════════════════════════════════════════════════ */
router.get("/conversations/:id/messages", verifyToken, async (req: AuthRequest, res) => {
  try {
    const userId         = req.user!.id;
    const conversationId = p(req.params.id);

    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) return res.status(403).json({ message: "Not a member" });

    const otherMembers = await prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    });
    const allowed = await assertCanMessageTargets(userId, otherMembers.map((o) => o.userId));
    if (!allowed.ok) {
      return res.status(allowed.status).json({ message: allowed.message });
    }

    const { messages, pinnedMessage } = await fetchMessagesForUser(conversationId, userId);
    return res.json({ messages, pinnedMessage });
  } catch (err) {
    console.error("[chat] GET messages", err);
    return res.status(500).json({ message: "Failed to fetch messages" });
  }
});

/* ═══════════════════════════════════════════════════════
   POST /chat/conversations/:id/messages
═══════════════════════════════════════════════════════ */
router.post(
  "/conversations/:id/messages",
  verifyToken,
  chatUpload.single("file"),
  async (req: AuthRequest, res) => {
    try {
      const userId         = req.user!.id;
      const conversationId = p(req.params.id);
      const body           = req.body as { text?: string; type?: string; replyToId?: string; mentionIds?: string[] };
      const text           = (body.text ?? "").trim();
      const msgType        = (body.type ?? "text") as string;
      const replyToId      = body.replyToId;
      const mentionIds     = Array.isArray(body.mentionIds)
        ? body.mentionIds.filter(id => typeof id === "string")
        : [];

      const chatGate = await assertSenderCanChat(userId);
      if (!chatGate.ok) return res.status(chatGate.status).json({ message: chatGate.message });

      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!member) return res.status(403).json({ message: "Not a member" });

      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true, whoCanSend: true },
      });
      if (conv?.type === "group" && conv.whoCanSend === "admins" && member.memberRole !== "admin") {
        return res.status(403).json({ message: "Only group admins can send messages." });
      }

      /* Existing DMs/groups must also respect current admin restrictions. */
      const otherMembers = await prisma.conversationMember.findMany({
        where: { conversationId, userId: { not: userId } },
        select: { userId: true },
      });
      const allowed = await assertCanMessageTargets(userId, otherMembers.map((o) => o.userId));
      if (!allowed.ok) {
        return res.status(allowed.status).json({ message: allowed.message });
      }

      let fileUrl: string | undefined;
      let fileName: string | undefined;
      let fileSize: number | undefined;
      let fileMimeType: string | undefined;

      if (req.file) {
        const mime         = req.file.mimetype;
        const resourceType = mime.startsWith("image/") ? "image"
                           : mime.startsWith("video/") ? "video"
                           : "raw";

        const uploaded = await new Promise<{ secure_url: string }>((resolve, reject) => {
          cloudinary.uploader
            .upload_stream({ resource_type: resourceType, folder: "crm_chat" }, (err, result) => {
              if (err || !result) reject(err);
              else resolve({ secure_url: result.secure_url });
            })
            .end(req.file!.buffer);
        });

        fileUrl      = uploaded.secure_url;
        fileName     = req.file.originalname !== "blob"
                         ? req.file.originalname
                         : (msgType === "voice" ? "Voice message" : req.file.originalname);
        fileSize     = req.file.size;
        fileMimeType = mime;
      }

      if (!text && !fileUrl) {
        return res.status(400).json({ message: "Message cannot be empty" });
      }

      /* verify replyToId belongs to same conversation */
      let validReplyToId: string | undefined;
      if (replyToId) {
        const rMsg = await prisma.message.findFirst({
          where: { id: replyToId, conversationId },
        });
        if (rMsg) validReplyToId = replyToId;
      }

      const message = await prisma.message.create({
        data: {
          conversationId,
          senderId:    userId,
          text,
          type:        req.file ? msgType : "text",
          fileUrl,
          fileName,
          fileSize,
          fileMimeType,
          replyToId:   validReplyToId,
          mentions:    mentionIds,
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

      await prisma.conversation.update({
        where: { id: conversationId },
        data:  { updatedAt: new Date() },
      });

      // New activity restores the thread on everyone's recent list
      await prisma.conversationMember.updateMany({
        where: { conversationId },
        data:  { clearedAt: null },
      });

      invalidatePattern("chat:convs:");

      const members = await prisma.conversationMember.findMany({
        where: { conversationId },
        include: { user: { select: { id: true, name: true, email: true, role: true, profilePic: true } } },
      });

      emitNewMessage(conversationId, userId, message, members);

      return res.json({
        message: formatMessage(message, userId, members),
      });
    } catch (err) {
      console.error("[chat] POST message", err);
      return res.status(500).json({ message: "Failed to send message" });
    }
  }
);

/* ═══════════════════════════════════════════════════════
   DELETE /chat/messages/:id
   for_me — hidden for requester only; for_everyone — soft-delete for all CSRs.
   Admin peek still sees content + delete type.
═══════════════════════════════════════════════════════ */
router.delete("/messages/:id", verifyToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const msgId  = p(req.params.id);
    const mode   = String(req.body?.mode ?? "for_everyone").toLowerCase();

    const msg = await prisma.message.findUnique({ where: { id: msgId } });
    if (!msg) return res.json({ success: true });

    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: msg.conversationId, userId } },
    });
    if (!member) {
      return res.status(403).json({ message: "Not in this conversation" });
    }

    if (mode === "for_me") {
      const hidden = msg.hiddenForUserIds ?? [];
      if (!hidden.includes(userId)) {
        await prisma.message.update({
          where: { id: msgId },
          data:  { hiddenForUserIds: [...hidden, userId] },
        });
      }
      const cleared = await clearConversationIfEmptyForUser(msg.conversationId, userId);
      invalidatePattern("chat:convs:");
      return res.json({ success: true, mode: "for_me", conversationCleared: cleared });
    }

    if (msg.deletedAt) return res.json({ success: true, mode: "for_everyone" });

    const role = req.user!.role;
    if (role !== "admin" && msg.senderId !== userId) {
      return res.status(403).json({ message: "You can only delete your own messages for everyone" });
    }

    await prisma.message.update({
      where: { id: msgId },
      data:  {
        deletedAt: new Date(),
        deletedById: userId,
        deletedReason: "for_everyone",
      },
    });

    const memberIds = await getConversationMemberIds(msg.conversationId);
    emitMessageDelete(msg.conversationId, msgId, memberIds);

    // Soft-hide for each member who no longer has any visible messages
    for (const mid of memberIds) {
      await clearConversationIfEmptyForUser(msg.conversationId, mid);
    }

    invalidatePattern("chat:convs:");
    return res.json({ success: true, mode: "for_everyone" });
  } catch {
    return res.json({ success: true });
  }
});

/* ═══════════════════════════════════════════════════════
   POST /chat/conversations/:id/read
═══════════════════════════════════════════════════════ */
router.post("/conversations/:id/read", verifyToken, async (req: AuthRequest, res) => {
  try {
    const userId         = req.user!.id;
    const conversationId = p(req.params.id);

    const readAt = new Date();
    await prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data:  { lastReadAt: readAt },
    });

    const memberIds = await getConversationMemberIds(conversationId);
    emitConversationRead(conversationId, userId, readAt.toISOString(), memberIds);

    return res.json({ success: true });
  } catch {
    return res.json({ success: true });
  }
});

/* ═══════════════════════════════════════════════════════
   POST /chat/conversations/:id/typing
═══════════════════════════════════════════════════════ */
router.post("/conversations/:id/typing", verifyToken, async (req: AuthRequest, res) => {
  try {
    const convId = p(req.params.id);
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const name = user?.name ?? "Someone";

    if (!typingMap.has(convId)) typingMap.set(convId, new Map());
    typingMap.get(convId)!.set(userId, { name, expiresAt: Date.now() + 4000 });

    emitTyping(convId, userId, name);

    return res.json({ success: true });
  } catch {
    return res.json({ success: true });
  }
});

/* ═══════════════════════════════════════════════════════
   GET /chat/conversations/:id/typing
═══════════════════════════════════════════════════════ */
router.get("/conversations/:id/typing", verifyToken, async (req: AuthRequest, res) => {
  const convId = p(req.params.id);
  const userId = req.user!.id;
  const now    = Date.now();

  const conv  = typingMap.get(convId);
  const names: string[] = [];

  if (conv) {
    for (const [uid, { name, expiresAt }] of conv.entries()) {
      if (expiresAt <= now) { conv.delete(uid); continue; }
      if (uid !== userId) names.push(name);
    }
  }

  return res.json({ names });
});

/* ═══════════════════════════════════════════════════════
   POST /chat/status  — heartbeat
═══════════════════════════════════════════════════════ */
router.post("/status", verifyToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const body   = req.body as { online?: boolean };
    const online = Boolean(body.online);

    await prisma.user.update({
      where: { id: userId },
      data:  { isOnline: online, lastActive: new Date() },
    });

    emitPresence(userId, online);

    return res.json({ success: true });
  } catch {
    return res.json({ success: true });
  }
});

/* ═══════════════════════════════════════════════════════
   GET /chat/users — admin + csr + manager (for DMs)
═══════════════════════════════════════════════════════ */
router.get("/users", verifyToken, async (req: AuthRequest, res) => {
  try {
    const meId = req.user!.id;
    const access = await getChatAccess(meId);
    if (!access || access.chatEnabled === false) {
      return res.json({ users: [] });
    }

    const allow = access.chatAllowedUserIds.filter(id => id !== meId);
    const users = await prisma.user.findMany({
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
        .filter(u => isVisibleToUser(u, meId) && canSeeRoleByOrg(access.role, String(u.role)))
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
  } catch (err) {
    console.error("[chat] GET /users", err);
    return res.status(500).json({ message: "Failed to fetch users" });
  }
});

/* ═══════════════════════════════════════════════════════
   GET /chat/conversations/:id/members
═══════════════════════════════════════════════════════ */
router.get("/conversations/:id/members", verifyToken, async (req: AuthRequest, res) => {
  try {
    const userId         = req.user!.id;
    const conversationId = p(req.params.id);
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) return res.status(403).json({ message: "Not a member" });

    const members = await prisma.conversationMember.findMany({
      where: { conversationId },
      include: { user: { select: { id: true, name: true, role: true, csrCode: true, isOnline: true, profilePic: true } } },
    });
    return res.json({
      members: members.map(m => ({
        id:       m.user.id,
        name:     m.user.name,
        role:     m.user.role,
        memberRole: m.memberRole || "member",
        csrCode:  m.user.csrCode,
        isOnline: m.user.isOnline,
        profilePic: m.user.profilePic ?? null,
      })),
    });
  } catch {
    return res.status(500).json({ message: "Failed to fetch members" });
  }
});

/* ═══════════════════════════════════════════════════════
   PATCH /chat/conversations/:id/settings — admins + who can send
═══════════════════════════════════════════════════════ */
router.patch("/conversations/:id/settings", verifyToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const conversationId = p(req.params.id);
    const me = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!me) return res.status(403).json({ message: "Not a member" });

    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true, createdById: true },
    });
    if (conv?.type !== "group") return res.status(400).json({ message: "Only groups have these settings" });

    const members = await prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true, memberRole: true },
    });
    const isCreator = conv.createdById === userId;
    const isGroupAdmin = me.memberRole === "admin";
    const legacyCeo = !conv.createdById && req.user!.role === "admin";
    if (!isCreator && !isGroupAdmin && !legacyCeo) {
      return res.status(403).json({ message: "Only group admins can change this." });
    }

    const body = req.body as { whoCanSend?: string; adminIds?: string[] };
    const whoCanSend = body.whoCanSend === "admins" ? "admins" : body.whoCanSend === "everyone" ? "everyone" : null;
    if (whoCanSend || !conv.createdById) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          ...(whoCanSend ? { whoCanSend } : {}),
          ...(!conv.createdById ? { createdById: userId } : {}),
        },
      });
    }
    let adminIds: string[] = members.filter((m) => m.memberRole === "admin").map((m) => m.userId);
    if (Array.isArray(body.adminIds)) {
      const ids = new Set(members.map((m) => m.userId));
      const adminSet = new Set(body.adminIds.filter((id) => ids.has(id)));
      if (conv.createdById && ids.has(conv.createdById)) adminSet.add(conv.createdById);
      if (adminSet.size === 0) adminSet.add(userId);
      adminIds = [...adminSet];
      await prisma.conversationMember.updateMany({
        where: { conversationId, userId: { in: adminIds } },
        data: { memberRole: "admin" },
      });
      await prisma.conversationMember.updateMany({
        where: { conversationId, userId: { notIn: adminIds } },
        data: { memberRole: "member" },
      });
    }

    invalidatePattern("chat:convs:");
    return res.json({
      success: true,
      whoCanSend: whoCanSend ?? undefined,
      adminIds,
      createdById: conv.createdById || userId,
    });
  } catch (err) {
    console.error("[chat] PATCH settings", err);
    return res.status(500).json({ message: "Failed to update group settings" });
  }
});

/* ═══════════════════════════════════════════════════════
   PATCH /chat/messages/:id — edit within 10 minutes
═══════════════════════════════════════════════════════ */
router.patch("/messages/:id", verifyToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const msgId  = p(req.params.id);
    const text   = ((req.body as { text?: string }).text ?? "").trim();
    if (!text) return res.status(400).json({ message: "Text required" });

    const msg = await prisma.message.findUnique({ where: { id: msgId } });
    if (!msg || msg.senderId !== userId || msg.type !== "text" || msg.deletedAt) {
      return res.status(403).json({ message: "Cannot edit this message" });
    }

    const updated = await prisma.message.update({
      where: { id: msgId },
      data:  { text, editedAt: new Date() },
      include: {
        sender: { select: { id: true, name: true, email: true, role: true, profilePic: true } },
        replyTo: { select: { id: true, text: true, type: true, sender: { select: { name: true, email: true, role: true } } } },
      },
    });

    const members = await prisma.conversationMember.findMany({
      where: { conversationId: msg.conversationId },
      include: { user: { select: { id: true, name: true, email: true, role: true, profilePic: true } } },
    });

    invalidatePattern("chat:convs:");
    emitMessageEdit(msg.conversationId, updated, members);
    return res.json({ message: formatMessage(updated, userId, members) });
  } catch {
    return res.status(500).json({ message: "Failed to edit message" });
  }
});

/* ═══════════════════════════════════════════════════════
   POST /chat/messages/:id/reactions — toggle emoji
═══════════════════════════════════════════════════════ */
router.post("/messages/:id/reactions", verifyToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const msgId  = p(req.params.id);
    const emoji  = ((req.body as { emoji?: string }).emoji ?? "").trim();
    if (!emoji) return res.status(400).json({ message: "emoji required" });

    const msg = await prisma.message.findUnique({ where: { id: msgId } });
    if (!msg) return res.status(404).json({ message: "Message not found" });

    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: msg.conversationId, userId } },
    });
    if (!member) return res.status(403).json({ message: "Not a member" });

    const reactions = parseReactions(msg.reactions);
    const list = reactions[emoji] ?? [];
    if (list.includes(userId)) {
      reactions[emoji] = list.filter(id => id !== userId);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji] = [...list, userId];
    }

    await prisma.message.update({
      where: { id: msgId },
      data:  { reactions },
    });

    const memberIds = await getConversationMemberIds(msg.conversationId);
    emitMessageReaction(msg.conversationId, msgId, reactions, memberIds);

    return res.json({ reactions });
  } catch {
    return res.status(500).json({ message: "Failed to update reaction" });
  }
});

/* ═══════════════════════════════════════════════════════
   POST /chat/conversations/:id/pin
═══════════════════════════════════════════════════════ */
router.post("/conversations/:id/pin", verifyToken, async (req: AuthRequest, res) => {
  try {
    const userId         = req.user!.id;
    const conversationId = p(req.params.id);
    const messageId      = (req.body as { messageId?: string | null }).messageId ?? null;

    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) return res.status(403).json({ message: "Not a member" });

    if (messageId) {
      const msg = await prisma.message.findFirst({ where: { id: messageId, conversationId } });
      if (!msg) return res.status(404).json({ message: "Message not found" });
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data:  { pinnedMessageId: messageId },
    });

    invalidatePattern("chat:convs:");

    const members = await prisma.conversationMember.findMany({
      where: { conversationId },
      include: { user: { select: { id: true, name: true, email: true, role: true, profilePic: true } } },
    });
    let pinnedMessage = null;
    if (messageId) {
      const pin = await prisma.message.findFirst({
        where: { id: messageId, conversationId },
        include: {
          sender: { select: { id: true, name: true, email: true, role: true, profilePic: true } },
          replyTo: { select: { id: true, text: true, type: true, sender: { select: { name: true, email: true, role: true } } } },
        },
      });
      if (pin) pinnedMessage = formatMessage(pin, userId, members);
    }
    const memberIds = members.map(m => m.userId);
    emitPinnedMessage(conversationId, pinnedMessage, memberIds);

    return res.json({ success: true, pinnedMessageId: messageId });
  } catch {
    return res.status(500).json({ message: "Failed to pin message" });
  }
});

/* ═══════════════════════════════════════════════════════
   POST /chat/conversations/:id/archive | unarchive
═══════════════════════════════════════════════════════ */
router.post("/conversations/:id/archive", verifyToken, async (req: AuthRequest, res) => {
  try {
    const userId         = req.user!.id;
    const conversationId = p(req.params.id);
    await prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data:  { archivedAt: new Date() },
    });
    invalidatePattern("chat:convs:");
    return res.json({ success: true });
  } catch {
    return res.json({ success: true });
  }
});

router.post("/conversations/:id/unarchive", verifyToken, async (req: AuthRequest, res) => {
  try {
    const userId         = req.user!.id;
    const conversationId = p(req.params.id);
    await prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data:  { archivedAt: null },
    });
    invalidatePattern("chat:convs:");
    return res.json({ success: true });
  } catch {
    return res.json({ success: true });
  }
});

/* ═══════════════════════════════════════════════════════
   Admin stealth — list of users whose chats admin can open
═══════════════════════════════════════════════════════ */
router.get("/admin/viewable-users", verifyToken, allowRoles("admin"), async (req: AuthRequest, res) => {
  try {
    const meId = req.user!.id;
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: meId },
        role: { in: ["csr", "manager", "accounts", "technical_manager", "estimator", "bim_manager", "bim", "admin"] },
      },
      select: { id: true, name: true, email: true, role: true, csrCode: true, isOnline: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    return res.json({
      users: users.map((u) => ({
        id: u.id,
        name: chatDisplayName(u),
        role: u.role,
        csrCode: u.csrCode,
        isOnline: u.isOnline,
      })),
    });
  } catch (err) {
    console.error("[chat] admin viewable-users", err);
    return res.status(500).json({ message: "Failed to fetch users" });
  }
});

/* ═══════════════════════════════════════════════════════
   Admin stealth view — read any staff chats without notifying them
═══════════════════════════════════════════════════════ */
router.get("/admin/view/:userId/conversations", verifyToken, allowRoles("admin"), async (req: AuthRequest, res) => {
  try {
    const userId       = p(req.params.userId);
    const showArchived = req.query.archived === "1";

    const target = await prisma.user.findFirst({
      where:  { id: userId, isActive: true },
      select: { id: true },
    });
    if (!target) return res.status(404).json({ message: "User not found" });

    const conversations = await fetchConversationsForUser(userId, showArchived, {
      includeEmpty: true,
      includeCleared: true,
    });
    return res.json({ conversations });
  } catch (err) {
    console.error("[chat] admin view conversations", err);
    return res.status(500).json({ message: "Failed to fetch conversations" });
  }
});

router.get("/admin/view/:userId/conversations/:convId/messages", verifyToken, allowRoles("admin"), async (req: AuthRequest, res) => {
  try {
    const userId         = p(req.params.userId);
    const conversationId = p(req.params.convId);

    const target = await prisma.user.findFirst({
      where:  { id: userId, isActive: true },
      select: { id: true },
    });
    if (!target) return res.status(404).json({ message: "User not found" });

    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) return res.status(403).json({ message: "User is not in this conversation" });

    const { messages, pinnedMessage } = await fetchMessagesForUser(conversationId, userId, { includeDeleted: true });
    return res.json({ messages, pinnedMessage });
  } catch (err) {
    console.error("[chat] admin view messages", err);
    return res.status(500).json({ message: "Failed to fetch messages" });
  }
});

export default router;

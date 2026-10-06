import { chatDisplayName } from "../utils/chatAccess";

export type ReactionsMap = Record<string, string[]>;

export const EDIT_WINDOW_MS = 10 * 60 * 1000;

export function parseReactions(raw: unknown): ReactionsMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ReactionsMap;
}

export function msgStatus(
  senderId: string,
  userId: string,
  createdAt: Date,
  members: { userId: string; lastReadAt: Date | null; user: { name: string; email?: string | null; role?: string | null } }[]
): { status: string; readBy: string[] } {
  const readers = members.filter(m => m.userId !== senderId && m.lastReadAt && m.lastReadAt >= createdAt);
  const readBy = readers.map(m => chatDisplayName(m.user));
  if (senderId === userId) {
    const others = members.filter(m => m.userId !== userId);
    const allRead = others.length > 0 && readers.length === others.length;
    return { status: allRead ? "read" : "delivered", readBy };
  }
  const me = members.find(m => m.userId === userId);
  const read = me?.lastReadAt && me.lastReadAt >= createdAt;
  return { status: read ? "read" : "delivered", readBy };
}

export function formatMessage(
  m: {
    id: string; senderId: string; text: string; type: string;
    fileUrl: string | null; fileName: string | null; fileSize: number | null;
    fileMimeType: string | null; createdAt: Date; editedAt: Date | null;
    deletedAt?: Date | null;
    deletedReason?: string | null;
    hiddenForUserIds?: string[];
    mentions: string[]; reactions: unknown;
    sender: { id: string; name: string; email?: string | null; role?: string | null; profilePic?: string | null };
    replyTo: {
      id: string; text: string; type: string;
      sender: { name: string; email?: string | null; role?: string | null };
    } | null;
  },
  userId: string,
  members: { userId: string; lastReadAt: Date | null; user: { name: string; email?: string | null; role?: string | null } }[],
  auditMode = false,
) {
  const { status, readBy } = msgStatus(m.senderId, userId, m.createdAt, members);
  const hiddenForViewer = (m.hiddenForUserIds ?? []).includes(userId);
  const deletedForEveryone = Boolean(m.deletedAt);
  let deleteLabel: string | null = null;
  if (auditMode) {
    if (deletedForEveryone) deleteLabel = "Deleted for everyone";
    else if (hiddenForViewer) deleteLabel = "Deleted for me";
  }
  const isDeleted = auditMode && (deletedForEveryone || hiddenForViewer);
  return {
    id:           m.id,
    senderId:     m.senderId,
    senderName:   chatDisplayName(m.sender),
    senderProfilePic: m.sender.profilePic ?? null,
    text:         m.text,
    type:         m.type,
    fileUrl:      m.fileUrl,
    fileName:     m.fileName,
    fileSize:     m.fileSize,
    fileMimeType: m.fileMimeType,
    createdAt:    m.createdAt,
    editedAt:     m.editedAt,
    deletedAt:    m.deletedAt ?? null,
    deletedReason: m.deletedReason ?? null,
    isDeleted,
    isDeletedForEveryone: auditMode && deletedForEveryone,
    isHiddenForViewer: auditMode && hiddenForViewer && !deletedForEveryone,
    deleteLabel,
    mentions:     m.mentions ?? [],
    reactions:    parseReactions(m.reactions),
    readBy,
    isOwn:        m.senderId === userId,
    status,
    replyTo:      m.replyTo ? {
      id:         m.replyTo.id,
      text:       m.replyTo.text,
      senderName: chatDisplayName(m.replyTo.sender),
      type:       m.replyTo.type,
    } : null,
  };
}

export function messagePreviewText(type: string, text: string): string {
  return type !== "text" ? `Sent a ${type}` : text;
}

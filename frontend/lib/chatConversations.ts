export interface ChatConversation {
  id: string;
  type: "direct" | "group";
  name: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
  memberCount?: number;
  isOnline?: boolean;
  otherUserId?: string;
  profilePic?: string | null;
  pinnedMessageId?: string | null;
  archived?: boolean;
  whoCanSend?: "everyone" | "admins";
  myMemberRole?: "admin" | "member";
  canManageGroup?: boolean;
  createdById?: string | null;
}

/** One direct thread per other user — keep the most recently active. */
export function deduplicateConvs(convs: ChatConversation[]): ChatConversation[] {
  const seenDm = new Map<string, number>();
  const result: ChatConversation[] = [];

  for (const c of convs) {
    if (c.type === "group") {
      result.push(c);
      continue;
    }
    const key = c.otherUserId ?? c.id ?? c.name;
    const idx = seenDm.get(key);
    if (idx === undefined) {
      seenDm.set(key, result.length);
      result.push(c);
    } else if ((c.lastMessageAt ?? "") > (result[idx]?.lastMessageAt ?? "")) {
      result[idx] = c;
    }
  }

  return result;
}

/** Keep optimistic / not-yet-synced local threads when refreshing from the server. */
export function mergeConversationLists(
  server: ChatConversation[],
  local: ChatConversation[],
): ChatConversation[] {
  const merged = deduplicateConvs(server);
  const byId = new Map(merged.map(c => [c.id, c]));
  const byOther = new Map(
    merged
      .filter(c => c.type === "direct" && c.otherUserId)
      .map(c => [c.otherUserId!, c]),
  );

  for (const loc of local) {
    if (byId.has(loc.id)) continue;
    if (loc.type === "direct" && loc.otherUserId && byOther.has(loc.otherUserId)) continue;
    merged.unshift(loc);
    byId.set(loc.id, loc);
    if (loc.otherUserId) byOther.set(loc.otherUserId, loc);
  }

  return merged;
}

export function sortConversations(
  convs: ChatConversation[],
  pinnedIds: Set<string>,
): ChatConversation[] {
  return [...convs].sort((a, b) => {
    const ap = pinnedIds.has(a.id) ? 1 : 0;
    const bp = pinnedIds.has(b.id) ? 1 : 0;
    if (ap !== bp) return bp - ap;

    const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    if (tb !== ta) return tb - ta;

    return a.name.localeCompare(b.name);
  });
}

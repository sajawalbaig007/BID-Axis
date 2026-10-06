import API from "./api";
import type { ChatConversation } from "./chatConversations";

type Entry<T> = { data: T; at: number };

const CONV_TTL_MS        = 15_000;
const ARCHIVED_TTL_MS    = 90_000;
const STEALTH_TTL_MS     = 15_000;
const MSG_TTL_MS         = 12_000;
const ADMIN_CSRS_TTL_MS  = 120_000;
const MEMBERS_TTL_MS     = 60_000;

const inflight = new Map<string, Promise<unknown>>();

function read<T>(store: Map<string, Entry<T>>, key: string, ttlMs: number): T | null {
  const hit = store.get(key);
  if (!hit || Date.now() - hit.at >= ttlMs) return null;
  return hit.data;
}

function write<T>(store: Map<string, Entry<T>>, key: string, data: T) {
  store.set(key, { data, at: Date.now() });
}

async function cached<T>(
  key: string,
  store: Map<string, Entry<T>>,
  ttlMs: number,
  fetcher: () => Promise<T>,
  force = false,
): Promise<T> {
  if (!force) {
    const hit = read(store, key, ttlMs);
    if (hit !== null) return hit;
  }

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const p = fetcher()
    .then(data => {
      write(store, key, data);
      return data;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

const convStore     = new Map<string, Entry<ChatConversation[]>>();
const archivedStore = new Map<string, Entry<ChatConversation[]>>();
const stealthStore  = new Map<string, Entry<ChatConversation[]>>();
const msgStore      = new Map<string, Entry<MessagesPayload>>();
const membersStore  = new Map<string, Entry<ChatUser[]>>();
const csrsStore     = new Map<string, Entry<AdminCsr[]>>();

export type MessagesPayload = {
  messages: unknown[];
  pinnedMessage?: unknown | null;
};

type ChatUser = { id: string; name: string; email?: string; csrCode?: string | null; isOnline?: boolean; role?: string; profilePic?: string | null };
type AdminCsr = { id: string; name: string; role?: string };

export function isChatConversationsFresh(): boolean {
  return read(convStore, "active", CONV_TTL_MS) !== null;
}

export function peekChatConversations(): ChatConversation[] {
  return read(convStore, "active", Number.POSITIVE_INFINITY) ?? [];
}

export function peekArchivedConversations(): ChatConversation[] {
  return read(archivedStore, "archived", Number.POSITIVE_INFINITY) ?? [];
}

export async function fetchChatConversations(force = false): Promise<ChatConversation[]> {
  return cached("active", convStore, CONV_TTL_MS, async () => {
    const r = await API.get("/chat/conversations");
    return (r.data.conversations ?? r.data ?? []) as ChatConversation[];
  }, force);
}

export async function fetchArchivedConversations(force = false): Promise<ChatConversation[]> {
  return cached("archived", archivedStore, ARCHIVED_TTL_MS, async () => {
    const r = await API.get("/chat/conversations?archived=1");
    return (r.data.conversations ?? r.data ?? []) as ChatConversation[];
  }, force);
}

export async function fetchStealthConversations(
  csrId: string,
  archived = false,
  force = false,
): Promise<ChatConversation[]> {
  const key = `${csrId}:${archived ? "archived" : "active"}`;
  return cached(key, stealthStore, STEALTH_TTL_MS, async () => {
    const q = archived ? "?archived=1" : "";
    const r = await API.get(`/chat/admin/view/${csrId}/conversations${q}`);
    return (r.data.conversations ?? r.data ?? []) as ChatConversation[];
  }, force);
}

export async function fetchChatMessages(url: string, force = false): Promise<MessagesPayload> {
  return cached(url, msgStore, MSG_TTL_MS, async () => {
    const r = await API.get(url);
    return {
      messages: (r.data.messages ?? r.data ?? []) as unknown[],
      pinnedMessage: r.data.pinnedMessage ?? null,
    };
  }, force);
}

export function invalidateChatMessages(url: string) {
  msgStore.delete(url);
  inflight.delete(url);
}

export async function fetchConvMembers(convId: string, force = false): Promise<ChatUser[]> {
  return cached(convId, membersStore, MEMBERS_TTL_MS, async () => {
    const r = await API.get(`/chat/conversations/${convId}/members`);
    return (r.data.members ?? []) as ChatUser[];
  }, force);
}

export async function fetchAdminCsrs(force = false): Promise<AdminCsr[]> {
  return cached("list", csrsStore, ADMIN_CSRS_TTL_MS, async () => {
    try {
      const r = await API.get("/chat/admin/viewable-users");
      const list = (r.data?.users ?? []) as AdminCsr[];
      if (list.length) return list.map(c => ({ id: c.id, name: c.name, role: c.role }));
    } catch { /* fall back to CSR-only list */ }
    const r = await API.get("/admin/csrs");
    const list = (r.data?.csrs ?? []) as AdminCsr[];
    return list.map(c => ({ id: c.id, name: c.name, role: "csr" }));
  }, force);
}

export function invalidateChatCaches() {
  convStore.clear();
  archivedStore.clear();
  stealthStore.clear();
  msgStore.clear();
  membersStore.clear();
  inflight.clear();
}

/** Zero unread for one conversation in the local cache (badge sync) */
export function patchConversationUnread(convId: string, unreadCount = 0) {
  const hit = convStore.get("active");
  if (!hit) return;
  const convs = hit.data as ChatConversation[];
  const patched = convs.map(c => (c.id === convId ? { ...c, unreadCount } : c));
  write(convStore, "active", patched);
}

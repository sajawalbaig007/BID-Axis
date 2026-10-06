export type ChatAction = {
  type: "compose_email" | "download_accounts_pdf";
  to?: string;
  clientName?: string;
  company?: string;
  intent?: string;
  subject?: string;
  body?: string;
  notes?: string;
  month?: string;
  page?: string;
};

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  at?: number;
  actions?: ChatAction[];
  feedback?: "up" | "down";
  source?: "agent" | "rules";
  tools?: string[];
};

export type CeoChat = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMsg[];
};

type Store = {
  activeId: string;
  chats: CeoChat[];
};

export const CEO_ASSISTANT_WELCOME =
  "Hey — this is me, Nexa. Each question stands alone. Quote a message with the reply arrow to answer from that, or say “go through this chat” to recap.";

const KEY = "crm_ceo_assistant_chats_v1";
const MAX_CHATS = 40;
const MAX_MSGS = 80;

export function newChatId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function welcomeMsg(): ChatMsg {
  return { id: "welcome", role: "assistant", text: CEO_ASSISTANT_WELCOME, at: Date.now() };
}

export function chatMsgAt(msg: ChatMsg): number {
  if (typeof msg.at === "number" && msg.at > 0) return msg.at;
  const n = Number(String(msg.id).split("-")[0]);
  return n > 1e12 ? n : 0;
}

export function emptyChat(): CeoChat {
  return {
    id: newChatId(),
    title: "New chat",
    updatedAt: Date.now(),
    messages: [welcomeMsg()],
  };
}

function storageKey(userId: string) {
  return `${KEY}:${userId}`;
}

export function loadCeoChats(userId: string): Store {
  if (typeof window === "undefined" || !userId) {
    const chat = emptyChat();
    return { activeId: chat.id, chats: [chat] };
  }
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) {
      const chat = emptyChat();
      return { activeId: chat.id, chats: [chat] };
    }
    const parsed = JSON.parse(raw) as Store;
    if (!parsed?.chats?.length) {
      const chat = emptyChat();
      return { activeId: chat.id, chats: [chat] };
    }
    const activeId = parsed.chats.some(c => c.id === parsed.activeId)
      ? parsed.activeId
      : parsed.chats[0]!.id;
    return { activeId, chats: parsed.chats.slice(0, MAX_CHATS) };
  } catch {
    const chat = emptyChat();
    return { activeId: chat.id, chats: [chat] };
  }
}

export function saveCeoChats(userId: string, store: Store) {
  if (typeof window === "undefined" || !userId) return;
  const trimmed: Store = {
    activeId: store.activeId,
    chats: store.chats.slice(0, MAX_CHATS).map(c => ({
      ...c,
      messages: c.messages.slice(-MAX_MSGS),
    })),
  };
  const json = JSON.stringify(trimmed);
  try {
    localStorage.setItem(storageKey(userId), json);
  } catch {
    /* quota */
  }
}

export function titleFromMessages(messages: ChatMsg[]): string {
  const first = messages.find(m => m.role === "user" && m.text.trim());
  if (!first) return "New chat";
  const t = first.text.trim().replace(/\s+/g, " ");
  return t.length > 42 ? `${t.slice(0, 42)}…` : t;
}

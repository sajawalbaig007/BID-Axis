"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Bot, FileDown, History, Loader2, Mail, Plus, Reply, Send, Sparkles, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import API, { apiErrorMessage, getTokenUserId } from "@/lib/api";
import { getAuthMe, peekAuthMe } from "@/lib/authMeCache";
import { useOpenCrmMail } from "@/app/components/mail/CrmMailProvider";
import {
  downloadAccountsPageViaFrame,
} from "@/app/accounts/utils/useAccountsVisualPdf";
import {
  emptyChat,
  loadCeoChats,
  newChatId,
  saveCeoChats,
  titleFromMessages,
  chatMsgAt,
  type ChatAction,
  type ChatMsg,
  type CeoChat,
} from "@/lib/ceoAssistantChats";
import { formatEstTime } from "@/lib/estTime";

function useCeoSession() {
  const pathname = usePathname();
  const [isCeo, setIsCeo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      const peek = peekAuthMe();
      const onCeoPage = pathname.startsWith("/admin");
      if (peek?.role === "admin" && onCeoPage) {
        setIsCeo(true);
        return;
      }
      void getAuthMe().then(user => {
        if (cancelled) return;
        setIsCeo(user?.role === "admin" && pathname.startsWith("/admin"));
      });
    };
    sync();
    window.addEventListener("crm-auth-me-updated", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("crm-auth-me-updated", sync);
    };
  }, [pathname]);

  return isCeo;
}

function looksLikeWalkthrough(text: string) {
  return /\b(go through|go thru|walk through|yeh chat|this chat|is chat|poori chat|saari chat|peechli chat|previous chat|chat context|remind (me|kr|karo)|is conversation)\b/i.test(
    text,
  );
}

function splitQuoteAndAsk(text: string): { quoted: string; ask: string } {
  const quoted: string[] = [];
  const ask: string[] = [];
  for (const line of text.split("\n")) {
    if (/^>\s?/.test(line)) quoted.push(line.replace(/^>\s?/, ""));
    else ask.push(line);
  }
  return { quoted: quoted.join("\n").trim(), ask: ask.join("\n").trim() };
}
function nexaStamp(msg: ChatMsg) {
  const at = chatMsgAt(msg);
  return at ? formatEstTime(new Date(at)) : "";
}

function chatWhen(ts: number) {
  const d = Date.now() - ts;
  if (d < 60_000) return "Just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function AssistantRichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <div key={i} className="space-y-1">
          {block.split("\n").map((line, j) => {
            const heading = /^\*\*(.+)\*\*$/.exec(line.trim());
            if (heading) {
              return (
                <p
                  key={j}
                  className="font-extrabold text-[14px] leading-snug text-[#0F172A] dark:text-white"
                >
                  {heading[1]}
                </p>
              );
            }
            const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
            return (
              <p key={j} className="text-[13px] leading-relaxed text-[#334155] dark:text-gray-200">
                {parts.map((part, k) => {
                  const bold = /^\*\*(.+)\*\*$/.exec(part);
                  if (bold) {
                    return (
                      <strong key={k} className="font-bold text-[#0F172A] dark:text-white">
                        {bold[1]}
                      </strong>
                    );
                  }
                  return <span key={k}>{part}</span>;
                })}
              </p>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function CrmAssistantPanel() {
  const openCompose = useOpenCrmMail();
  const isCeo = useCeoSession();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [chats, setChats] = useState<CeoChat[]>([]);
  const [activeId, setActiveId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const quotedRef = useRef<{ role: "user" | "assistant"; text: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    const uid = getTokenUserId() || "ceo";
    setUserId(uid);
    const store = loadCeoChats(uid);
    setChats(store.chats);
    setActiveId(store.activeId);
  }, []);

  useEffect(() => {
    if (!userId || !chats.length) return;
    saveCeoChats(userId, { activeId, chats });
  }, [userId, activeId, chats]);

  const active = useMemo(
    () => chats.find(c => c.id === activeId) ?? chats[0] ?? null,
    [chats, activeId],
  );
  const msgs = active?.messages ?? [];

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, open, activeId]);

  const patchActive = useCallback((fn: (chat: CeoChat) => CeoChat) => {
    setChats(prev => prev.map(c => (c.id === activeId ? fn(c) : c)));
  }, [activeId]);

  const startNewChat = useCallback(() => {
    const chat = emptyChat();
    setChats(prev => [chat, ...prev]);
    setActiveId(chat.id);
    setInput("");
    setHistoryOpen(false);
  }, []);

  const deleteChat = useCallback((id: string) => {
    setChats(prev => {
      const next = prev.filter(c => c.id !== id);
      if (!next.length) {
        const chat = emptyChat();
        setActiveId(chat.id);
        return [chat];
      }
      if (id === activeId) setActiveId(next[0]!.id);
      return next;
    });
  }, [activeId]);

  const openEmail = (a: ChatAction) => {
    if (!openCompose || !a.to) return;
    openCompose({
      to: a.to,
      clientName: a.clientName,
      company: a.company,
      intent: a.intent,
      subject: a.subject,
      body: a.body,
      notes: a.notes,
    });
  };

  const downloadPdf = async (month: string) => {
    const key = `reports:${month}`;
    setPdfBusy(key);
    try {
      await downloadAccountsPageViaFrame("reports", month);
    } catch (err) {
      const detail = err instanceof Error && err.message.trim() ? err.message.trim() : "";
      patchActive(chat => ({
        ...chat,
        updatedAt: Date.now(),
        messages: [
          ...chat.messages,
          {
            id: newChatId(),
            role: "assistant",
            at: Date.now(),
            text:
              detail ||
              "Could not capture that Accounts PDF with graphs. Open the Accounts page and use Save as PDF.",
          },
        ],
      }));
    } finally {
      setPdfBusy(null);
    }
  };

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy || !active) return;
    const chatId = active.id;
    setInput("");
    const userMsg: ChatMsg = { id: newChatId(), role: "user", text: q, at: Date.now() };
    setChats(prev => prev.map(c => {
      if (c.id !== chatId) return c;
      const messages = [...c.messages, userMsg];
      return { ...c, title: titleFromMessages(messages), updatedAt: Date.now(), messages };
    }));
    setBusy(true);
    try {
      const { quoted, ask: askOnly } = splitQuoteAndAsk(q);
      const payload = askOnly || q;
      const history = quoted
        ? [{
            role: quotedRef.current?.role ?? "assistant",
            text: (quotedRef.current?.text || quoted).slice(0, 2000),
            tools: [] as string[],
          }]
        : looksLikeWalkthrough(q)
          ? msgs
              .filter(m => m.id !== "welcome" && m.text.trim())
              .slice(-16)
              .map(m => ({ role: m.role, text: m.text.slice(0, 2000), tools: m.tools ?? [] }))
          : [];
      quotedRef.current = null;
      const res = await API.post("/assistant/chat", { message: payload, history }, { timeout: 45_000 });
      const reply = String(res.data.reply ?? "No reply.");
      const actions = Array.isArray(res.data.actions) ? (res.data.actions as ChatAction[]) : [];
      const tools = Array.isArray(res.data.tools) ? (res.data.tools as string[]) : [];
      const source = res.data.source === "agent" || res.data.source === "rules" ? res.data.source : undefined;
      const assistantMsg: ChatMsg = { id: newChatId(), role: "assistant", text: reply, at: Date.now(), actions, tools, source };
      setChats(prev => prev.map(c => {
        if (c.id !== chatId) return c;
        const messages = [...c.messages, assistantMsg];
        return { ...c, title: titleFromMessages(messages), updatedAt: Date.now(), messages };
      }));
      const compose = actions.find(a => a.type === "compose_email" && a.to);
      if (compose) window.setTimeout(() => openEmail(compose), 30);
    } catch (err) {
      setChats(prev => prev.map(c => {
        if (c.id !== chatId) return c;
        return {
          ...c,
          updatedAt: Date.now(),
          messages: [
            ...c.messages,
            { id: newChatId(), role: "assistant", at: Date.now(), text: apiErrorMessage(err, "Assistant failed. Try again.") },
          ],
        };
      }));
    } finally {
      setBusy(false);
    }
  };

  const rate = async (msg: ChatMsg, rating: "up" | "down") => {
    if (msg.role !== "assistant" || msg.id === "welcome" || msg.feedback) return;
    const idx = msgs.findIndex(m => m.id === msg.id);
    const prevUser = [...msgs.slice(0, idx)].reverse().find(m => m.role === "user");
    patchActive(chat => ({
      ...chat,
      messages: chat.messages.map(m => (m.id === msg.id ? { ...m, feedback: rating } : m)),
    }));
    try {
      await API.post("/assistant/feedback", {
        rating,
        userMessage: prevUser?.text ?? "",
        assistantReply: msg.text,
        source: msg.source,
        tools: msg.tools ?? [],
      });
    } catch {
      /* dataset write is best-effort */
    }
  };

  const quoteIntoInput = (msg: ChatMsg) => {
    if (msg.id === "welcome") return;
    const selected = typeof window !== "undefined" ? window.getSelection()?.toString().trim() : "";
    const raw = (selected && msg.text.includes(selected) ? selected : msg.text).trim();
    if (!raw) return;
    quotedRef.current = { role: msg.role, text: raw };
    const quoted = raw
      .split("\n")
      .slice(0, 16)
      .map(line => `> ${line}`)
      .join("\n");
    setInput(prev => {
      const rest = prev.replace(/^> .*(?:\n|$)/gm, "").trim();
      return rest ? `${quoted}\n${rest}` : `${quoted}\n`;
    });
  };

  if (!mounted || !isCeo) return null;

  const pdfAction = (msg: ChatMsg) => msg.actions?.find(x => x.type === "download_accounts_pdf");

  return createPortal(
    <div className="fixed z-[110] right-3 bottom-3 sm:right-5 sm:bottom-5 lg:right-7 lg:bottom-7 xl:right-8 xl:bottom-8 flex flex-col items-end gap-3 lg:gap-4 pointer-events-none">
      {open ? (
        <div
          className="pointer-events-auto relative w-[calc(100vw-1.5rem)] max-w-[22rem] sm:max-w-[26rem] md:max-w-[28rem] lg:max-w-[32rem] xl:max-w-[34rem] 2xl:max-w-[36rem] h-[min(66dvh,32rem)] sm:h-[min(70dvh,38rem)] lg:h-[min(74dvh,44rem)] xl:h-[min(78dvh,50rem)] 2xl:h-[min(80dvh,54rem)] flex flex-col overflow-hidden rounded-[1.85rem] border border-white/70 dark:border-white/10 bg-white/90 dark:bg-crm-surface/95 backdrop-blur-2xl shadow-[0_28px_80px_-18px_rgba(15,23,42,0.5),0_0_0_1px_rgba(184,17,45,0.08)] animate-[fadeUp_0.32s_ease-out]"
        >
          <div className="pointer-events-none absolute -top-20 -right-8 h-44 w-44 rounded-full bg-[#1B6FE8]/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-40 w-40 rounded-full bg-sky-400/10 blur-3xl" />

          <header className="relative shrink-0 px-4 pt-4 pb-3 flex items-center gap-3">
            <span className="h-11 w-11 rounded-2xl bg-gradient-to-br from-[#1B6FE8] to-[#8c0d22] text-white inline-flex items-center justify-center shadow-[0_8px_20px_rgba(184,17,45,0.35)]">
              <Sparkles size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#1B6FE8]">Nexa</p>
              <p className="text-[15px] font-extrabold text-[#0F172A] dark:text-white tracking-tight">Live CRM</p>
            </div>
            <button
              type="button"
              onClick={startNewChat}
              className="h-9 w-9 rounded-2xl bg-[#EAF2FE] text-[#1B6FE8] inline-flex items-center justify-center hover:bg-[#FFE4E8] transition-colors"
              title="New chat"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              onClick={() => setHistoryOpen(v => !v)}
              className={`h-9 w-9 rounded-2xl inline-flex items-center justify-center transition-colors ${
                historyOpen
                  ? "bg-[#1B6FE8] text-white"
                  : "bg-[#EAF2FE] text-[#1B6FE8] hover:bg-[#FFE4E8]"
              }`}
              title="History"
              aria-label="Chat history"
            >
              <History size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setHistoryOpen(false);
                setOpen(false);
              }}
              className="h-9 w-9 rounded-2xl bg-gray-50 dark:bg-white/5 text-gray-500 hover:text-[#1B6FE8] inline-flex items-center justify-center transition-colors"
              aria-label="Close Nexa"
            >
              <X size={16} />
            </button>
          </header>

          {historyOpen ? (
            <div className="relative flex-1 min-h-0 overflow-y-auto px-3 pb-3">
              <p className="px-1.5 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">History</p>
              <div className="space-y-1.5">
                {chats.map(c => (
                  <div
                    key={c.id}
                    className={`group flex items-center gap-2 rounded-2xl px-3 py-2.5 transition-colors ${
                      c.id === activeId
                        ? "bg-[#EAF2FE] dark:bg-[#1B6FE8]/15"
                        : "hover:bg-gray-50 dark:hover:bg-white/5"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveId(c.id);
                        setHistoryOpen(false);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className={`text-[13px] font-bold truncate ${c.id === activeId ? "text-[#1B6FE8]" : "text-[#0F172A] dark:text-white"}`}>
                        {c.title}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{chatWhen(c.updatedAt)}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteChat(c.id)}
                      className="h-8 w-8 rounded-xl text-gray-400 hover:text-[#1B6FE8] hover:bg-white inline-flex items-center justify-center"
                      aria-label="Delete chat"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
          <div ref={listRef} className="relative flex-1 min-h-0 overflow-y-auto px-3.5 py-1 space-y-3">
            {msgs.map(msg => (
              <div key={msg.id} className={`flex items-end gap-1 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "user" && msg.id !== "welcome" ? (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      quoteIntoInput(msg);
                    }}
                    className="h-7 w-7 mb-5 rounded-lg text-gray-400 hover:text-[#1B6FE8] hover:bg-[#EAF2FE] inline-flex items-center justify-center shrink-0"
                    aria-label="Reply"
                    title="Reply"
                  >
                    <Reply size={13} />
                  </button>
                ) : null}
                <div className={`max-w-[88%] flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-[#1B6FE8] to-[#9d0e26] text-white rounded-[1.15rem] rounded-br-md whitespace-pre-wrap shadow-[0_8px_18px_rgba(184,17,45,0.22)]"
                      : "rounded-[1.15rem] rounded-bl-md bg-white/80 dark:bg-white/5 border border-gray-100/80 dark:border-white/10 text-[#0F172A] dark:text-gray-100 shadow-[0_8px_24px_-16px_rgba(15,23,42,0.35)]"
                  }`}
                >
                  {msg.role === "assistant" ? <AssistantRichText text={msg.text} /> : msg.text}
                  {msg.actions?.some(a => a.type === "compose_email" && a.to) && openCompose ? (
                    <button
                      type="button"
                      onClick={() => {
                        const a = msg.actions?.find(x => x.type === "compose_email");
                        if (a) openEmail(a);
                      }}
                      className="mt-2 h-8 px-2.5 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <Mail size={12} /> Open email
                    </button>
                  ) : null}
                  {pdfAction(msg)?.month ? (
                    <button
                      type="button"
                      onClick={() => {
                        const a = pdfAction(msg);
                        if (a?.month) void downloadPdf(a.month);
                      }}
                      disabled={!!pdfBusy}
                      className="mt-2 h-8 px-2.5 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      {pdfBusy ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
                      {pdfBusy
                        ? "Capturing..."
                        : "Download Accounts Reports"}
                    </button>
                  ) : null}
                  {msg.role === "assistant" && msg.id !== "welcome" ? (
                    <div className="mt-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          quoteIntoInput(msg);
                        }}
                        className="h-7 w-7 rounded-lg text-gray-400 hover:text-[#1B6FE8] hover:bg-[#EAF2FE] inline-flex items-center justify-center"
                        aria-label="Reply"
                        title="Reply"
                      >
                        <Reply size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void rate(msg, "up")}
                        className={`h-7 w-7 rounded-lg inline-flex items-center justify-center ${
                          msg.feedback === "up" ? "bg-[#EAF2FE] text-[#1B6FE8]" : "text-gray-400 hover:text-[#1B6FE8]"
                        }`}
                        aria-label="Good answer"
                        title="Good answer"
                      >
                        <ThumbsUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void rate(msg, "down")}
                        className={`h-7 w-7 rounded-lg inline-flex items-center justify-center ${
                          msg.feedback === "down" ? "bg-[#EAF2FE] text-[#1B6FE8]" : "text-gray-400 hover:text-[#1B6FE8]"
                        }`}
                        aria-label="Needs work"
                        title="Needs work"
                      >
                        <ThumbsDown size={12} />
                      </button>
                    </div>
                  ) : null}
                </div>
                {nexaStamp(msg) ? (
                  <span className={`mt-0.5 px-1 text-[10px] font-medium ${
                    msg.role === "user" ? "text-[#1B6FE8]/70" : "text-gray-400"
                  }`}>
                    {nexaStamp(msg)}
                  </span>
                ) : null}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="inline-flex items-center gap-2 rounded-2xl bg-white/80 dark:bg-white/5 border border-gray-100 px-3 py-2 text-[11px] font-semibold text-gray-500">
                <Loader2 size={12} className="animate-spin text-[#1B6FE8]" /> Looking up CRM...
              </div>
            ) : null}
          </div>

          <form
            className="relative shrink-0 p-3 pt-2"
            onSubmit={e => {
              e.preventDefault();
              void ask(input);
            }}
          >
            <div className="flex items-end gap-2 rounded-[1.35rem] bg-gray-50/90 dark:bg-white/5 border border-gray-100/80 dark:border-white/10 p-1.5 pl-3 shadow-inner">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
                rows={1}
                placeholder="Ask Nexa…"
                className="flex-1 resize-none bg-transparent py-2.5 text-sm text-[#0F172A] dark:text-white placeholder:text-gray-400 outline-none max-h-24"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#1B6FE8] to-[#8c0d22] text-white inline-flex items-center justify-center disabled:opacity-35 shrink-0 shadow-[0_8px_16px_rgba(184,17,45,0.3)] hover:brightness-110 transition"
                aria-label="Send"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </form>
            </>
          )}
        </div>
      ) : null}

      <div className={`pointer-events-auto relative ${open ? "" : "crm-assistant-bob"}`}>
        {!open ? (
          <span
            aria-hidden
            className="crm-assistant-ring pointer-events-none absolute inset-0 rounded-[1.45rem] border-2 border-[#1B6FE8]/40"
          />
        ) : null}
        <button
          type="button"
          onClick={() => {
            setHistoryOpen(false);
            setOpen(v => !v);
          }}
          className="group relative h-14 w-14 lg:h-16 lg:w-16 rounded-[1.35rem] lg:rounded-[1.45rem] bg-gradient-to-br from-[#1B6FE8] to-[#8c0d22] text-white shadow-[0_16px_40px_rgba(184,17,45,0.45)] inline-flex items-center justify-center hover:scale-[1.05] active:scale-[0.98] transition-transform"
          aria-label={open ? "Close Nexa" : "Open Nexa"}
        >
          <span className="absolute inset-0 rounded-[1.35rem] lg:rounded-[1.45rem] bg-white/15 opacity-0 group-hover:opacity-100 transition-opacity" />
          {open ? <X size={20} /> : <Bot size={22} className="lg:h-[26px] lg:w-[26px]" />}
        </button>
      </div>
    </div>,
    document.body,
  );
}

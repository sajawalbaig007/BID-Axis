"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { visibleInterval } from "@/lib/visibleInterval";
import {
  Send, Plus, Search, X, MessageSquare, Hash, User2,
  Check, CheckCheck, ChevronLeft, Loader2, Paperclip,
  Mic, StopCircle, Play, Pause, Download, FileText,
  Film, Music, Bell, BellOff, Image as ImageIcon,
  Trash2, Reply, Copy, Pin, PinOff, CheckSquare,
} from "lucide-react";
import TopNavbar from "../components/navigation/TopNavbar";
import ChatActionRail from "@/app/components/chat/ChatActionRail";
import { MentionText, autoGrowTextarea } from "@/app/components/chat/MessageExtras";
import ChatListResizeHandle, { useChatListWidth } from "@/app/components/chat/ChatListResizeHandle";
import { deduplicateConvs, mergeConversationLists, sortConversations, type ChatConversation } from "@/lib/chatConversations";
import API from "@/lib/api";
import { formatEstChatDaySep, formatEstChatTime, formatEstTime } from "@/lib/estTime";
import { getAuthMe } from "@/lib/authMeCache";
import { fetchChatMessages, isChatConversationsFresh } from "@/lib/chatApiCache";
import { roleDisplayLabel } from "@/lib/roleDisplay";
import { playChatSound } from "@/lib/chatSound";
import {
  ensureChatUnreadPolling, getChatConversations,
  forceStopChatUnreadPolling, pollChatUnread, subscribeChatUnread,
  markConversationRead,
} from "@/lib/chatUnreadStore";
import {
  startChatStatusHeartbeat,
  stopChatStatusHeartbeat,
} from "@/lib/chatStatusHeartbeat";

/* ─── Types ─────────────────────────────────────────────── */
interface ChatUser {
  id: string; name: string; email?: string;
  csrCode?: string | null; isOnline?: boolean; role?: string;
  profilePic?: string | null;
}
type MsgType   = "text" | "file" | "image" | "voice";
type MsgStatus = "sending" | "sent" | "delivered" | "read";

interface ReplyQuote { id: string; text: string; senderName: string; type: MsgType; }

interface Message {
  id: string; senderId: string; senderName: string;
  text: string; type: MsgType;
  fileUrl?: string; fileName?: string; fileSize?: number; fileMimeType?: string;
  createdAt: string; isOwn: boolean; status: MsgStatus;
  replyTo?: ReplyQuote | null;
}
interface Conversation extends ChatConversation {}

interface CtxMenu { x: number; y: number; msg: Message; }

/* ─── Constants ──────────────────────────────────────────── */
const MAX_FILE_BYTES = 200 * 1024 * 1024;

/* ─── Helpers ────────────────────────────────────────────── */
function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}
function fmtConvTime(iso: string) {
  return formatEstChatTime(iso);
}
function fmtMsgTime(iso: string) {
  return formatEstTime(iso);
}
function fmtDateSep(iso: string) {
  return formatEstChatDaySep(iso);
}
function fmtAudio(secs: number) {
  const s = Math.floor(secs), m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
function mimeIcon(mime = "") {
  if (mime.startsWith("image/")) return <ImageIcon size={18} />;
  if (mime.startsWith("video/")) return <Film size={18} />;
  if (mime.startsWith("audio/")) return <Music size={18} />;
  return <FileText size={18} />;
}
function truncate(text: string, n = 60) {
  return text.length > n ? text.slice(0, n) + "…" : text;
}

/* ─── Avatar ─────────────────────────────────────────────── */
const COLORS = ["bg-[#1B6FE8]","bg-[#1D4ED8]","bg-[#15803D]","bg-[#B45309]","bg-[#7C3AED]","bg-[#0891B2]"];
function Avatar({ name, src, size = "md", online }: { name: string; src?: string | null; size?: "sm"|"md"|"lg"; online?: boolean }) {
  const c  = COLORS[name.charCodeAt(0) % COLORS.length];
  const sz = size === "sm" ? "w-8 h-8 text-[10px]" : size === "lg" ? "w-11 h-11 text-sm" : "w-9 h-9 text-xs";
  return (
    <div className="relative shrink-0">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className={`${sz} rounded-full object-cover bg-gray-100`} />
      ) : (
        <div className={`${sz} ${c} rounded-full text-white flex items-center justify-center font-bold`}>{initials(name)}</div>
      )}
      {online !== undefined && (
        <div className="absolute -bottom-0.5 -right-0.5">
          {online && <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-green-400 animate-ping opacity-75" />}
          <div className={`w-2.5 h-2.5 rounded-full border-2 border-white ${online ? "bg-green-500" : "bg-gray-300"}`} />
        </div>
      )}
    </div>
  );
}

/* ─── Ticks ──────────────────────────────────────────────── */
function Ticks({ status }: { status: MsgStatus }) {
  if (status === "sending")   return <Loader2 size={10} className="text-white/50 animate-spin" />;
  if (status === "sent")      return <Check size={10} className="text-white/60" />;
  if (status === "delivered") return <CheckCheck size={10} className="text-white/70" />;
  return <CheckCheck size={10} className="text-blue-300" />;
}

/* ─── FileCard ────────────────────────────────────────────── */
function FileCard({ fileName, fileSize, fileUrl, fileMimeType, isOwn }: {
  fileName: string; fileSize: number; fileUrl: string; fileMimeType?: string; isOwn: boolean;
}) {
  return (
    <a href={fileUrl} target="_blank" rel="noopener noreferrer" download={fileName}
      className={`flex items-center gap-2.5 p-2.5 rounded-xl min-w-[160px] max-w-[240px] group transition-colors ${
        isOwn ? "bg-white/15 hover:bg-white/25" : "bg-[#F5F6FA] hover:bg-gray-100"
      }`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
        isOwn ? "bg-white/20 text-white" : "bg-[#1B6FE8]/10 text-[#1B6FE8]"
      }`}>{mimeIcon(fileMimeType)}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate">{fileName}</p>
        <p className={`text-[10px] ${isOwn ? "text-white/60" : "text-gray-400"}`}>{fmtSize(fileSize)}</p>
      </div>
      <Download size={13} className={`shrink-0 opacity-60 group-hover:opacity-100 ${isOwn ? "text-white" : "text-gray-400"}`} />
    </a>
  );
}

/* ─── VoicePlayer ────────────────────────────────────────── */
function VoicePlayer({ fileUrl, isOwn }: { fileUrl: string; isOwn: boolean }) {
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [curTime,  setCurTime]  = useState(0);
  const [dur,      setDur]      = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().then(() => setPlaying(true)).catch(() => {}); }
  };
  return (
    <div className="flex items-center gap-2.5 min-w-[180px] max-w-[240px] py-0.5">
      <audio ref={audioRef} src={fileUrl}
        onTimeUpdate={e => { const a = e.currentTarget; setCurTime(a.currentTime); setProgress(a.duration ? (a.currentTime/a.duration)*100 : 0); }}
        onLoadedMetadata={e => setDur(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurTime(0); }} />
      <button onClick={toggle}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
          isOwn ? "bg-white/20 hover:bg-white/30" : "bg-[#1B6FE8]/10 hover:bg-[#1B6FE8]/20"
        }`}>
        {playing ? <Pause size={13} className={isOwn ? "text-white" : "text-[#1B6FE8]"} />
                 : <Play  size={13} className={isOwn ? "text-white" : "text-[#1B6FE8]"} />}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className={`h-1 rounded-full overflow-hidden ${isOwn ? "bg-white/30" : "bg-gray-200"}`}>
          <div className={`h-full rounded-full ${isOwn ? "bg-white" : "bg-[#1B6FE8]"}`}
            style={{ width: `${progress}%`, transition: "width 0.1s linear" }} />
        </div>
        <span className={`text-[9px] ${isOwn ? "text-white/60" : "text-gray-400"}`}>
          {fmtAudio(curTime)} / {fmtAudio(dur)}
        </span>
      </div>
    </div>
  );
}

/* ─── MessageBubble ──────────────────────────────────────── */
function MessageBubble({
  msg, isGroup, showAvatar, myId, onCtxMenu, onReply, onJumpToReply,
}: {
  msg: Message; isGroup: boolean; showAvatar: boolean; myId?: string;
  onCtxMenu: (e: React.MouseEvent, msg: Message) => void;
  onReply:   (msg: Message) => void;
  onJumpToReply: (id: string) => void;
}) {
  const own = Boolean(msg.isOwn || (myId && msg.senderId === myId));

  const body = () => {
    if (msg.type === "image" && msg.fileUrl)
      return (
        <div className="space-y-1.5">
          <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={msg.fileUrl} alt={msg.fileName ?? "image"}
              className="max-w-[220px] max-h-[220px] rounded-xl object-cover" />
          </a>
          {msg.text?.trim() ? <MentionText text={msg.text} tone={own ? "own" : "other"} className="text-sm leading-relaxed break-words whitespace-pre-wrap" /> : null}
        </div>
      );
    if (msg.type === "voice" && msg.fileUrl)
      return <VoicePlayer fileUrl={msg.fileUrl} isOwn={own} />;
    if (msg.type === "file" && msg.fileUrl)
      return (
        <div className="space-y-1.5">
          <FileCard fileName={msg.fileName ?? "File"} fileSize={msg.fileSize ?? 0}
            fileUrl={msg.fileUrl} fileMimeType={msg.fileMimeType} isOwn={own} />
          {msg.text?.trim() ? <MentionText text={msg.text} tone={own ? "own" : "other"} className="text-sm leading-relaxed break-words whitespace-pre-wrap" /> : null}
        </div>
      );
    return <MentionText text={msg.text} tone={own ? "own" : "other"} className="text-sm leading-relaxed break-words whitespace-pre-wrap" />;
  };

  return (
    <div
      id={`msg-${msg.id}`}
      className="flex w-full"
      style={{ justifyContent: own ? "flex-end" : "flex-start" }}
      onContextMenu={e => onCtxMenu(e, msg)}
    >
      <div className="relative group max-w-[min(85%,28rem)]">
        <div className={`flex items-end gap-2 min-w-0 ${own ? "flex-row-reverse" : ""}`}>
          {!own && showAvatar  && <Avatar name={msg.senderName} size="sm" />}
          {!own && !showAvatar && <div className="w-8 shrink-0" />}

          <div className={`flex flex-col min-w-0 ${own ? "items-end" : "items-start"}`}>
            {isGroup && !own && showAvatar && (
              <span className="text-[10px] font-bold text-[#1B6FE8] mb-0.5 ml-1">{msg.senderName}</span>
            )}

            {msg.replyTo && (
              <button
                onClick={() => onJumpToReply(msg.replyTo!.id)}
                className={`mb-1 text-left rounded-xl px-2.5 py-1.5 border-l-4 text-[11px] max-w-full ${
                  own
                    ? "bg-white/10 border-white/40 text-white/80 hover:bg-white/20"
                    : "bg-gray-100 border-[#1B6FE8]/40 text-gray-500 hover:bg-gray-200"
                } transition-colors`}
              >
                <p className="font-bold text-[10px] mb-0.5 opacity-80">{msg.replyTo.senderName}</p>
                <p className="truncate max-w-[180px]">
                  {msg.replyTo.type !== "text" ? `📎 ${msg.replyTo.type}` : truncate(msg.replyTo.text, 50)}
                </p>
              </button>
            )}

            <div className={`rounded-2xl ${msg.type === "text" ? "px-3.5 py-2.5" : "p-2"} ${
              own
                ? "bg-[#1B6FE8] text-white rounded-br-sm"
                : "bg-white text-[#0F172A] shadow-sm border border-gray-100 rounded-bl-sm"
            }`}>
              {body()}
            </div>

            <div className={`flex items-center gap-1 mt-0.5 px-1 ${own ? "flex-row-reverse" : ""}`}>
              <span className="text-[9px] text-gray-400">{fmtMsgTime(msg.createdAt)}</span>
              {own && <Ticks status={msg.status} />}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onReply(msg)}
          title="Reply"
          className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50 z-10 ${own ? "right-full mr-1" : "left-full ml-1"}`}
        >
          <Reply size={12} className="text-gray-500" />
        </button>
      </div>
    </div>
  );
}

/* ─── ConvItem ───────────────────────────────────────────── */
function ConvItem({
  conv, active, onClick, selectMode, selected, onSelect, pinned, onPin,
}: {
  conv: Conversation; active: boolean; onClick: () => void;
  selectMode: boolean; selected: boolean; onSelect: () => void;
  pinned: boolean; onPin: () => void;
}) {
  return (
    <div
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer group ${
        active ? "bg-[#EAF2FE]" : "hover:bg-[#F9FAFB]"
      } ${selected ? "bg-[#EAF2FE] ring-1 ring-[#1B6FE8]/20" : ""}`}
      onClick={selectMode ? onSelect : onClick}
    >
      {/* Checkbox in select mode */}
      {selectMode ? (
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          selected ? "bg-[#1B6FE8] border-[#1B6FE8]" : "border-gray-300"
        }`}>
          {selected && <Check size={10} className="text-white" />}
        </div>
      ) : (
        conv.type === "group"
          ? <div className="w-9 h-9 rounded-full bg-[#1B6FE8]/10 text-[#1B6FE8] flex items-center justify-center shrink-0"><Hash size={16} /></div>
          : <Avatar name={conv.name} size="sm" online={conv.isOnline} />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={`text-[13px] font-semibold truncate ${active ? "text-[#1B6FE8]" : "text-[#0F172A]"}`}>
            {pinned && <Pin size={9} className="inline mr-1 text-[#1B6FE8]" />}
            {conv.name}
          </span>
          {conv.lastMessageAt && <span className="text-[10px] text-gray-400 shrink-0">{fmtConvTime(conv.lastMessageAt)}</span>}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="text-[11px] text-gray-400 truncate">
            {conv.lastMessage ?? (conv.type === "group" ? `${conv.memberCount ?? 0} members` : "No messages yet")}
          </p>
          {conv.unreadCount > 0 && (
            <span className="bg-[#1B6FE8] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center shrink-0">
              {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
            </span>
          )}
        </div>
      </div>

      {/* Pin/unpin on hover (not in select mode) */}
      {!selectMode && (
        <button
          onClick={e => { e.stopPropagation(); onPin(); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 shrink-0"
          title={pinned ? "Unpin" : "Pin"}
        >
          {pinned ? <PinOff size={12} className="text-gray-400" /> : <Pin size={12} className="text-gray-400" />}
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
export default function ChatPage() {
  const [me,             setMe]             = useState<ChatUser | null>(null);
  const [conversations,  setConversations]  = useState<Conversation[]>([]);
  const [activeConvId,   setActiveConvId]   = useState<string | null>(null);
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [loadingConvs,   setLoadingConvs]   = useState(true);
  const [loadingMsgs,    setLoadingMsgs]    = useState(false);
  const [sendingMsg,     setSendingMsg]     = useState(false);
  const [msgText,        setMsgText]        = useState("");
  const [convSearch,     setConvSearch]     = useState("");
  const [mobileSideOpen, setMobileSideOpen] = useState(true);

  // Group modal
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName,      setGroupName]      = useState("");
  const [allUsers,       setAllUsers]       = useState<ChatUser[]>([]);
  const [loadingUsers,   setLoadingUsers]   = useState(false);
  const [selectedUsers,  setSelectedUsers]  = useState<string[]>([]);
  const [userSearch,     setUserSearch]     = useState("");
  const [creatingGroup,  setCreatingGroup]  = useState(false);

  // DM modal
  const [showDmModal, setShowDmModal] = useState(false);
  const [dmSearch,    setDmSearch]    = useState("");

  // File upload
  const [pendingFile,    setPendingFile]    = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading,      setUploading]      = useState(false);

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [recTime,     setRecTime]     = useState(0);

  // Notifications — lazy initializer avoids synchronous setState in effect
  const [notifGranted, setNotifGranted] = useState(
    () => typeof Notification !== "undefined" && Notification.permission === "granted"
  );

  // ── NEW: WhatsApp features ──
  const [selectMode,    setSelectMode]    = useState(false);
  const [selectedConvs, setSelectedConvs] = useState<string[]>([]);
  const [pinnedIds,     setPinnedIds]     = useState<Set<string>>(new Set());
  const [replyTo,       setReplyTo]       = useState<Message | null>(null);
  const [ctxMenu,       setCtxMenu]       = useState<CtxMenu | null>(null);
  const [typingName,    setTypingName]    = useState<string | null>(null);
  const [msgSearchOpen, setMsgSearchOpen] = useState(false);
  const [msgSearchText, setMsgSearchText] = useState("");

  // Refs
  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const inputRef         = useRef<HTMLTextAreaElement>(null);
  const fileInputRef     = useRef<HTMLInputElement>(null);
  const lastMsgCount     = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);
  const recTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCancelRef      = useRef(false);
  const notifRef         = useRef(typeof Notification !== "undefined" && Notification.permission === "granted");
  const meRef            = useRef<ChatUser | null>(null);
  const recConvRef       = useRef<string | null>(null);
  const dmLoadingRef     = useRef<string | null>(null);
  const blockNavCloseRef = useRef(false);
  const typingDebRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgsContainerRef = useRef<HTMLDivElement>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const { width: listWidth, onPointerDown: onListResize } = useChatListWidth("csr-chat-list-width", 300);

  useEffect(() => { setPortalReady(true); }, []);

  /* ── Profile ── */
  useEffect(() => {
    void getAuthMe(true).then(u => { if (u) { setMe(u); meRef.current = u; } });
  }, []);

  /* ── Notification permission ── */
  const askNotif = async () => {
    if (typeof Notification === "undefined") return;
    const r = await Notification.requestPermission();
    const ok = r === "granted";
    setNotifGranted(ok); notifRef.current = ok;
  };

  /* ── Conversation list via shared store — poll only while this page is open ── */
  useEffect(() => {
    ensureChatUnreadPolling();

    const cached = getChatConversations();
    if (cached.length > 0) {
      setConversations(deduplicateConvs(cached));
      setLoadingConvs(false);
    }
    if (!isChatConversationsFresh() || cached.length === 0) {
      void pollChatUnread().finally(() => setLoadingConvs(false));
    }

    const unsub = subscribeChatUnread((_total, convs) => {
      setConversations(prev => mergeConversationLists(deduplicateConvs(convs), prev));
    });
    return () => {
      unsub();
      forceStopChatUnreadPolling();
    };
  }, []);

  /* ── Heartbeat ── */
  useEffect(() => {
    startChatStatusHeartbeat();
    return () => stopChatStatusHeartbeat();
  }, []);

  /* ── Load + poll messages + typing ── */
  useEffect(() => {
    if (!activeConvId || activeConvId.startsWith("temp-")) return;
    const cid = activeConvId;
    lastMsgCount.current = 0;

    void (async () => {
      await Promise.resolve(); // yield — keeps all setState calls out of sync effect body
      setTypingName(null);
      setMsgSearchOpen(false);
      setMsgSearchText("");
      setMessages([]);
      setLoadingMsgs(true);
      try {
        const url = `/chat/conversations/${cid}/messages`;
        const payload = await fetchChatMessages(url);
        const msgs: Message[] = payload.messages as Message[];
        setMessages(msgs);
        lastMsgCount.current = msgs.length;
        setConversations(p => p.map(c => c.id === cid ? { ...c, unreadCount: 0 } : c));
        markConversationRead(cid);
        void API.post(`/chat/conversations/${cid}/read`).catch(() => {});
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }), 60);
      } catch { setMessages([]); }
      finally { setLoadingMsgs(false); }
    })();

    const stopPoll = visibleInterval(async () => {
      try {
        const url = `/chat/conversations/${cid}/messages`;
        const [payload, typingRes] = await Promise.all([
          fetchChatMessages(url),
          API.get(`/chat/conversations/${cid}/typing`).catch(() => ({ data: { names: [] } })),
        ]);

        setTypingName((typingRes.data.names as string[])?.[0] ?? null);

        const msgs: Message[] = payload.messages as Message[];
        if (msgs.length !== lastMsgCount.current) {
          const hadNew = msgs.length > lastMsgCount.current;
          lastMsgCount.current = msgs.length;
          setMessages(msgs);
          setConversations(p => p.map(c => c.id === cid ? { ...c, unreadCount: 0 } : c));
          markConversationRead(cid);
          void API.post(`/chat/conversations/${cid}/read`).catch(() => {});
          const newest = msgs[msgs.length - 1];
          if (hadNew && newest && !newest.isOwn) {
            playChatSound();
            if (notifRef.current && !document.hasFocus()) {
              new Notification(newest.senderName, {
                body: newest.type !== "text" ? `Sent a ${newest.type}` : newest.text.slice(0, 80),
                icon: "/images/image.png",
              });
            }
          }
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
        }
      } catch { /* ignore */ }
    }, 8_000);

    return stopPoll;
  }, [activeConvId]);

  /* ── Cleanup recording on unmount ── */
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (recTimerRef.current) clearInterval(recTimerRef.current);
  }, []);

  /* ─── Send text ─── */
  const sendText = async () => {
    if (!msgText.trim() || !activeConvId || sendingMsg) return;
    const text = msgText.trim();
    const reply = replyTo;
    setMsgText("");
    setReplyTo(null);
    setSendingMsg(true);
    requestAnimationFrame(() => autoGrowTextarea(inputRef.current));
    const opt: Message = {
      id: `opt-${Date.now()}`, senderId: meRef.current?.id ?? "",
      senderName: meRef.current?.name ?? "You", text, type: "text",
      createdAt: new Date().toISOString(), isOwn: true, status: "sending",
      replyTo: reply ? { id: reply.id, text: reply.text, senderName: reply.senderName, type: reply.type } : null,
    };
    setMessages(p => [...p, opt]);
    setConversations(p => p.map(c => c.id === activeConvId
      ? { ...c, lastMessage: text, lastMessageAt: new Date().toISOString() } : c));
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    try {
      await API.post(`/chat/conversations/${activeConvId}/messages`, {
        text,
        ...(reply ? { replyToId: reply.id } : {}),
      });
      setMessages(p => p.map(m => m.id === opt.id ? { ...m, status: "sent" } : m));
    } catch {
      setMessages(p => p.filter(m => m.id !== opt.id));
      setMsgText(text);
    } finally {
      setSendingMsg(false);
      inputRef.current?.focus();
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (pendingFile) void sendFile(); else void sendText(); }
  };

  const onMsgTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMsgText(e.target.value);
    autoGrowTextarea(e.target);
    if (activeConvId && e.target.value.trim()) {
      if (typingDebRef.current) clearTimeout(typingDebRef.current);
      typingDebRef.current = setTimeout(() => {
        void API.post(`/chat/conversations/${activeConvId}/typing`).catch(() => {});
      }, 500);
    }
  };

  /* ─── File select ─── */
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { alert(`Max file size is 200 MB. This file is ${fmtSize(file.size)}.`); e.target.value = ""; return; }
    setPendingFile(file);
    setPendingPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    e.target.value = "";
  };

  const clearPending = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null); setPendingPreview(null);
  };

  /* ─── Send file/image ─── */
  const sendFile = async () => {
    if (!pendingFile || !activeConvId || uploading) return;
    const file = pendingFile;
    const type: MsgType = file.type.startsWith("image/") ? "image" : "file";
    const caption = msgText.trim();
    clearPending();
    setMsgText("");
    setUploading(true); setUploadProgress(0);
    const opt: Message = {
      id: `opt-${Date.now()}`, senderId: meRef.current?.id ?? "",
      senderName: meRef.current?.name ?? "You", text: caption, type,
      fileName: file.name, fileSize: file.size, fileMimeType: file.type,
      createdAt: new Date().toISOString(), isOwn: true, status: "sending",
    };
    setMessages(p => [...p, opt]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", type);
    if (caption) fd.append("text", caption);
    try {
      await API.post(`/chat/conversations/${activeConvId}/messages`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (ev: { loaded: number; total?: number }) => {
          if (ev.total) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        },
      });
      setMessages(p => p.map(m => m.id === opt.id ? { ...m, status: "sent" } : m));
    } catch {
      setMessages(p => p.filter(m => m.id !== opt.id));
    } finally {
      setUploading(false); setUploadProgress(0);
    }
  };

  /* ─── Voice recording ─── */
  const startRec = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      alert("Voice recording not supported in this browser."); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      isCancelRef.current = false;
      recConvRef.current = activeConvId;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (isCancelRef.current) { chunksRef.current = []; return; }
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size === 0) return;
        await sendVoice(blob, mime);
      };
      rec.start(100);
      mediaRecorderRef.current = rec;
      setIsRecording(true); setRecTime(0);
      recTimerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
    } catch { alert("Microphone access denied."); }
  };

  const stopRec = () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    isCancelRef.current = false;
    mediaRecorderRef.current?.stop();
    setIsRecording(false); setRecTime(0);
  };

  const cancelRec = () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    isCancelRef.current = true;
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setIsRecording(false); setRecTime(0);
  };

  const sendVoice = async (blob: Blob, mime: string) => {
    const cid = recConvRef.current ?? activeConvId;
    if (!cid) return;
    const opt: Message = {
      id: `opt-${Date.now()}`, senderId: meRef.current?.id ?? "",
      senderName: meRef.current?.name ?? "You", text: "", type: "voice",
      fileName: "Voice message", fileSize: blob.size, fileMimeType: mime,
      createdAt: new Date().toISOString(), isOwn: true, status: "sending",
    };
    setMessages(p => [...p, opt]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    const fd = new FormData();
    fd.append("file", blob, "voice.webm");
    fd.append("type", "voice");
    try {
      await API.post(`/chat/conversations/${cid}/messages`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setMessages(p => p.map(m => m.id === opt.id ? { ...m, status: "sent" } : m));
    } catch {
      setMessages(p => p.filter(m => m.id !== opt.id));
    }
  };

  /* ─── Load users ─── */
  const parseUsers = (data: unknown): ChatUser[] => {
    const raw = Array.isArray(data) ? data : ((data as Record<string, unknown>)?.users ?? data ?? []) as unknown[];
    return (raw as Record<string, unknown>[]).map(u => ({
      id:       String(u.id),
      name:     (() => {
        const n = String(u.name ?? "").trim();
        if (n && n.toLowerCase() !== "unknown") return n;
        const email = u.email ? String(u.email) : "";
        if (email) return email.includes("@") ? email.split("@")[0]! : email;
        return u.csrCode ? String(u.csrCode) : (u.role ? String(u.role).replace(/_/g, " ") : "User");
      })(),
      email:    u.email ? String(u.email) : undefined,
      csrCode:  u.csrCode ? String(u.csrCode) : null,
      role:     u.role ? String(u.role) : undefined,
      isOnline: Boolean(u.isOnline),
    }));
  };

  const fetchUsers = async (force = false) => {
    if (!force && allUsers.length > 0) return;
    setLoadingUsers(true);
    try {
      const r = await API.get("/chat/users");
      setAllUsers(parseUsers(r.data?.users ?? r.data).filter(u => u.id !== meRef.current?.id));
    } catch {
      try {
        const r = await API.get("/users");
        setAllUsers(parseUsers(r.data).filter(u => u.id !== meRef.current?.id));
      } catch {
        if (force || allUsers.length === 0) setAllUsers([]);
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (allUsers.length === 0) return;
    const t = setInterval(async () => {
      try {
        const r = await API.get("/chat/users");
        const fresh = parseUsers(r.data?.users ?? r.data);
        setAllUsers(prev => prev.map(u => {
          const updated = fresh.find(f => f.id === u.id);
          return updated ? { ...u, isOnline: updated.isOnline } : u;
        }));
      } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUsers.length === 0 ? 0 : 1]);

  /* ─── Create group ─── */
  const createGroup = async () => {
    if (!groupName.trim() || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const r = await API.post("/chat/conversations", { type: "group", name: groupName.trim(), memberIds: selectedUsers });
      const conv: Conversation = r.data.conversation ?? {
        id: r.data.id ?? `grp-${Date.now()}`, type: "group",
        name: groupName.trim(), unreadCount: 0, memberCount: selectedUsers.length + 1,
      };
      setConversations(p => [conv, ...p]);
      setActiveConvId(conv.id);
      setShowGroupModal(false); setGroupName(""); setSelectedUsers([]); setUserSearch(""); setMobileSideOpen(false);
    } catch { /* ignore */ }
    setCreatingGroup(false);
  };

  /* ─── Start DM ─── */
  const startDm = async (user: ChatUser) => {
    if (dmLoadingRef.current) return;
    dmLoadingRef.current = user.id;
    blockNavCloseRef.current = true;
    window.setTimeout(() => { blockNavCloseRef.current = false; }, 400);

    window.setTimeout(() => { setShowDmModal(false); setDmSearch(""); }, 0);
    setMobileSideOpen(false);

    const existing = conversations.find(c => c.type === "direct" && c.otherUserId === user.id);
    if (existing) {
      setActiveConvId(existing.id);
      dmLoadingRef.current = null;
      return;
    }

    const tempId = `temp-${user.id}`;
    const placeholder: Conversation = {
      id: tempId, type: "direct", name: user.name,
      unreadCount: 0, isOnline: user.isOnline, otherUserId: user.id,
      lastMessageAt: new Date().toISOString(),
    };
    setConversations(p => [placeholder, ...p]);
    setActiveConvId(tempId);

    try {
      const r   = await API.post("/chat/conversations", { type: "direct", userId: user.id });
      const cid = r.data.id ?? r.data.conversation?.id;
      if (!cid) return;

      setConversations(p => {
        const merged = p.map(c => c.id === tempId ? { ...c, id: cid } : c);
        const seen   = new Set<string>();
        return merged.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
      });
      setActiveConvId(cid);
    } catch {
      /* Keep in sidebar if sync fails */
    } finally {
      dmLoadingRef.current = null;
    }
  };

  /* ─── Delete conversations ─── */
  const deleteConversations = async (ids: string[]) => {
    setConversations(p => p.filter(c => !ids.includes(c.id)));
    if (ids.includes(activeConvId ?? "")) setActiveConvId(null);
    setSelectedConvs([]);
    setSelectMode(false);
    await Promise.all(ids.map(id => API.delete(`/chat/conversations/${id}`).catch(() => {})));
  };

  /* ─── Delete message ─── */
  const deleteMsg = async (msgId: string, forEveryone: boolean) => {
    const remaining = messages.filter(m => m.id !== msgId);
    setMessages(remaining);
    setCtxMenu(null);
    try {
      const res = await API.delete(`/chat/messages/${msgId}`, {
        data: { mode: forEveryone ? "for_everyone" : "for_me" },
      });
      const cleared = Boolean(res.data?.conversationCleared) || remaining.length === 0;
      if (cleared && activeConvId) {
        setConversations(p => p.filter(c => c.id !== activeConvId));
        setActiveConvId(null);
      }
    } catch { /* ignore */ }
  };

  /* ─── Context menu ─── */
  const handleCtxMenu = (e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth  - 200);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    setCtxMenu({ x, y, msg });
  };

  /* ─── Reply ─── */
  const handleReply = (msg: Message) => {
    setReplyTo(msg);
    setCtxMenu(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  /* ─── Copy text ─── */
  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCtxMenu(null);
  };

  /* ─── Jump to reply ─── */
  const jumpToReply = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-yellow-50");
      setTimeout(() => el.classList.remove("bg-yellow-50"), 1200);
    }
  };

  /* ─── Toggle pin ─── */
  const togglePin = (convId: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(convId)) next.delete(convId);
      else next.add(convId);
      return next;
    });
  };

  /* ─── Derived ─── */
  const activeConv = useMemo(() => conversations.find(c => c.id === activeConvId) ?? null, [conversations, activeConvId]);

  const filteredConvs = useMemo(() => {
    const q = convSearch.toLowerCase();
    return !q ? conversations : conversations.filter(c => c.name.toLowerCase().includes(q));
  }, [conversations, convSearch]);

  const filteredUsers = useMemo(() => {
    const q = (showGroupModal ? userSearch : dmSearch).toLowerCase();
    return !q ? allUsers : allUsers.filter(u =>
      u.name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || (u.csrCode ?? "").toLowerCase().includes(q)
    );
  }, [allUsers, userSearch, dmSearch, showGroupModal]);

  const visibleMessages = useMemo(() => {
    if (!msgSearchText.trim()) return messages;
    const q = msgSearchText.toLowerCase();
    return messages.filter(m => m.text.toLowerCase().includes(q) || m.fileName?.toLowerCase().includes(q));
  }, [messages, msgSearchText]);

  const msgGroups = useMemo(() => {
    const groups: { date: string; msgs: Message[] }[] = [];
    visibleMessages.forEach(msg => {
      const date = fmtDateSep(msg.createdAt);
      const last = groups[groups.length - 1];
      if (!last || last.date !== date) groups.push({ date, msgs: [msg] });
      else last.msgs.push(msg);
    });
    return groups;
  }, [visibleMessages]);

  const totalUnread = useMemo(() => conversations.reduce((s, c) => s + c.unreadCount, 0), [conversations]);

  const sortedConvs = useMemo(() => sortConversations(filteredConvs, pinnedIds), [filteredConvs, pinnedIds]);

  const directConvs = useMemo(() =>
    sortedConvs.filter(c => c.type === "direct").sort((a, b) => {
      if (pinnedIds.has(a.id) !== pinnedIds.has(b.id)) return pinnedIds.has(a.id) ? -1 : 1;
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return 0;
    }),
    [sortedConvs, pinnedIds]
  );

  const groupConvs = useMemo(() => sortedConvs.filter(c => c.type === "group"), [sortedConvs]);

  const onlineDirects = useMemo(() =>
    conversations.filter(c => c.type === "direct" && c.isOnline),
    [conversations]
  );

  /* ═══════════════════════════ RENDER ═══════════════════════════ */
  return (
    <div className={`${chatFullscreen ? "fixed inset-0 z-[80]" : "min-h-screen"} bg-[#F5F6FA] flex flex-col`}>
      {chatFullscreen ? null : <TopNavbar />}

      <div className="flex-1 flex overflow-hidden" style={{ height: chatFullscreen ? "100vh" : "calc(100vh - 64px)", ["--chat-list-w" as string]: `${listWidth}px` }}>

        {!selectMode && (
          <ChatActionRail
            notifGranted={notifGranted}
            onNotif={() => void askNotif()}
            onSelect={() => setSelectMode(true)}
            onNewDm={() => { setShowDmModal(true); void fetchUsers(true); }}
            onNewGroup={() => { setShowGroupModal(true); void fetchUsers(true); }}
            isFullscreen={chatFullscreen}
            onFullscreen={() => setChatFullscreen(v => !v)}
          />
        )}

        {/* ══ SIDEBAR ══ */}
        <aside className={`${mobileSideOpen ? "flex" : "hidden"} lg:flex w-full lg:w-[var(--chat-list-w)] shrink-0 flex-col bg-white border-r border-gray-100 absolute lg:relative inset-0 z-20 lg:z-auto min-h-0 overflow-hidden`}>

          <div className="px-4 py-4 border-b border-gray-100 shrink-0">
            {selectMode ? (
              /* ── Select mode header ── */
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => { setSelectMode(false); setSelectedConvs([]); }}
                    className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                    <X size={14} />
                  </button>
                  <span className="text-sm font-bold text-[#0F172A]">
                    {selectedConvs.length} selected
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setSelectedConvs(conversations.map(c => c.id))}
                    className="text-[11px] font-semibold text-[#1B6FE8] hover:underline px-2"
                  >
                    All
                  </button>
                  {selectedConvs.length > 0 && (
                    <button
                      onClick={() => void deleteConversations(selectedConvs)}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#1B6FE8] text-white text-[11px] font-bold hover:bg-[#a30f27] transition-colors"
                    >
                      <Trash2 size={12} />Delete
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* ── Normal header ── */
              <div className="flex items-center gap-2 mb-3 min-w-0">
                <h2 className="text-[17px] font-bold text-[#0F172A] truncate">Messages</h2>
                {totalUnread > 0 && (
                  <span className="bg-[#1B6FE8] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shrink-0">
                    {totalUnread}
                  </span>
                )}
              </div>
            )}

            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search conversations…" value={convSearch}
                onChange={e => setConvSearch(e.target.value)}
                className="w-full h-9 rounded-xl bg-[#F3F4F6] pl-8 pr-3 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-[#1B6FE8]/20 transition-all" />
            </div>
          </div>

          {/* Online Now strip */}
          {!selectMode && onlineDirects.length > 0 && (
            <div className="px-4 pt-3 pb-3 border-b border-gray-100 shrink-0">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
                Online Now · {onlineDirects.length}
              </p>
              <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {onlineDirects.map(c => (
                  <button key={c.id} onClick={() => { setActiveConvId(c.id); setMobileSideOpen(false); }}
                    className="flex flex-col items-center gap-1 shrink-0 group" title={c.name}>
                    <Avatar name={c.name} size="sm" online />
                    <span className="text-[9px] text-gray-500 font-medium max-w-[40px] truncate group-hover:text-[#1B6FE8] transition-colors">
                      {c.name.split(" ")[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto py-2 px-1.5">
            {loadingConvs ? (
              <div className="space-y-1">
                {[1,2,3,4].map(i => (
                  <div key={i} className="flex items-center gap-3 px-3 py-3 animate-pulse">
                    <div className="w-9 h-9 rounded-full bg-gray-100 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-gray-100 rounded w-24" />
                      <div className="h-2.5 bg-gray-100 rounded w-36" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="py-16 text-center px-4">
                <MessageSquare size={32} className="text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-500">No conversations yet</p>
                <p className="text-xs text-gray-400 mt-1">Start a DM or create a group</p>
              </div>
            ) : (
              <>
                {directConvs.length > 0 && (
                  <>
                    <p className="px-4 pt-2 pb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Direct Messages</p>
                    {directConvs.map(conv => (
                      <ConvItem key={conv.id} conv={conv} active={activeConvId === conv.id}
                        selectMode={selectMode}
                        selected={selectedConvs.includes(conv.id)}
                        pinned={pinnedIds.has(conv.id)}
                        onSelect={() => setSelectedConvs(p =>
                          p.includes(conv.id) ? p.filter(id => id !== conv.id) : [...p, conv.id]
                        )}
                        onPin={() => togglePin(conv.id)}
                        onClick={() => { setActiveConvId(conv.id); setMobileSideOpen(false); }} />
                    ))}
                  </>
                )}
                {groupConvs.length > 0 && (
                  <>
                    <p className="px-4 pt-3 pb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Groups</p>
                    {groupConvs.map(conv => (
                      <ConvItem key={conv.id} conv={conv} active={activeConvId === conv.id}
                        selectMode={selectMode}
                        selected={selectedConvs.includes(conv.id)}
                        pinned={pinnedIds.has(conv.id)}
                        onSelect={() => setSelectedConvs(p =>
                          p.includes(conv.id) ? p.filter(id => id !== conv.id) : [...p, conv.id]
                        )}
                        onPin={() => togglePin(conv.id)}
                        onClick={() => { setActiveConvId(conv.id); setMobileSideOpen(false); }} />
                    ))}
                  </>
                )}
                {filteredConvs.length === 0 && convSearch && (
                  <p className="py-10 text-center text-sm text-gray-400">No results for &ldquo;{convSearch}&rdquo;</p>
                )}
              </>
            )}
          </div>

          {me && (
            <div className="px-4 py-3 border-t border-gray-100 shrink-0 flex items-center gap-2.5">
              <Avatar name={me.name} src={me.profilePic} size="sm" online />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#0F172A] truncate">{me.name}</p>
                <p className="text-[10px] text-gray-400 truncate">{me.csrCode ?? roleDisplayLabel(me.role)}</p>
                {me.email ? <p className="text-[9px] text-gray-400 truncate">{me.email}</p> : null}
              </div>
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            </div>
          )}
        </aside>

        <ChatListResizeHandle onPointerDown={onListResize} className="hidden lg:flex" />

        {/* ══ CHAT AREA ══ */}
        <section className={`${!mobileSideOpen ? "flex" : "hidden"} lg:flex flex-1 flex-col min-w-0`}>
          {activeConv ? (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white shrink-0 shadow-sm">
                <button onClick={() => setMobileSideOpen(true)}
                  className="lg:hidden w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <ChevronLeft size={15} />
                </button>
                {activeConv.type === "group"
                  ? <div className="w-9 h-9 rounded-full bg-[#1B6FE8]/10 text-[#1B6FE8] flex items-center justify-center shrink-0"><Hash size={16} /></div>
                  : <Avatar name={activeConv.name} size="sm" online={activeConv.isOnline} />}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-[#0F172A] truncate">{activeConv.name}</h3>
                  {/* Typing indicator takes precedence */}
                  {typingName ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1B6FE8]">
                      <span className="flex gap-0.5">
                        {[0,1,2].map(i => (
                          <span key={i} className="w-1 h-1 rounded-full bg-[#1B6FE8] animate-bounce"
                            style={{ animationDelay: `${i * 150}ms` }} />
                        ))}
                      </span>
                      {typingName} is typing…
                    </span>
                  ) : activeConv.type === "group" ? (
                    <p className="text-[11px] text-gray-400">{activeConv.memberCount ?? "—"} members</p>
                  ) : activeConv.isOnline ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
                      Active now
                    </span>
                  ) : (
                    <p className="text-[11px] text-gray-400">Offline</p>
                  )}
                </div>

                {/* Search toggle */}
                <button
                  onClick={() => { setMsgSearchOpen(v => !v); if (msgSearchOpen) setMsgSearchText(""); }}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                    msgSearchOpen ? "bg-[#1B6FE8] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                  title="Search in chat"
                >
                  <Search size={14} />
                </button>

                {/* Delete this conversation */}
                <button
                  onClick={() => void deleteConversations([activeConv.id])}
                  className="w-8 h-8 rounded-xl bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-[#1B6FE8] flex items-center justify-center transition-colors"
                  title="Delete conversation"
                >
                  <Trash2 size={14} />
                </button>

                {/* Close chat panel */}
                <button
                  onClick={() => setActiveConvId(null)}
                  className="w-8 h-8 rounded-xl bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 flex items-center justify-center transition-colors"
                  title="Close chat"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Message search bar */}
              {msgSearchOpen && (
                <div className="px-4 py-2 border-b border-gray-100 bg-white shrink-0">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search messages…"
                      value={msgSearchText}
                      onChange={e => setMsgSearchText(e.target.value)}
                      className="w-full h-9 rounded-xl bg-[#F3F4F6] pl-8 pr-8 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-[#1B6FE8]/20 transition-all"
                    />
                    {msgSearchText && (
                      <button onClick={() => setMsgSearchText("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  {msgSearchText && (
                    <p className="text-[10px] text-gray-400 mt-1 ml-1">
                      {visibleMessages.length} result{visibleMessages.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              )}

              {/* Messages */}
              <div ref={msgsContainerRef} className="flex-1 overflow-y-auto px-4 py-4 bg-[#F5F6FA]">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 size={22} className="text-gray-300 animate-spin" />
                  </div>
                ) : visibleMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-14 h-14 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center mb-3">
                      <MessageSquare size={22} className="text-gray-300" />
                    </div>
                    <p className="text-sm font-semibold text-gray-500">
                      {msgSearchText ? "No messages match your search" : "No messages yet"}
                    </p>
                    {!msgSearchText && <p className="text-xs text-gray-400 mt-1">Say hello 👋</p>}
                  </div>
                ) : (
                  <div className="space-y-0.5 w-full">
                    {msgGroups.map(group => (
                      <div key={group.date} className="w-full">
                        <div className="flex items-center gap-3 my-4">
                          <div className="flex-1 h-px bg-gray-200" />
                          <span className="text-[10px] font-semibold text-gray-400 whitespace-nowrap px-2 bg-[#F5F6FA]">{group.date}</span>
                          <div className="flex-1 h-px bg-gray-200" />
                        </div>
                        <div className="flex flex-col gap-1.5 w-full">
                          {group.msgs.map((msg, idx) => {
                            const prev = group.msgs[idx - 1];
                            const showAvatar = !prev || prev.senderId !== msg.senderId;
                            return (
                              <MessageBubble key={msg.id} msg={msg}
                                isGroup={activeConv.type === "group"} showAvatar={showAvatar}
                                myId={me?.id}
                                onCtxMenu={handleCtxMenu}
                                onReply={handleReply}
                                onJumpToReply={jumpToReply} />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Upload progress */}
              {uploading && (
                <div className="px-4 pt-2 shrink-0 bg-white">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-[#1B6FE8] rounded-full transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-[#1B6FE8] shrink-0 tabular-nums">{uploadProgress}%</span>
                  </div>
                </div>
              )}

              {/* Pending file preview */}
              {pendingFile && (
                <div className="px-4 pb-2 pt-2 shrink-0 bg-white">
                  <div className="flex items-center gap-2.5 bg-[#F5F6FA] rounded-2xl border border-gray-100 px-3 py-2">
                    {pendingPreview
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={pendingPreview} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                      : <div className="w-12 h-12 rounded-xl bg-[#1B6FE8]/10 text-[#1B6FE8] flex items-center justify-center shrink-0">{mimeIcon(pendingFile.type)}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#0F172A] truncate">{pendingFile.name}</p>
                      <p className="text-[10px] text-gray-400">{fmtSize(pendingFile.size)}</p>
                    </div>
                    <button onClick={clearPending}
                      className="w-7 h-7 rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-500 flex items-center justify-center shrink-0 transition-colors">
                      <X size={11} />
                    </button>
                  </div>
                </div>
              )}

              {/* Reply-to strip */}
              {replyTo && (
                <div className="px-4 pt-2 shrink-0 bg-white">
                  <div className="flex items-center gap-2.5 bg-[#EAF2FE] border border-[#1B6FE8]/20 rounded-xl px-3 py-2">
                    <Reply size={13} className="text-[#1B6FE8] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-[#1B6FE8]">{replyTo.senderName}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {replyTo.type !== "text" ? `📎 ${replyTo.type}` : truncate(replyTo.text, 60)}
                      </p>
                    </div>
                    <button onClick={() => setReplyTo(null)}
                      className="w-6 h-6 rounded-full hover:bg-[#1B6FE8]/10 flex items-center justify-center shrink-0 text-gray-400">
                      <X size={11} />
                    </button>
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="px-4 py-3 bg-white border-t border-gray-100 shrink-0">
                <input ref={fileInputRef} type="file" className="hidden" accept="*/*" onChange={onFileChange} />

                {isRecording ? (
                  <div className="flex items-center gap-3 bg-[#EAF2FE] rounded-2xl px-4 py-3 border border-[#1B6FE8]/20">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <div className="flex items-end gap-0.5 flex-1 h-6">
                      {[4,7,3,9,5,8,2,6,4,7,3,8,5,9,3].map((h, i) => (
                        <div key={i} className="w-0.5 bg-[#1B6FE8] rounded-full animate-pulse"
                          style={{ height: `${h * 10}%`, animationDelay: `${i * 55}ms` }} />
                      ))}
                    </div>
                    <span className="text-sm font-bold text-[#1B6FE8] tabular-nums shrink-0">{fmtAudio(recTime)}</span>
                    <button onClick={cancelRec}
                      className="w-8 h-8 rounded-xl bg-white text-gray-500 hover:bg-gray-100 flex items-center justify-center shrink-0"
                      title="Cancel">
                      <X size={14} />
                    </button>
                    <button onClick={stopRec}
                      className="w-8 h-8 rounded-xl bg-[#1B6FE8] text-white flex items-center justify-center shrink-0 shadow-sm"
                      title="Stop and send">
                      <StopCircle size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <button onClick={() => fileInputRef.current?.click()}
                      className="w-9 h-9 rounded-xl bg-[#F3F4F6] text-gray-500 hover:bg-[#EAF2FE] hover:text-[#1B6FE8] flex items-center justify-center shrink-0 transition-colors mb-0.5"
                      title="Attach file (max 200 MB)">
                      <Paperclip size={15} />
                    </button>

                    <div className="flex-1 flex items-end bg-[#F3F4F6] rounded-2xl px-3.5 py-2.5 min-h-[72px]">
                      <textarea ref={inputRef} value={msgText}
                        onChange={onMsgTextChange}
                        onKeyDown={onKey}
                        placeholder={pendingFile ? "Add a message with this file…" : `Message ${activeConv.type === "group" ? `#${activeConv.name}` : activeConv.name}…`}
                        rows={3}
                        className="flex-1 bg-transparent text-sm outline-none resize-none leading-relaxed placeholder:text-gray-400 min-h-[56px] max-h-52 overflow-y-auto" />
                    </div>

                    <button onClick={() => void startRec()}
                      disabled={!!pendingFile || sendingMsg}
                      className="w-9 h-9 rounded-xl bg-[#F3F4F6] text-gray-500 hover:bg-[#EAF2FE] hover:text-[#1B6FE8] flex items-center justify-center shrink-0 transition-colors mb-0.5 disabled:opacity-40"
                      title="Record voice message">
                      <Mic size={15} />
                    </button>

                    <button
                      onClick={pendingFile ? () => void sendFile() : () => void sendText()}
                      disabled={(!msgText.trim() && !pendingFile) || sendingMsg || uploading}
                      className="w-9 h-9 rounded-xl bg-[#1B6FE8] text-white flex items-center justify-center hover:bg-[#a30f27] disabled:bg-gray-200 disabled:text-gray-400 transition-colors shrink-0 mb-0.5 shadow-sm shadow-red-200">
                      {sendingMsg || uploading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                  </div>
                )}
                {!isRecording && (
                  <p className="text-[9px] text-gray-400 mt-1 ml-1">Enter to send · Shift+Enter for new line · Right-click a message for options</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#F5F6FA]">
              <div className="w-20 h-20 rounded-3xl bg-white border border-gray-100 shadow-sm flex items-center justify-center mb-4">
                <MessageSquare size={32} className="text-gray-200" />
              </div>
              <h3 className="text-lg font-bold text-[#0F172A]">Your Messages</h3>
              <p className="text-sm text-gray-400 mt-1 max-w-xs">Select a conversation or start a new one with any team member.</p>
              <div className="flex flex-wrap gap-2.5 mt-5 justify-center">
                <button onClick={() => { setShowDmModal(true); void fetchUsers(true); }}
                  className="h-9 px-4 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-600 hover:border-[#1B6FE8] hover:text-[#1B6FE8] flex items-center gap-2 shadow-sm transition-all">
                  <User2 size={13} />New DM
                </button>
                <button onClick={() => { setShowGroupModal(true); void fetchUsers(true); }}
                  className="h-9 px-4 rounded-xl bg-[#1B6FE8] text-white text-sm font-semibold flex items-center gap-2 hover:bg-[#a30f27] shadow-sm shadow-red-200 transition-colors">
                  <Hash size={13} />Create Group
                </button>
              </div>
              <button onClick={() => setMobileSideOpen(true)}
                className="lg:hidden mt-4 text-xs text-[#1B6FE8] font-semibold underline">
                ← Back to conversations
              </button>
            </div>
          )}
        </section>
      </div>

      {/* ══ CONTEXT MENU ══ */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }} />
          <div
            className="fixed z-[91] bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 min-w-[180px] overflow-hidden"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => handleReply(ctxMenu.msg)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#0F172A] hover:bg-[#F5F6FA] transition-colors"
            >
              <Reply size={14} className="text-gray-400" /> Reply
            </button>

            {ctxMenu.msg.type === "text" && (
              <button
                onClick={() => void copyText(ctxMenu.msg.text)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#0F172A] hover:bg-[#F5F6FA] transition-colors"
              >
                <Copy size={14} className="text-gray-400" /> Copy text
              </button>
            )}

            <div className="border-t border-gray-100 my-1" />

            <button
              onClick={() => void deleteMsg(ctxMenu.msg.id, false)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} /> Delete for me
            </button>

          </div>
        </>
      )}

      {/* ══ GROUP MODAL ══ */}
      {portalReady && showGroupModal && createPortal(
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => { setShowGroupModal(false); setGroupName(""); setSelectedUsers([]); setUserSearch(""); }}>
          <div className="w-full sm:max-w-[480px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: "85vh" }} onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#1B6FE8] text-white flex items-center justify-center"><Hash size={16} /></div>
                <div>
                  <h2 className="text-base font-bold text-[#0F172A]">Create Group</h2>
                  <p className="text-[11px] text-gray-400">Name and invite members</p>
                </div>
              </div>
              <button onClick={() => { setShowGroupModal(false); setGroupName(""); setSelectedUsers([]); setUserSearch(""); }}
                className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center"><X size={14} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Group Name *</label>
                <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} autoFocus
                  placeholder="e.g. CSR Team, Morning Shift…"
                  className="w-full h-10 rounded-xl border-2 border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#1B6FE8] transition-colors placeholder:text-gray-300" />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Members <span className="text-gray-300 font-normal">({selectedUsers.length} selected)</span>
                </label>

                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={userSearch} onChange={e => setUserSearch(e.target.value)}
                    placeholder="Search by name, email, CSR code…"
                    className="w-full h-9 rounded-xl border border-gray-200 bg-[#FAFAFA] pl-8 pr-3 text-xs outline-none focus:border-[#1B6FE8] transition-colors" />
                </div>

                {selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedUsers.map(uid => {
                      const u = allUsers.find(x => x.id === uid);
                      return u ? (
                        <span key={uid} className="flex items-center gap-1 bg-[#EAF2FE] text-[#1B6FE8] px-2 py-0.5 rounded-lg text-[11px] font-semibold">
                          {u.name.split(" ")[0]}
                          <button onClick={() => setSelectedUsers(p => p.filter(id => id !== uid))} className="hover:opacity-70"><X size={9} /></button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}

                <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-100 bg-[#FAFAFA] p-1 space-y-0.5">
                  {filteredUsers.length === 0
                    ? <p className="text-center text-xs text-gray-400 py-4">No users found</p>
                    : filteredUsers.map(user => {
                        const sel = selectedUsers.includes(user.id);
                        return (
                          <button key={user.id}
                            onClick={() => setSelectedUsers(p => sel ? p.filter(id => id !== user.id) : [...p, user.id])}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors ${sel ? "bg-[#EAF2FE]" : "hover:bg-white"}`}>
                            <Avatar name={user.name} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-[#0F172A] truncate">{user.name}</p>
                              <p className="text-[10px] text-gray-400">{user.csrCode ?? user.role ?? user.email ?? ""}</p>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${sel ? "bg-[#1B6FE8] border-[#1B6FE8]" : "border-gray-300"}`}>
                              {sel && <Check size={10} className="text-white" />}
                            </div>
                          </button>
                        );
                      })}
                </div>
              </div>
            </div>

            <div className="px-5 pb-5 pt-3 border-t border-gray-100 shrink-0 flex gap-2.5">
              <button onClick={() => { setShowGroupModal(false); setGroupName(""); setSelectedUsers([]); setUserSearch(""); }}
                className="flex-1 h-10 rounded-xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button onClick={() => void createGroup()} disabled={!groupName.trim() || creatingGroup}
                className="flex-1 h-10 rounded-xl bg-[#1B6FE8] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#a30f27] disabled:bg-gray-200 disabled:text-gray-400 transition-colors">
                {creatingGroup ? <><Loader2 size={13} className="animate-spin" />Creating…</> : <><Hash size={13} />Create Group</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ══ DM MODAL ══ */}
      {portalReady && showDmModal && createPortal(
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => { setShowDmModal(false); setDmSearch(""); }}>
          <div className="w-full sm:max-w-[420px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: "75vh" }} onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#1D4ED8]/10 text-[#1D4ED8] flex items-center justify-center"><User2 size={16} /></div>
                <div>
                  <h2 className="text-base font-bold text-[#0F172A]">New Message</h2>
                  <p className="text-[11px] text-gray-400">All team members</p>
                </div>
              </div>
              <button onClick={() => { setShowDmModal(false); setDmSearch(""); }}
                className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center"><X size={14} /></button>
            </div>

            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" value={dmSearch} onChange={e => setDmSearch(e.target.value)} autoFocus
                  placeholder="Search by name, email, or CSR code…"
                  className="w-full h-9 rounded-xl border border-gray-200 bg-[#FAFAFA] pl-8 pr-3 text-xs outline-none focus:border-[#1B6FE8] transition-colors" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4">
              {loadingUsers ? (
                <div className="py-10 text-center"><Loader2 size={22} className="text-gray-300 mx-auto mb-2 animate-spin" /><p className="text-xs text-gray-400">Loading team members…</p></div>
              ) : filteredUsers.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-6">No users found</p>
              ) : (() => {
                const sorted     = [...filteredUsers].sort((a, b) => (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0));
                const onlineCount = sorted.filter(u => u.isOnline).length;
                return (
                  <>
                    {onlineCount > 0 && (
                      <p className="px-3 pt-2 pb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
                        Online · {onlineCount}
                      </p>
                    )}
                    {sorted.map((user, idx) => {
                      const showOfflineLabel = onlineCount > 0 && idx === onlineCount;
                      return (
                        <div key={user.id}>
                          {showOfflineLabel && (
                            <p className="px-3 pt-3 pb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Offline</p>
                          )}
                          <button type="button" onClick={(e) => { e.stopPropagation(); void startDm(user); }}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/10">
                            <Avatar name={user.name} size="md" online={user.isOnline} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{user.name}</p>
                                {user.isOnline && (
                                  <span className="text-[9px] font-bold text-green-600 dark:text-green-300 bg-green-50 dark:bg-green-500/20 px-1.5 py-0.5 rounded-full shrink-0">Active</span>
                                )}
                              </div>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{user.csrCode ?? user.role ?? user.email ?? ""}</p>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

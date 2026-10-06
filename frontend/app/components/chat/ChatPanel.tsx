"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { visibleInterval } from "@/lib/visibleInterval";
import {
  Send, Plus, Search, X, MessageSquare, Hash, User2,
  Check, CheckCheck, ChevronLeft, Loader2, Paperclip,
  Mic, StopCircle, Play, Pause, Download, FileText,
  Film, Music, Image as ImageIcon,
  Trash2, Reply, Copy, Pin, PinOff, Pencil, Smile, Eye,
  Archive, ArchiveRestore, Settings,
} from "lucide-react";
import API, { apiErrorMessage } from "@/lib/api";
import toast from "react-hot-toast";
import { getAuthMe } from "@/lib/authMeCache";
import { useChatEnabled } from "@/lib/useChatEnabled";
import {
  fetchChatMessages,
  fetchConvMembers,
  fetchStealthConversations,
  invalidateChatMessages,
  isChatConversationsFresh,
} from "@/lib/chatApiCache";
import {
  ensureChatUnreadPolling, getArchivedConversations, getChatConversations,
  forceStopChatUnreadPolling, pollArchivedConversations, pollChatUnread, subscribeChatUnread,
  markConversationRead, setChatWatchingConversation,
} from "@/lib/chatUnreadStore";
import {
  sendTyping,
  setWatchingConversation,
  subscribeChatSocket,
  type ChatSocketEvent,
} from "@/lib/chatSocket";
import {
  startChatStatusHeartbeat,
  stopChatStatusHeartbeat,
} from "@/lib/chatStatusHeartbeat";
import { useTheme } from "@/app/components/ThemeProvider";
import { playChatSound } from "@/lib/chatSound";
import { roleDisplayLabel } from "@/lib/roleDisplay";
import { addToOfflineQueue, getOfflineQueue, removeFromOfflineQueue } from "@/lib/chatOfflineQueue";
import { MentionText, PdfPreview, ReactionBar, ReactionPicker, autoGrowTextarea } from "./MessageExtras";
import ChatActionRail from "./ChatActionRail";
import { deduplicateConvs, mergeConversationLists, sortConversations, type ChatConversation } from "@/lib/chatConversations";
import ChatListResizeHandle, { useChatListWidth } from "./ChatListResizeHandle";

/* ── */
interface ChatUser { id: string; name: string; email?: string; csrCode?: string | null; isOnline?: boolean; role?: string; memberRole?: string; profilePic?: string | null; }
type MsgType   = "text" | "file" | "image" | "voice";
type MsgStatus = "sending" | "sent" | "delivered" | "read";
interface ReplyQuote { id: string; text: string; senderName: string; type: MsgType; }
interface Message {
  id: string; senderId: string; senderName: string; senderProfilePic?: string | null; text: string; type: MsgType;
  fileUrl?: string; fileName?: string; fileSize?: number; fileMimeType?: string;
  createdAt: string; editedAt?: string | null; deletedAt?: string | null;
  isDeleted?: boolean; deleteLabel?: string | null;
  isOwn: boolean; status: MsgStatus;
  replyTo?: ReplyQuote | null; mentions?: string[];
  reactions?: Record<string, string[]>;
  readBy?: string[];
}
interface CtxMenu { x: number; y: number; msg: Message; canEdit: boolean; }
type Conversation = ChatConversation;

/* ── */
const MAX_FILE_BYTES = 200 * 1024 * 1024;
function messageCanEdit(msg: Message) {
  return msg.isOwn && msg.type === "text" && !msg.deletedAt;
}
function initials(name: string) { return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(); }
type ChatLook = { bg: string; mine: string; font: string; fontFamily: string };
const DEFAULT_CHAT_LOOK: ChatLook = { bg: "#F5F6FA", mine: "#1B6FE8", font: "#111827", fontFamily: "inherit" };
const FONT_STYLES = [
  { id: "inherit", label: "Default" },
  { id: "Georgia, serif", label: "Serif" },
  { id: "ui-monospace, SFMono-Regular, monospace", label: "Mono" },
  { id: "\"Trebuchet MS\", sans-serif", label: "Rounded" },
];
function loadChatLook(): ChatLook {
  if (typeof window === "undefined") return DEFAULT_CHAT_LOOK;
  try {
    const raw = localStorage.getItem("crm_chat_look");
    if (!raw) return DEFAULT_CHAT_LOOK;
    return { ...DEFAULT_CHAT_LOOK, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CHAT_LOOK;
  }
}
const PKT = "Asia/Karachi";
function pktYmd(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PKT, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
function fmtConvTime(iso: string) {
  try {
    const day = pktYmd(iso);
    const today = pktYmd(new Date().toISOString());
    if (day === today) return new Date(iso).toLocaleTimeString("en-US", { timeZone: PKT, hour: "numeric", minute: "2-digit" });
    return new Date(iso).toLocaleDateString("en-US", { timeZone: PKT, month: "short", day: "numeric" });
  } catch { return ""; }
}
function fmtMsgTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { timeZone: PKT, hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}
function fmtDateSep(iso: string) {
  try {
    const day = pktYmd(iso);
    const today = pktYmd(new Date().toISOString());
    if (day === today) return "Today";
    return new Date(iso).toLocaleDateString("en-US", { timeZone: PKT, weekday: "long", month: "short", day: "numeric" });
  } catch { return ""; }
}
function fmtAudio(secs: number) { const s = Math.floor(secs), m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; }
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
function truncate(text: string, n = 60) { return text.length > n ? text.slice(0, n) + "..." : text; }

/* ── */
const COLORS = ["bg-[#1B6FE8]","bg-[#1D4ED8]","bg-[#15803D]","bg-[#B45309]","bg-[#7C3AED]","bg-[#0891B2]"];
function Avatar({ name, src, size = "md", online }: { name: string; src?: string | null; size?: "sm"|"md"|"lg"; online?: boolean }) {
  const c  = COLORS[name.charCodeAt(0) % COLORS.length];
  const sz = size === "sm" ? "w-8 h-8 text-[10px]" : size === "lg" ? "w-11 h-11 text-sm" : "w-9 h-9 text-xs";
  return (
    <div className="relative shrink-0">
      {src ? (
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

/* ── */
function Ticks({ status }: { status: MsgStatus }) {
  if (status === "sending")   return <Loader2 size={10} className="text-white/50 animate-spin" />;
  if (status === "sent")      return <Check size={10} className="text-white/60" />;
  if (status === "delivered") return <CheckCheck size={10} className="text-white/70" />;
  return <CheckCheck size={10} className="text-blue-300" />;
}

/* ── */
function FileCard({ fileName, fileSize, fileUrl, fileMimeType, isOwn }: { fileName: string; fileSize: number; fileUrl: string; fileMimeType?: string; isOwn: boolean; }) {
  if (fileMimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    return <PdfPreview url={fileUrl} fileName={fileName} />;
  }
  return (
    <a href={fileUrl} target="_blank" rel="noopener noreferrer" download={fileName}
      className={`flex items-center gap-2.5 p-2.5 rounded-xl min-w-[160px] max-w-[220px] group transition-colors ${isOwn ? "bg-white/15 hover:bg-white/25" : "bg-[#F5F6FA] hover:bg-gray-100"}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isOwn ? "bg-white/20 text-white" : "bg-[#1B6FE8]/10 text-[#1B6FE8]"}`}>{mimeIcon(fileMimeType)}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate">{fileName}</p>
        <p className={`text-[10px] ${isOwn ? "text-white/60" : "text-gray-400"}`}>{fmtSize(fileSize)}</p>
      </div>
      <Download size={13} className={`shrink-0 opacity-60 group-hover:opacity-100 ${isOwn ? "text-white" : "text-gray-400"}`} />
    </a>
  );
}

/* ── */
function VoicePlayer({ fileUrl, isOwn }: { fileUrl: string; isOwn: boolean }) {
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [curTime,  setCurTime]  = useState(0);
  const [dur,      setDur]      = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().then(() => setPlaying(true)).catch(() => {}); }
  };
  return (
    <div className="flex items-center gap-2.5 min-w-[160px] max-w-[220px] py-0.5">
      <audio ref={audioRef} src={fileUrl}
        onTimeUpdate={e => { const a = e.currentTarget; setCurTime(a.currentTime); setProgress(a.duration ? (a.currentTime/a.duration)*100 : 0); }}
        onLoadedMetadata={e => setDur(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurTime(0); }} />
      <button onClick={toggle} className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${isOwn ? "bg-white/20 hover:bg-white/30" : "bg-[#1B6FE8]/10 hover:bg-[#1B6FE8]/20"}`}>
        {playing ? <Pause size={13} className={isOwn ? "text-white" : "text-[#1B6FE8]"} /> : <Play size={13} className={isOwn ? "text-white" : "text-[#1B6FE8]"} />}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className={`h-1 rounded-full overflow-hidden ${isOwn ? "bg-white/30" : "bg-gray-200"}`}>
          <div className={`h-full rounded-full ${isOwn ? "bg-white" : "bg-[#1B6FE8]"}`} style={{ width: `${progress}%`, transition: "width 0.1s linear" }} />
        </div>
        <span className={`text-[9px] ${isOwn ? "text-white/60" : "text-gray-400"}`}>{fmtAudio(curTime)} / {fmtAudio(dur)}</span>
      </div>
    </div>
  );
}

/* ── */
function incomingTextColor(textColor: string | undefined, dark: boolean) {
  const chosen = (textColor || "").trim();
  const isDefault = !chosen || chosen.toLowerCase() === "#111827";
  if (dark && isDefault) return "#eef0f4";
  return chosen || "#111827";
}

function MessageBubble({ msg, isGroup, showAvatar, myId, mineColor, textColor, fontFamily, selectable, selected, onToggleSelect, onCtxMenu, onReply, onJumpToReply, onReact }: {
  msg: Message; isGroup: boolean; showAvatar: boolean; myId?: string; mineColor?: string; textColor?: string; fontFamily?: string;
  selectable?: boolean; selected?: boolean; onToggleSelect?: () => void;
  onCtxMenu: (e: React.MouseEvent, msg: Message) => void;
  onReply:   (msg: Message) => void;
  onJumpToReply: (id: string) => void;
  onReact: (msg: Message, emoji: string) => void;
}) {
  const [showReact, setShowReact] = useState(false);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const own = Boolean(msg.isOwn || (myId && msg.senderId === myId));
  const deleted = Boolean(msg.isDeleted);
  const body = () => {
    if (msg.type === "image" && msg.fileUrl) return (
      <div className="space-y-1.5">
        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={msg.fileUrl} alt={msg.fileName ?? "image"} className="max-w-[200px] max-h-[200px] rounded-xl object-cover" />
        </a>
        {msg.text?.trim() ? <MentionText text={msg.text} tone={own ? "own" : "other"} className="text-sm leading-relaxed break-words whitespace-pre-wrap" /> : null}
      </div>
    );
    if (msg.type === "voice" && msg.fileUrl) return <VoicePlayer fileUrl={msg.fileUrl} isOwn={own} />;
    if (msg.type === "file"  && msg.fileUrl) return (
      <div className="space-y-1.5">
        <FileCard fileName={msg.fileName ?? "File"} fileSize={msg.fileSize ?? 0} fileUrl={msg.fileUrl} fileMimeType={msg.fileMimeType} isOwn={own} />
        {msg.text?.trim() ? <MentionText text={msg.text} tone={own ? "own" : "other"} className="text-sm leading-relaxed break-words whitespace-pre-wrap" /> : null}
      </div>
    );
    return <MentionText text={msg.text} tone={own ? "own" : "other"} className={`text-sm leading-relaxed break-words whitespace-pre-wrap ${deleted ? "opacity-75" : ""}`} />;
  };
  return (
    <div
      id={`msg-${msg.id}`}
      className={`flex w-full ${selectable ? "cursor-pointer" : ""}`}
      style={{ justifyContent: own ? "flex-end" : "flex-start" }}
      onClick={selectable ? () => onToggleSelect?.() : undefined}
      onContextMenu={e => !deleted && onCtxMenu(e, msg)}>
      {selectable && (
        <div className={`w-5 h-5 mt-2 rounded-full border-2 flex items-center justify-center shrink-0 ${own ? "order-2 ml-2" : "mr-2"} ${selected ? "bg-[#1B6FE8] border-[#1B6FE8]" : "border-gray-300 bg-white"}`}>
          {selected ? <Check size={10} className="text-white" /> : null}
        </div>
      )}
      <div className="relative group max-w-[min(85%,28rem)]">
        <div className={`flex items-end gap-2 min-w-0 ${own ? "flex-row-reverse" : ""}`}>
          {!own && showAvatar  && <Avatar name={msg.senderName} src={msg.senderProfilePic} size="sm" />}
          {!own && !showAvatar && <div className="w-8 shrink-0" />}
          <div className={`flex flex-col min-w-0 ${own ? "items-end" : "items-start"}`}>
            {isGroup && !own && showAvatar && <span className="text-[10px] font-bold text-[#1B6FE8] mb-0.5 ml-1">{msg.senderName}</span>}
            {deleted && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 mb-0.5 px-1"
                title={msg.deleteLabel ?? "Deleted — visible in admin peek only"}
              >
                <Trash2 size={10} className="shrink-0" />
                {msg.deleteLabel ?? "Deleted"}
              </span>
            )}
            {msg.replyTo && (
              <button onClick={() => onJumpToReply(msg.replyTo!.id)}
                className={`mb-1 text-left rounded-xl px-2.5 py-1.5 border-l-4 text-[11px] max-w-full transition-colors ${own ? "bg-white/10 border-white/40 text-white/80 hover:bg-white/20" : "bg-gray-100 border-[#1B6FE8]/40 text-gray-500 hover:bg-gray-200"}`}>
                <p className="font-bold text-[10px] mb-0.5 opacity-80">{msg.replyTo.senderName}</p>
                <p className="truncate max-w-[160px]">{msg.replyTo.type !== "text" ? `${msg.replyTo.type}` : truncate(msg.replyTo.text, 40)}</p>
              </button>
            )}
            <div
              className={`rounded-2xl ${msg.type === "text" ? "px-3.5 py-2.5" : "p-2"} ${deleted ? "border border-dashed border-amber-300/80 dark:border-amber-500/50 bg-amber-50/80 dark:bg-amber-950/30" : "shadow-sm border border-gray-100"} ${own ? `rounded-br-sm ${deleted ? "!bg-amber-100/90 dark:!bg-amber-950/40" : ""}` : `rounded-bl-sm ${deleted ? "!bg-amber-50/90 dark:!bg-amber-950/25" : ""}`}`}
              style={deleted
                ? { fontFamily: fontFamily || undefined }
                : own
                  ? { backgroundColor: mineColor || "#1B6FE8", color: "#ffffff", fontFamily: fontFamily || undefined }
                  : { backgroundColor: dark ? "#22262f" : "#ffffff", color: incomingTextColor(textColor, dark), fontFamily: fontFamily || undefined }}
            >
              {body()}
            </div>
            {msg.reactions && Object.keys(msg.reactions).length > 0 && (
              <ReactionBar reactions={msg.reactions} myId={myId} onToggle={emoji => onReact(msg, emoji)} />
            )}
            <div className={`flex items-center gap-1 mt-0.5 px-1 ${own ? "flex-row-reverse" : ""}`}>
              <span className="text-[9px] text-gray-400">{fmtMsgTime(msg.createdAt)}{msg.editedAt ? " · edited" : ""}</span>
              {own && <Ticks status={msg.status} />}
            </div>
            {own && msg.readBy && msg.readBy.length > 0 && (
              <p className="text-[9px] text-gray-400 mt-0.5 px-1" title={msg.readBy.join(", ")}>
                Read by {msg.readBy.slice(0, 3).join(", ")}{msg.readBy.length > 3 ? ` +${msg.readBy.length - 3}` : ""}
              </p>
            )}
          </div>
        </div>
        {!deleted && !selectable && (
          <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 z-10 ${own ? "right-full mr-1 flex-row-reverse" : "left-full ml-1"}`}>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowReact((v) => !v)}
                title="React"
                className={`${showReact ? "opacity-100" : "opacity-0 group-hover:opacity-100"} focus:opacity-100 transition-opacity w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50`}
              >
                <Smile size={12} className="text-gray-500" />
              </button>
              {showReact && (
                <div className={`absolute bottom-full mb-1 bg-white rounded-xl border border-gray-200 shadow-lg ${own ? "right-0" : "left-0"}`}>
                  <ReactionPicker onPick={(emoji) => { setShowReact(false); onReact(msg, emoji); }} />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onReply(msg)}
              title="Reply"
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50"
            >
              <Reply size={12} className="text-gray-500" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── */
function ConvItem({ conv, active, onClick, selectMode, selected, onSelect, pinned, onPin }: {
  conv: Conversation; active: boolean; onClick: () => void;
  selectMode: boolean; selected: boolean; onSelect: () => void; pinned: boolean; onPin: () => void;
}) {
  return (
    <div
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer group ${
        active || selected
          ? "bg-red-50 dark:bg-red-500/20 ring-1 ring-[#1B6FE8]/25 dark:ring-red-400/40"
          : "hover:bg-gray-50 dark:hover:bg-white/5"
      }`}
      onClick={selectMode ? onSelect : onClick}
    >
      {selectMode ? (
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? "bg-[#1B6FE8] border-[#1B6FE8]" : "border-gray-300 dark:border-gray-500"}`}>
          {selected && <Check size={10} className="text-white" />}
        </div>
      ) : (
        conv.type === "group"
          ? <div className="w-9 h-9 rounded-full bg-[#1B6FE8]/10 text-[#1B6FE8] dark:bg-red-500/20 dark:text-red-300 flex items-center justify-center shrink-0"><Hash size={16} /></div>
          : <Avatar name={conv.name} src={conv.profilePic} size="sm" online={conv.isOnline} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={`text-[13px] font-semibold truncate ${
            active ? "text-[#1B6FE8] dark:text-red-300" : "text-gray-900 dark:text-gray-100"
          }`}>
            {pinned && <Pin size={9} className="inline mr-1 text-[#1B6FE8]" />}{conv.name}
          </span>
          {conv.lastMessageAt && <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">{fmtConvTime(conv.lastMessageAt)}</span>}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{conv.lastMessage ?? (conv.type === "group" ? `${conv.memberCount ?? 0} members` : "No messages yet")}</p>
          {conv.unreadCount > 0 && (
            <span className="bg-[#1B6FE8] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center shrink-0">
              {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
      {!selectMode && (
        <button onClick={e => { e.stopPropagation(); onPin(); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10 shrink-0" title={pinned ? "Unpin" : "Pin"}>
          {pinned ? <PinOff size={12} className="text-gray-400" /> : <Pin size={12} className="text-gray-400" />}
        </button>
      )}
    </div>
  );
}

/* ---- */
export type ViewAsCsr = { id: string; name: string; role?: string };

function AdminViewAsPicker({
  options,
  value,
  onChange,
  isStealthView,
}: {
  options: ViewAsCsr[];
  value: ViewAsCsr | null;
  onChange: (csr: ViewAsCsr | null) => void;
  isStealthView: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => {
      const hay = `${o.name} ${o.role ?? ""} ${roleDisplayLabel(o.role)}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [options, q]);

  return (
    <div className="mb-2.5" ref={rootRef}>
      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">View as account</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 w-full h-9 px-2.5 rounded-xl border border-gray-200 text-[12px] font-semibold bg-[#FAFAFA] outline-none focus:border-[#1B6FE8] flex items-center justify-between gap-2 text-left"
      >
        <span className="truncate">{value ? `${value.name}${value.role ? ` · ${roleDisplayLabel(value.role)}` : ""}` : "My chats (CEO)"}</span>
        <ChevronLeft size={14} className={`text-gray-400 shrink-0 transition-transform ${open ? "rotate-90" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="mt-1.5 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search all accounts…"
                className="w-full h-8 rounded-lg bg-[#F3F4F6] pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-[#1B6FE8]/20"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto overscroll-contain py-1">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); setQ(""); }}
              className={`w-full text-left px-3 py-2 text-xs font-semibold hover:bg-[#EAF2FE] ${!value ? "bg-[#EAF2FE] text-[#1B6FE8]" : "text-gray-800"}`}
            >
              My chats (Admin)
            </button>
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-gray-400">No matches</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { onChange(c); setOpen(false); setQ(""); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[#EAF2FE] flex items-center justify-between gap-2 ${
                    value?.id === c.id ? "bg-[#EAF2FE] text-[#1B6FE8] font-semibold" : "text-gray-800"
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{roleDisplayLabel(c.role)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {isStealthView && (
        <p className="mt-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 leading-snug">
          Read-only — user is not notified
        </p>
      )}
    </div>
  );
}

export default function ChatPanel({
  onClose,
  viewAsCsr = null,
  onViewAsCsrChange,
  adminCsrOptions = [],
}: {
  onClose: () => void;
  viewAsCsr?: ViewAsCsr | null;
  onViewAsCsrChange?: (csr: ViewAsCsr | null) => void;
  adminCsrOptions?: ViewAsCsr[];
}) {
  const isStealthView = Boolean(viewAsCsr);
  const [me,             setMe]             = useState<ChatUser | null>(null);
  const [chatFullscreen, setChatFullscreen] = useState(false);

  useEffect(() => {
    if (!chatFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChatFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatFullscreen]);
  const chatAllowed = useChatEnabled();
  const [conversations,  setConversations]  = useState<Conversation[]>(() => {
    const cached = getChatConversations();
    return cached.length > 0 ? deduplicateConvs(cached) : [];
  });
  const [activeConvId,   setActiveConvId]   = useState<string | null>(null);
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [loadingConvs,   setLoadingConvs]   = useState(() => getChatConversations().length === 0);
  const [loadingMsgs,    setLoadingMsgs]    = useState(false);
  const [sendingMsg,     setSendingMsg]     = useState(false);
  const [msgText,        setMsgText]        = useState("");
  const [convSearch,     setConvSearch]     = useState("");
  const [mobileSideOpen, setMobileSideOpen] = useState(true);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName,      setGroupName]      = useState("");
  const [allUsers,       setAllUsers]       = useState<ChatUser[]>([]);
  const [loadingUsers,   setLoadingUsers]   = useState(false);
  const [selectedUsers,  setSelectedUsers]  = useState<string[]>([]);
  const [userSearch,     setUserSearch]     = useState("");
  const [creatingGroup,  setCreatingGroup]  = useState(false);
  const [showDmModal,    setShowDmModal]    = useState(false);
  const [dmSearch,       setDmSearch]       = useState("");
  const [pendingFile,    setPendingFile]    = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading,      setUploading]      = useState(false);
  const [isRecording,    setIsRecording]    = useState(false);
  const [recTime,        setRecTime]        = useState(0);
  const [notifGranted,   setNotifGranted]   = useState(() => typeof Notification !== "undefined" && Notification.permission === "granted");
  const [selectMode,     setSelectMode]     = useState(false);
  const [msgSelectMode,  setMsgSelectMode]  = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<string[]>([]);
  const [selectedConvs,  setSelectedConvs]  = useState<string[]>([]);
  const [pinnedIds,      setPinnedIds]      = useState<Set<string>>(new Set());
  const [replyTo,        setReplyTo]        = useState<Message | null>(null);
  const [ctxMenu,        setCtxMenu]        = useState<CtxMenu | null>(null);
  const [typingName,     setTypingName]     = useState<string | null>(null);
  const [msgSearchOpen,  setMsgSearchOpen]  = useState(false);
  const [msgSearchText,  setMsgSearchText]  = useState("");
  const [pinnedMessage,  setPinnedMessage]  = useState<Message | null>(null);
  const [groupMembers,   setGroupMembers]   = useState<ChatUser[]>([]);
  const [showArchived,   setShowArchived]   = useState(false);
  const [archivedConvs,  setArchivedConvs]  = useState<Conversation[]>([]);
  const [editingMsg,     setEditingMsg]     = useState<Message | null>(null);
  const [editText,       setEditText]       = useState("");
  const [mentionQuery,   setMentionQuery]   = useState<string | null>(null);
  const [chatLook, setChatLook] = useState<ChatLook>(loadChatLook);
  const { resolvedTheme } = useTheme();
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [groupAdminIds, setGroupAdminIds] = useState<string[]>([]);
  const [whoCanSend, setWhoCanSend] = useState<"everyone" | "admins">("everyone");
  const [soundOn,        setSoundOn]        = useState(true);
  const { width: listWidth, onPointerDown: onListResize } = useChatListWidth("chat-list-width", 280);

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
  const tagOwn = (m: Message): Message => ({
    ...m,
    isOwn: Boolean(m.isOwn || (meRef.current?.id && m.senderId === meRef.current.id)),
  });
  const recConvRef       = useRef<string | null>(null);
  const [dmLoadingUserId, setDmLoadingUserId] = useState<string | null>(null);
  const blockPanelCloseRef = useRef(false);
  const typingDebRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgsContainerRef = useRef<HTMLDivElement>(null);
  const portalReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    void getAuthMe().then(u => {
      if (u) {
        const meUser: ChatUser = {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          csrCode: u.csrCode ?? null,
          profilePic: u.profilePic ?? null,
        };
        setMe(meUser);
        meRef.current = meUser;
      }
    });
  }, []);

  const askNotif = async () => {
    if (typeof Notification === "undefined") return;
    const r = await Notification.requestPermission(); const ok = r === "granted";
    setNotifGranted(ok); notifRef.current = ok;
  };

  useEffect(() => {
    let cancelled = false;

    if (isStealthView && viewAsCsr) {
      const csrId = viewAsCsr.id;
      const loadConvs = async (force = false) => {
        if (cancelled) return;
        try {
          const convs = await fetchStealthConversations(csrId, false, force);
          if (cancelled) return;
          setConversations(deduplicateConvs(convs));
        } catch { /* ignore */ }
        finally { if (!cancelled) setLoadingConvs(false); }
      };
      void loadConvs(false);
      const stopPoll = visibleInterval(() => { void loadConvs(false); }, 8_000);
      return () => { cancelled = true; stopPoll(); };
    }

    ensureChatUnreadPolling();

    if (!isChatConversationsFresh() || getChatConversations().length === 0) {
      void pollChatUnread().finally(() => {
        if (!cancelled) setLoadingConvs(false);
      });
    }

    const unsub = subscribeChatUnread((_total, convs) => {
      if (!cancelled) {
        setConversations(prev => mergeConversationLists(deduplicateConvs(convs), prev));
      }
    });

    return () => {
      cancelled = true;
      unsub();
      forceStopChatUnreadPolling();
    };
  }, [viewAsCsr, isStealthView]);

  useEffect(() => {
    if (!showArchived) return;
    let cancelled = false;

    const loadArchived = async () => {
      try {
        const convs = isStealthView && viewAsCsr
          ? await fetchStealthConversations(viewAsCsr.id, true)
          : await pollArchivedConversations();
        if (!cancelled) setArchivedConvs(deduplicateConvs(convs));
      } catch { /* ignore */ }
    };

    void loadArchived();
    return () => { cancelled = true; };
  }, [showArchived, isStealthView, viewAsCsr]);

  useEffect(() => {
    if (isStealthView) return;
    startChatStatusHeartbeat();
    return () => stopChatStatusHeartbeat();
  }, [isStealthView]);

  useEffect(() => {
    const flush = async () => {
      for (const q of getOfflineQueue()) {
        try {
          await API.post(`/chat/conversations/${q.conversationId}/messages`, { text: q.text, ...(q.replyToId ? { replyToId: q.replyToId } : {}) });
          removeFromOfflineQueue(q.id);
        } catch { break; }
      }
    };
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  useEffect(() => {
    if (!activeConvId || activeConvId.startsWith("temp-")) {
      setWatchingConversation(null);
      setChatWatchingConversation(null);
      return;
    }
    const cid = activeConvId;
    const stealth = isStealthView;
    const url = stealth && viewAsCsr
      ? `/chat/admin/view/${viewAsCsr.id}/conversations/${cid}/messages`
      : `/chat/conversations/${cid}/messages`;
    let cancelled = false;
    let typingClearTimer: ReturnType<typeof setTimeout> | null = null;

    if (!stealth) {
      setWatchingConversation(cid);
      setChatWatchingConversation(cid);
    }

    lastMsgCount.current = 0;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setTypingName(null); setMsgSearchOpen(false); setMsgSearchText(""); setMessages([]); setLoadingMsgs(true);
      setMsgSelectMode(false); setSelectedMsgIds([]);
      try {
        const [payload, members] = await Promise.all([
          fetchChatMessages(url),
          stealth ? Promise.resolve(null) : fetchConvMembers(cid).catch(() => [] as ChatUser[]),
        ]);
        if (cancelled) return;
        const msgs: Message[] = (payload.messages as Message[]).map(tagOwn);
        setMessages(msgs);
        setPinnedMessage((payload.pinnedMessage as Message | null) ?? null);
        lastMsgCount.current = msgs.length;
        setConversations(p => p.map(c => c.id === cid ? { ...c, unreadCount: 0 } : c));
        if (!stealth) {
          markConversationRead(cid);
          void API.post(`/chat/conversations/${cid}/read`).catch(() => {});
          setGroupMembers((members ?? []) as ChatUser[]);
        }
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }), 60);
      } catch { if (!cancelled) { setMessages([]); setPinnedMessage(null); } } finally { if (!cancelled) setLoadingMsgs(false); }
    })();

    const onSocket = (event: ChatSocketEvent) => {
      if (cancelled || stealth) return;

      if (event.type === "message:new" && event.conversationId === cid) {
        const msg = tagOwn(event.message as unknown as Message);
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          const withoutOpt = prev.filter(m => !m.id.startsWith("opt-") || m.text !== msg.text);
          return [...withoutOpt, msg];
        });
        lastMsgCount.current += 1;
        setConversations(p => p.map(c => c.id === cid ? { ...c, unreadCount: 0, lastMessage: msg.type !== "text" ? `Sent a ${msg.type}` : msg.text, lastMessageAt: msg.createdAt } : c));
        markConversationRead(cid);
        void API.post(`/chat/conversations/${cid}/read`).catch(() => {});
        if (!msg.isOwn) {
          if (soundOn) playChatSound();
          if (notifRef.current && !document.hasFocus()) {
            new Notification(msg.senderName, {
              body: msg.type !== "text" ? `Sent a ${msg.type}` : msg.text.slice(0, 80),
              icon: "/images/image.png",
            });
          }
        }
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
        return;
      }

      if (event.type === "message:edit" && event.conversationId === cid) {
        const updated = event.message as unknown as Message;
        setMessages(p => p.map(m => m.id === updated.id ? { ...m, ...updated } : m));
        return;
      }

      if (event.type === "message:delete" && event.conversationId === cid) {
        setMessages(p => p.filter(m => m.id !== event.messageId));
        return;
      }

      if (event.type === "message:reaction" && event.conversationId === cid) {
        setMessages(p => p.map(m => m.id === event.messageId ? { ...m, reactions: event.reactions } : m));
        return;
      }

      if (event.type === "message:pinned" && event.conversationId === cid) {
        setPinnedMessage((event.pinnedMessage as unknown as Message | null) ?? null);
        return;
      }

      if (event.type === "typing" && event.conversationId === cid) {
        setTypingName(event.name);
        if (typingClearTimer) clearTimeout(typingClearTimer);
        typingClearTimer = setTimeout(() => setTypingName(null), 4_000);
        return;
      }

      if (event.type === "read" && event.conversationId === cid) {
        setMessages(p => p.map(m => {
          if (!m.isOwn) return m;
          return { ...m, status: "read" as MsgStatus };
        }));
      }
    };

    const unsub = subscribeChatSocket(onSocket);

    return () => {
      cancelled = true;
      unsub();
      if (typingClearTimer) clearTimeout(typingClearTimer);
      if (!stealth) {
        setWatchingConversation(null);
        setChatWatchingConversation(null);
      }
    };
  }, [activeConvId, soundOn, isStealthView, viewAsCsr]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (recTimerRef.current) clearInterval(recTimerRef.current);
  }, []);

  const parseMentionIds = (text: string): string[] => {
    const ids: string[] = [];
    for (const m of groupMembers) {
      if (text.includes(`@${m.name}`)) ids.push(m.id);
    }
    return ids;
  };

  const sendText = async () => {
    if (!msgText.trim() || !activeConvId || sendingMsg) return;
    const convNow = conversations.find(c => c.id === activeConvId);
    if (convNow?.type === "group" && convNow.whoCanSend === "admins" && convNow.myMemberRole !== "admin") {
      toast.error("Only group admins can send messages in this chat.");
      return;
    }
    const text = msgText.trim(); const reply = replyTo;
    const mentionIds = activeConv?.type === "group" ? parseMentionIds(text) : [];
    setMsgText(""); setReplyTo(null); setMentionQuery(null); setSendingMsg(true);
    requestAnimationFrame(() => autoGrowTextarea(inputRef.current));
    const opt: Message = { id: `opt-${Date.now()}`, senderId: meRef.current?.id ?? "", senderName: meRef.current?.name ?? "You", text, type: "text", createdAt: new Date().toISOString(), isOwn: true, status: "sending", replyTo: reply ? { id: reply.id, text: reply.text, senderName: reply.senderName, type: reply.type } : null };
    setMessages(p => [...p, opt]);
    setConversations(p => p.map(c => c.id === activeConvId ? { ...c, lastMessage: text, lastMessageAt: new Date().toISOString() } : c));
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    try {
      const r = await API.post(`/chat/conversations/${activeConvId}/messages`, { text, ...(reply ? { replyToId: reply.id } : {}), ...(mentionIds.length ? { mentionIds } : {}) });
      const saved = r.data.message as Message | undefined;
      invalidateChatMessages(`/chat/conversations/${activeConvId}/messages`);
      setMessages(p => p.map(m => m.id === opt.id ? (saved ? { ...saved, status: "sent" } : { ...m, status: "sent" }) : m));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        setMessages(p => p.filter(m => m.id !== opt.id));
        toast.error(apiErrorMessage(err, "You cannot send in this group."));
      } else {
        addToOfflineQueue({ id: opt.id, conversationId: activeConvId, text, replyToId: reply?.id, createdAt: new Date().toISOString() });
        setMessages(p => p.map(m => m.id === opt.id ? { ...m, status: "sent" } : m));
      }
    }
    finally { setSendingMsg(false); inputRef.current?.focus(); }
  };

  const saveEdit = async () => {
    if (!editingMsg || !editText.trim()) return;
    try {
      const r = await API.patch(`/chat/messages/${editingMsg.id}`, { text: editText.trim() });
      const updated = r.data.message as Message;
      setMessages(p => p.map(m => m.id === editingMsg.id ? { ...m, ...updated } : m));
      setEditingMsg(null); setEditText("");
    } catch { /* ignore */ }
  };

  const toggleReaction = async (msg: Message, emoji: string) => {
    try {
      const r = await API.post(`/chat/messages/${msg.id}/reactions`, { emoji });
      const reactions = r.data.reactions as Record<string, string[]>;
      setMessages(p => p.map(m => m.id === msg.id ? { ...m, reactions } : m));
    } catch { /* ignore */ }
    setCtxMenu(null);
  };

  const pinMessage = async (msg: Message | null) => {
    if (!activeConvId) return;
    try {
      await API.post(`/chat/conversations/${activeConvId}/pin`, { messageId: msg?.id ?? null });
      setPinnedMessage(msg);
      setConversations(p => p.map(c => c.id === activeConvId ? { ...c, pinnedMessageId: msg?.id ?? null } : c));
    } catch { /* ignore */ }
    setCtxMenu(null);
  };

  const archiveConversation = async (archive: boolean) => {
    if (!activeConvId) return;
    try {
      await API.post(`/chat/conversations/${activeConvId}/${archive ? "archive" : "unarchive"}`);
      if (archive) {
        const conv = conversations.find(c => c.id === activeConvId);
        if (conv) { setArchivedConvs(p => [{ ...conv, archived: true }, ...p]); setConversations(p => p.filter(c => c.id !== activeConvId)); }
        setActiveConvId(null);
      } else {
        const conv = archivedConvs.find(c => c.id === activeConvId);
        if (conv) { setConversations(p => [{ ...conv, archived: false }, ...p]); setArchivedConvs(p => p.filter(c => c.id !== activeConvId)); }
      }
    } catch { /* ignore */ }
  };

  const handleCtxMenu = (e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    const menuH = Math.min(520, window.innerHeight - 24);
    const x = Math.min(e.clientX, window.innerWidth - 230);
    const y = Math.max(72, Math.min(e.clientY, window.innerHeight - menuH));
    setCtxMenu({ x, y, msg, canEdit: messageCanEdit(msg) });
  };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (pendingFile) void sendFile(); else void sendText(); } };
  const onMsgTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMsgText(val);
    autoGrowTextarea(e.target);
    if (activeConv?.type === "group") {
      const caret = e.target.selectionStart ?? val.length;
      const match = val.slice(0, caret).match(/@([^@\n]*)$/);
      setMentionQuery(match ? match[1].trim().toLowerCase() : null);
    } else setMentionQuery(null);
    if (activeConvId && val.trim()) {
      if (typingDebRef.current) clearTimeout(typingDebRef.current);
      typingDebRef.current = setTimeout(() => { sendTyping(activeConvId); }, 400);
    }
  };

  const insertMention = (name: string) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? msgText.length;
    const upto = msgText.slice(0, caret);
    const match = upto.match(/@([^@\n]*)$/);
    const start = match ? caret - match[0].length : caret;
    const next = `${msgText.slice(0, start)}@${name} ${msgText.slice(caret)}`;
    setMsgText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => autoGrowTextarea(inputRef.current));
    inputRef.current?.focus();
  };

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    return groupMembers.filter(m => m.id !== me?.id && m.name.toLowerCase().includes(mentionQuery));
  }, [mentionQuery, groupMembers, me?.id]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > MAX_FILE_BYTES) { alert(`Max 200 MB. File is ${fmtSize(file.size)}.`); e.target.value = ""; return; }
    setPendingFile(file); setPendingPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null); e.target.value = "";
  };
  const clearPending = () => { if (pendingPreview) URL.revokeObjectURL(pendingPreview); setPendingFile(null); setPendingPreview(null); };

  const sendFile = async () => {
    if (!pendingFile || !activeConvId || uploading) return;
    const file = pendingFile; const type: MsgType = file.type.startsWith("image/") ? "image" : "file";
    const caption = msgText.trim();
    clearPending(); setMsgText(""); setUploading(true); setUploadProgress(0);
    const opt: Message = { id: `opt-${Date.now()}`, senderId: meRef.current?.id ?? "", senderName: meRef.current?.name ?? "You", text: caption, type, fileName: file.name, fileSize: file.size, fileMimeType: file.type, createdAt: new Date().toISOString(), isOwn: true, status: "sending" };
    setMessages(p => [...p, opt]); setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    const fd = new FormData(); fd.append("file", file); fd.append("type", type); if (caption) fd.append("text", caption);
    try {
      await API.post(`/chat/conversations/${activeConvId}/messages`, fd, { headers: { "Content-Type": "multipart/form-data" }, onUploadProgress: (ev: { loaded: number; total?: number }) => { if (ev.total) setUploadProgress(Math.round((ev.loaded / ev.total) * 100)); } });
      invalidateChatMessages(`/chat/conversations/${activeConvId}/messages`);
      setMessages(p => p.map(m => m.id === opt.id ? { ...m, status: "sent" } : m));
    } catch { setMessages(p => p.filter(m => m.id !== opt.id)); }
    finally { setUploading(false); setUploadProgress(0); }
  };

  const startRec = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) { alert("Not supported."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream; isCancelRef.current = false; recConvRef.current = activeConvId;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const rec = new MediaRecorder(stream, { mimeType: mime }); chunksRef.current = [];
      rec.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (isCancelRef.current) { chunksRef.current = []; return; }
        const blob = new Blob(chunksRef.current, { type: mime }); if (blob.size === 0) return;
        await sendVoice(blob, mime);
      };
      rec.start(100); mediaRecorderRef.current = rec; setIsRecording(true); setRecTime(0);
      recTimerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
    } catch { alert("Microphone access denied."); }
  };
  const stopRec = () => { if (recTimerRef.current) clearInterval(recTimerRef.current); isCancelRef.current = false; mediaRecorderRef.current?.stop(); setIsRecording(false); setRecTime(0); };
  const cancelRec = () => { if (recTimerRef.current) clearInterval(recTimerRef.current); isCancelRef.current = true; mediaRecorderRef.current?.stop(); streamRef.current?.getTracks().forEach(t => t.stop()); setIsRecording(false); setRecTime(0); };
  const sendVoice = async (blob: Blob, mime: string) => {
    const cid = recConvRef.current ?? activeConvId; if (!cid) return;
    const opt: Message = { id: `opt-${Date.now()}`, senderId: meRef.current?.id ?? "", senderName: meRef.current?.name ?? "You", text: "", type: "voice", fileName: "Voice message", fileSize: blob.size, fileMimeType: mime, createdAt: new Date().toISOString(), isOwn: true, status: "sending" };
    setMessages(p => [...p, opt]); setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    const fd = new FormData(); fd.append("file", blob, "voice.webm"); fd.append("type", "voice");
    try {
      await API.post(`/chat/conversations/${cid}/messages`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      invalidateChatMessages(`/chat/conversations/${cid}/messages`);
      setMessages(p => p.map(m => m.id === opt.id ? { ...m, status: "sent" } : m));
    } catch { setMessages(p => p.filter(m => m.id !== opt.id)); }
  };

  const parseUsers = (data: unknown): ChatUser[] => {
    const raw = Array.isArray(data) ? data : ((data as Record<string, unknown>)?.users ?? data ?? []) as unknown[];
    return (raw as Record<string, unknown>[]).map(u => {
      const name = String(u.name ?? "").trim();
      const email = u.email ? String(u.email) : undefined;
      const role = u.role ? String(u.role) : undefined;
      const roleLabel =
        role === "technical_manager" ? "Chief Estimator"
        : role === "bim_manager" ? "BIM Manager"
        : role === "accounts" ? "Accounts"
        : role === "estimator" ? "Estimator"
        : role === "bim" ? "BIM"
        : role === "csr" ? "CSR"
        : role === "manager" ? "Admin"
        : role === "admin" ? "CEO"
        : roleDisplayLabel(role);
      const display =
        name && name.toLowerCase() !== "unknown"
          ? name
          : email
            ? (email.includes("@") ? email.split("@")[0]! : email)
            : (u.csrCode ? String(u.csrCode) : roleLabel || "User");
      return {
        id: String(u.id),
        name: display,
        email,
        csrCode: u.csrCode ? String(u.csrCode) : null,
        role,
        isOnline: Boolean(u.isOnline),
        profilePic: u.profilePic ? String(u.profilePic) : null,
      };
    });
  };
  /** Mirror backend GPS/BEM chat visibility (admin sees all). */
  const canSeeChatUser = (viewerRole: string | undefined, targetRole: string | undefined) => {
    const viewer = (viewerRole || "").toLowerCase();
    const target = (targetRole || "").toLowerCase();
    if (!viewer || !target) return false;
    if (viewer === "admin") return true;
    if (viewer === "technical_manager" || viewer === "estimator") {
      return (
        target === "admin" ||
        target === "technical_manager" ||
        target === "estimator" ||
        target === "accounts"
      );
    }
    if (viewer === "bim_manager" || viewer === "bim") {
      return (
        target === "admin" ||
        target === "bim_manager" ||
        target === "bim" ||
        target === "accounts"
      );
    }
    if (viewer === "accounts") {
      return (
        target === "admin" ||
        target === "csr" ||
        target === "manager" ||
        target === "accounts" ||
        target === "technical_manager" ||
        target === "estimator" ||
        target === "bim_manager" ||
        target === "bim"
      );
    }
    return target === "admin" || target === "csr" || target === "manager" || target === "accounts";
  };
  const fetchUsers = async (force = false) => {
    if (!force && allUsers.length > 0) return;
    setLoadingUsers(true);
    try {
      const r = await API.get("/chat/users");
      const users = parseUsers(r.data?.users ?? r.data);
      setAllUsers(
        users.filter(u => u.id !== meRef.current?.id && canSeeChatUser(meRef.current?.role, u.role)),
      );
    } catch {
      try {
        const r = await API.get("/users");
        setAllUsers(
          parseUsers(r.data).filter(
            u => u.id !== meRef.current?.id && canSeeChatUser(meRef.current?.role, u.role),
          ),
        );
      } catch {
        if (force || allUsers.length === 0) setAllUsers([]);
      }
    } finally {
      setLoadingUsers(false);
    }
  };
  useEffect(() => {
    if (allUsers.length === 0) return;
    return subscribeChatSocket((event) => {
      if (event.type !== "presence") return;
      setAllUsers(prev => prev.map(u => u.id === event.userId ? { ...u, isOnline: event.isOnline } : u));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUsers.length === 0 ? 0 : 1]);

  const createGroup = async () => {
    if (!groupName.trim() || creatingGroup) return; setCreatingGroup(true);
    try {
      const r = await API.post("/chat/conversations", {
        type: "group",
        name: groupName.trim(),
        memberIds: selectedUsers,
        adminIds: groupAdminIds.filter((id) => selectedUsers.includes(id)),
        whoCanSend,
      });
      const conv: Conversation = r.data.conversation ?? { id: r.data.id ?? `grp-${crypto.randomUUID()}`, type: "group", name: groupName.trim(), unreadCount: 0, memberCount: selectedUsers.length + 1 };
      guardPanelClose();
      setConversations(p => [conv, ...p]); setActiveConvId(conv.id);
      window.setTimeout(() => { setShowGroupModal(false); setGroupName(""); setSelectedUsers([]); setGroupAdminIds([]); setWhoCanSend("everyone"); setUserSearch(""); }, 0);
      setMobileSideOpen(false);
    } catch {}
    setCreatingGroup(false);
  };

  const saveLook = (next: ChatLook) => {
    setChatLook(next);
    localStorage.setItem("crm_chat_look", JSON.stringify(next));
  };

  const saveGroupSettings = async (nextWho: "everyone" | "admins", adminIds: string[]) => {
    if (!activeConvId) return;
    try {
      const r = await API.patch(`/chat/conversations/${activeConvId}/settings`, { whoCanSend: nextWho, adminIds });
      const savedIds = Array.isArray(r.data?.adminIds) ? (r.data.adminIds as string[]) : adminIds;
      const mine = me?.id;
      setConversations((p) => p.map((c) => c.id === activeConvId ? {
        ...c,
        whoCanSend: nextWho,
        createdById: r.data?.createdById ?? c.createdById,
        myMemberRole: mine && savedIds.includes(mine) ? "admin" : "member",
        canManageGroup: Boolean(mine && (savedIds.includes(mine) || c.createdById === mine || r.data?.createdById === mine)),
      } : c));
      setGroupMembers((prev) => prev.map((m) => ({ ...m, memberRole: savedIds.includes(m.id) ? "admin" : "member" })));
      void fetchConvMembers(activeConvId, true).then((members) => setGroupMembers(members as ChatUser[])).catch(() => {});
      toast.success("Group settings saved");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not save group settings"));
    }
  };

  const startDm = async (user: ChatUser) => {
    if (dmLoadingUserId) return;
    setDmLoadingUserId(user.id);
    guardPanelClose();
    closeDmModal();
    setMobileSideOpen(false);
    const existing = conversations.find(c => c.type === "direct" && c.otherUserId === user.id);
    if (existing) { setActiveConvId(existing.id); setDmLoadingUserId(null); return; }
    const tempId = `temp-${user.id}`;
    const placeholder: Conversation = {
      id: tempId, type: "direct", name: user.name, unreadCount: 0,
      isOnline: user.isOnline, otherUserId: user.id, profilePic: user.profilePic ?? null,
      lastMessageAt: new Date().toISOString(),
    };
    setConversations(p => [placeholder, ...p]); setActiveConvId(tempId);
    try {
      const r = await API.post("/chat/conversations", { type: "direct", userId: user.id });
      const cid = r.data.id ?? r.data.conversation?.id;
      const conv = r.data.conversation as Conversation | undefined;
      if (!cid) return;
      setConversations(p => {
        const merged = p.map(c =>
          c.id === tempId
            ? { ...c, ...conv, id: cid, otherUserId: user.id, name: conv?.name ?? user.name, isOnline: conv?.isOnline ?? user.isOnline }
            : c
        );
        const seen = new Set<string>();
        return merged.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
      });
      setActiveConvId(cid);
    } catch {
      /* Keep thread in sidebar even if sync failed — user can retry by opening it again */
    }
    finally { setDmLoadingUserId(null); }
  };

  const deleteConversations = async (ids: string[]) => {
    setConversations(p => p.filter(c => !ids.includes(c.id)));
    if (ids.includes(activeConvId ?? "")) setActiveConvId(null);
    setSelectedConvs([]); setSelectMode(false);
    await Promise.all(ids.map(id => API.delete(`/chat/conversations/${id}`).catch(() => {})));
  };
  const deleteMsgs = async (ids: string[], mode: "for_me" | "for_everyone") => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length || !activeConvId) return;
    const ownIds = new Set(messages.filter(m => m.isOwn || m.senderId === me?.id).map(m => m.id));
    const isCeo = me?.role === "admin";
    const targets = mode === "for_everyone"
      ? unique.filter(id => ownIds.has(id) || isCeo)
      : unique;
    if (!targets.length) {
      toast.error("Delete for everyone only works on your own messages.");
      setCtxMenu(null);
      return;
    }
    setCtxMenu(null);
    const remaining = messages.filter(m => !targets.includes(m.id));
    setMessages(remaining);
    setSelectedMsgIds([]);
    setMsgSelectMode(false);
    invalidateChatMessages(`/chat/conversations/${activeConvId}/messages`);
    try {
      const results = await Promise.all(targets.map(id => API.delete(`/chat/messages/${id}`, { data: { mode } }).catch(() => null)));
      const cleared = results.some(r => Boolean(r?.data?.conversationCleared)) || remaining.length === 0;
      if (cleared && mode === "for_me") {
        setConversations(p => p.filter(c => c.id !== activeConvId));
        setActiveConvId(null);
      } else {
        const last = remaining[remaining.length - 1];
        setConversations(p => p.map(c => {
          if (c.id !== activeConvId) return c;
          return {
            ...c,
            lastMessage: last
              ? (last.type !== "text" ? `Sent a ${last.type}` : last.text)
              : undefined,
            lastMessageAt: last?.createdAt ?? undefined,
          };
        }));
      }
    } catch { /* ignore */ }
  };
  const handleReply = (msg: Message) => { setReplyTo(msg); setCtxMenu(null); setTimeout(() => inputRef.current?.focus(), 50); };
  const copyText = async (text: string) => { await navigator.clipboard.writeText(text).catch(() => {}); setCtxMenu(null); };
  const jumpToReply = (id: string) => {
    const el = document.getElementById(`msg-${id}`); if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("bg-yellow-50"); setTimeout(() => el.classList.remove("bg-yellow-50"), 1200);
  };
  const togglePin = (convId: string) => setPinnedIds(prev => { const next = new Set(prev); if (next.has(convId)) next.delete(convId); else next.add(convId); return next; });

  const guardPanelClose = () => {
    blockPanelCloseRef.current = true;
    window.setTimeout(() => { blockPanelCloseRef.current = false; }, 400);
  };

  const handlePanelBackdrop = () => {
    if (blockPanelCloseRef.current || showDmModal || showGroupModal) return;
    onClose();
  };

  const closeDmModal = () => {
    window.setTimeout(() => { setShowDmModal(false); setDmSearch(""); }, 0);
  };

  /* ── */
  const activeConv = conversations.find(c => c.id === activeConvId) ?? null;
  const sendLocked = activeConv?.type === "group" && activeConv.whoCanSend === "admins" && activeConv.myMemberRole !== "admin";
  const filteredConvs = useMemo(() => { const q = convSearch.toLowerCase(); return !q ? conversations : conversations.filter(c => c.name.toLowerCase().includes(q)); }, [conversations, convSearch]);
  const filteredUsers = useMemo(() => { const q = (showGroupModal ? userSearch : dmSearch).toLowerCase(); return !q ? allUsers : allUsers.filter(u => u.name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || (u.csrCode ?? "").toLowerCase().includes(q)); }, [allUsers, userSearch, dmSearch, showGroupModal]);
  const visibleMessages = useMemo(() => { if (!msgSearchText.trim()) return messages; const q = msgSearchText.toLowerCase(); return messages.filter(m => m.text.toLowerCase().includes(q) || m.fileName?.toLowerCase().includes(q)); }, [messages, msgSearchText]);
  const msgGroups = useMemo(() => { const groups: { date: string; msgs: Message[] }[] = []; visibleMessages.forEach(msg => { const date = fmtDateSep(msg.createdAt); const last = groups[groups.length - 1]; if (!last || last.date !== date) groups.push({ date, msgs: [msg] }); else last.msgs.push(msg); }); return groups; }, [visibleMessages]);
  const totalUnread = useMemo(() => conversations.reduce((s, c) => s + c.unreadCount, 0), [conversations]);
  const sortedConvs = useMemo(() => sortConversations(
    showArchived ? archivedConvs : filteredConvs,
    pinnedIds,
  ), [filteredConvs, archivedConvs, showArchived, pinnedIds]);
  const directConvs = useMemo(() => sortedConvs.filter(c => c.type === "direct").sort((a, b) => { if (pinnedIds.has(a.id) !== pinnedIds.has(b.id)) return pinnedIds.has(a.id) ? -1 : 1; if (a.isOnline && !b.isOnline) return -1; if (!a.isOnline && b.isOnline) return 1; return 0; }), [sortedConvs, pinnedIds]);
  const groupConvs   = useMemo(() => sortedConvs.filter(c => c.type === "group"), [sortedConvs]);
  const onlineDirects = useMemo(() => conversations.filter(c => c.type === "direct" && c.isOnline), [conversations]);

  /* ---- */
  if (!isStealthView && !chatAllowed) {
    return (
      <div className="fixed inset-0 top-[var(--app-header-h,64px)] z-[45] pointer-events-none">
        <div
          className="absolute inset-0 bg-black/20 pointer-events-auto sm:left-auto sm:w-[420px] sm:max-w-full sm:right-0"
          onClick={onClose}
          aria-hidden
        />
        <div className="absolute top-0 right-0 bottom-0 z-[46] flex flex-col bg-white shadow-2xl border-l border-gray-200 w-full sm:w-[420px] max-w-full pointer-events-auto overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-800">Messages</p>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-cyan-50 text-cyan-700 flex items-center justify-center">
              <MessageSquare size={24} />
            </div>
            <p className="text-base font-bold text-gray-900">Chat disabled</p>
            <p className="text-sm text-gray-500">
              An administrator has turned off messaging for your account. Contact admin if you need access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ---- */
  return (
    <div className={`fixed inset-0 z-[80] pointer-events-none ${chatFullscreen ? "" : "top-[var(--app-header-h,64px)]"}`}>
      {/* Light backdrop - only blocks clicks behind panel area */}
      <div
        className={`absolute inset-0 bg-black/20 pointer-events-auto ${chatFullscreen ? "" : "sm:left-auto sm:w-[768px] sm:max-w-full sm:right-0"}`}
        onClick={handlePanelBackdrop}
        aria-hidden
      />

      {/* Panel */}
      <div className={`absolute z-[81] flex bg-white dark:bg-crm-surface shadow-2xl pointer-events-auto overflow-hidden ${
        chatFullscreen
          ? "inset-0 w-full border-0"
          : "top-0 right-0 bottom-0 border-l border-gray-200 dark:border-crm-border w-full sm:w-[768px] max-w-full"
      }`}>

        {!selectMode && (
          <ChatActionRail
            notifGranted={notifGranted}
            onNotif={() => void askNotif()}
            soundOn={soundOn}
            onSoundToggle={() => setSoundOn(v => !v)}
            showArchived={showArchived}
            onArchiveToggle={() => {
              setShowArchived(v => {
                const next = !v;
                if (next) {
                  const cached = getArchivedConversations();
                  if (cached.length > 0) setArchivedConvs(deduplicateConvs(cached));
                }
                return next;
              });
            }}
            onSelect={isStealthView ? undefined : () => setSelectMode(true)}
            onNewDm={isStealthView ? undefined : () => { setShowDmModal(true); void fetchUsers(true); }}
            onNewGroup={isStealthView ? undefined : () => { setShowGroupModal(true); void fetchUsers(true); }}
            onSettings={isStealthView ? undefined : () => { setShowChatSettings((v) => !v); setShowGroupSettings(false); }}
            settingsOpen={showChatSettings}
            isFullscreen={chatFullscreen}
            onFullscreen={() => setChatFullscreen(v => !v)}
            onClose={onClose}
            readOnly={isStealthView}
          />
        )}

        {showChatSettings && !selectMode && (
          <div className="absolute left-14 top-24 z-[90] w-64 rounded-2xl border border-gray-200 bg-white shadow-xl p-3 space-y-3">
            <p className="text-xs font-bold text-gray-900">Chat theme</p>
            <label className="flex items-center justify-between text-[11px] font-semibold text-gray-500">
              Background
              <input type="color" value={chatLook.bg} onChange={(e) => saveLook({ ...chatLook, bg: e.target.value })} className="h-8 w-12 rounded-lg border border-gray-200 bg-white" />
            </label>
            <label className="flex items-center justify-between text-[11px] font-semibold text-gray-500">
              My bubble
              <input type="color" value={chatLook.mine} onChange={(e) => saveLook({ ...chatLook, mine: e.target.value })} className="h-8 w-12 rounded-lg border border-gray-200 bg-white" />
            </label>
            <label className="flex items-center justify-between text-[11px] font-semibold text-gray-500">
              Font color
              <input type="color" value={chatLook.font} onChange={(e) => saveLook({ ...chatLook, font: e.target.value })} className="h-8 w-12 rounded-lg border border-gray-200 bg-white" />
            </label>
            <label className="block text-[11px] font-semibold text-gray-500">
              Font style
              <select value={chatLook.fontFamily} onChange={(e) => saveLook({ ...chatLook, fontFamily: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-gray-200 px-2 text-xs text-gray-800">
                {FONT_STYLES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => saveLook(DEFAULT_CHAT_LOOK)} className="h-8 w-full rounded-lg border border-gray-200 text-xs font-semibold text-gray-600">Reset</button>
          </div>
        )}

        <div className="flex flex-1 min-w-0 min-h-0">

        {/* ── CONVERSATIONS SIDEBAR ── */}
        <aside
          className={`${mobileSideOpen ? "flex" : "hidden"} sm:flex w-full sm:w-[var(--chat-list-w)] shrink-0 flex-col bg-white dark:bg-crm-surface border-r border-gray-100 dark:border-crm-border sm:relative min-h-0 overflow-hidden`}
          style={{ ["--chat-list-w" as string]: `${listWidth}px` }}
        >
          <div className="px-3 py-3 border-b border-gray-100 shrink-0 overflow-hidden">
            {selectMode ? (
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <button onClick={() => { setSelectMode(false); setSelectedConvs([]); }} className="w-7 h-7 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"><X size={13} /></button>
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{selectedConvs.length} selected</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setSelectedConvs(conversations.map(c => c.id))} className="text-[11px] font-semibold text-[#1B6FE8] hover:underline px-1">All</button>
                  {selectedConvs.length > 0 && (
                    <button onClick={() => void deleteConversations(selectedConvs)} className="flex items-center gap-1 h-7 px-2.5 rounded-xl bg-[#1B6FE8] text-white text-[11px] font-bold hover:bg-[#a30f27] transition-colors"><Trash2 size={11} />Del</button>
                  )}
                </div>
              </div>
            ) : (
              <>
              <div className="flex items-center gap-2 mb-2.5 min-w-0">
                <h2 className="text-[15px] font-bold text-gray-900 dark:text-gray-100 truncate">
                  {isStealthView ? `${viewAsCsr!.name}'s Chats` : "Messages"}
                </h2>
                {!isStealthView && totalUnread > 0 && (
                  <span className="bg-[#1B6FE8] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shrink-0">{totalUnread}</span>
                )}
              </div>
              {adminCsrOptions.length > 0 && onViewAsCsrChange && (
                <AdminViewAsPicker
                  options={adminCsrOptions}
                  value={viewAsCsr}
                  onChange={onViewAsCsrChange}
                  isStealthView={isStealthView}
                />
              )}
              </>
            )}
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search..." value={convSearch} onChange={e => setConvSearch(e.target.value)} className="w-full h-8 rounded-xl bg-[#F3F4F6] dark:bg-crm-muted dark:text-gray-100 pl-7 pr-3 text-xs outline-none focus:bg-white dark:focus:bg-crm-input focus:ring-2 focus:ring-[#1B6FE8]/20 transition-all" />
            </div>
          </div>

          {!selectMode && onlineDirects.length > 0 && (
            <div className="px-3 pt-2.5 pb-2.5 border-b border-gray-100 shrink-0">
              <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />Online - {onlineDirects.length}</p>
              <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {onlineDirects.map(c => (
                  <button key={c.id} onClick={() => { setActiveConvId(c.id); setMobileSideOpen(false); }} className="flex flex-col items-center gap-1 shrink-0 group" title={c.name}>
                    <Avatar name={c.name} src={c.profilePic} size="sm" online />
                    <span className="text-[9px] text-gray-500 font-medium max-w-[36px] truncate">{c.name.split(" ")[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto py-1.5 px-1">
            {loadingConvs ? (
              <div className="space-y-0.5">{[1,2,3,4].map(i => (<div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse"><div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" /><div className="flex-1 space-y-1.5"><div className="h-2.5 bg-gray-100 rounded w-20" /><div className="h-2 bg-gray-100 rounded w-28" /></div></div>))}</div>
            ) : conversations.length === 0 && !showArchived ? (
              <div className="py-14 text-center px-3"><MessageSquare size={28} className="text-gray-200 mx-auto mb-2" /><p className="text-sm font-semibold text-gray-500">No conversations</p><p className="text-xs text-gray-400 mt-0.5">Start a DM or create a group</p></div>
            ) : (
              <>
                {directConvs.length > 0 && (<><p className="px-3 pt-1.5 pb-1 text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Direct Messages</p>{directConvs.map(conv => (<ConvItem key={conv.id} conv={conv} active={activeConvId === conv.id} selectMode={selectMode} selected={selectedConvs.includes(conv.id)} pinned={pinnedIds.has(conv.id)} onSelect={() => setSelectedConvs(p => p.includes(conv.id) ? p.filter(id => id !== conv.id) : [...p, conv.id])} onPin={() => togglePin(conv.id)} onClick={() => { setActiveConvId(conv.id); setMobileSideOpen(false); }} />))}</>)}
                {groupConvs.length > 0 && (<><p className="px-3 pt-2.5 pb-1 text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Groups</p>{groupConvs.map(conv => (<ConvItem key={conv.id} conv={conv} active={activeConvId === conv.id} selectMode={selectMode} selected={selectedConvs.includes(conv.id)} pinned={pinnedIds.has(conv.id)} onSelect={() => setSelectedConvs(p => p.includes(conv.id) ? p.filter(id => id !== conv.id) : [...p, conv.id])} onPin={() => togglePin(conv.id)} onClick={() => { setActiveConvId(conv.id); setMobileSideOpen(false); }} />))}</>)}
                {filteredConvs.length === 0 && convSearch && (<p className="py-8 text-center text-xs text-gray-400">No results for &ldquo;{convSearch}&rdquo;</p>)}
              </>
            )}
          </div>

          {me && (
            <div className="px-3 py-2.5 border-t border-gray-100 shrink-0 flex items-center gap-2">
              <Avatar name={me.name} src={me.profilePic} size="sm" online />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{me.name}</p>
                <p className="text-[10px] text-gray-400 truncate">{me.csrCode ?? roleDisplayLabel(me.role)}</p>
                {me.email ? <p className="text-[9px] text-gray-400 truncate">{me.email}</p> : null}
              </div>
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            </div>
          )}
        </aside>

        <ChatListResizeHandle onPointerDown={onListResize} />

        {/* ── */}
        <section className={`${!mobileSideOpen ? "flex" : "hidden"} sm:flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden`}>
          {activeConv ? (
            <>
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-100 bg-white shrink-0 shadow-sm">
                <button onClick={() => setMobileSideOpen(true)} className="sm:hidden w-7 h-7 rounded-xl bg-gray-100 flex items-center justify-center shrink-0"><ChevronLeft size={14} /></button>
                {activeConv.type === "group" ? <div className="w-8 h-8 rounded-full bg-[#1B6FE8]/10 text-[#1B6FE8] flex items-center justify-center shrink-0"><Hash size={15} /></div> : <Avatar name={activeConv.name} src={activeConv.profilePic} size="sm" online={activeConv.isOnline} />}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{activeConv.name}</h3>
                  {typingName ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#1B6FE8]"><span className="flex gap-0.5">{[0,1,2].map(i => <span key={i} className="w-1 h-1 rounded-full bg-[#1B6FE8] animate-bounce" style={{ animationDelay: `${i*150}ms` }} />)}</span>{typingName} is typing...</span>
                  ) : activeConv.type === "group" ? <p className="text-[10px] text-gray-400">{activeConv.memberCount ?? "-"} members</p>
                    : activeConv.isOnline ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-600"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />Active now</span>
                    : <p className="text-[10px] text-gray-400">Offline</p>}
                </div>
                <button onClick={() => { setMsgSearchOpen(v => !v); if (msgSearchOpen) setMsgSearchText(""); }} className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors ${msgSearchOpen ? "bg-[#1B6FE8] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}><Search size={13} /></button>
                {activeConv.type === "group" && activeConv.canManageGroup ? (
                  <button onClick={() => { setShowGroupSettings(v => !v); setShowChatSettings(false); }} className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors ${showGroupSettings ? "bg-[#1B6FE8] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`} title="Group settings"><Settings size={13} /></button>
                ) : null}
                <button type="button" onClick={() => void archiveConversation(!showArchived)} title={showArchived ? "Unarchive" : "Archive chat"} className="w-7 h-7 rounded-xl bg-gray-100 text-gray-400 hover:bg-amber-50 hover:text-amber-600 flex items-center justify-center transition-colors">{showArchived ? <ArchiveRestore size={13} /> : <Archive size={13} />}</button>
                <button onClick={() => void deleteConversations([activeConv.id])} className="w-7 h-7 rounded-xl bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-[#1B6FE8] flex items-center justify-center transition-colors"><Trash2 size={13} /></button>
              </div>

              {msgSelectMode && !isStealthView && (
                <div className="px-3 py-2 border-b border-gray-100 bg-white shrink-0 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => { setMsgSelectMode(false); setSelectedMsgIds([]); }} className="h-8 px-2.5 rounded-lg bg-gray-100 text-xs font-semibold text-gray-600">Cancel</button>
                  <span className="text-xs font-bold text-gray-800">{selectedMsgIds.length} selected</span>
                  <button type="button" disabled={!selectedMsgIds.length} onClick={() => void deleteMsgs(selectedMsgIds, "for_me")} className="h-8 px-2.5 rounded-lg bg-[#EAF2FE] text-[#1B6FE8] text-xs font-bold disabled:opacity-40">Delete for me</button>
                  <button type="button" disabled={!selectedMsgIds.length} onClick={() => void deleteMsgs(selectedMsgIds, "for_everyone")} className="h-8 px-2.5 rounded-lg bg-[#1B6FE8] text-white text-xs font-bold disabled:opacity-40">Delete for everyone</button>
                </div>
              )}

              {showGroupSettings && activeConv.type === "group" && activeConv.canManageGroup && (
                <div className="px-3 py-3 border-b border-gray-100 bg-white shrink-0 space-y-2">
                  <label className="flex items-center justify-between gap-3 text-xs font-semibold text-gray-600">
                    Who can send
                    <select
                      value={activeConv.whoCanSend === "admins" ? "admins" : "everyone"}
                      onChange={(e) => {
                        const next = e.target.value === "admins" ? "admins" : "everyone";
                        const adminIds = groupMembers.filter((m) => m.memberRole === "admin").map((m) => m.id);
                        void saveGroupSettings(next, adminIds.length ? adminIds : (me?.id ? [me.id] : []));
                      }}
                      className="h-8 rounded-lg border border-gray-200 px-2 text-xs"
                    >
                      <option value="everyone">Everyone</option>
                      <option value="admins">Admins only</option>
                    </select>
                  </label>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {groupMembers.map((m) => (
                      <div key={m.id} className="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1">
                        <span className="text-xs font-semibold text-gray-800 truncate">{m.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const adminIds = groupMembers.filter((x) => x.memberRole === "admin").map((x) => x.id);
                            const nextIds = adminIds.includes(m.id) ? adminIds.filter((id) => id !== m.id) : [...adminIds, m.id];
                            setGroupMembers((prev) => prev.map((x) => ({ ...x, memberRole: nextIds.includes(x.id) ? "admin" : "member" })));
                            void saveGroupSettings(activeConv.whoCanSend === "admins" ? "admins" : "everyone", nextIds);
                          }}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${m.memberRole === "admin" ? "bg-[#0F172A] text-white" : "bg-gray-100 text-gray-600"}`}
                        >
                          {m.memberRole === "admin" ? "Admin" : "Make admin"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pinnedMessage && (
                <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 shrink-0 flex items-center gap-2">
                  <Pin size={12} className="text-amber-600 shrink-0" />
                  <button type="button" onClick={() => jumpToReply(pinnedMessage.id)} className="flex-1 min-w-0 text-left">
                    <p className="text-[10px] font-bold text-amber-700">Pinned</p>
                    <p className="text-[11px] text-gray-600 truncate">{pinnedMessage.type !== "text" ? `${pinnedMessage.type}` : pinnedMessage.text}</p>
                  </button>
                  <button type="button" onClick={() => void pinMessage(null)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
                </div>
              )}

              {msgSearchOpen && (
                <div className="px-3 py-2 border-b border-gray-100 bg-white shrink-0">
                  <div className="relative">
                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input autoFocus type="text" placeholder="Search messages..." value={msgSearchText} onChange={e => setMsgSearchText(e.target.value)} className="w-full h-8 rounded-xl bg-[#F3F4F6] pl-7 pr-7 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-[#1B6FE8]/20 transition-all" />
                    {msgSearchText && <button onClick={() => setMsgSearchText("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={11} /></button>}
                  </div>
                  {msgSearchText && <p className="text-[10px] text-gray-400 mt-1 ml-1">{visibleMessages.length} result{visibleMessages.length !== 1 ? "s" : ""}</p>}
                </div>
              )}

              <div ref={msgsContainerRef} className="flex-1 overflow-y-auto px-3 py-3" style={{ background: resolvedTheme === "dark" && chatLook.bg.toLowerCase() === "#f5f6fa" ? "var(--crm-bg)" : chatLook.bg, color: incomingTextColor(chatLook.font, resolvedTheme === "dark"), fontFamily: chatLook.fontFamily }}>
                {loadingMsgs ? (
                  <div className="flex items-center justify-center h-full"><Loader2 size={20} className="text-gray-300 animate-spin" /></div>
                ) : visibleMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-12 h-12 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center mb-2.5"><MessageSquare size={20} className="text-gray-300" /></div>
                    <p className="text-sm font-semibold text-gray-500">{msgSearchText ? "No matches" : "No messages yet"}</p>
                    {!msgSearchText && <p className="text-xs text-gray-400 mt-0.5">Say hello!</p>}
                  </div>
                ) : (
                  <div className="space-y-0.5 w-full">
                    {msgGroups.map(group => (
                      <div key={group.date} className="w-full">
                        <div className="flex items-center gap-2 my-3"><div className="flex-1 h-px bg-gray-200" /><span className="text-[9px] font-semibold text-gray-400 whitespace-nowrap px-2">{group.date}</span><div className="flex-1 h-px bg-gray-200" /></div>
                        <div className="flex flex-col gap-1.5 w-full">{group.msgs.map((msg, idx) => { const prev = group.msgs[idx - 1]; const showAvatar = !prev || prev.senderId !== msg.senderId; return <MessageBubble key={msg.id} msg={msg} isGroup={activeConv.type === "group"} showAvatar={showAvatar} myId={me?.id} mineColor={chatLook.mine} textColor={chatLook.font} fontFamily={chatLook.fontFamily} selectable={msgSelectMode && !isStealthView} selected={selectedMsgIds.includes(msg.id)} onToggleSelect={() => setSelectedMsgIds(p => p.includes(msg.id) ? p.filter(id => id !== msg.id) : [...p, msg.id])} onCtxMenu={handleCtxMenu} onReply={handleReply} onJumpToReply={jumpToReply} onReact={toggleReaction} />; })}</div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {uploading && (<div className="px-3 pt-2 shrink-0 bg-white"><div className="flex items-center gap-2"><div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-[#1B6FE8] rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} /></div><span className="text-[10px] font-bold text-[#1B6FE8] shrink-0">{uploadProgress}%</span></div></div>)}
              {pendingFile && (
                <div className="px-3 pb-2 pt-2 shrink-0 bg-white">
                  <div className="flex items-center gap-2.5 bg-[#F5F6FA] rounded-2xl border border-gray-100 px-3 py-2">
                    {pendingPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pendingPreview} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                    ) : <div className="w-10 h-10 rounded-xl bg-[#1B6FE8]/10 text-[#1B6FE8] flex items-center justify-center shrink-0">{mimeIcon(pendingFile.type)}</div>}
                    <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{pendingFile.name}</p><p className="text-[10px] text-gray-400">{fmtSize(pendingFile.size)}</p></div>
                    <button onClick={clearPending} className="w-6 h-6 rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-500 flex items-center justify-center shrink-0 transition-colors"><X size={10} /></button>
                  </div>
                </div>
              )}
              {replyTo && (
                <div className="px-3 pt-2 shrink-0 bg-white">
                  <div className="flex items-center gap-2 bg-[#EAF2FE] border border-[#1B6FE8]/20 rounded-xl px-3 py-1.5">
                    <Reply size={12} className="text-[#1B6FE8] shrink-0" />
                    <div className="flex-1 min-w-0"><p className="text-[10px] font-bold text-[#1B6FE8]">{replyTo.senderName}</p><p className="text-[11px] text-gray-500 truncate">{replyTo.type !== "text" ? `${replyTo.type}` : truncate(replyTo.text, 50)}</p></div>
                    <button onClick={() => setReplyTo(null)} className="w-5 h-5 rounded-full hover:bg-[#1B6FE8]/10 flex items-center justify-center shrink-0 text-gray-400"><X size={10} /></button>
                  </div>
                </div>
              )}

              {editingMsg ? (
                <div className="px-3 py-2.5 bg-white border-t border-gray-100 shrink-0">
                  <p className="text-[10px] font-bold text-[#1B6FE8] mb-1">Edit message</p>
                  <div className="flex items-end gap-1.5">
                    <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={2} className="flex-1 bg-[#F3F4F6] rounded-xl px-3 py-2 text-sm outline-none resize-none" />
                    <button type="button" onClick={() => { setEditingMsg(null); setEditText(""); }} className="h-8 px-3 rounded-xl bg-gray-100 text-xs font-semibold">Cancel</button>
                    <button type="button" onClick={() => void saveEdit()} className="h-8 px-3 rounded-xl bg-[#1B6FE8] text-white text-xs font-semibold">Save</button>
                  </div>
                </div>
              ) : isStealthView ? (
                <div className="px-3 py-3 bg-amber-50 border-t border-amber-100 shrink-0">
                  <p className="text-[11px] text-amber-800 text-center font-medium">Read-only view — messages cannot be sent</p>
                </div>
              ) : sendLocked ? (
                <div className="px-3 py-3 bg-gray-50 border-t border-gray-100 shrink-0">
                  <p className="text-[11px] text-gray-500 text-center font-medium">Only group admins can send messages in this chat.</p>
                </div>
              ) : (
              <div className="px-3 py-2.5 bg-white border-t border-gray-100 shrink-0 relative">
                <input ref={fileInputRef} type="file" className="hidden" accept="*/*" onChange={onFileChange} />
                {isRecording ? (
                  <div className="flex items-center gap-2.5 bg-[#EAF2FE] rounded-2xl px-3 py-2.5 border border-[#1B6FE8]/20">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <div className="flex items-end gap-0.5 flex-1 h-5">{[4,7,3,9,5,8,2,6,4,7].map((h,i) => <div key={i} className="w-0.5 bg-[#1B6FE8] rounded-full animate-pulse" style={{ height:`${h*10}%`, animationDelay:`${i*55}ms` }} />)}</div>
                    <span className="text-sm font-bold text-[#1B6FE8] tabular-nums shrink-0">{fmtAudio(recTime)}</span>
                    <button onClick={cancelRec} className="w-7 h-7 rounded-xl bg-white text-gray-500 hover:bg-gray-100 flex items-center justify-center shrink-0"><X size={13} /></button>
                    <button onClick={stopRec} className="w-7 h-7 rounded-xl bg-[#1B6FE8] text-white flex items-center justify-center shrink-0 shadow-sm"><StopCircle size={13} /></button>
                  </div>
                ) : (
                  <div className="flex items-end gap-1.5">
                    <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 rounded-xl bg-[#F3F4F6] text-gray-500 hover:bg-[#EAF2FE] hover:text-[#1B6FE8] flex items-center justify-center shrink-0 transition-colors mb-0.5" title="Attach file"><Paperclip size={14} /></button>
                    <div className="flex-1 flex items-end bg-[#F3F4F6] dark:bg-zinc-800 rounded-2xl px-3 py-2 min-h-[72px]">
                      <textarea ref={inputRef} value={msgText} onChange={onMsgTextChange} onKeyDown={onKey} placeholder={pendingFile ? "Add a message with this file…" : activeConv.type === "group" ? `Message #${activeConv.name}... (@ to mention)` : `Message ${activeConv.name}...`} rows={3} className="w-full flex-1 bg-transparent text-sm outline-none resize-none leading-relaxed placeholder:text-gray-400 dark:placeholder:text-gray-500 min-h-[56px] max-h-52 overflow-y-auto text-gray-900 dark:text-gray-100" />
                    </div>
                    <button onClick={() => void startRec()} disabled={!!pendingFile || sendingMsg} className="w-8 h-8 rounded-xl bg-[#F3F4F6] text-gray-500 hover:bg-[#EAF2FE] hover:text-[#1B6FE8] flex items-center justify-center shrink-0 transition-colors mb-0.5 disabled:opacity-40" title="Voice message"><Mic size={14} /></button>
                    <button onClick={pendingFile ? () => void sendFile() : () => void sendText()} disabled={(!msgText.trim() && !pendingFile) || sendingMsg || uploading} className="w-8 h-8 rounded-xl bg-[#1B6FE8] text-white flex items-center justify-center hover:bg-[#a30f27] disabled:bg-gray-200 disabled:text-gray-400 transition-colors shrink-0 mb-0.5 shadow-sm shadow-red-200">
                      {sendingMsg || uploading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    </button>
                  </div>
                )}
                {mentionSuggestions.length > 0 && (
                  <div className="absolute bottom-full left-10 mb-1 w-56 max-h-48 overflow-y-auto bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-white/15 shadow-lg py-1 z-10">
                    {mentionSuggestions.map(m => (
                      <button key={m.id} type="button" onClick={() => insertMention(m.name)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#F5F6FA] dark:hover:bg-white/10 truncate text-gray-900 dark:text-gray-100">
                        <span className="font-semibold text-[#1B6FE8] dark:text-yellow-300">@{m.name}</span>{" "}
                        <span className="text-gray-500 dark:text-gray-400">{roleDisplayLabel(m.role)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[#F5F6FA] dark:bg-crm-bg">
              <div className="w-16 h-16 rounded-3xl bg-white border border-gray-100 shadow-sm flex items-center justify-center mb-3"><MessageSquare size={28} className="text-gray-200" /></div>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Your Messages</h3>
              <p className="text-xs text-gray-400 mt-1 max-w-[220px]">Select a conversation or start a new one.</p>
              <div className="flex flex-wrap gap-2 mt-4 justify-center">
                <button onClick={() => { setShowDmModal(true); void fetchUsers(true); }} className="h-8 px-3 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-600 hover:border-[#1B6FE8] hover:text-[#1B6FE8] flex items-center gap-1.5 shadow-sm transition-all"><User2 size={12} />New DM</button>
                <button onClick={() => { setShowGroupModal(true); void fetchUsers(true); }} className="h-8 px-3 rounded-xl bg-[#1B6FE8] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#a30f27] shadow-sm shadow-red-200 transition-colors"><Hash size={12} />Create Group</button>
              </div>
              <button onClick={() => setMobileSideOpen(true)} className="sm:hidden mt-3 text-xs text-[#1B6FE8] font-semibold underline">← Back</button>
            </div>
          )}
        </section>
        </div>
      </div>

      {/* ── */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[200] pointer-events-auto" onClick={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }} />
          <div className="fixed z-[201] bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 min-w-[220px] max-h-[70vh] overflow-y-auto pointer-events-auto" style={{ top: ctxMenu.y, left: ctxMenu.x }} onClick={e => e.stopPropagation()}>
            <button onClick={() => handleReply(ctxMenu.msg)} className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-[#F5F6FA] transition-colors"><Reply size={13} className="text-gray-400" />Reply</button>
            {ctxMenu.msg.type === "text" && <button onClick={() => void copyText(ctxMenu.msg.text)} className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-[#F5F6FA] transition-colors"><Copy size={13} className="text-gray-400" />Copy text</button>}
            {ctxMenu.canEdit && (
              <button onClick={() => { setEditingMsg(ctxMenu.msg); setEditText(ctxMenu.msg.text); setCtxMenu(null); }} className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-[#F5F6FA] transition-colors"><Pencil size={13} className="text-gray-400" />Edit</button>
            )}
            <button onClick={() => void pinMessage(ctxMenu.msg)} className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-[#F5F6FA] transition-colors"><Pin size={13} className="text-gray-400" />Pin message</button>
            <div className="border-t border-gray-100 my-1 px-4 py-2">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1"><Eye size={12} />Seen by</p>
              {(ctxMenu.msg.readBy ?? []).length > 0 ? (
                <ul className="space-y-0.5">
                  {(ctxMenu.msg.readBy ?? []).map((name, i) => (
                    <li key={`${name}-${i}`} className="text-xs font-semibold text-gray-800">{name}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400">No one yet</p>
              )}
            </div>
            <div className="border-t border-gray-100 px-4 py-2">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1"><Smile size={12} />Reactions</p>
              {Object.entries(ctxMenu.msg.reactions ?? {}).filter(([, ids]) => ids.length > 0).length > 0 ? (
                <ul className="space-y-1">
                  {Object.entries(ctxMenu.msg.reactions ?? {}).filter(([, ids]) => ids.length > 0).map(([emoji, ids]) => (
                    <li key={emoji} className="text-xs text-gray-800">
                      <span className="mr-1">{emoji}</span>
                      <span className="font-semibold">
                        {ids.map((id) => groupMembers.find((m) => m.id === id)?.name || (me?.id === id ? "You" : "Someone")).join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400">No reactions</p>
              )}
            </div>
            <div className="border-t border-gray-100 my-1 px-1"><ReactionPicker onPick={emoji => void toggleReaction(ctxMenu.msg, emoji)} /></div>
            {!isStealthView && (
              <button
                type="button"
                onClick={() => {
                  setMsgSelectMode(true);
                  setSelectedMsgIds(p => p.includes(ctxMenu.msg.id) ? p : [...p, ctxMenu.msg.id]);
                  setCtxMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-900 hover:bg-[#F5F6FA]"
              >
                <Check size={13} className="text-gray-400" />Select messages
              </button>
            )}
            <div className="border-t border-gray-100 my-1" />
            {!isStealthView && (
              <button onClick={() => void deleteMsgs(selectedMsgIds.includes(ctxMenu.msg.id) && selectedMsgIds.length > 1 ? selectedMsgIds : [ctxMenu.msg.id], "for_me")} className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={13} />Delete for me{selectedMsgIds.includes(ctxMenu.msg.id) && selectedMsgIds.length > 1 ? ` (${selectedMsgIds.length})` : ""}</button>
            )}
            {!isStealthView && (
              <button onClick={() => void deleteMsgs(selectedMsgIds.includes(ctxMenu.msg.id) && selectedMsgIds.length > 1 ? selectedMsgIds : [ctxMenu.msg.id], "for_everyone")} className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 font-semibold hover:bg-red-50 transition-colors"><Trash2 size={13} />Delete for everyone{selectedMsgIds.includes(ctxMenu.msg.id) && selectedMsgIds.length > 1 ? ` (${selectedMsgIds.length})` : ""}</button>
            )}
          </div>
        </>
      )}

      {/* ── GROUP MODAL ── */}
      {portalReady && showGroupModal && createPortal(
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => { setShowGroupModal(false); setGroupName(""); setSelectedUsers([]); setGroupAdminIds([]); setWhoCanSend("everyone"); setUserSearch(""); }}>
          <div className="w-full sm:max-w-[440px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: "85vh" }} onClick={e => e.stopPropagation()}>
            <div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-xl bg-[#1B6FE8] text-white flex items-center justify-center"><Hash size={14} /></div><div><h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Create Group</h2><p className="text-[10px] text-gray-400">Name and invite members</p></div></div>
              <button onClick={() => { setShowGroupModal(false); setGroupName(""); setSelectedUsers([]); setGroupAdminIds([]); setWhoCanSend("everyone"); setUserSearch(""); }} className="w-7 h-7 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"><X size={13} /></button>
            </div>
            <div className="px-4 pt-3 pb-2 shrink-0 space-y-2.5 border-b border-gray-100">
              <input type="text" placeholder="Group name..." value={groupName} onChange={e => setGroupName(e.target.value)} className="w-full h-9 rounded-xl border-2 border-gray-200 bg-[#FAFAFA] px-3 text-sm outline-none focus:border-[#1B6FE8] focus:bg-white transition-colors" />
              <div className="relative"><Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="Search users..." value={userSearch} onChange={e => setUserSearch(e.target.value)} className="w-full h-8 rounded-xl bg-[#F3F4F6] dark:bg-crm-muted dark:text-gray-100 pl-7 pr-3 text-xs outline-none focus:bg-white dark:focus:bg-crm-input focus:ring-2 focus:ring-[#1B6FE8]/20 transition-all" /></div>
              {selectedUsers.length > 0 && <p className="text-[10px] text-gray-400">{selectedUsers.length} member{selectedUsers.length !== 1 ? "s" : ""} selected · you are an admin</p>}
              <label className="flex items-center justify-between gap-3 text-xs font-semibold text-gray-600">
                Who can send
                <select value={whoCanSend} onChange={(e) => setWhoCanSend(e.target.value === "admins" ? "admins" : "everyone")} className="h-8 rounded-lg border border-gray-200 px-2 text-xs">
                  <option value="everyone">Everyone</option>
                  <option value="admins">Admins only</option>
                </select>
              </label>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5">
              {loadingUsers ? (
                <div className="py-10 text-center"><Loader2 size={26} className="text-gray-300 mx-auto mb-2 animate-spin" /><p className="text-sm text-gray-400">Loading team members…</p></div>
              ) : filteredUsers.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-6">No users found</p>
              ) : filteredUsers.map(u => {
                const sel = selectedUsers.includes(u.id);
                return (
                  <div key={u.id} onClick={() => setSelectedUsers(p => sel ? p.filter(id => id !== u.id) : [...p, u.id])} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${sel ? "bg-red-50 dark:bg-red-500/20 ring-1 ring-[#1B6FE8]/20" : "hover:bg-gray-50 dark:hover:bg-white/10"}`}>
                    <Avatar name={u.name} src={u.profilePic} size="sm" online={u.isOnline} />
                    <div className="flex-1 min-w-0 text-left"><p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{u.name}</p><p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">{u.csrCode ?? u.role ?? u.email}</p></div>
                    {sel && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setGroupAdminIds((p) => p.includes(u.id) ? p.filter((id) => id !== u.id) : [...p, u.id]); }}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg ${groupAdminIds.includes(u.id) ? "bg-[#0F172A] text-white" : "bg-gray-100 text-gray-600"}`}
                      >
                        {groupAdminIds.includes(u.id) ? "Admin" : "Make admin"}
                      </button>
                    )}
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${sel ? "bg-[#1B6FE8] border-[#1B6FE8]" : "border-gray-300 dark:border-gray-500"}`}>{sel && <Check size={8} className="text-white" />}</div>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 shrink-0 flex gap-2">
              <button onClick={() => { setShowGroupModal(false); setGroupName(""); setSelectedUsers([]); setGroupAdminIds([]); setWhoCanSend("everyone"); setUserSearch(""); }} className="flex-1 h-9 rounded-xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors">Cancel</button>
              <button onClick={() => void createGroup()} disabled={!groupName.trim() || creatingGroup} className={`flex-1 h-9 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 transition-all ${groupName.trim() && !creatingGroup ? "bg-[#1B6FE8] text-white hover:bg-[#a30f27] shadow-sm" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
                {creatingGroup ? <><Loader2 size={13} className="animate-spin" />Creating...</> : <><Plus size={13} />Create</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── DM MODAL ── */}
      {portalReady && showDmModal && createPortal(
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => { setShowDmModal(false); setDmSearch(""); }}>
          <div className="w-full sm:max-w-[400px] bg-white dark:bg-crm-surface rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-transparent dark:border-crm-border" style={{ maxHeight: "80vh" }} onClick={e => e.stopPropagation()}>
            <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-crm-border-subtle shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-xl bg-[#1B6FE8]/10 text-[#1B6FE8] flex items-center justify-center"><User2 size={14} /></div><div><h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">New Direct Message</h2><p className="text-[10px] text-gray-500 dark:text-gray-400">Choose a team member</p></div></div>
              <button onClick={() => { setShowDmModal(false); setDmSearch(""); }} className="w-7 h-7 rounded-xl bg-gray-100 dark:bg-crm-muted hover:bg-gray-200 dark:hover:bg-white/10 flex items-center justify-center transition-colors"><X size={13} /></button>
            </div>
            <div className="px-3 py-2.5 border-b border-gray-100 dark:border-crm-border-subtle shrink-0">
              <div className="relative"><Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="Search users..." value={dmSearch} onChange={e => setDmSearch(e.target.value)} autoFocus className="w-full h-8 rounded-xl bg-[#F3F4F6] dark:bg-crm-muted dark:text-gray-100 pl-7 pr-3 text-xs outline-none focus:bg-white dark:focus:bg-crm-input focus:ring-2 focus:ring-[#1B6FE8]/20 transition-all" /></div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5">
              {loadingUsers ? (
                <div className="py-10 text-center"><Loader2 size={26} className="text-gray-300 mx-auto mb-2 animate-spin" /><p className="text-sm text-gray-400">Loading team members…</p></div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-10 text-center"><User2 size={26} className="text-gray-200 mx-auto mb-2" /><p className="text-sm text-gray-400">{dmSearch ? "No users found" : "No team members"}</p></div>
              ) : filteredUsers.map(u => (
                <button key={u.id} type="button" onClick={(e) => { e.stopPropagation(); guardPanelClose(); void startDm(u); }} disabled={dmLoadingUserId === u.id} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/10 transition-all group disabled:opacity-50">
                  <Avatar name={u.name} src={u.profilePic} size="sm" online={u.isOnline} />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-[#1B6FE8] dark:group-hover:text-red-300 transition-colors">{u.name}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{u.csrCode ?? u.role ?? u.email}</p>
                  </div>
                  {u.isOnline && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

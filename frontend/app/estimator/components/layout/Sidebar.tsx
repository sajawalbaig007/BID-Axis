"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, FolderKanban, LogOut, ChevronDown, MessageSquare, Bell, X,
} from "lucide-react";
import { logoutSession } from "@/lib/session";
import { getAuthMe, peekAuthMe, type AuthUser } from "@/lib/authMeCache";
import { ProfileAvatar, ProfileInfoRows } from "@/app/components/StaffProfileMenu";
import { roleDisplayLabel } from "@/lib/roleDisplay";
import { useChatUnreadBadge } from "@/lib/useChatUnreadBadge";
import { useChatEnabled } from "@/lib/useChatEnabled";
import { forceStopChatUnreadPolling } from "@/lib/chatUnreadStore";
import { forceStopChatStatusHeartbeat } from "@/lib/chatStatusHeartbeat";
import { forceDisconnectChatSocket } from "@/lib/chatSocket";
import ChatPanel from "@/app/components/chat/ChatPanel";
import ThemeToggle from "@/app/components/ThemeToggle";
import CapsuleChipNav from "@/app/components/CapsuleChipNav";
import EstimatorCheckInControl from "@/app/estimator/components/EstimatorCheckInControl";
import { useFixedHeaderHeight } from "@/lib/useFixedHeaderHeight";
import API from "@/lib/api";
import { playChatSound, primeChatSound } from "@/lib/chatSound";
import {
  fetchEstimatorNotifications,
  formatNotifTime,
  markEstimatorNotificationRead,
  type EstimatorInboxNotification,
} from "@/lib/technicalNotifications";

const BASE = "/estimator";
const ACCENT = "#7C3AED";

const navItems = [
  { title: "Dashboard", shortTitle: "Dashboard", href: `${BASE}`, icon: LayoutDashboard },
  { title: "My Projects", shortTitle: "Projects", href: `${BASE}/my-projects`, icon: FolderKanban },
];

type UserInfo = AuthUser;

export default function EstimatorSidebar() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(() => peekAuthMe());
  const [profileOpen, setProfileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<EstimatorInboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const totalUnread = useChatUnreadBadge();
  const chatEnabled = useChatEnabled();
  const profileRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useFixedHeaderHeight(headerRef);
  const bellRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef<number | null>(null);

  const closeChat = () => {
    forceStopChatUnreadPolling();
    setChatOpen(false);
  };

  const loadNotifications = useCallback(async () => {
    try {
      const data = await fetchEstimatorNotifications(40);
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unreadCount) || 0);
    } catch {
      /* keep previous */
    }
  }, []);

  useEffect(() => {
    primeChatSound();
  }, []);

  useEffect(() => {
    if (prevUnreadRef.current === null) {
      prevUnreadRef.current = unreadCount;
      return;
    }
    if (unreadCount > prevUnreadRef.current) playChatSound();
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  useEffect(() => () => {
    forceStopChatUnreadPolling();
    forceStopChatStatusHeartbeat();
    forceDisconnectChatSocket();
  }, []);

  useEffect(() => {
    const apply = (u: UserInfo | null) => { if (u) setUser(u); };
    apply(peekAuthMe());
    void getAuthMe(true).then(u => apply(u as UserInfo | null)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await loadNotifications();
    })();
    const poll = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadNotifications();
    }, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [loadNotifications]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logoutSession(() => API.post("/auth/logout", {}));
    window.location.href = "/login/estimator";
  };

  const openNotification = async (n: EstimatorInboxNotification) => {
    setBellOpen(false);
    if (!n.readAt) {
      try {
        await markEstimatorNotificationRead(n.id);
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        /* still navigate */
      }
    }
    router.push(`/estimator/my-projects?project=${encodeURIComponent(n.leadId)}`);
  };

  const handleDismiss = async (id: string, e: ReactMouseEvent) => {
    e.stopPropagation();
    const target = notifications.find((n) => n.id === id);
    try {
      await markEstimatorNotificationRead(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (target && !target.readAt) setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <header ref={headerRef} className="sticky top-0 z-30 bg-crm-surface border-b border-crm-border shadow-sm">
        <div className="h-[64px] px-3 sm:px-4 lg:px-5 flex items-center gap-3">
          <div className="flex-1 min-w-0 flex items-center">
            <Link href={BASE} prefetch={false} className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-[14px] bg-[#1B6FE8] flex items-center justify-center shadow-sm overflow-hidden p-1">
                <Image
                  src="/images/image.png"
                  alt="logo"
                  width={44}
                  height={44}
                  className="object-cover w-full h-full rounded-[10px] bg-white"
                />
              </div>
              <div className="hidden sm:block">
                <h2 className="text-[18px] md:text-[20px] font-extrabold leading-none text-crm-text tracking-tight">
                  CRM Dashboard
                </h2>
                <p className="text-[10px] md:text-[11px] font-semibold mt-1 tracking-wide uppercase" style={{ color: ACCENT }}>
                  {peekAuthMe()?.role === "bim" ? "BIM" : "Estimator"}
                </p>
              </div>
            </Link>
          </div>

          <div className="min-w-0 shrink">
            <CapsuleChipNav items={navItems} baseHref={BASE} accent={ACCENT} variant="inline" />
          </div>

          <div className="flex-1 min-w-0 flex items-center justify-end gap-2 sm:gap-3">
            <ThemeToggle />

            <div ref={bellRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setBellOpen((v) => !v);
                  setProfileOpen(false);
                  if (!bellOpen) void loadNotifications();
                }}
                className={`relative w-9 h-9 rounded-[13px] flex items-center justify-center transition-all ${
                  bellOpen
                    ? "text-white shadow-md"
                    : "bg-crm-nav-pill text-crm-text-muted hover:text-[#7C3AED]"
                }`}
                style={bellOpen ? { background: ACCENT } : undefined}
                title="Notifications"
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-[#1B6FE8] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 border-2 border-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute right-0 top-[calc(100%+10px)] w-[300px] sm:w-[340px] bg-crm-surface rounded-2xl border border-crm-border-subtle shadow-2xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-crm-border-subtle">
                    <div className="flex items-center gap-2">
                      <Bell size={14} style={{ color: ACCENT }} />
                      <span className="text-[13px] font-bold text-[#0F172A]">Notifications</span>
                    </div>
                    {unreadCount > 0 && (
                      <span className="text-[11px] bg-violet-100 text-violet-800 font-bold px-2 py-0.5 rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <div className="max-h-[360px] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-8 text-center">
                        <Bell size={24} className="text-gray-200 mx-auto mb-2" />
                        <p className="text-gray-400 text-[13px]">No notifications</p>
                        <p className="text-gray-300 text-[11px] mt-1">Assignments and messages from Technical appear here</p>
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => void openNotification(n)}
                          className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-violet-50/60 transition-colors ${
                            !n.readAt ? "bg-[#FAF5FF]" : ""
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-[#0F172A] truncate">
                              {n.projectCode ? `${n.projectCode} · ` : ""}{n.projectTitle || "Project"}
                            </p>
                            <p className="text-[11px] text-gray-600 mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-gray-400 mt-1">
                              {n.actorName ? `${n.actorName} · ` : ""}{formatNotifTime(n.createdAt)}
                            </p>
                          </div>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => void handleDismiss(n.id, e)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") void handleDismiss(n.id, e as unknown as ReactMouseEvent);
                            }}
                            className="w-6 h-6 rounded-lg text-gray-300 hover:text-[#7C3AED] hover:bg-violet-50 flex items-center justify-center shrink-0"
                            title="Dismiss"
                          >
                            <X size={12} />
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setChatOpen(v => !v)}
              className={`relative w-9 h-9 rounded-[13px] flex items-center justify-center transition-all shrink-0 ${
                chatOpen
                  ? "text-white shadow-md"
                  : "bg-crm-nav-pill text-crm-text-muted hover:text-[#7C3AED]"
              } ${!chatEnabled ? "opacity-50" : ""}`}
              style={chatOpen ? { background: ACCENT } : undefined}
              title={chatEnabled ? "Messages" : "Chat disabled by admin"}
            >
              <MessageSquare size={16} />
              {chatEnabled && totalUnread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-[#1B6FE8] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 border-2 border-white">
                  {totalUnread > 9 ? "9+" : totalUnread}
                </span>
              )}
            </button>

            <div ref={profileRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setProfileOpen(v => !v)}
                className="crm-profile-btn flex items-center gap-2 rounded-[14px] pl-1.5 pr-2.5 h-10 transition-colors"
              >
                <ProfileAvatar user={user} fallback="ES" />
                <div className="hidden lg:block text-left">
                  <p className="text-[12px] font-bold leading-none text-crm-text max-w-[90px] truncate">
                    {user?.name ?? "Estimator"}
                  </p>
                  <p className="text-[10px] text-crm-text-muted mt-1">
                    {user?.csrCode ?? roleDisplayLabel(user?.role)}
                  </p>
                </div>
                <ChevronDown
                  size={13}
                  className={`hidden sm:block text-crm-text-faint transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`}
                />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-[calc(100%+10px)] w-[240px] bg-crm-surface rounded-2xl border border-crm-border-subtle shadow-2xl z-50 overflow-hidden">
                  <div className="bg-gradient-to-br from-[#7C3AED] to-[#5B21B6] px-4 py-4 flex items-center gap-3">
                    <ProfileAvatar user={user} size="md" fallback="ES" />
                    <div className="min-w-0">
                      <p className="text-white text-[14px] font-bold truncate">{user?.name ?? "Estimator"}</p>
                      <p className="text-white/65 text-[11px] truncate mt-0.5">{user?.email ?? "—"}</p>
                    </div>
                  </div>
                  <ProfileInfoRows user={user} />
                  <div className="px-3 pb-3">
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      disabled={loggingOut}
                      className="w-full h-9 rounded-xl bg-violet-50 text-[#7C3AED] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-violet-100 transition-colors"
                    >
                      <LogOut size={13} />
                      {loggingOut ? "Logging out…" : "Logout"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-crm-border px-3 sm:px-4 lg:px-5 py-2">
          <EstimatorCheckInControl compact />
        </div>
      </header>

      {chatOpen && <ChatPanel onClose={closeChat} />}
    </>
  );
}

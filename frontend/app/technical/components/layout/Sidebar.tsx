"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, FolderKanban, BarChart3, Users,
  GitBranch, FileText, LogOut, ChevronDown, MessageSquare, Bell, CheckCheck, X,
} from "lucide-react";
import { logoutSession } from "@/lib/session";
import { getAuthMe, peekAuthMe, type AuthUser } from "@/lib/authMeCache";
import { useChatUnreadBadge } from "@/lib/useChatUnreadBadge";
import { useChatEnabled } from "@/lib/useChatEnabled";
import { forceStopChatUnreadPolling } from "@/lib/chatUnreadStore";
import { forceStopChatStatusHeartbeat } from "@/lib/chatStatusHeartbeat";
import { forceDisconnectChatSocket } from "@/lib/chatSocket";
import ChatPanel from "@/app/components/chat/ChatPanel";
import ThemeToggle from "@/app/components/ThemeToggle";
import StaffDayCheckBar from "@/app/components/StaffDayCheckBar";
import { useFixedHeaderHeight } from "@/lib/useFixedHeaderHeight";
import CapsuleChipNav from "@/app/components/CapsuleChipNav";
import API from "@/lib/api";
import { playChatSound, primeChatSound } from "@/lib/chatSound";
import { roleDisplayLabel } from "@/lib/roleDisplay";
import { ProfileAvatar, ProfileInfoRows } from "@/app/components/StaffProfileMenu";
import {
  dismissTechnicalNotification,
  fetchTechnicalNotifications,
  formatNotifTime,
  markAllTechnicalNotificationsRead,
  markTechnicalNotificationRead,
  sourceLabel,
  technicalProjectHref,
  technicalRevisionHref,
  type TechnicalInboxNotification,
} from "@/lib/technicalNotifications";

const BASE = "/technical";

const navItems = [
  { title: "Dashboard",       shortTitle: "Dashboard",       href: `${BASE}`,                 icon: LayoutDashboard },
  { title: "Active Projects", shortTitle: "Active Projects", href: `${BASE}/active-projects`, icon: FolderKanban    },
  { title: "KPI",             shortTitle: "KPI",             href: `${BASE}/kpi`,             icon: BarChart3       },
  { title: "Team",            shortTitle: "Team",            href: `${BASE}/team`,            icon: Users           },
  { title: "Revisions",       shortTitle: "Revisions",       href: `${BASE}/revisions`,       icon: GitBranch       },
  { title: "Reports",         shortTitle: "Reports",         href: `${BASE}/reports`,         icon: FileText        },
];

type UserInfo = AuthUser;

export default function TechnicalSidebar() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(() => peekAuthMe());
  const [profileOpen, setProfileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<TechnicalInboxNotification[]>([]);
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
      const data = await fetchTechnicalNotifications(40);
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
      // Yield so setState is not synchronous inside the effect body (react-hooks/set-state-in-effect).
      await Promise.resolve();
      if (cancelled) return;
      try {
        const data = await fetchTechnicalNotifications(40);
        if (cancelled) return;
        setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
        setUnreadCount(Number(data.unreadCount) || 0);
      } catch {
        /* keep previous */
      }
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
    const onDoc = (e: globalThis.MouseEvent) => {
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
    window.location.href = "/login/technical_manager";
  };

  const openNotification = async (n: TechnicalInboxNotification) => {
    setBellOpen(false);
    if (!n.readAt) {
      try {
        await markTechnicalNotificationRead(n.id);
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        /* still navigate */
      }
    }
    const href =
      n.title.toLowerCase().includes("revision")
        ? technicalRevisionHref(n.leadId)
        : technicalProjectHref(n.leadId);
    router.push(href);
  };

  const handleMarkAll = async () => {
    try {
      await markAllTechnicalNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
      );
      setUnreadCount(0);
    } catch {
      /* ignore */
    }
  };

  const handleDismiss = async (id: string, e: ReactMouseEvent) => {
    e.stopPropagation();
    const target = notifications.find((n) => n.id === id);
    try {
      await dismissTechnicalNotification(id);
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
              <p className="text-[10px] md:text-[11px] font-semibold text-[#1B6FE8] mt-1 tracking-wide uppercase">
                {user?.role === "bim_manager" ? "BIM Manager" : "Chief Estimator"}
              </p>
            </div>
          </Link>
          </div>

          <div className="min-w-0 shrink">
            <CapsuleChipNav items={navItems} baseHref={BASE} accent="#1B6FE8" variant="inline" />
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
                  ? "bg-[#1B6FE8] text-white shadow-md"
                  : "bg-crm-nav-pill text-crm-text-muted hover:bg-crm-brand-soft hover:text-[#1B6FE8]"
              }`}
              title="Project notifications"
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-[#1B6FE8] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 border-2 border-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {bellOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] w-[min(92vw,380px)] bg-crm-surface rounded-2xl border border-crm-border-subtle shadow-2xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-crm-border-subtle flex items-center justify-between gap-2 bg-gradient-to-r from-[#EAF2FE] to-white dark:from-[#1B6FE8]/20 dark:to-crm-surface">
                  <div>
                    <p className="text-sm font-bold text-[#0F172A] dark:text-crm-text">Notifications</p>
                    <p className="text-[10px] text-gray-500">
                      Admin & estimator project updates · {unreadCount} unread
                    </p>
                  </div>
                  {notifications.some((n) => !n.readAt) ? (
                    <button
                      type="button"
                      onClick={() => void handleMarkAll()}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1B6FE8] hover:underline shrink-0"
                    >
                      <CheckCheck size={13} />
                      Mark all
                    </button>
                  ) : null}
                </div>

                <div className="max-h-[min(70vh,420px)] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm text-gray-400 font-medium">
                      No notifications yet
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {notifications.map((n) => {
                        const unread = !n.readAt;
                        return (
                          <li key={n.id} className={unread ? "bg-[#FFF8F9]" : "bg-white"}>
                            <div className="flex items-start gap-1">
                              <button
                                type="button"
                                onClick={() => void openNotification(n)}
                                className="flex-1 min-w-0 text-left px-3.5 py-3 hover:bg-[#EAF2FE]/80 transition-colors"
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                      n.source === "estimator"
                                        ? "bg-sky-50 text-sky-700"
                                        : "bg-amber-50 text-amber-800"
                                    }`}
                                  >
                                    {sourceLabel(n.source, n.actorRole)}
                                  </span>
                                  {unread ? (
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#1B6FE8]" />
                                  ) : null}
                                  <span className="text-[10px] text-gray-400 ml-auto">
                                    {formatNotifTime(n.createdAt)}
                                  </span>
                                </div>
                                <p className="text-[13px] font-bold text-[#0F172A] mt-1 line-clamp-1">
                                  {n.title}
                                </p>
                                <p className="text-[11px] text-gray-600 mt-0.5 line-clamp-2">
                                  {n.message}
                                </p>
                                {(n.projectCode || n.projectTitle) && (
                                  <p className="text-[10px] font-semibold text-[#1B6FE8] mt-1 truncate">
                                    {n.projectCode ? `${n.projectCode} · ` : ""}
                                    {n.projectTitle || "Open project"}
                                  </p>
                                )}
                                {n.actorName ? (
                                  <p className="text-[10px] text-gray-400 mt-0.5">by {n.actorName}</p>
                                ) : null}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => void handleDismiss(n.id, e)}
                                className="mt-3 mr-2 w-7 h-7 rounded-lg text-gray-400 hover:text-[#1B6FE8] hover:bg-[#EAF2FE] inline-flex items-center justify-center shrink-0"
                                title="Dismiss"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
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
                ? "bg-[#1B6FE8] text-white shadow-md"
                : "bg-crm-nav-pill text-crm-text-muted hover:bg-crm-brand-soft hover:text-[#1B6FE8]"
            } ${!chatEnabled ? "opacity-50" : ""}`}
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
              <ProfileAvatar user={user} fallback="TM" />
              <div className="hidden lg:block text-left">
                <p className="text-[12px] font-bold leading-none text-crm-text max-w-[90px] truncate">
                  {user?.name ?? "TM"}
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
                <div className="bg-gradient-to-br from-[#1B6FE8] to-[#7A0B1E] px-4 py-4 flex items-center gap-3">
                  <ProfileAvatar user={user} size="md" fallback="TM" />
                  <div className="min-w-0">
                    <p className="text-white text-[14px] font-bold truncate">{user?.name ?? "Chief Estimator"}</p>
                    <p className="text-white/65 text-[11px] truncate mt-0.5">{user?.email ?? "—"}</p>
                  </div>
                </div>
                <ProfileInfoRows user={user} />
                <div className="px-3 pb-3">
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    disabled={loggingOut}
                    className="w-full h-9 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#FFE4E8] transition-colors"
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
          <StaffDayCheckBar compact defaultVisible showOvertime chiefDashboard />
        </div>
      </header>

      {chatOpen && <ChatPanel onClose={closeChat} />}
    </>
  );
}

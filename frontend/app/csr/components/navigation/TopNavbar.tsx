"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Link2,
  AlertTriangle,
  ThumbsDown,
  Users,
  FolderKanban,
  Trash2,
  MessageSquare,
  Bell,
  LogOut,
  ChevronDown,
  Phone,
  Clock,
  Activity,
  X,
} from "lucide-react";
import API from "@/lib/api";
import { estNowYmd, formatEstScheduleLabel } from "@/lib/estTime";
import { dismissNotification, getDismissedNotificationIds, clearDismissedNotifications } from "@/lib/notificationDismiss";
import { logoutSession } from "@/lib/session";
import { getAuthMe, peekAuthMe } from "@/lib/authMeCache";
import ChatPanel from "@/app/components/chat/ChatPanel";
import { useChatUnreadBadge } from "@/lib/useChatUnreadBadge";
import { useChatEnabled } from "@/lib/useChatEnabled";
import { forceStopChatUnreadPolling } from "@/lib/chatUnreadStore";
import { forceStopChatStatusHeartbeat } from "@/lib/chatStatusHeartbeat";
import { forceDisconnectChatSocket } from "@/lib/chatSocket";
import { requestNotificationPermission } from "../../hooks/useChatNotifications";
import {
  formatNotificationStatus,
  statusBadgeColor,
} from "../../constants/notificationRoutes";
import CsrActivityReportModal from "../shared/CsrActivityReportModal";
import CsrCheckInControl from "../CsrCheckInControl";
import { useFixedHeaderHeight } from "@/lib/useFixedHeaderHeight";
import CsrCheckInBanner from "../CsrCheckInBanner";
import ThemeToggle from "@/app/components/ThemeToggle";
import CapsuleChipNav from "@/app/components/CapsuleChipNav";

const BASE = "/csr";

const navItems = [
  { title: "Call Data",         shortTitle: "Call Data",         href: BASE,                       icon: Link2         },
  { title: "Potential Clients", shortTitle: "Potential Clients", href: `${BASE}/potential-clients`, icon: AlertTriangle },
  { title: "Not Interested",    shortTitle: "Not Interested",    href: `${BASE}/not-interested`,    icon: ThumbsDown    },
  { title: "Clients",           shortTitle: "Clients",           href: `${BASE}/clients`,           icon: Users         },
  { title: "Active Projects",   shortTitle: "Active Projects",   href: `${BASE}/active-projects`,   icon: FolderKanban  },
  { title: "Bin",               shortTitle: "Bin",               href: `${BASE}/bin`,               icon: Trash2        },
];

type UserInfo = {
  name: string;
  email: string;
  role: string;
  csrCode?:    string | null;
  cnic?:       string | null;
  profilePic?: string | null;
};

type ScheduledCall = {
  id: string;
  client: string;
  date: string;
  time: string;
  timezone: string;
  status: string;
};

type DailyStats = {
  total: number;
  byStatus: Record<string, number>;
  periodHours: number;
};

type NotificationsPayload = {
  scheduledCalls: ScheduledCall[];
  dailyStats: DailyStats;
};

const TODAY = estNowYmd();

let _cachedUser: UserInfo | null = null;
let _cachedNotifications: NotificationsPayload = {
  scheduledCalls: [],
  dailyStats: { total: 0, byStatus: {}, periodHours: 24 },
};
let _lastFetch = 0;
const NAV_CACHE_TTL = 60_000;

function labelDate(d: string) {
  return formatEstScheduleLabel(d);
}

export default function TopNavbar() {
  const router = useRouter();

  const [user, setUser] = useState<UserInfo | null>(
    () => (Date.now() - _lastFetch < NAV_CACHE_TTL && _cachedUser ? _cachedUser : peekAuthMe())
  );
  const [notifications, setNotifications] = useState<NotificationsPayload>(
    () => (Date.now() - _lastFetch < NAV_CACHE_TTL ? _cachedNotifications : {
      scheduledCalls: [],
      dailyStats: { total: 0, byStatus: {}, periodHours: 24 },
    })
  );
  const [profileOpen,  setProfileOpen]  = useState(false);
  const [bellOpen,     setBellOpen]     = useState(false);
  const [reportOpen,   setReportOpen]   = useState(false);
  const [chatOpen,     setChatOpen]     = useState(false);
  const totalUnread    = useChatUnreadBadge();
  const chatEnabled    = useChatEnabled();
  const [loggingOut,   setLoggingOut]   = useState(false);
  const [notifPerm,    setNotifPerm]    = useState<NotificationPermission | "unsupported">(
    () => typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );

  const profileRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useFixedHeaderHeight(headerRef);
  const bellRef = useRef<HTMLDivElement>(null);

  const closeChat = () => {
    forceStopChatUnreadPolling();
    setChatOpen(false);
  };

  useEffect(() => () => {
    forceStopChatUnreadPolling();
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem("csrChatOpen") === "1") {
      sessionStorage.removeItem("csrChatOpen");
      setChatOpen(true);
    }
  }, []);

  useEffect(() => {
    const load = () => {
      const cached = peekAuthMe() ?? (Date.now() - _lastFetch < NAV_CACHE_TTL ? _cachedUser : null);
      if (cached) {
        _cachedUser = cached;
        setUser(cached);
      }

      if (Date.now() - _lastFetch < NAV_CACHE_TTL && _cachedUser && _cachedNotifications) {
        setNotifications(_cachedNotifications);
        getAuthMe(false).then(u => {
          if (u) {
            _cachedUser = u;
            setUser(u);
          }
        }).catch(() => {});
        return;
      }

      Promise.all([
        getAuthMe(false),
        API.get("/csr/notifications").catch(() => null),
      ]).then(([userData, notifRes]) => {
        const dismissed = getDismissedNotificationIds();
        const allCalls = (notifRes?.data?.scheduledCalls ?? []) as ScheduledCall[];
        const payload: NotificationsPayload = {
          scheduledCalls: allCalls.filter(c => !dismissed.has(c.id)),
          dailyStats:     notifRes?.data?.dailyStats ?? { total: 0, byStatus: {}, periodHours: 24 },
        };

        if (userData) _cachedUser = userData;
        _cachedNotifications = payload;
        _lastFetch           = Date.now();
        if (userData) setUser(userData);
        setNotifications(payload);
      });
    };

    load();
    const onAuthUpdated = () => {
      _lastFetch = 0;
      const snap = peekAuthMe();
      if (snap) {
        _cachedUser = snap;
        setUser(snap);
      }
      getAuthMe(true).then(u => {
        if (u) {
          _cachedUser = u;
          setUser(u);
        }
      });
    };
    window.addEventListener("crm-auth-me-updated", onAuthUpdated);
    return () => window.removeEventListener("crm-auth-me-updated", onAuthUpdated);
  }, []);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }

      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };

    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);

    try {
      forceStopChatStatusHeartbeat();
      forceDisconnectChatSocket();
      await logoutSession(() => API.post("/auth/logout", {}));
      toast.success("Logged out successfully.");
      window.location.href = "/";
    } catch {
      toast.error("Logout failed.");
    } finally {
      setLoggingOut(false);
    }
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "CR";

  const todayCalls = notifications.scheduledCalls.filter((c) => c.date === TODAY);
  const { dailyStats, scheduledCalls: calls } = notifications;

  const hasNotifications = calls.length > 0 || dailyStats.total > 0;

  const handleClearNotifications = () => {
    clearDismissedNotifications();
    const empty: NotificationsPayload = {
      scheduledCalls: [],
      dailyStats: { total: 0, byStatus: {}, periodHours: 24 },
    };
    _cachedNotifications = empty;
    setNotifications(empty);
    toast.success("Notifications cleared.");
  };

  const dismissOneCall = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dismissNotification(id);
    setNotifications(prev => ({
      ...prev,
      scheduledCalls: prev.scheduledCalls.filter(c => c.id !== id),
    }));
    if (_cachedNotifications) {
      _cachedNotifications = {
        ..._cachedNotifications,
        scheduledCalls: _cachedNotifications.scheduledCalls.filter(c => c.id !== id),
      };
    }
  };

  const goToScheduledCall = (call: ScheduledCall) => {
    setBellOpen(false);
    const params = new URLSearchParams({ leadId: call.id, tab: "schedule" });
    router.push(`/csr/potential-clients?${params.toString()}`);
  };

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotifPerm(granted ? "granted" : Notification.permission);
    if (granted) toast.success("Notifications enabled!");
    else toast.error("Notifications blocked — enable in browser settings.");
  };

  return (
    <>
    <header ref={headerRef} className="sticky top-0 z-30 bg-crm-surface border-b border-crm-border shadow-sm">
      <div className="h-[64px] px-2 sm:px-3 lg:px-4 flex items-center gap-2 sm:gap-2.5 min-w-0">
        <Link href={BASE} prefetch={false} className="flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-[14px] bg-[#1B6FE8] flex items-center justify-center shadow-sm overflow-hidden p-1 shrink-0">
            <Image
              src="/images/image.png"
              alt="logo"
              width={44}
              height={44}
              className="object-cover w-full h-full rounded-[10px] bg-white"
            />
          </div>

          <div className="hidden lg:block min-w-0 max-w-[140px] xl:max-w-none">
            <h2 className="text-[16px] xl:text-[18px] font-extrabold leading-none text-crm-text tracking-tight truncate">
              CRM Dashboard
            </h2>
            <p className="text-[10px] font-semibold text-[#1B6FE8] mt-1 tracking-wide uppercase">
              BEM Solutions
            </p>
          </div>
        </Link>

        <div className="flex-1 min-w-0 overflow-hidden">
          <CapsuleChipNav items={navItems} baseHref={BASE} accent="#1B6FE8" variant="inline" />
        </div>

        <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0">
        <ThemeToggle />

        <button
          type="button"
          onClick={() => {
            setChatOpen(v => !v);
            setBellOpen(false);
            setProfileOpen(false);
          }}
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

        <div className="flex items-center gap-1.5 shrink-0">
          <div ref={bellRef} className="relative">
            <button
              onClick={() => {
                setBellOpen((v) => !v);
                setProfileOpen(false);
              }}
              className="relative w-10 h-10 rounded-[13px] flex items-center justify-center text-crm-text-muted hover:text-[#1B6FE8] hover:bg-crm-nav-pill transition-colors"
            >
              <Bell size={18} />

              {calls.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] bg-[#1B6FE8] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                  {calls.length > 9 ? "9+" : calls.length}
                </span>
              )}
            </button>

            {bellOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] w-[300px] sm:w-[340px] bg-crm-surface rounded-2xl border border-crm-border-subtle shadow-2xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-crm-border-subtle">
                  <div className="flex items-center gap-2">
                    <Bell size={14} className="text-[#1B6FE8]" />
                    <span className="text-[13px] font-bold text-crm-text">Notifications</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {todayCalls.length > 0 && (
                      <span className="text-[11px] bg-red-100 text-[#1B6FE8] dark:bg-red-500/25 dark:text-red-300 font-bold px-2 py-0.5 rounded-full">
                        {todayCalls.length} call{todayCalls.length > 1 ? "s" : ""} today
                      </span>
                    )}
                    {hasNotifications && (
                      <button
                        type="button"
                        onClick={handleClearNotifications}
                        className="text-[10px] font-semibold text-crm-text-muted hover:text-[#1B6FE8] transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3 bg-crm-muted border-b border-crm-border-subtle">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Activity size={13} className="text-[#1B6FE8] shrink-0" />
                      <p className="text-[12px] font-bold text-crm-text truncate">
                        Last {dailyStats.periodHours}h — {dailyStats.total} status change{dailyStats.total !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setBellOpen(false); setReportOpen(true); }}
                      className="text-[10px] font-bold text-[#1B6FE8] hover:text-[#9a0e25] whitespace-nowrap shrink-0 transition-colors"
                    >
                      View Report
                    </button>
                  </div>
                  {dailyStats.total === 0 ? (
                    <p className="text-[11px] text-crm-text-muted">No status updates in the last 24 hours.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(dailyStats.byStatus).map(([status, count]) => (
                        <span key={status} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadgeColor(status)}`}>
                          {formatNotificationStatus(status)} {count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {notifPerm !== "granted" && notifPerm !== "unsupported" && (
                  <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-500/15 border-b border-amber-100 dark:border-amber-500/20 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                      {notifPerm === "denied" ? "Notifications blocked in browser" : "Enable message notifications"}
                    </p>
                    {notifPerm !== "denied" && (
                      <button
                        onClick={handleEnableNotifications}
                        className="text-[10px] font-bold text-white bg-amber-500 hover:bg-amber-600 px-2.5 py-1 rounded-lg shrink-0 transition-colors"
                      >
                        Enable
                      </button>
                    )}
                  </div>
                )}

                <div className="max-h-[360px] overflow-y-auto bg-crm-surface">
                  <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold text-crm-text-muted uppercase tracking-wider">
                    Scheduled Calls
                  </p>
                  {calls.length === 0 ? (
                    <div className="py-8 text-center">
                      <Bell size={24} className="text-crm-text-faint mx-auto mb-2" />
                      <p className="text-crm-text-muted text-[13px]">No scheduled calls</p>
                      <p className="text-crm-text-faint text-[11px] mt-1">Mark leads as Important + set a time</p>
                    </div>
                  ) : (
                    calls.map((c) => {
                      const label = labelDate(c.date);
                      const isToday = label === "Today";
                      const tzShort = c.timezone
                        ? c.timezone.split("/").pop()?.replace("_", " ") ?? c.timezone
                        : "";

                      return (
                        <div
                          key={c.id}
                          className={`w-full flex items-center gap-3 px-4 py-3 ${
                            isToday ? "bg-[#FFFBF5]" : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => goToScheduledCall(c)}
                            className="flex flex-1 items-center gap-3 text-left min-w-0 hover:opacity-80"
                          >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isToday ? "bg-[#EAF2FE] text-[#1B6FE8]" : "bg-[#FFF7E6] text-[#B54708]"
                          }`}>
                            <Phone size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-crm-text truncate">{c.client}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Clock size={10} className="text-crm-text-faint shrink-0" />
                              <p className="text-[11px] text-crm-text-muted truncate">
                                {c.time}{tzShort ? ` · ${tzShort}` : ""}
                              </p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                            isToday ? "bg-[#EAF2FE] text-[#1B6FE8]" : "bg-[#FFF7E6] text-[#B54708]"
                          }`}>
                            {label}
                          </span>
                          </button>
                          <button
                            type="button"
                            onClick={e => dismissOneCall(c.id, e)}
                            className="w-6 h-6 rounded-lg text-gray-300 hover:text-[#1B6FE8] flex items-center justify-center shrink-0"
                            title="Dismiss"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div ref={profileRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setProfileOpen((v) => !v);
                setBellOpen(false);
              }}
              className="crm-profile-btn flex items-center gap-2 rounded-[14px] pl-1.5 pr-2.5 h-10 transition-colors"
            >
              <div className="w-8 h-8 rounded-[11px] bg-[#1B6FE8] text-white flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                {user?.profilePic
                  ? <Image src={user.profilePic} alt={user.name} width={32} height={32} className="w-full h-full object-cover" />
                  : initials
                }
              </div>

              <div className="hidden lg:block text-left">
                <p className="text-[12px] font-bold leading-none text-crm-text max-w-[90px] truncate">
                  {user?.name ?? "CSR User"}
                </p>
                <p className="text-[10px] text-crm-text-muted mt-1 max-w-[90px] truncate">
                  {user?.csrCode ?? "Customer Support"}
                </p>
              </div>

              <ChevronDown
                size={13}
                className={`hidden sm:block text-crm-text-faint transition-transform duration-200 ${
                  profileOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] w-[240px] bg-crm-surface rounded-2xl border border-crm-border-subtle shadow-2xl z-50 overflow-hidden">
                <div className="bg-gradient-to-br from-[#1B6FE8] to-[#7A0B1E] px-4 py-4 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/20 text-white flex items-center justify-center text-lg font-bold shrink-0 overflow-hidden">
                    {user?.profilePic
                      ? <Image src={user.profilePic} alt={user?.name ?? "Avatar"} width={48} height={48} className="w-full h-full object-cover" />
                      : initials
                    }
                  </div>

                  <div className="min-w-0">
                    <p className="text-white text-[14px] font-bold truncate">
                      {user?.name ?? "CSR User"}
                    </p>
                    <p className="text-white/65 text-[11px] truncate mt-0.5">
                      {user?.email ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="p-3 space-y-1.5">
                  <InfoRow label="Full Name" value={user?.name ?? "—"} />
                  <InfoRow label="Email" value={user?.email ?? "—"} small />
                  <InfoRow label="Role" value="Customer Support" />

                  {user?.csrCode && (
                    <InfoRow label="CSR Code" value={user.csrCode} mono />
                  )}
                  {user?.cnic && (
                    <InfoRow label="CNIC" value={user.cnic} mono />
                  )}
                </div>

                <div className="px-3 pb-3 space-y-1.5">
                  <Link href="/csr/settings" prefetch={false} onClick={() => setProfileOpen(false)}
                    className="w-full h-9 rounded-xl bg-[#F5F6FA] hover:bg-gray-100 text-gray-700 text-[12px] font-semibold flex items-center justify-center gap-2 transition-colors">
                    Security Settings
                  </Link>
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="w-full h-9 rounded-xl bg-[#EAF2FE] hover:bg-[#ffe4e9] text-[#1B6FE8] text-[12px] font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
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
      </div>
      <div className="border-t border-crm-border px-3 sm:px-4 lg:px-5 py-2">
        <CsrCheckInControl compact />
      </div>
    </header>

    <CsrCheckInBanner />

    {chatOpen && <ChatPanel onClose={closeChat} />}
    <CsrActivityReportModal open={reportOpen} onClose={() => setReportOpen(false)} />
    </>
  );
}

function InfoRow({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-2 bg-[#F5F6FA] rounded-xl">
      <span className="text-[10px] text-gray-400 font-medium shrink-0">
        {label}
      </span>

      <span
        className={`text-right truncate max-w-[140px] ${
          mono
            ? "font-mono text-[#1B6FE8] text-[11px] font-bold"
            : small
            ? "text-[10px] text-[#0F172A]"
            : "text-[11px] font-semibold text-[#0F172A]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
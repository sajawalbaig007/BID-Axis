"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  LayoutDashboard, Users, FileText, BarChart3,
  FolderKanban, Upload, Trash2, Settings,
  LogOut, ChevronDown, MessageSquare, Bell, Phone, Clock, X, StickyNote, Wallet,
} from "lucide-react";
import API from "@/lib/api";
import { estNowYmd, formatEstScheduleLabel } from "@/lib/estTime";
import { dismissNotification, getDismissedNotificationIds, clearDismissedNotifications } from "@/lib/notificationDismiss";
import { logoutSession } from "@/lib/session";
import { getAuthMe, peekAuthMe, type AuthUser } from "@/lib/authMeCache";
import { useChatUnreadBadge } from "@/lib/useChatUnreadBadge";
import { useFixedHeaderHeight } from "@/lib/useFixedHeaderHeight";
import { useChatEnabled } from "@/lib/useChatEnabled";
import { forceStopChatUnreadPolling } from "@/lib/chatUnreadStore";
import { forceStopChatStatusHeartbeat } from "@/lib/chatStatusHeartbeat";
import { forceDisconnectChatSocket } from "@/lib/chatSocket";
import AdminChatPanel from "./AdminChatPanel";
import ThemeToggle from "@/app/components/ThemeToggle";
import CapsuleChipNav from "@/app/components/CapsuleChipNav";
import { playChatSound, primeChatSound } from "@/lib/chatSound";
import { roleDisplayLabel } from "@/lib/roleDisplay";
import { ProfileAvatar, ProfileInfoRows } from "@/app/components/StaffProfileMenu";

const BASE = "/admin";

const navItems = [
  { title: "Dashboard",  shortTitle: "Dashboard",  href: BASE,                     icon: LayoutDashboard },
  { title: "Users",      shortTitle: "Users",      href: `${BASE}/users`,           icon: Users           },
  { title: "Leads",      shortTitle: "Leads",      href: `${BASE}/leads`,           icon: FileText        },
  { title: "Reports",    shortTitle: "Reports",    href: `${BASE}/reports`,         icon: BarChart3       },
  { title: "Project DB", shortTitle: "Project DB", href: `${BASE}/active-projects`, icon: FolderKanban    },
  { title: "Payments",   shortTitle: "Payments",   href: `${BASE}/payments`,       icon: Wallet          },
  { title: "Data Hub",   shortTitle: "Data Hub",   href: `${BASE}/uploads`,         icon: Upload          },
  { title: "Bin",        shortTitle: "Bin",        href: `${BASE}/bin`,             icon: Trash2          },
  { title: "Zoom Dialer", shortTitle: "Zoom",      href: `${BASE}/zoom-dialer`,    icon: Phone           },
  { title: "Settings",   shortTitle: "Settings",   href: `${BASE}/settings`,        icon: Settings        },
];

type UserInfo = AuthUser;

type ScheduledCall = {
  id: string;
  client: string;
  date: string;
  time: string;
  timezone: string;
  csrName: string;
  csrCode: string;
  csrId: string;
};

type TechnicalNoteAlert = {
  id: string;
  leadId: string;
  projectTitle: string;
  projectCode: string;
  preview: string;
  authorName?: string;
  createdAt: string;
};

const TODAY = estNowYmd();

let _cachedScheduledCalls: ScheduledCall[] = [];
let _cachedTechNotes: TechnicalNoteAlert[] = [];
let _lastNotifFetch = 0;
const NOTIF_CACHE_TTL = 20_000;

function filterDismissedCalls(all: ScheduledCall[]) {
  const dismissed = getDismissedNotificationIds();
  return all.filter(c => !dismissed.has(c.id));
}

function labelDate(d: string) {
  return formatEstScheduleLabel(d);
}

export default function DashboardSidebar() {
  const [user,        setUser]        = useState<UserInfo | null>(() => peekAuthMe());
  const [profileOpen, setProfileOpen] = useState(false);
  const [bellOpen,    setBellOpen]    = useState(false);
  const [loggingOut,  setLoggingOut]  = useState(false);
  const [chatOpen,    setChatOpen]    = useState(false);
  const [scheduledCalls, setScheduledCalls] = useState<ScheduledCall[]>(() =>
    Date.now() - _lastNotifFetch < NOTIF_CACHE_TTL ? filterDismissedCalls(_cachedScheduledCalls) : []
  );
  const [techNotes, setTechNotes] = useState<TechnicalNoteAlert[]>(() =>
    Date.now() - _lastNotifFetch < NOTIF_CACHE_TTL
      ? _cachedTechNotes.filter((n) => !getDismissedNotificationIds().has(n.id))
      : []
  );
  const totalUnread   = useChatUnreadBadge();
  const chatEnabled   = useChatEnabled();
  const profileRef    = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useFixedHeaderHeight(headerRef);
  const bellRef       = useRef<HTMLDivElement>(null);
  const seenTechNoteIdsRef = useRef<Set<string> | null>(null);

  const closeChat = () => {
    forceStopChatUnreadPolling();
    setChatOpen(false);
  };

  useEffect(() => () => {
    forceStopChatUnreadPolling();
  }, []);

  useEffect(() => {
    primeChatSound();
  }, []);

  const fetchNotifications = () => {
    API.get("/admin/notifications")
      .then(res => {
        const all = (res.data.scheduledCalls ?? []) as ScheduledCall[];
        const notes = (res.data.technicalNotes ?? []) as TechnicalNoteAlert[];
        _cachedScheduledCalls = all;
        _cachedTechNotes = notes;
        _lastNotifFetch = Date.now();
        const dismissed = getDismissedNotificationIds();
        const visibleNotes = notes.filter((n) => !dismissed.has(n.id));
        setScheduledCalls(filterDismissedCalls(all));
        setTechNotes(visibleNotes);

        if (seenTechNoteIdsRef.current === null) {
          seenTechNoteIdsRef.current = new Set(visibleNotes.map((n) => n.id));
        } else {
          let rang = false;
          for (const n of visibleNotes) {
            if (!seenTechNoteIdsRef.current.has(n.id)) {
              if (!rang) {
                playChatSound();
                rang = true;
              }
              seenTechNoteIdsRef.current.add(n.id);
            }
          }
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    const apply = (u: UserInfo | null) => { if (u) setUser(u); };
    /* Instant from cache, then soft refresh (no force) so pic/name don't flash */
    apply(peekAuthMe());
    getAuthMe(false).then(apply).catch(() => {});

    const onAuthUpdated = () => {
      apply(peekAuthMe());
      getAuthMe(true).then(apply).catch(() => {});
    };
    window.addEventListener("crm-auth-me-updated", onAuthUpdated);

    if (Date.now() - _lastNotifFetch < NOTIF_CACHE_TTL) {
      setScheduledCalls(filterDismissedCalls(_cachedScheduledCalls));
      setTechNotes(_cachedTechNotes.filter((n) => !getDismissedNotificationIds().has(n.id)));
      return () => window.removeEventListener("crm-auth-me-updated", onAuthUpdated);
    }
    fetchNotifications();
    const poll = window.setInterval(fetchNotifications, 25_000);
    return () => {
      window.removeEventListener("crm-auth-me-updated", onAuthUpdated);
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (!bellOpen) return;
    if (Date.now() - _lastNotifFetch < NOTIF_CACHE_TTL) return;
    fetchNotifications();
  }, [bellOpen]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
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
    } catch { toast.error("Logout failed."); }
    finally { setLoggingOut(false); }
  };

  const todayCalls = scheduledCalls.filter(c => c.date === TODAY);

  const handleClearNotifications = () => {
    clearDismissedNotifications();
    for (const n of techNotes) {
      void API.put(`/admin/lead/${n.leadId}/technical-notes/read`).catch(() => {});
      dismissNotification(n.id);
    }
    _cachedScheduledCalls = [];
    _cachedTechNotes = [];
    setScheduledCalls([]);
    setTechNotes([]);
    toast.success("Notifications cleared.");
  };

  const dismissOne = (id: string) => {
    dismissNotification(id);
    _cachedScheduledCalls = _cachedScheduledCalls.filter(c => c.id !== id);
    setScheduledCalls(prev => prev.filter(c => c.id !== id));
    const note = techNotes.find((n) => n.id === id);
    if (note) {
      void API.put(`/admin/lead/${note.leadId}/technical-notes/read`).catch(() => {});
      _cachedTechNotes = _cachedTechNotes.filter((n) => n.id !== id);
      setTechNotes((prev) => prev.filter((n) => n.id !== id));
    }
  };

  const hasNotifications = scheduledCalls.length > 0 || techNotes.length > 0;
  const bellCount = scheduledCalls.length + techNotes.length;

  return (
    <>
      <header ref={headerRef} className="fixed top-0 left-0 right-0 z-30 bg-crm-surface border-b border-crm-border shadow-sm">
        <div className="h-[64px] px-2 sm:px-3 lg:px-4 flex items-center gap-2">

          {/* Logo */}
          <div className="shrink-0 flex items-center max-w-[40%] sm:max-w-none">
          <Link href={BASE} prefetch={false} className="flex items-center gap-2 xl:gap-3 min-w-0">
            <div className="w-9 h-9 xl:w-11 xl:h-11 rounded-[14px] bg-[#1B6FE8] flex items-center justify-center shadow-sm overflow-hidden p-1 shrink-0">
              <Image
                src="/images/image.png" alt="logo"
                width={44} height={44}
                className="object-cover w-full h-full rounded-[10px] bg-white"
              />
            </div>
            <div className="hidden xl:block min-w-0">
              <h2 className="text-[18px] 2xl:text-[20px] font-extrabold leading-none text-crm-text tracking-tight">
                CRM Dashboard
              </h2>
              <p className="text-[10px] md:text-[11px] font-semibold text-[#1B6FE8] mt-1 tracking-wide uppercase">
                CEO Panel
              </p>
            </div>
          </Link>
          </div>

          <div className="flex-1 min-w-0 overflow-hidden px-1">
            <CapsuleChipNav items={navItems} baseHref={BASE} accent="#1B6FE8" variant="inline" />
          </div>

          <div className="shrink-0 flex items-center justify-end gap-1.5 sm:gap-2">
          <ThemeToggle />

          {/* Chat button */}
          <button
            onClick={() => { setChatOpen(v => !v); setBellOpen(false); }}
            className={`relative w-9 h-9 rounded-[13px] flex items-center justify-center transition-all shrink-0 ${chatOpen ? "bg-[#1B6FE8] text-white shadow-md" : "bg-crm-nav-pill text-crm-text-muted hover:bg-crm-brand-soft hover:text-[#1B6FE8]"} ${!chatEnabled ? "opacity-50" : ""}`}
            title={chatEnabled ? "Messages" : "Chat disabled by admin"}
          >
            <MessageSquare size={16} />
            {chatEnabled && totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-[#1B6FE8] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 border-2 border-white">
                {totalUnread > 9 ? "9+" : totalUnread}
              </span>
            )}
          </button>

          {/* Meeting notifications */}
          <div ref={bellRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => { setBellOpen(v => !v); setProfileOpen(false); }}
              className="relative w-9 h-9 rounded-[13px] flex items-center justify-center text-crm-text-muted hover:text-[#1B6FE8] hover:bg-crm-nav-pill transition-colors"
              title="Scheduled meetings"
            >
              <Bell size={17} />
              {bellCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-[#1B6FE8] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 border-2 border-white">
                  {bellCount > 9 ? "9+" : bellCount}
                </span>
              )}
            </button>

            {bellOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] w-[300px] sm:w-[340px] bg-crm-surface rounded-2xl border border-crm-border-subtle shadow-2xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-crm-border-subtle">
                  <div className="flex items-center gap-2">
                    <Bell size={14} className="text-[#1B6FE8]" />
                    <span className="text-[13px] font-bold text-[#0F172A]">Notifications</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {todayCalls.length > 0 && (
                      <span className="text-[11px] bg-[#EAF2FE] text-[#1B6FE8] font-bold px-2 py-0.5 rounded-full">
                        {todayCalls.length} today
                      </span>
                    )}
                    {techNotes.length > 0 && (
                      <span className="text-[11px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                        {techNotes.length} tech
                      </span>
                    )}
                    {hasNotifications && (
                      <button
                        type="button"
                        onClick={handleClearNotifications}
                        className="text-[10px] font-semibold text-gray-400 hover:text-[#1B6FE8] transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-[360px] overflow-y-auto">
                  {techNotes.length > 0 && (
                    <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Notes by Technical</p>
                    </div>
                  )}
                  {techNotes.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start gap-3 px-4 py-3 border-b border-gray-50 bg-[#FFFBF5]"
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-100 text-amber-800">
                        <StickyNote size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#0F172A] truncate">
                          {n.projectCode ? `${n.projectCode} · ` : ""}{n.projectTitle}
                        </p>
                        <p className="text-[11px] text-gray-600 mt-0.5 line-clamp-2">
                          {n.authorName ? `${n.authorName}: ` : ""}{n.preview}
                        </p>
                        <Link
                          href="/admin/active-projects"
                          onClick={() => {
                            dismissOne(n.id);
                            setBellOpen(false);
                          }}
                          className="inline-block mt-1 text-[11px] font-bold text-[#1B6FE8] hover:underline"
                        >
                          Open Project DB
                        </Link>
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissOne(n.id)}
                        className="w-6 h-6 rounded-lg text-gray-300 hover:text-[#1B6FE8] hover:bg-[#EAF2FE] flex items-center justify-center shrink-0"
                        title="Dismiss"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}

                  {scheduledCalls.length > 0 && (
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Meetings</p>
                    </div>
                  )}
                  {scheduledCalls.length === 0 && techNotes.length === 0 ? (
                    <div className="py-8 text-center">
                      <Bell size={24} className="text-gray-200 mx-auto mb-2" />
                      <p className="text-gray-400 text-[13px]">No notifications</p>
                      <p className="text-gray-300 text-[11px] mt-1">Meetings & technical notes appear here</p>
                    </div>
                  ) : (
                    scheduledCalls.map((c) => {
                      const label = labelDate(c.date);
                      const isToday = label === "Today";
                      const tzShort = c.timezone
                        ? c.timezone.split("/").pop()?.replace("_", " ") ?? c.timezone
                        : "";

                      return (
                        <div
                          key={c.id}
                          className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${
                            isToday ? "bg-[#FFFBF5]" : ""
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isToday ? "bg-[#EAF2FE] text-[#1B6FE8]" : "bg-[#FFF7E6] text-[#B54708]"
                          }`}>
                            <Phone size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-[#0F172A] truncate">{c.client}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Clock size={10} className="text-gray-400 shrink-0" />
                              <p className="text-[11px] text-gray-500 truncate">
                                {c.time}{tzShort ? ` · ${tzShort}` : ""}
                              </p>
                            </div>
                            {c.csrName && (
                              <p className="text-[10px] text-[#065F46] font-semibold mt-0.5 truncate">
                                {c.csrCode ? `${c.csrCode} · ` : ""}{c.csrName}
                              </p>
                            )}
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                            isToday ? "bg-[#EAF2FE] text-[#1B6FE8]" : "bg-[#FFF7E6] text-[#B54708]"
                          }`}>
                            {label}
                          </span>
                          <button
                            type="button"
                            onClick={() => dismissOne(c.id)}
                            className="w-6 h-6 rounded-lg text-gray-300 hover:text-[#1B6FE8] hover:bg-[#EAF2FE] flex items-center justify-center shrink-0"
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

          {/* Profile */}
          <div ref={profileRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => { setProfileOpen(v => !v); setBellOpen(false); }}
              className="crm-profile-btn flex items-center gap-2 rounded-[14px] pl-1.5 pr-2.5 h-10 transition-colors"
            >
              <ProfileAvatar user={user} fallback="AD" />
              <div className="hidden 2xl:block text-left">
                    <p className="text-[12px] font-bold leading-none text-crm-text max-w-[110px] truncate">
                  {user?.name ?? "CEO"}
                </p>
                <p className="text-[10px] text-crm-text-muted mt-1">{roleDisplayLabel(user?.role) || "CEO"}</p>
              </div>
              <ChevronDown
                size={13}
                className={`hidden sm:block text-crm-text-faint transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`}
              />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] w-[240px] bg-crm-surface rounded-2xl border border-crm-border-subtle shadow-2xl z-50 overflow-hidden">
                <div className="bg-gradient-to-br from-[#1B6FE8] to-[#7A0B1E] px-4 py-4 flex items-center gap-3">
                  <ProfileAvatar user={user} size="md" fallback="AD" />
                  <div className="min-w-0">
                    <p className="text-white text-[14px] font-bold truncate">{user?.name ?? "CEO"}</p>
                    <p className="text-white/65 text-[11px] truncate mt-0.5">{user?.email ?? "—"}</p>
                  </div>
                </div>
                <ProfileInfoRows user={user} />
                <div className="px-3 pb-3">
                  <button
                    onClick={handleLogout} disabled={loggingOut}
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
      </header>

      {/* Zero-width in-flow placeholder so flex siblings still get full width */}
      <div className="w-0 shrink-0" />

      {chatOpen && <AdminChatPanel onClose={closeChat} />}
    </>
  );
}

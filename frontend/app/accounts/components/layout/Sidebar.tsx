"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { LayoutDashboard, Scale, TrendingUp, Landmark, FileText, LogOut, MessageSquare, ChevronDown } from "lucide-react";
import { logoutSession } from "@/lib/session";
import API from "@/lib/api";
import ThemeToggle from "@/app/components/ThemeToggle";
import ChatPanel from "@/app/components/chat/ChatPanel";
import CapsuleChipNav from "@/app/components/CapsuleChipNav";
import StaffDayCheckBar from "@/app/components/StaffDayCheckBar";
import { useFixedHeaderHeight } from "@/lib/useFixedHeaderHeight";
import { getAuthMe, peekAuthMe, type AuthUser } from "@/lib/authMeCache";
import { ProfileAvatar, ProfileInfoRows } from "@/app/components/StaffProfileMenu";
import { roleDisplayLabel } from "@/lib/roleDisplay";
import { useChatUnreadBadge } from "@/lib/useChatUnreadBadge";
import { useChatEnabled } from "@/lib/useChatEnabled";
import { forceStopChatUnreadPolling } from "@/lib/chatUnreadStore";
import { forceStopChatStatusHeartbeat } from "@/lib/chatStatusHeartbeat";
import { forceDisconnectChatSocket } from "@/lib/chatSocket";

const BASE = "/accounts";

const navItems = [
  { title: "Dashboard", shortTitle: "Home", href: `${BASE}`, icon: LayoutDashboard },
  { title: "Balance Sheet", shortTitle: "Balance", href: `${BASE}/balance-sheet`, icon: Scale },
  { title: "Income Statement", shortTitle: "Income", href: `${BASE}/income-statement`, icon: TrendingUp },
  { title: "Cash Flow Statement", shortTitle: "Cash Flow", href: `${BASE}/cash-flow-statement`, icon: Landmark },
  { title: "Reports", shortTitle: "Reports", href: `${BASE}/reports`, icon: FileText },
];

type UserInfo = AuthUser;

export default function AccountsSidebar() {
  const [user, setUser] = useState<UserInfo | null>(() => peekAuthMe());
  const [profileOpen, setProfileOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useFixedHeaderHeight(headerRef);
  const totalUnread = useChatUnreadBadge();
  const chatEnabled = useChatEnabled();

  useEffect(() => {
    void getAuthMe(false).then(u => {
      if (u) setUser(u);
    });
    const onAuthUpdated = () => {
      const snap = peekAuthMe();
      if (snap) setUser(snap);
      void getAuthMe(true).then(u => {
        if (u) setUser(u);
      });
    };
    window.addEventListener("crm-auth-me-updated", onAuthUpdated);
    return () => window.removeEventListener("crm-auth-me-updated", onAuthUpdated);
  }, []);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  useEffect(() => () => {
    forceStopChatUnreadPolling();
  }, []);

  const handleLogout = async () => {
    forceStopChatUnreadPolling();
    forceStopChatStatusHeartbeat();
    forceDisconnectChatSocket();
    await logoutSession(() => API.post("/auth/logout", {}));
    window.location.href = "/login/accounts";
  };

  return (
    <>
    <header ref={headerRef} className="fixed top-0 left-0 right-0 z-30 bg-crm-surface/90 backdrop-blur-md border-b border-crm-border shadow-[0_1px_12px_-4px_rgba(15,23,42,0.08)]">
      <div className="h-[64px] px-2 sm:px-3 lg:px-4 flex items-center gap-1.5 sm:gap-2 lg:gap-3">
        <div className="flex-1 min-w-0 flex items-center">
        <Link href={BASE} prefetch={false} className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-[12px] sm:rounded-[14px] bg-[#1B6FE8] flex items-center justify-center shadow-sm shadow-[#1B6FE8]/20 overflow-hidden p-1 shrink-0">
            <Image
              src="/images/image.png"
              alt="logo"
              width={40}
              height={40}
              className="object-cover w-full h-full rounded-[8px] sm:rounded-[10px] bg-crm-surface"
            />
          </div>
          <div className="hidden lg:block min-w-0">
            <h2 className="text-[17px] xl:text-[19px] font-extrabold leading-none text-crm-text tracking-tight truncate">
              CRM Dashboard
            </h2>
            <p className="text-[10px] font-semibold text-[#1B6FE8] mt-0.5 tracking-wide uppercase">
              Accounts Panel
            </p>
          </div>
        </Link>
        </div>

        <div className="min-w-0 shrink px-0.5 sm:px-1">
          <CapsuleChipNav
            items={navItems}
            baseHref={BASE}
            accent="#1B6FE8"
            variant="inline"
          />
        </div>

        <div className="flex-1 min-w-0 flex items-center justify-end gap-1 sm:gap-1.5">
        <ThemeToggle />

        <button
          type="button"
          onClick={() => {
            setChatOpen(v => !v);
            setProfileOpen(false);
          }}
          className={`relative w-9 h-9 rounded-[12px] flex items-center justify-center transition-all shrink-0 ${
            chatOpen
              ? "bg-[#1B6FE8] text-white shadow-md"
              : "bg-crm-nav-pill text-crm-text-muted hover:bg-crm-brand-soft hover:text-[#1B6FE8]"
          } ${!chatEnabled ? "opacity-50" : ""}`}
          title={chatEnabled ? "Messages" : "Chat disabled by admin"}
        >
          <MessageSquare size={16} />
          {chatEnabled && totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-[#1B6FE8] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 border-2 border-crm-surface">
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}
        </button>

        <div ref={profileRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setProfileOpen(v => !v);
              setChatOpen(false);
            }}
            className="crm-profile-btn flex items-center gap-2 rounded-[14px] pl-1.5 pr-2.5 h-10 transition-colors"
          >
            <ProfileAvatar user={user} fallback="AC" />
            <div className="hidden xl:block text-left min-w-0 max-w-[120px]">
              <p className="text-[12px] font-bold leading-none text-crm-text truncate">
                {user?.name ?? "Accounts User"}
              </p>
              <p className="text-[10px] text-crm-text-muted mt-0.5 truncate">
                {roleDisplayLabel(user?.role) || "Accounts"}
              </p>
            </div>
            <ChevronDown size={13} className={`hidden xl:block text-crm-text-faint transition-transform shrink-0 ${profileOpen ? "rotate-180" : ""}`} />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-[calc(100%+10px)] w-[240px] bg-crm-surface rounded-2xl border border-crm-border-subtle shadow-2xl z-50 overflow-hidden">
              <div className="bg-gradient-to-br from-[#1B6FE8] to-[#7A0B1E] px-4 py-4 flex items-center gap-3">
                <ProfileAvatar user={user} size="md" fallback="AC" />
                <div className="min-w-0">
                  <p className="text-white text-[14px] font-bold truncate">
                    {user?.name ?? "Accounts User"}
                  </p>
                  <p className="text-white/65 text-[11px] truncate mt-0.5">
                    {user?.email ?? "—"}
                  </p>
                </div>
              </div>
              <ProfileInfoRows user={user} />
              <div className="px-3 pb-3">
                <button
                  onClick={() => void handleLogout()}
                  className="w-full h-9 rounded-xl bg-[#EAF2FE] dark:bg-[#1B6FE8]/15 hover:bg-[#ffe4e9] dark:hover:bg-[#1B6FE8]/25 text-[#1B6FE8] text-[12px] font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <LogOut size={13} />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
        </div>

      </div>
      <div className="border-t border-crm-border px-3 sm:px-4 lg:px-5 py-2 bg-crm-surface">
        <StaffDayCheckBar compact defaultVisible />
      </div>
    </header>
    {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
    </>
  );
}

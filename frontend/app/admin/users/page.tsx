"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import toast, { Toaster } from "react-hot-toast";
import {
  Search, Plus, Pencil, Trash2, Ban,
  MoreVertical, Eye, EyeOff, Wifi, WifiOff,
  Globe, RotateCcw, User2, Users, KeyRound, ChevronDown, MessageSquare, ArrowUpDown, LogOut,
} from "lucide-react";

import DashboardSidebar from "../components/layout/Sidebar";
import DashboardNavbar  from "../components/layout/Navbar";
import API, { getApiBase } from "@/lib/api";
import { formatEstDate, formatEstDateTime } from "@/lib/estTime";
import { invalidateAuthMeCache } from "@/lib/authMeCache";
import { logoutSession } from "@/lib/session";
import RequiredMark, { ReqLabel } from "@/app/components/form/RequiredMark";
import { PdfPreview } from "@/app/components/chat/MessageExtras";
import CapsuleTabs from "@/app/components/CapsuleTabs";
import AllEmployeesPanel from "../components/users/AllEmployeesPanel";
import CompanyPortalAccessCard from "./CompanyPortalAccessCard";
import {
  ALL_CSR_RESET_SCOPE_IDS,
  CSR_RESET_GROUPS,
  scopeLabel,
  type CsrResetScopeId,
} from "@/lib/csrResetPages";
import { broadcastAdminSummaryStale } from "@/lib/adminSummaryCache";

/** Build a viewable CNIC preview URL (Cloudinary raw PDFs blank in iframes). */
function cnicDocumentPreview(url: string): { kind: "image" | "pdf"; src: string } {
  const u = url.trim();
  if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(u)) {
    return { kind: "image", src: u };
  }
  // New uploads: image/pdf — first page thumbnail
  if (u.includes("/image/upload/") && /\.pdf(\?|$)/i.test(u)) {
    return { kind: "image", src: u.replace("/upload/", "/upload/f_jpg,pg_1,q_auto,w_900/") };
  }
  // Legacy raw PDF — Google Docs embedded viewer
  if (u.includes("/raw/upload/") || /\.pdf(\?|$)/i.test(u)) {
    return {
      kind: "pdf",
      src: `https://docs.google.com/gview?url=${encodeURIComponent(u)}&embedded=true`,
    };
  }
  return { kind: "pdf", src: u };
}

type UserRole = "CSR" | "CEO" | "Admin" | "Chief Estimator" | "Accounts" | "Estimator" | "BIM Manager" | "BIM";

type PortalCompany = "BEM" | "GPS";
type CompanyFilter = PortalCompany | "EMPLOYEES";

/**
 * Single source for Admin → Users activity chart / role tabs / create-user options.
 * Add a new dashboard here → User Activity Overview picks it up automatically.
 */
type PortalDashboard = {
  role: UserRole;
  company: PortalCompany;
  /** Short label on the activity chart X-axis */
  shortLabel: string;
  /** Footer / stats label */
  onlineLabel: string;
  /** Create-user dropdown label */
  formLabel: string;
};

const PORTAL_DASHBOARDS: PortalDashboard[] = [
  { role: "CSR", company: "BEM", shortLabel: "CSR", onlineLabel: "CSR Online", formLabel: "CSR (Customer Support)" },
  { role: "Admin", company: "BEM", shortLabel: "Admin", onlineLabel: "Admins Online", formLabel: "Admin" },
  { role: "Accounts", company: "BEM", shortLabel: "Accounts", onlineLabel: "Accounts Online", formLabel: "Accounts" },
  { role: "CEO", company: "BEM", shortLabel: "CEO", onlineLabel: "CEO Online", formLabel: "CEO" },
  { role: "Chief Estimator", company: "GPS", shortLabel: "Chief Est.", onlineLabel: "Chief Estimator Online", formLabel: "Chief Estimator" },
  { role: "Estimator", company: "GPS", shortLabel: "Estimator", onlineLabel: "Estimators Online", formLabel: "Estimator" },
  { role: "BIM Manager", company: "GPS", shortLabel: "BIM Mgr", onlineLabel: "BIM Manager Online", formLabel: "BIM Manager" },
  { role: "BIM", company: "GPS", shortLabel: "BIM", onlineLabel: "BIM Online", formLabel: "BIM" },
];

const BEM_ROLES: UserRole[] = PORTAL_DASHBOARDS.filter((d) => d.company === "BEM").map((d) => d.role);
const GPS_ROLES: UserRole[] = PORTAL_DASHBOARDS.filter((d) => d.company === "GPS").map((d) => d.role);

function rolesForCompany(company: PortalCompany): UserRole[] {
  return company === "GPS" ? GPS_ROLES : BEM_ROLES;
}

function companyForRole(role: UserRole): PortalCompany {
  return GPS_ROLES.includes(role) ? "GPS" : "BEM";
}

function dashboardsForCompany(company: PortalCompany, presentRoles: UserRole[]): PortalDashboard[] {
  const known = PORTAL_DASHBOARDS.filter((d) => d.company === company);
  const knownSet = new Set(known.map((d) => d.role));
  const extras = presentRoles
    .filter((r) => !knownSet.has(r) && companyForRole(r) === company)
    .map((role) => ({
      role,
      company,
      shortLabel: role.length > 10 ? role.slice(0, 8) + "…" : role,
      onlineLabel: `${role} Online`,
      formLabel: role,
    }));
  return [...known, ...extras];
}

type User = {
  id: string; name: string; email: string; password: string;
  status: "Active" | "Inactive"; role: UserRole;
  csrCode:    string | null;
  employeeCode: string | null;
  fatherName: string | null;
  currentAddress: string | null;
  contactNo: string | null;
  cnic:       string | null;
  cnicPdfUrl: string | null;
  profilePic: string | null;
  isOnline: boolean; lastActive: string | null;
  browser:     string | null;
  tabId:       string | null;
  openedAt:    string | null;
  tabVisible:  boolean | null;
  hiddenAt:    string | null;
  allowedIps: string[];
  allowedMacAddress: string | null;
  temporaryAccessIp: string | null;
  temporaryAccessMac: string | null;
  temporaryAccessUntil: string | null;
  chatEnabled: boolean;
  chatAllowedUserIds: string[];
  chatVisibleToUserIds: string[];
  createdAt: string | null;
};

const EMPTY_USER_FORM = {
  name: "",
  email: "",
  password: "",
  company: "BEM" as PortalCompany,
  role: "CSR" as UserRole,
  employeeCode: "",
  fatherName: "",
  currentAddress: "",
  contactNo: "",
  csrCode: "",
  cnic: "",
  cnicPdfUrl: "",
  profilePic: "",
  allowedIps: [""] as string[],
  allowedMacAddress: "",
  temporaryAccessIp: "",
  temporaryAccessMac: "",
  temporaryAccessHours: "9",
};

const BEM_ROLE_OPTIONS: { value: UserRole; label: string }[] = PORTAL_DASHBOARDS
  .filter((d) => d.company === "BEM")
  .map((d) => ({ value: d.role, label: d.formLabel }));

const GPS_ROLE_OPTIONS: { value: UserRole; label: string }[] = PORTAL_DASHBOARDS
  .filter((d) => d.company === "GPS")
  .map((d) => ({ value: d.role, label: d.formLabel }));

function defaultRoleForCompany(company: PortalCompany): UserRole {
  return company === "GPS" ? "Chief Estimator" : "CSR";
}

function roleOptionsForCompany(company: PortalCompany) {
  return company === "GPS" ? GPS_ROLE_OPTIONS : BEM_ROLE_OPTIONS;
}

type UserSortKey =
  | "name_asc"
  | "name_desc"
  | "created_desc"
  | "created_asc"
  | "last_active_desc"
  | "last_active_asc"
  | "role_asc"
  | "status_asc"
  | "online_first";

const USER_SORT_OPTIONS: { value: UserSortKey; label: string }[] = [
  { value: "name_asc", label: "Name (A → Z)" },
  { value: "name_desc", label: "Name (Z → A)" },
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "last_active_desc", label: "Last active (recent)" },
  { value: "last_active_asc", label: "Last active (oldest)" },
  { value: "role_asc", label: "Role (A → Z)" },
  { value: "status_asc", label: "Status (Active first)" },
  { value: "online_first", label: "Online first" },
];

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareDateAsc(a: string | null | undefined, b: string | null | undefined) {
  const ta = a ? new Date(a).getTime() : Number.POSITIVE_INFINITY;
  const tb = b ? new Date(b).getTime() : Number.POSITIVE_INFINITY;
  return ta - tb;
}

function compareDateDesc(a: string | null | undefined, b: string | null | undefined) {
  const ta = a ? new Date(a).getTime() : Number.NEGATIVE_INFINITY;
  const tb = b ? new Date(b).getTime() : Number.NEGATIVE_INFINITY;
  return tb - ta;
}

function sortUsersList(list: User[], sortKey: UserSortKey): User[] {
  const sorted = [...list];
  sorted.sort((a, b) => {
    switch (sortKey) {
      case "name_asc":
        return compareText(a.name, b.name) || compareText(a.email, b.email);
      case "name_desc":
        return compareText(b.name, a.name) || compareText(b.email, a.email);
      case "created_asc":
        return compareDateAsc(a.createdAt, b.createdAt) || compareText(a.name, b.name);
      case "created_desc":
        return compareDateDesc(a.createdAt, b.createdAt) || compareText(a.name, b.name);
      case "last_active_asc":
        return compareDateAsc(a.lastActive, b.lastActive) || compareText(a.name, b.name);
      case "last_active_desc":
        return compareDateDesc(a.lastActive, b.lastActive) || compareText(a.name, b.name);
      case "role_asc":
        return compareText(a.role, b.role) || compareText(a.name, b.name);
      case "status_asc":
        return compareText(a.status, b.status) || compareText(a.name, b.name);
      case "online_first":
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        return compareText(a.name, b.name);
      default:
        return 0;
    }
  });
  return sorted;
}

type AccessHistoryRow = {
  id: string;
  event: string;
  ip: string | null;
  deviceId: string | null;
  browser: string | null;
  createdAt: string;
};

const apiBase = () => getApiBase();

const roleColor = (role: UserRole) => {
  if (role === "CEO") return "bg-blue-100 text-blue-600";
  if (role === "Admin") return "bg-violet-100 text-violet-600";
  if (role === "Chief Estimator") return "bg-amber-100 text-amber-700";
  if (role === "Accounts") return "bg-cyan-100 text-cyan-700";
  if (role === "Estimator") return "bg-purple-100 text-purple-700";
  if (role === "BIM Manager") return "bg-blue-100 text-blue-800";
  if (role === "BIM") return "bg-sky-100 text-sky-800";
  return "bg-emerald-100 text-emerald-600";
};

const formatLastActive = (iso: string | null): string => {
  if (!iso) return "Never";
  const diff  = Date.now() - new Date(iso).getTime();
  const secs  = Math.floor(diff / 1000);
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (secs  < 30) return "Just now";
  if (mins  < 1)  return `${secs}s ago`;
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return formatEstDate(iso);
};

const formatOpenedAt = (iso: string | null): string => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  if (mins < 1)  return "just opened";
  if (mins < 60) return `${mins}m ago`;
  return `${hrs}h ago`;
};


/* Browser badge */
function BrowserBadge({ browser }: { browser: string | null }) {
  if (!browser) return null;
  const colors: Record<string, string> = {
    Chrome:  "bg-yellow-50 text-yellow-700 border-yellow-200",
    Firefox: "bg-orange-50 text-orange-700 border-orange-200",
    Safari:  "bg-blue-50 text-blue-700 border-blue-200",
    Edge:    "bg-indigo-50 text-indigo-700 border-indigo-200",
    Opera:   "bg-red-50 text-red-700 border-red-200",
  };
  const cls = colors[browser] ?? "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${cls}`}>
      <Globe size={10}/>{browser}
    </span>
  );
}

/* ── Render elapsed seconds as human string ── */
function formatElapsed(totalSecs: number): string {
  if (totalSecs < 60)  return `${totalSecs}s`;
  const mins = Math.floor(totalSecs / 60);
  const s    = totalSecs % 60;
  if (mins < 60) return s > 0 ? `${mins}m ${s}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const m   = mins % 60;
  return m > 0 ? `${hrs}h ${m}m` : `${hrs}h`;
}

/* ── Away timer badge — live counting ── */
function AwayTimer({ hiddenAt, browser, now }: { hiddenAt: string | null; browser: string | null; now: number }) {
  const secs = hiddenAt ? Math.floor((now - new Date(hiddenAt).getTime()) / 1000) : 0;
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-[#FFF7E6] text-[#B45309]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]"/>
        Away · {formatElapsed(secs)}
      </span>
      <div className="flex items-center gap-1">
        {browser && <BrowserBadge browser={browser}/>}
        <span className="text-[10px] text-gray-400">not on dashboard</span>
      </div>
    </div>
  );
}

/* ── Tab status — On Dashboard or Away ── */
function TabStatusBadge({ tabVisible, hiddenAt, openedAt, browser, now }: {
  tabVisible: boolean | null; hiddenAt: string | null;
  openedAt: string | null; browser: string | null; now: number;
}) {
  if (tabVisible === null) return <span className="text-gray-300 text-xs">—</span>;

  if (tabVisible) {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-[#ECFDF3] text-[#027A48]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#12B76A] animate-pulse"/>
          On Dashboard
        </span>
        <div className="flex items-center gap-1 flex-wrap">
          {browser && <BrowserBadge browser={browser}/>}
          {openedAt && <span className="text-[10px] text-gray-400">· {formatOpenedAt(openedAt)}</span>}
        </div>
      </div>
    );
  }

  return <AwayTimer hiddenAt={hiddenAt} browser={browser} now={now}/>;
}

/* ── Online/Offline badge — 5min offline → Inactive label ── */
function OnlineBadge({ isOnline, lastActive, now }: { isOnline: boolean; lastActive: string | null; now: number }) {
  const offlineSecs = !isOnline && lastActive ? Math.floor((now - new Date(lastActive).getTime()) / 1000) : 0;
  const isLongOffline = !isOnline && offlineSecs > 5 * 60; // > 5 minutes

  if (isOnline) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-[#ECFDF3] text-[#027A48]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#12B76A] animate-pulse"/>
        Online
      </div>
    );
  }

  if (isLongOffline) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-red-100 text-red-600">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400"/>
          Inactive
        </div>
        <span className="text-[10px] text-gray-400 pl-1">offline {formatElapsed(offlineSecs)}</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-[#F4F4F5] text-[#52525B]">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400"/>
      {formatLastActive(lastActive)}
    </div>
  );
}

const PAGE_SIZE = 30;

export default function UsersPage() {
  const [now, setNow] = useState(() => Date.now());

  const [users,        setUsers]        = useState<User[]>([]);
  const [search,       setSearch]       = useState("");
  const [page,         setPage]         = useState(1);
  const [roleFilter,   setRoleFilter]   = useState<"All" | UserRole>("All");
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>("BEM");
  const [sortKey,      setSortKey]      = useState<UserSortKey>("name_asc");
  const [showModal,    setShowModal]    = useState(false);
  const [editingUser,  setEditingUser]  = useState<User | null>(null);
  const [detailUser,   setDetailUser]   = useState<User | null>(null);
  const [openMenu,     setOpenMenu]     = useState<{ id: string; top: number; right: number } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [pwUser, setPwUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [accessHistory, setAccessHistory] = useState<AccessHistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editIpOpen, setEditIpOpen] = useState(false);
  const [detailIpOpen, setDetailIpOpen] = useState(false);
  const [chatUser, setChatUser] = useState<User | null>(null);
  const [chatEnabledForm, setChatEnabledForm] = useState(true);
  const [chatRestrictMode, setChatRestrictMode] = useState<"all" | "selected">("all");
  const [chatAllowedIds, setChatAllowedIds] = useState<string[]>([]);
  const [chatSearch, setChatSearch] = useState("");
  const [chatVisibilityMode, setChatVisibilityMode] = useState<"all" | "selected">("all");
  const [chatVisibleToIds, setChatVisibleToIds] = useState<string[]>([]);
  const [chatVisibilitySearch, setChatVisibilitySearch] = useState("");
  const [savingChat, setSavingChat] = useState(false);

  const [form, setForm] = useState({ ...EMPTY_USER_FORM });
  const [uploadingPic, setUploadingPic] = useState(false);
  const [uploadingCnic, setUploadingCnic] = useState(false);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetScopes, setResetScopes] = useState<CsrResetScopeId[]>([...ALL_CSR_RESET_SCOPE_IDS]);
  const [resettingCsr, setResettingCsr] = useState(false);

  /* Single 1s tick — replaces per-row useLiveSeconds intervals */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchUsers = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res  = await fetch(`${apiBase()}/users`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) { if (!silent) toast.error("Failed to fetch users."); return; }

      const formatted: User[] = (Array.isArray(data) ? data : []).map((u: {
        id: string; name: string; email: string; role: string; csrCode?: string;
        employeeCode?: string; fatherName?: string; currentAddress?: string; contactNo?: string;
        cnic?: string; cnicPdfUrl?: string; profilePic?: string;
        isActive?: boolean; isOnline?: boolean; lastActive?: string;
        browser?: string; tabId?: string; openedAt?: string;
        tabVisible?: boolean; hiddenAt?: string;
        allowedIps?: string[];
        allowedMacAddress?: string | null;
        temporaryAccessIp?: string | null;
        temporaryAccessMac?: string | null;
        temporaryAccessUntil?: string | null;
        chatEnabled?: boolean;
        chatAllowedUserIds?: string[];
        chatVisibleToUserIds?: string[];
        createdAt?: string | null;
      }) => ({
        id:         u.id,
        name:       u.name,
        email:      u.email,
        role:       u.role === "csr" ? "CSR"
                  : u.role === "manager" ? "Admin"
                  : u.role === "technical_manager" ? "Chief Estimator"
                  : u.role === "accounts" ? "Accounts"
                  : u.role === "estimator" ? "Estimator"
                  : u.role === "bim_manager" ? "BIM Manager"
                  : u.role === "bim" ? "BIM"
                  : "CEO",
        csrCode:    u.csrCode    ?? null,
        employeeCode: u.employeeCode ?? null,
        fatherName: u.fatherName ?? null,
        currentAddress: u.currentAddress ?? null,
        contactNo: u.contactNo ?? null,
        cnic:       u.cnic       ?? null,
        cnicPdfUrl: u.cnicPdfUrl ?? null,
        profilePic: u.profilePic ?? null,
        status:     u.isActive === false ? "Inactive" : "Active",
        isOnline:   u.isOnline   ?? false,
        lastActive: u.lastActive ?? null,
        password:   "",
        browser:    u.browser    ?? null,
        tabId:      u.tabId      ?? null,
        openedAt:   u.openedAt   ?? null,
        tabVisible: u.tabVisible ?? null,
        hiddenAt:   u.hiddenAt   ?? null,
        allowedIps: Array.isArray(u.allowedIps) && u.allowedIps.length > 0 ? u.allowedIps : [""],
        allowedMacAddress: u.allowedMacAddress ?? null,
        temporaryAccessIp: u.temporaryAccessIp ?? null,
        temporaryAccessMac: u.temporaryAccessMac ?? null,
        temporaryAccessUntil: u.temporaryAccessUntil ?? null,
        chatEnabled: u.chatEnabled !== false,
        chatAllowedUserIds: Array.isArray(u.chatAllowedUserIds) ? u.chatAllowedUserIds : [],
        chatVisibleToUserIds: Array.isArray(u.chatVisibleToUserIds) ? u.chatVisibleToUserIds : [],
        createdAt: u.createdAt ?? null,
      }));

      setUsers(formatted);
    } catch {
      if (!silent) toast.error("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => { await fetchUsers(); };
    load();
    // Auto-refresh every 20s for live presence tracking
    const interval = setInterval(() => { void fetchUsers(true); }, 20_000);
    return () => clearInterval(interval);
  }, [fetchUsers]);

  useEffect(() => {
    const target = detailUser ?? editingUser;
    if (!target) {
      setAccessHistory([]);
      return;
    }
    setLoadingHistory(true);
    API.get(`/admin/access-history/${target.id}?limit=30`)
      .then(res => setAccessHistory(res.data.history ?? []))
      .catch(() => setAccessHistory([]))
      .finally(() => setLoadingHistory(false));
  }, [detailUser, editingUser]);

  useEffect(() => {
    if (!detailUser) setDetailIpOpen(false);
  }, [detailUser]);

  const totalUsers   = users.length;
  const onlineNow    = users.filter(u => u.isOnline).length;
  const countByRole = useMemo(() => {
    const base: Record<string, number> = { All: users.length };
    for (const u of users) {
      base[u.role] = (base[u.role] ?? 0) + 1;
    }
    for (const d of PORTAL_DASHBOARDS) {
      if (base[d.role] === undefined) base[d.role] = 0;
    }
    return base as Record<UserRole | "All", number> & Record<string, number>;
  }, [users]);

  const onlineByRole = useMemo(() => {
    const map: Record<string, number> = {};
    for (const u of users) {
      if (!u.isOnline) continue;
      map[u.role] = (map[u.role] ?? 0) + 1;
    }
    return map;
  }, [users]);

  const portalCompany: PortalCompany = companyFilter === "GPS" ? "GPS" : "BEM";
  const isEmployeesView = companyFilter === "EMPLOYEES";

  const companyRoles = useMemo(() => {
    const base = rolesForCompany(portalCompany);
    const extras = [...new Set(users.map((u) => u.role))].filter(
      (r) => !base.includes(r) && companyForRole(r) === portalCompany,
    );
    return [...base, ...extras];
  }, [portalCompany, users]);
  const activityDashboards = useMemo(
    () => dashboardsForCompany(portalCompany, [...new Set(users.map((u) => u.role))]),
    [portalCompany, users],
  );
  const activityChartData = useMemo(
    () =>
      activityDashboards.map((d) => {
        const total = countByRole[d.role] ?? 0;
        const online = onlineByRole[d.role] ?? 0;
        return {
          name: d.shortLabel,
          online,
          offline: Math.max(0, total - online),
        };
      }),
    [activityDashboards, countByRole, onlineByRole],
  );
  const activitySubtitle = useMemo(() => {
    if (isEmployeesView) return "All Employees · dashboard linked + manual staff";
    const names = activityDashboards.map((d) => d.role).join(", ");
    return portalCompany === "GPS" ? `GPS · ${names}` : `BEM · ${names}`;
  }, [activityDashboards, isEmployeesView, portalCompany]);
  const countByCompany = {
    BEM: users.filter(u => companyForRole(u.role) === "BEM").length,
    GPS: users.filter(u => companyForRole(u.role) === "GPS").length,
  };
  const companyAllCount = users.filter(u => companyRoles.includes(u.role)).length;

  const dashboardPickOptions = useMemo(
    () =>
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        employeeCode: u.employeeCode,
        profilePic: u.profilePic,
        company: companyForRole(u.role),
      })),
    [users],
  );

  const filteredUsers = users.filter(u => {
    if (!companyRoles.includes(u.role)) return false;
    if (roleFilter !== "All" && u.role !== roleFilter) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.employeeCode ?? "").toLowerCase().includes(q) ||
      (u.csrCode ?? "").toLowerCase().includes(q) ||
      (u.fatherName ?? "").toLowerCase().includes(q) ||
      (u.contactNo ?? "").toLowerCase().includes(q)
    );
  });

  const sortedUsers = useMemo(
    () => sortUsersList(filteredUsers, sortKey),
    [filteredUsers, sortKey],
  );

  const totalPagesUsers = Math.max(1, Math.ceil(sortedUsers.length / PAGE_SIZE));
  const paginatedUsers  = sortedUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handlePicUpload = async (file: File) => {
    setUploadingPic(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch(`${apiBase()}/users/upload-pic`, { method: "POST", credentials: "include", body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error("Image upload failed."); return; }
      setForm(f => ({ ...f, profilePic: data.url }));
    } catch { toast.error("Upload failed."); } finally { setUploadingPic(false); }
  };

  const handleCnicUpload = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are allowed for CNIC.");
      return;
    }
    setUploadingCnic(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch(`${apiBase()}/users/upload-cnic`, { method: "POST", credentials: "include", body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message || "CNIC PDF upload failed."); return; }
      setForm(f => ({ ...f, cnicPdfUrl: data.url }));
      toast.success("CNIC PDF uploaded.");
    } catch { toast.error("Upload failed."); } finally { setUploadingCnic(false); }
  };

  const handleSubmit = async () => {
    if (!form.name || !form.email || (!editingUser && !form.password)) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (form.role === "CSR" && !form.csrCode.trim()) {
      toast.error("CSR Code is required for CSR accounts.");
      return;
    }
    try {
      const role =
        form.role === "CSR" ? "csr"
        : form.role === "Admin" ? "manager"
        : form.role === "Chief Estimator" ? "technical_manager"
        : form.role === "Accounts" ? "accounts"
        : form.role === "Estimator" ? "estimator"
        : form.role === "BIM Manager" ? "bim_manager"
        : form.role === "BIM" ? "bim"
        : "admin";
      const url    = editingUser ? `${apiBase()}/users/${editingUser.id}` : `${apiBase()}/auth/register`;
      const method = editingUser ? "PUT" : "POST";
      const shared = {
        name: form.name, email: form.email, role,
        employeeCode: form.employeeCode.trim() || null,
        fatherName: form.fatherName.trim() || null,
        currentAddress: form.currentAddress.trim() || null,
        contactNo: form.contactNo.trim() || null,
        csrCode:    role === "csr" || role === "estimator" || role === "bim" ? (form.csrCode.trim() || null) : null,
        cnic:       form.cnic.trim() || null,
        cnicPdfUrl: form.cnicPdfUrl || null,
        profilePic: form.profilePic  || null,
        allowedIps: form.allowedIps.map(v => v.trim()).filter(Boolean).slice(0, 5),
        allowedMacAddress: null,
        temporaryAccessIp: form.temporaryAccessIp.trim() || null,
        temporaryAccessMac: null,
        temporaryAccessHours: Number(form.temporaryAccessHours || "9"),
      };
      const body = editingUser ? shared : { ...shared, password: form.password };

      const res  = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message || "Operation failed."); return; }

      toast.success(editingUser ? "User updated." : "User created.");
      invalidateAuthMeCache();

      const savedId = editingUser?.id ?? (data.user?.id as string | undefined) ?? (data.id as string | undefined);
      const nextProfile = {
        name: form.name,
        email: form.email,
        role: form.role,
        employeeCode: form.employeeCode.trim() || null,
        fatherName: form.fatherName.trim() || null,
        currentAddress: form.currentAddress.trim() || null,
        contactNo: form.contactNo.trim() || null,
        csrCode: role === "csr" || role === "estimator" || role === "bim" ? (form.csrCode.trim() || null) : null,
        cnic: form.cnic.trim() || null,
        cnicPdfUrl: form.cnicPdfUrl || null,
        profilePic: form.profilePic || null,
        allowedIps: form.allowedIps.map(v => v.trim()).filter(Boolean).slice(0, 5),
      };
      if (savedId) {
        setUsers(prev => {
          const exists = prev.some(u => u.id === savedId);
          if (exists) {
            return prev.map(u => (u.id === savedId ? { ...u, ...nextProfile } : u));
          }
          return prev;
        });
        setDetailUser(prev => (prev?.id === savedId ? { ...prev, ...nextProfile } : prev));
      }

      await fetchUsers();
      setShowModal(false); setEditingUser(null);
      setForm({ ...EMPTY_USER_FORM });
      setShowPassword(false);
    } catch {
      toast.error("Something went wrong.");
    }
  };

  const handleLogoutAllDevices = (user: User) => {
    toast(t => (
      <div className="flex flex-col gap-3 min-w-[220px]">
        <p className="font-semibold text-[#111827]">Logout from all devices?</p>
        <p className="text-xs text-gray-500">{user.name} will be signed out everywhere.</p>
        <div className="flex gap-2">
          <button onClick={async () => {
            toast.dismiss(t.id);
            const tid = toast.loading("Signing out...");
            try {
              const res = await API.post(`/users/${user.id}/logout-all`);
              toast.success(res.data?.message ?? "Logged out from all devices.", { id: tid });
              if (res.data?.self) {
                await logoutSession(async () => {});
                setTimeout(() => { window.location.href = "/"; }, 800);
                return;
              }
              setUsers(prev => prev.map(u => u.id === user.id
                ? {
                    ...u,
                    isOnline: false,
                    browser: null,
                    tabId: null,
                    openedAt: null,
                    tabVisible: null,
                    hiddenAt: null,
                  }
                : u));
              setDetailUser(prev => prev?.id === user.id
                ? {
                    ...prev,
                    isOnline: false,
                    browser: null,
                    tabId: null,
                    openedAt: null,
                    tabVisible: null,
                    hiddenAt: null,
                  }
                : prev);
              await fetchUsers(true);
            } catch (err: unknown) {
              const msg =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message
                || "Failed to log user out.";
              toast.error(msg, { id: tid });
            }
          }} className="flex-1 rounded-xl bg-[#1B6FE8] py-2 text-sm font-semibold text-white">Logout</button>
          <button onClick={() => toast.dismiss(t.id)} className="flex-1 rounded-xl bg-gray-100 py-2 text-sm font-semibold text-gray-600">Cancel</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const handleDelete = async (id: string) => {
    toast(t => (
      <div className="flex flex-col gap-3 min-w-[200px]">
        <p className="font-semibold text-[#111827]">Delete this user?</p>
        <div className="flex gap-2">
          <button onClick={async () => {
            toast.dismiss(t.id);
            const tid = toast.loading("Deleting...");
            try {
              await API.delete(`/users/${id}`);
              toast.success("User deleted.", { id: tid });
              broadcastAdminSummaryStale();
              fetchUsers();
            } catch (err: unknown) {
              const msg =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message
                || "Something went wrong.";
              toast.error(msg, { id: tid });
            }
          }} className="flex-1 rounded-xl bg-[#1B6FE8] py-2 text-sm font-semibold text-white">Delete</button>
          <button onClick={() => toast.dismiss(t.id)} className="flex-1 rounded-xl bg-gray-100 py-2 text-sm font-semibold text-gray-600">Cancel</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const openResetModal = (user: User) => {
    setResetScopes([...ALL_CSR_RESET_SCOPE_IDS]);
    setResetUser(user);
  };

  const toggleResetScope = (scopeId: CsrResetScopeId) => {
    setResetScopes(prev =>
      prev.includes(scopeId)
        ? prev.filter(id => id !== scopeId)
        : [...prev, scopeId],
    );
  };

  const isGroupFullySelected = (groupId: string) => {
    const group = CSR_RESET_GROUPS.find(g => g.id === groupId);
    if (!group) return false;
    return group.children.every(c => resetScopes.includes(c.id));
  };

  const isGroupPartiallySelected = (groupId: string) => {
    const group = CSR_RESET_GROUPS.find(g => g.id === groupId);
    if (!group) return false;
    const selected = group.children.filter(c => resetScopes.includes(c.id)).length;
    return selected > 0 && selected < group.children.length;
  };

  const toggleResetGroup = (groupId: string) => {
    const group = CSR_RESET_GROUPS.find(g => g.id === groupId);
    if (!group) return;
    const childIds = group.children.map(c => c.id);
    if (isGroupFullySelected(groupId)) {
      setResetScopes(prev => prev.filter(id => !childIds.includes(id)));
    } else {
      setResetScopes(prev => [...new Set([...prev, ...childIds])]);
    }
  };

  const allResetScopesSelected = resetScopes.length === ALL_CSR_RESET_SCOPE_IDS.length;

  const toggleAllResetScopes = () => {
    setResetScopes(allResetScopesSelected ? [] : [...ALL_CSR_RESET_SCOPE_IDS]);
  };

  const runCsrReset = async () => {
    if (!resetUser || resetScopes.length === 0) {
      toast.error("Select at least one page or sub-page to reset.");
      return;
    }

    setResettingCsr(true);
    const tid = toast.loading(`Resetting ${resetUser.name}'s data (${resetScopes.length} selected)...`);
    try {
      const res = await fetch(`${apiBase()}/admin/csr-leads/${resetUser.id}/reset`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: resetScopes }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Reset failed.", { id: tid });
        return;
      }
      if (data.warning) {
        toast.error(data.warning, { id: tid, duration: 8000 });
        return;
      }
      const labels = (data.scopes as string[] | undefined ?? data.pages as string[] | undefined)
        ?.slice(0, 4)
        .map(scopeLabel)
        .join(", ");
      const more = resetScopes.length > 4 ? ` +${resetScopes.length - 4} more` : "";
      toast.success(
        `Reset complete for ${resetUser.name}: ${data.deleted ?? 0} leads removed${labels ? ` (${labels}${more})` : ""}.`,
        { id: tid, duration: 6000 },
      );
      broadcastAdminSummaryStale();
      setResetUser(null);
    } catch {
      toast.error("Reset timed out or failed. Try fewer sections and retry.", { id: tid });
    } finally {
      setResettingCsr(false);
    }
  };

  const handleResetCSR = (user: User) => {
    openResetModal(user);
  };

  const toggleStatus = async (user: User) => {
    const newActive = user.status !== "Active";
    try {
      const res = await fetch(`${apiBase()}/users/${user.id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newActive }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message || "Status update failed."); return; }
      toast.success(newActive ? "User activated." : "User blocked.");
      await fetchUsers(true);
    } catch {
      toast.error("Status update failed.");
    }
  };

  const openChatRestrictions = (user: User) => {
    setChatUser(user);
    setChatEnabledForm(user.chatEnabled !== false);
    const ids = user.chatAllowedUserIds ?? [];
    setChatRestrictMode(ids.length > 0 ? "selected" : "all");
    setChatAllowedIds(ids);
    setChatSearch("");
    const visibleIds = user.chatVisibleToUserIds ?? [];
    setChatVisibilityMode(visibleIds.length > 0 ? "selected" : "all");
    setChatVisibleToIds(visibleIds);
    setChatVisibilitySearch("");
  };

  const saveChatRestrictions = async () => {
    if (!chatUser) return;
    setSavingChat(true);
    try {
      const body = {
        chatEnabled: chatEnabledForm,
        chatAllowedUserIds:
          chatEnabledForm && chatRestrictMode === "selected" ? chatAllowedIds : [],
        chatVisibleToUserIds:
          chatEnabledForm && chatVisibilityMode === "selected" ? chatVisibleToIds : [],
      };
      const res = await fetch(`${apiBase()}/users/${chatUser.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to update chat restrictions.");
        return;
      }
      toast.success(
        !chatEnabledForm
          ? `Chat disabled for ${chatUser.name}.`
          : `Chat access updated for ${chatUser.name}.`,
      );
      setChatUser(null);
      await fetchUsers(true);
    } catch {
      toast.error("Failed to update chat restrictions.");
    } finally {
      setSavingChat(false);
    }
  };

  const openPasswordModal = (user: User) => {
    setPwUser(user);
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
  };

  const closePasswordModal = () => {
    setPwUser(null);
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
  };

  const handlePasswordSubmit = async () => {
    if (!pwUser) return;
    if (!newPassword || !confirmPassword) {
      toast.error("Enter and confirm the new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch(`${apiBase()}/users/${pwUser.id}/password`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to update password.");
        return;
      }
      toast.success(`Password updated for ${pwUser.name}. They must sign in again.`);
      closePasswordModal();
      fetchUsers(true);
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setSavingPassword(false);
    }
  };

  const openEditUser = useCallback((u: User) => {
    setEditingUser(u);
    setForm({
      ...EMPTY_USER_FORM,
      name: u.name,
      email: u.email,
      company: companyForRole(u.role),
      role: u.role,
      employeeCode: u.employeeCode ?? "",
      fatherName: u.fatherName ?? "",
      currentAddress: u.currentAddress ?? "",
      contactNo: u.contactNo ?? "",
      csrCode: u.csrCode ?? "",
      cnic: u.cnic ?? "",
      cnicPdfUrl: u.cnicPdfUrl ?? "",
      profilePic: u.profilePic ?? "",
      allowedIps: u.allowedIps?.length ? u.allowedIps : [""],
      allowedMacAddress: u.allowedMacAddress ?? "",
      temporaryAccessIp: u.temporaryAccessIp ?? "",
      temporaryAccessMac: u.temporaryAccessMac ?? "",
    });
    setShowModal(true);
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const onDoc = () => setOpenMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenMenu(null); };
    const onScroll = () => setOpenMenu(null);
    const t = window.setTimeout(() => {
      document.addEventListener("click", onDoc);
      document.addEventListener("keydown", onKey);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onScroll);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [openMenu]);

  const menuUser = openMenu ? users.find((x) => x.id === openMenu.id) ?? null : null;

  return (
    <div className="flex min-h-screen bg-[#F5F6FA]">
      <Toaster position="top-right" toastOptions={{
        style: { borderRadius:"16px", fontFamily:"inherit", fontSize:"14px" },
        success: { iconTheme:{ primary:"#027A48", secondary:"#fff" } },
        error:   { iconTheme:{ primary:"#1B6FE8", secondary:"#fff" } },
      }}/>

      <DashboardSidebar/>

      <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden mt-[var(--app-header-h,64px)]">
        <DashboardNavbar/>

        {/* USER ACTIVITY OVERVIEW */}
        <div className="mb-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="w-11 h-11 rounded-2xl bg-[#1B6FE8] text-white inline-flex items-center justify-center shrink-0 shadow-sm">
                <Users size={18} />
              </span>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#0F172A]">Users</h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{activitySubtitle}</p>
            </div>
            </div>
            <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
              <span className="h-9 px-3 rounded-xl bg-emerald-50 text-emerald-700 text-[11px] font-semibold inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {onlineNow} online
              </span>
              <span className="h-9 px-3 rounded-xl text-slate-500 text-[11px] font-semibold inline-flex items-center gap-1.5">
                {Math.max(0, totalUsers - onlineNow)} offline
              </span>
          </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,1.6fr)] gap-3 items-stretch">
            <div className="rounded-2xl bg-gradient-to-br from-[#1B6FE8] to-[#8c0d22] border border-[#1B6FE8]/40 p-4 h-full">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Total users</p>
          {loading ? (
                <div className="h-8 w-12 bg-white/20 rounded-lg animate-pulse mt-2" />
              ) : (
                <p className="text-3xl font-extrabold text-white mt-1 tabular-nums">{totalUsers}</p>
              )}
              <p className="text-[11px] text-white/55 mt-1">Dashboard logins in this portal</p>
              </div>
            <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4 h-full">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/70">Online now</p>
              {loading ? (
                <div className="h-8 w-12 bg-emerald-100/60 rounded-lg animate-pulse mt-2" />
              ) : (
                <p className="text-3xl font-extrabold text-emerald-700 mt-1 tabular-nums">{onlineNow}</p>
              )}
              {!loading && totalUsers > 0 && (
                <>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {Math.round((onlineNow / totalUsers) * 100)}% of the current list
                  </p>
                  <div className="mt-3 h-1.5 rounded-full bg-emerald-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(100, (onlineNow / totalUsers) * 100)}%` }}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] h-full flex flex-col min-h-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-3">Presence by role</p>
              {loading ? (
                <div className="space-y-2 flex-1">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 bg-gray-50 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-center gap-2.5">
                  {activityChartData.map((row) => {
                    const total = row.online + row.offline;
                    const pct = total > 0 ? (row.online / total) * 100 : 0;
                    return (
                      <div key={row.name} className="flex items-center gap-3">
                        <span className="w-16 sm:w-20 text-[11px] font-bold text-slate-700 shrink-0 truncate">
                          {row.name}
                        </span>
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden flex">
                          <div
                            className="h-full bg-emerald-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold tabular-nums text-slate-500 w-14 text-right shrink-0">
                          <span className="text-emerald-600">{row.online}</span>
                          <span className="text-slate-300">/</span>
                          {total}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SEARCH + SORT + CREATE */}
        {!isEmployeesView && (
        <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
          <div className="grid w-full gap-2 grid-cols-1 sm:grid-cols-[1fr_200px_auto]">
            <div className="relative min-w-0">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input type="text" placeholder="Search name, email, code…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="w-full h-11 bg-white border border-gray-200 rounded-xl pl-10 pr-4 text-sm outline-none focus:border-[#1B6FE8]"/>
          </div>
            <div className="relative min-w-0">
              <ArrowUpDown size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
              <select
                value={sortKey}
                onChange={e => { setSortKey(e.target.value as UserSortKey); setPage(1); }}
                aria-label="Sort users"
                className="w-full h-11 appearance-none bg-white border border-gray-200 rounded-xl pl-10 pr-9 text-sm outline-none focus:border-[#1B6FE8] cursor-pointer"
              >
                {USER_SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
            </div>
            <button onClick={() => { setEditingUser(null); setForm({ ...EMPTY_USER_FORM }); setShowModal(true); }}
              className="h-11 px-5 rounded-xl bg-[#1B6FE8] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#a30f27] w-full sm:w-auto">
            <Plus size={16}/>Create User
          </button>
        </div>
        </div>
        )}

        {/* COMPANY + ROLE TABS */}
        <div className="mb-5 space-y-3">
          <CapsuleTabs
            stretch
            activeKey={companyFilter}
            onChange={key => {
              setCompanyFilter(key as CompanyFilter);
              setRoleFilter("All");
              setPage(1);
            }}
            accent={companyFilter === "GPS" ? "#0F398A" : companyFilter === "EMPLOYEES" ? "#0F766E" : "#1B6FE8"}
            tabs={[
              { key: "BEM", label: "BEM Solutions", shortLabel: "BEM", count: countByCompany.BEM },
              { key: "GPS", label: "GPS · Global", shortLabel: "GPS", count: countByCompany.GPS },
              { key: "EMPLOYEES", label: "All Employees", shortLabel: "Employees", count: undefined },
            ]}
          />
          {!isEmployeesView && (
            <CapsuleTabs
              stretch
              activeKey={roleFilter}
              onChange={key => { setRoleFilter(key as "All" | UserRole); setPage(1); }}
              accent={companyFilter === "GPS" ? "#0F398A" : "#1B6FE8"}
              tabs={[
                { key: "All", label: companyFilter === "GPS" ? "All GPS" : "All BEM", count: companyAllCount },
                ...activityDashboards.map(d => ({
                  key: d.role,
                  label: d.role,
                  shortLabel: d.shortLabel,
                  count: countByRole[d.role] ?? 0,
                })),
              ]}
            />
          )}
        </div>

        {isEmployeesView ? (
          <AllEmployeesPanel dashboardUsers={dashboardPickOptions} />
        ) : (
        <>
        <CompanyPortalAccessCard company={portalCompany} />
        {/* TABLE */}
        <div className="bg-white border border-slate-200/80 rounded-[28px] overflow-hidden shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed min-w-[720px] border-collapse">
              <colgroup>
                <col style={{ width: "34%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "24%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} />
              </colgroup>
              <thead className="sticky top-0 z-20 bg-[#1B6FE8]">
                <tr className="text-left">
                  <th className="px-5 py-3 text-[10px] font-bold text-white/80 uppercase tracking-[0.14em]">User</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-white/80 uppercase tracking-[0.14em]">Role</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-white/80 uppercase tracking-[0.14em]">Presence</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-white/80 uppercase tracking-[0.14em]">Account</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-white/80 uppercase tracking-[0.14em] text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1,2,3,4].map(i => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse"/>
                          <div className="space-y-1.5">
                            <div className="h-3.5 w-28 bg-gray-100 rounded animate-pulse"/>
                            <div className="h-3 w-36 bg-gray-100 rounded animate-pulse"/>
                          </div>
                        </div>
                      </td>
                      {[1,2,3,4].map(j => (
                        <td key={j} className="px-4 py-4"><div className="h-6 w-16 bg-gray-100 rounded-lg animate-pulse"/></td>
                      ))}
                    </tr>
                  ))
                ) : paginatedUsers.length > 0 ? paginatedUsers.map(u => (
                  <tr key={u.id} className="border-b border-slate-100/90 last:border-0 even:bg-slate-50/40 hover:bg-[#FFF8F9] hover:shadow-[inset_3px_0_0_#1B6FE8] transition-colors">

                    {/* USER */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm relative overflow-hidden shrink-0 ${u.profilePic ? "" : roleColor(u.role)}`}>
                          {u.profilePic
                            ? <img src={u.profilePic} alt={u.name} className="w-full h-full object-cover" />
                            : u.name.charAt(0).toUpperCase()
                          }
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${u.isOnline ? "bg-[#12B76A]" : "bg-gray-300"}`}/>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-sm font-semibold text-[#0F172A] truncate">{u.name}</h3>
                            {u.employeeCode && (
                              <span className="inline-flex items-center bg-slate-100 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded-md tracking-wider font-mono">
                                {u.employeeCode}
                              </span>
                            )}
                            {u.role === "CSR" && u.csrCode && (
                              <span className="inline-flex items-center bg-[#1B6FE8]/10 text-[#1B6FE8] text-[9px] font-bold px-1.5 py-0.5 rounded-md tracking-wider">
                                CSR {u.csrCode}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* ROLE */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${roleColor(u.role)}`}>{u.role}</span>
                    </td>

                    {/* PRESENCE (online + browser) */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1 min-w-[140px]">
                      <OnlineBadge isOnline={u.isOnline} lastActive={u.lastActive} now={now}/>
                      {u.isOnline ? (
                        <TabStatusBadge
                          tabVisible={u.tabVisible}
                          hiddenAt={u.hiddenAt}
                          openedAt={u.openedAt}
                          browser={u.browser}
                          now={now}
                        />
                        ) : null}
                      </div>
                    </td>

                    {/* ACCOUNT */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                        u.status === "Active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-600"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.status === "Active" ? "bg-emerald-500" : "bg-red-400"}`} />
                        {u.status}
                      </span>
                    </td>

                    {/* ACTIONS — primary + overflow */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end" onClick={e => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
                        <button
                          type="button"
                          onClick={() => setDetailUser(users.find(x => x.id === u.id) ?? u)}
                          className="h-8 px-3 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditUser(u)}
                          className="w-8 h-8 rounded-lg text-blue-600 hover:bg-blue-50 flex items-center justify-center"
                          title="Edit"
                          aria-label="Edit user"
                        >
                          <Pencil size={14}/>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openMenu?.id === u.id) {
                              setOpenMenu(null);
                              return;
                            }
                            const rect = e.currentTarget.getBoundingClientRect();
                            const menuH = u.role === "CSR" ? 240 : 200;
                            const spaceBelow = window.innerHeight - rect.bottom;
                            const top = spaceBelow < menuH + 8
                              ? Math.max(8, rect.top - menuH - 4)
                              : rect.bottom + 4;
                            setOpenMenu({
                              id: u.id,
                              top,
                              right: Math.max(8, window.innerWidth - rect.right),
                            });
                          }}
                          className="w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-50 flex items-center justify-center"
                          aria-label="More actions"
                          aria-expanded={openMenu?.id === u.id}
                        >
                          <MoreVertical size={16}/>
                        </button>
                          </div>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="py-16 text-center text-gray-400 text-sm">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPagesUsers > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 bg-[#FAFBFC]">
              <p className="text-xs text-gray-400">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sortedUsers.length)} of {sortedUsers.length}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="w-8 h-8 rounded-xl bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 flex items-center justify-center text-lg transition-all">‹</button>
                <span className="text-xs font-semibold text-gray-700 min-w-[48px] text-center">{page} / {totalPagesUsers}</span>
                <button onClick={() => setPage(p => Math.min(totalPagesUsers, p + 1))} disabled={page === totalPagesUsers}
                  className="w-8 h-8 rounded-xl bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 flex items-center justify-center text-lg transition-all">›</button>
              </div>
            </div>
          )}
        </div>
        </>
        )}

        {/* DETAIL MODAL */}
        {detailUser && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto">
            <div className="bg-white w-full rounded-3xl max-w-lg max-h-[90vh] flex flex-col overflow-hidden my-4">
              <div className="p-6 pb-4 shrink-0">
                <div className="flex items-center gap-3">
                <div className={`relative w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${roleColor(detailUser.role)}`}>
                  {detailUser.name.charAt(0).toUpperCase()}
                  <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${detailUser.isOnline ? "bg-[#12B76A]" : "bg-gray-300"}`}/>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">{detailUser.name}</h2>
                  <p className="text-sm text-gray-400">{detailUser.role}</p>
                </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0 space-y-3">
                {[
                  { label:"Email",          value: detailUser.email  },
                  { label:"Role",           value: detailUser.role   },
                  { label:"Company",        value: companyForRole(detailUser.role) === "GPS" ? "GPS · Global" : "BEM Solutions" },
                  { label:"Account Status", value: detailUser.status },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-[#F8F9FC] rounded-2xl p-4">
                    <p className="text-xs text-gray-400 mb-1">{label}</p>
                    <h3 className="text-sm font-medium text-gray-700 whitespace-pre-wrap">{value}</h3>
                  </div>
                ))}

                <div className="bg-[#F8F9FC] rounded-2xl p-4 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Employee Info</p>
                  {[
                    { label: "Employee Code", value: detailUser.employeeCode },
                    { label: "Father Name", value: detailUser.fatherName },
                    { label: "Contact No", value: detailUser.contactNo },
                    { label: "Current Address", value: detailUser.currentAddress },
                    ...(detailUser.role === "CSR" && detailUser.csrCode
                      ? [{ label: "CSR Code", value: detailUser.csrCode }]
                      : detailUser.role === "Estimator" && detailUser.csrCode
                        ? [{ label: "Estimator Code", value: detailUser.csrCode }]
                        : detailUser.role === "BIM" && detailUser.csrCode
                          ? [{ label: "BIM Code", value: detailUser.csrCode }]
                          : []),
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                      <h3 className={`text-sm font-medium whitespace-pre-wrap ${value ? "text-gray-700" : "text-gray-300"}`}>
                        {value || "—"}
                      </h3>
                    </div>
                  ))}
                </div>

                {(detailUser.cnic || detailUser.cnicPdfUrl) && (
                  <div className="bg-[#F8F9FC] rounded-2xl p-4">
                    <p className="text-xs text-gray-400 mb-1">CNIC</p>
                    {detailUser.cnic && (
                      <p className="text-sm font-mono font-medium text-gray-700">{detailUser.cnic}</p>
                    )}
                    {detailUser.cnicPdfUrl && (
                      <div className="mt-3">
                        {(() => {
                          const preview = cnicDocumentPreview(detailUser.cnicPdfUrl);
                          return preview.kind === "image" ? (
                          <img
                              src={preview.src}
                            alt="CNIC"
                              className="w-full max-h-56 object-contain rounded-xl border border-gray-200 bg-white"
                          />
                        ) : (
                          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                            <iframe
                                src={preview.src}
                              title="CNIC document"
                                className="w-full h-56"
                            />
                          </div>
                          );
                        })()}
                        <div className="flex items-center gap-3 mt-2">
                          <PdfPreview url={detailUser.cnicPdfUrl} fileName="CNIC document" />
                          <a
                            href={detailUser.cnicPdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-[#1B6FE8] hover:underline"
                          >
                            Open in new tab
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-[#F8F9FC] rounded-2xl p-4">
                  <p className="text-xs text-gray-400 mb-1">Access Policy</p>
                  <p className="text-xs text-gray-600">
                    In-house IPs: {detailUser.allowedIps.filter(Boolean).length > 0 ? detailUser.allowedIps.filter(Boolean).join(", ") : "Any"}
                  </p>
                  {detailUser.temporaryAccessIp && (
                    <p className="text-xs text-amber-700 mt-2">
                      Temporary IP: {detailUser.temporaryAccessIp}{" "}
                      {detailUser.temporaryAccessUntil ? `(expires ${formatEstDateTime(detailUser.temporaryAccessUntil)})` : ""}
                    </p>
                  )}
                </div>

                <div className="bg-[#F8F9FC] rounded-2xl p-4">
                  <p className="text-xs text-gray-400 mb-1">Password</p>
                  <h3 className="text-sm font-medium text-gray-700">Encrypted (bcrypt hash in database)</h3>
                </div>

                <div className="border border-gray-100 rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDetailIpOpen(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-[#F8F9FC] text-left"
                  >
                    <div>
                      <span className="text-sm font-semibold text-gray-700">IP Access History</span>
                      {!detailIpOpen && accessHistory.length > 0 && (
                        <span className="ml-2 text-[10px] font-semibold text-gray-400">
                          ({accessHistory.length} record{accessHistory.length === 1 ? "" : "s"})
                        </span>
                      )}
                    </div>
                    <ChevronDown size={16} className={`text-gray-400 transition-transform shrink-0 ${detailIpOpen ? "rotate-180" : ""}`} />
                  </button>
                  {detailIpOpen && (
                    <div className="p-4">
                      {loadingHistory ? (
                        <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                      ) : accessHistory.length === 0 ? (
                        <p className="text-xs text-gray-400">No access records yet.</p>
                      ) : (
                        <div className="overflow-x-auto -mx-1 max-h-52 overflow-y-auto">
                          <table className="w-full text-[11px]">
                            <thead className="sticky top-0 bg-[#F8F9FC]">
                              <tr className="text-left text-gray-400 border-b border-gray-200">
                                <th className="pb-2 pr-2 font-medium">When</th>
                                <th className="pb-2 pr-2 font-medium">Event</th>
                                <th className="pb-2 pr-2 font-medium">IP</th>
                                <th className="pb-2 font-medium">Browser</th>
                              </tr>
                            </thead>
                            <tbody>
                              {accessHistory.map(row => (
                                <tr key={row.id} className="border-b border-gray-100 last:border-0">
                                  <td className="py-2 pr-2 text-gray-600 whitespace-nowrap">
                                    {formatEstDateTime(row.createdAt)}
                                  </td>
                                  <td className="py-2 pr-2 font-medium text-gray-700 capitalize">{row.event}</td>
                                  <td className="py-2 pr-2 font-mono text-gray-600">{row.ip ?? "—"}</td>
                                  <td className="py-2 text-gray-500">{row.browser ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ONLINE + BROWSER */}
                <div className={`rounded-2xl p-4 ${detailUser.isOnline ? "bg-[#ECFDF3]" : "bg-[#F4F4F5]"}`}>
                  <p className="text-xs text-gray-400 mb-2">Online Status</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {detailUser.isOnline
                        ? <><Wifi size={16} className="text-[#027A48]"/><span className="text-sm font-semibold text-[#027A48]">Online Now</span></>
                        : <><WifiOff size={16} className="text-gray-400"/><span className="text-sm font-semibold text-gray-500">Offline</span></>
                      }
                    </div>
                    {!detailUser.isOnline && detailUser.lastActive && (
                      <span className="text-xs text-gray-400">Last seen {formatLastActive(detailUser.lastActive)}</span>
                    )}
                  </div>
                  {detailUser.isOnline && detailUser.browser && (
                    <div className="mt-3 pt-3 border-t border-gray-100/50">
                      <TabStatusBadge
                        tabVisible={detailUser.tabVisible}
                        hiddenAt={detailUser.hiddenAt}
                        openedAt={detailUser.openedAt}
                        browser={detailUser.browser}
                        now={now}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 pt-4 shrink-0 border-t border-gray-100">
              <button onClick={() => setDetailUser(null)}
                className="w-full bg-[#1B6FE8] text-white py-3 rounded-2xl font-medium">
                Close
              </button>
              </div>
            </div>
          </div>
        )}

        {/* CHANGE PASSWORD MODAL */}
        {pwUser && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto">
            <div className="bg-white dark:bg-crm-surface w-full rounded-3xl max-w-md max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 dark:border-crm-border-subtle my-4">
              <div className="p-6 pb-4 shrink-0">
                <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-300 flex items-center justify-center">
                  <KeyRound size={18}/>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-crm-text">Change Password</h2>
                  <p className="text-xs text-gray-400 dark:text-crm-text-muted">{pwUser.name} · {pwUser.email}</p>
                </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-500 dark:text-crm-text-muted block mb-2">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Min 8 chars, upper, lower, number"
                      className="w-full border border-gray-200 dark:border-crm-border rounded-2xl px-4 py-3 pr-12 outline-none focus:border-[#1B6FE8] text-sm bg-white dark:bg-crm-input dark:text-crm-text"
                    />
                    <button type="button" onClick={() => setShowNewPassword(v => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-crm-text">
                      {showNewPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-500 dark:text-crm-text-muted block mb-2">Confirm Password</label>
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full border border-gray-200 dark:border-crm-border rounded-2xl px-4 py-3 outline-none focus:border-[#1B6FE8] text-sm bg-white dark:bg-crm-input dark:text-crm-text"
                  />
                </div>
                <p className="text-[11px] text-gray-400 dark:text-crm-text-faint">
                  User will be signed out on all devices and must log in with the new password.
                </p>
              </div>
              </div>

              <div className="p-6 pt-4 shrink-0 border-t border-gray-100 dark:border-crm-border-subtle flex gap-3">
                <button type="button" onClick={closePasswordModal}
                  className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-crm-muted text-gray-600 dark:text-crm-text-secondary font-medium text-sm">
                  Cancel
                </button>
                <button type="button" onClick={handlePasswordSubmit} disabled={savingPassword}
                  className="flex-1 py-3 rounded-2xl bg-[#1B6FE8] text-white font-medium text-sm disabled:opacity-60">
                  {savingPassword ? "Saving…" : "Update Password"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CREATE / EDIT MODAL */}
        {showModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
              <div className="px-4 sm:px-6 pt-5 pb-3 shrink-0 border-b border-gray-100">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-800">
                  {editingUser ? "Edit User" : "Create User"}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {editingUser
                    ? "Scroll down for access policy & more fields"
                    : "Choose company first (BEM or GPS), then pick a role for that company"}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-y-contain min-h-0 px-4 sm:px-6 py-4">
              <div className="space-y-4 pb-2">
                {[
                  { label:"Full Name",     key:"name",  type:"text",  placeholder:"Enter full name", req: true },
                  { label:"Email Address", key:"email", type:"email", placeholder:"Enter email",      req: true },
                ].map(({ label, key, type, placeholder, req }) => (
                  <div key={key}>
                    <label className="text-sm text-gray-500 block mb-2">{label}{req && <RequiredMark />}</label>
                    <input type={type} value={form[key as "name"|"email"]}
                      onChange={e => setForm({ ...form, [key]: e.target.value })}
                      placeholder={placeholder}
                      className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-[#1B6FE8] text-sm"/>
                  </div>
                ))}
                {!editingUser && (
                  <div>
                    <label className="text-sm text-gray-500 block mb-2">Password<RequiredMark /></label>
                    <div className="relative">
                      <input type={showPassword ? "text" : "password"} value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                        placeholder="Enter password"
                        className="w-full border border-gray-200 rounded-2xl px-4 py-3 pr-12 outline-none focus:border-[#1B6FE8] text-sm"/>
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Company — BEM vs GPS */}
                <div>
                  <label className="text-sm text-gray-500 block mb-2">
                    Company{!editingUser && <RequiredMark />}
                    <span className="text-xs text-gray-400 ml-2">Which company is this employee for?</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { key: "BEM" as const, title: "BEM Solutions", hint: PORTAL_DASHBOARDS.filter(d => d.company === "BEM").map(d => d.shortLabel).join(" · "), accent: "#1B6FE8" },
                      { key: "GPS" as const, title: "GPS · Global", hint: PORTAL_DASHBOARDS.filter(d => d.company === "GPS").map(d => d.shortLabel).join(" · "), accent: "#0F398A" },
                    ]).map(opt => {
                      const active = form.company === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            if (form.company === opt.key) return;
                            setForm({
                              ...form,
                              company: opt.key,
                              role: defaultRoleForCompany(opt.key),
                              csrCode: "",
                            });
                          }}
                          className={`rounded-2xl border-2 px-3 py-3 text-left transition-all ${
                            active
                              ? "shadow-sm"
                              : "border-gray-200 bg-white hover:border-gray-300"
                          }`}
                          style={
                            active
                              ? { borderColor: opt.accent, background: `${opt.accent}0D` }
                              : undefined
                          }
                        >
                          <p className="text-sm font-bold" style={{ color: active ? opt.accent : "#374151" }}>
                            {opt.title}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{opt.hint}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-500 block mb-2">
                    Role <span className="text-xs text-gray-400">({form.company})</span>
                  </label>
                  <select
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value as UserRole, csrCode: "" })}
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-[#1B6FE8] bg-white text-sm"
                  >
                    {roleOptionsForCompany(form.company).map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Employee profile — all roles */}
                <div className="rounded-2xl border border-gray-100 bg-[#FAFBFC] p-3.5 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Employee Info</p>
                  <div>
                    <label className="text-sm text-gray-500 block mb-2">
                      Employee Code <span className="text-xs text-gray-400">(optional · HR ID)</span>
                    </label>
                    <input
                      type="text"
                      value={form.employeeCode}
                      onChange={e => setForm({ ...form, employeeCode: e.target.value })}
                      placeholder="e.g. EMP-001"
                      maxLength={32}
                      className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-[#1B6FE8] text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 block mb-2">
                      Father Name <span className="text-xs text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={form.fatherName}
                      onChange={e => setForm({ ...form, fatherName: e.target.value })}
                      placeholder="Enter father name"
                      className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-[#1B6FE8] text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 block mb-2">
                      Contact No <span className="text-xs text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="tel"
                      value={form.contactNo}
                      onChange={e => setForm({ ...form, contactNo: e.target.value })}
                      placeholder="e.g. 0300-1234567"
                      maxLength={20}
                      className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-[#1B6FE8] text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 block mb-2">
                      Current Address <span className="text-xs text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      value={form.currentAddress}
                      onChange={e => setForm({ ...form, currentAddress: e.target.value })}
                      placeholder="Enter current residential address"
                      rows={2}
                      className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-[#1B6FE8] text-sm resize-none"
                    />
                  </div>
                </div>

                {/* CSR / Estimator code — separate from employee code */}
                {(form.role === "CSR" || form.role === "Estimator" || form.role === "BIM") && (
                  <div className="rounded-2xl border border-[#1B6FE8]/20 bg-[#FFF8F9] p-3.5 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#1B6FE8]/70">
                      {form.role === "Estimator" ? "Estimator Code" : form.role === "BIM" ? "BIM Code" : "CSR Code"} — client coding
                    </p>
                    <label className="text-sm text-gray-500 block">
                      {form.role === "Estimator" ? "Estimator Code" : form.role === "BIM" ? "BIM Code" : "CSR Code"}{" "}
                      {form.role === "CSR" ? <span className="text-[#1B6FE8] font-semibold">*</span> : (
                        <span className="text-xs text-gray-400">(optional)</span>
                      )}
                      <span className="text-xs text-gray-400 ml-2">
                        {form.role === "Estimator" ? "e.g. TECH-01" : form.role === "BIM" ? "e.g. BIM-01" : "e.g. 1000, 1001, 1002…"}
                      </span>
                    </label>
                    <input
                      type="text"
                      value={form.csrCode}
                      onChange={e => setForm({ ...form, csrCode: e.target.value })}
                      placeholder={form.role === "Estimator" ? "e.g. TECH-01" : form.role === "BIM" ? "e.g. BIM-01" : "e.g. 1000"}
                      maxLength={10}
                      className="w-full border-2 border-[#1B6FE8]/30 rounded-2xl px-4 py-3 outline-none focus:border-[#1B6FE8] text-sm font-mono font-bold tracking-wider bg-white"
                    />
                    {form.role === "CSR" && (
                      <p className="text-[11px] text-gray-400">
                      Clients of this CSR will be coded as {form.csrCode || "XXXX"}-01, {form.csrCode || "XXXX"}-02…
                        {" "}· Separate from Employee Code above.
                    </p>
                    )}
                  </div>
                )}

                {/* CNIC */}
                <div>
                  <label className="text-sm text-gray-500 block mb-2">CNIC <span className="text-xs text-gray-400">(optional)</span></label>
                  <input
                    type="text"
                    value={form.cnic}
                    onChange={e => setForm({ ...form, cnic: e.target.value })}
                    placeholder="e.g. 12345-6789012-3"
                    maxLength={15}
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-[#1B6FE8] text-sm font-mono"
                  />
                </div>

                {/* CNIC PDF */}
                <div>
                  <label className="text-sm text-gray-500 block mb-2">
                    CNIC Document (PDF) <span className="text-xs text-gray-400">(optional)</span>
                  </label>
                  <div className="flex flex-col gap-2">
                    {form.cnicPdfUrl ? (
                      <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-[#1B6FE8]/20 bg-[#EAF2FE]">
                        <a
                          href={form.cnicPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-[#1B6FE8] truncate hover:underline"
                        >
                          CNIC PDF uploaded — View
                        </a>
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, cnicPdfUrl: "" }))}
                          className="text-[11px] font-semibold text-gray-500 hover:text-[#1B6FE8] shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                    <label className="flex items-center justify-center gap-2 h-11 rounded-2xl border-2 border-dashed border-gray-200 hover:border-[#1B6FE8]/40 bg-[#FAFAFA] cursor-pointer text-xs font-semibold text-gray-600 hover:text-[#1B6FE8] transition-colors">
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        disabled={uploadingCnic}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) void handleCnicUpload(file);
                          e.target.value = "";
                        }}
                      />
                      {uploadingCnic ? "Uploading PDF…" : form.cnicPdfUrl ? "Replace CNIC PDF" : "Upload CNIC PDF"}
                    </label>
                    <p className="text-[11px] text-gray-400">Stored securely on cloud — max 10MB</p>
                  </div>
                </div>

                {/* Profile Picture */}
                <div>
                  <label className="text-sm text-gray-500 block mb-2">Profile Picture <span className="text-xs text-gray-400">(optional)</span></label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden border border-gray-200 shrink-0 bg-gray-50 flex items-center justify-center mx-auto sm:mx-0">
                      {form.profilePic
                        ? <img src={form.profilePic} alt="Preview" className="w-full h-full object-cover" />
                        : <User2 size={22} className="text-gray-300" />
                      }
                    </div>
                    <div className="flex-1">
                      <label className={`flex items-center justify-center w-full py-2.5 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-sm font-medium ${uploadingPic ? "border-gray-200 text-gray-300 cursor-not-allowed" : "border-gray-200 text-gray-500 hover:border-[#1B6FE8] hover:text-[#1B6FE8]"}`}>
                        {uploadingPic ? "Uploading…" : form.profilePic ? "Change Photo" : "Upload Photo"}
                        <input type="file" accept="image/*" className="hidden" disabled={uploadingPic}
                          onChange={e => { const f = e.target.files?.[0]; if (f) void handlePicUpload(f); e.target.value = ""; }} />
                      </label>
                      {form.profilePic && (
                        <button type="button" onClick={() => setForm(f => ({ ...f, profilePic: "" }))}
                          className="text-[11px] text-red-400 hover:text-red-600 mt-1 w-full text-center transition-colors">
                          Remove photo
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border border-gray-100 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-700">In-house Access Policy</p>
                      <p className="text-[11px] text-gray-400">Max 5 approved IPs</p>
                    </div>
                    {form.allowedIps.length < 5 && (
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, allowedIps: [...f.allowedIps, ""] }))}
                        className="w-7 h-7 rounded-lg bg-[#1B6FE8] text-white flex items-center justify-center"
                        title="Add IP field"
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {form.allowedIps.map((ip, idx) => (
                      <div key={`ip-${idx}`} className="flex items-center gap-2 min-w-0">
                        <input
                          type="text"
                          value={ip}
                          onChange={e => {
                            const value = e.target.value;
                            setForm(f => ({
                              ...f,
                              allowedIps: f.allowedIps.map((v, i) => (i === idx ? value : v)),
                            }));
                          }}
                          placeholder={`Approved IP ${idx + 1}`}
                          className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#1B6FE8]"
                        />
                        {form.allowedIps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setForm(f => ({ ...f, allowedIps: f.allowedIps.filter((_, i) => i !== idx) }))}
                            className="text-xs font-semibold text-red-500 shrink-0 px-1"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-amber-800">Temporary Outside Access</p>
                  <p className="text-[11px] text-amber-700 mb-2">Auto expires after selected duration.</p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={form.temporaryAccessIp}
                      onChange={e => setForm({ ...form, temporaryAccessIp: e.target.value })}
                      placeholder="Temporary IP"
                      className="w-full border border-amber-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 bg-white"
                    />
                    <select
                      value={form.temporaryAccessHours}
                      onChange={e => setForm({ ...form, temporaryAccessHours: e.target.value })}
                      className="w-full border border-amber-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 bg-white"
                    >
                      <option value="9">9 hours</option>
                      <option value="10">10 hours</option>
                    </select>
                  </div>
                  {editingUser?.temporaryAccessUntil && (
                    <p className="text-[11px] text-amber-700 mt-2">
                      Current expiry: {formatEstDateTime(editingUser.temporaryAccessUntil)}
                    </p>
                  )}
                </div>

                {editingUser && (
                  <div className="border border-gray-100 rounded-2xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setEditIpOpen(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#F8F9FC] text-left"
                    >
                      <span className="text-sm font-semibold text-gray-700">IP Access History</span>
                      <ChevronDown size={16} className={`text-gray-400 transition-transform ${editIpOpen ? "rotate-180" : ""}`} />
                    </button>
                    {editIpOpen && (
                      <div className="p-4 max-h-40 overflow-y-auto overscroll-y-contain">
                        {loadingHistory ? (
                          <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
                        ) : accessHistory.length === 0 ? (
                          <p className="text-xs text-gray-400">No access records yet.</p>
                        ) : (
                          <div className="overflow-x-auto -mx-1">
                          <table className="w-full text-[11px] min-w-[280px]">
                            <thead>
                              <tr className="text-left text-gray-400 border-b">
                                <th className="pb-1 pr-2">When</th>
                                <th className="pb-1 pr-2">IP</th>
                                <th className="pb-1">Browser</th>
                              </tr>
                            </thead>
                            <tbody>
                              {accessHistory.map(row => (
                                <tr key={row.id} className="border-b border-gray-50 last:border-0">
                                  <td className="py-1.5 pr-2 text-gray-600 whitespace-nowrap">
                                    {formatEstDateTime(row.createdAt)}
                                  </td>
                                  <td className="py-1.5 pr-2 font-mono">{row.ip ?? "—"}</td>
                                  <td className="py-1.5 truncate">{row.browser ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              </div>

              <div className="px-4 sm:px-6 py-4 shrink-0 border-t border-gray-100 bg-white flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
                <button onClick={() => { setShowModal(false); setEditingUser(null); setEditIpOpen(false); }}
                  className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-2xl hover:bg-gray-50 transition-all text-sm">
                  Cancel
                </button>
                <button onClick={handleSubmit}
                  className="flex-1 bg-[#1B6FE8] text-white py-3 rounded-2xl hover:bg-[#a30f27] transition-all text-sm font-semibold">
                  {editingUser ? "Update User" : "Create User"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CHAT RESTRICTIONS MODAL */}
        {chatUser && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-gray-100 my-auto max-h-[90vh] flex flex-col overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <MessageSquare size={18} className="text-cyan-600" />
                    Chat Restrictions
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Control messaging for <span className="font-semibold text-gray-700">{chatUser.name}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setChatUser(null)}
                  className="text-gray-400 hover:text-gray-600 text-sm font-semibold"
                >
                  Close
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
                <label className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-[#F8F9FC] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Enable chat</p>
                    <p className="text-[11px] text-gray-500">Off = chatbox disabled for this user</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={chatEnabledForm}
                    onChange={e => setChatEnabledForm(e.target.checked)}
                    className="h-5 w-5 rounded border-gray-300 text-[#1B6FE8] focus:ring-[#1B6FE8]"
                  />
                </label>

                {chatEnabledForm && (
                  <>
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Who can they message?</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setChatRestrictMode("all")}
                          className={`rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
                            chatRestrictMode === "all"
                              ? "border-[#1B6FE8] bg-[#EAF2FE] text-[#1B6FE8] font-semibold"
                              : "border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          Everyone
                          <span className="block text-[10px] font-normal text-gray-400 mt-0.5">All active users</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setChatRestrictMode("selected")}
                          className={`rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
                            chatRestrictMode === "selected"
                              ? "border-[#1B6FE8] bg-[#EAF2FE] text-[#1B6FE8] font-semibold"
                              : "border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          Selected only
                          <span className="block text-[10px] font-normal text-gray-400 mt-0.5">Pick contacts below</span>
                        </button>
                      </div>
                    </div>

                    {chatRestrictMode === "selected" && (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            value={chatSearch}
                            onChange={e => setChatSearch(e.target.value)}
                            placeholder="Search users…"
                            className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-cyan-500"
                          />
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {chatAllowedIds.length} contact{chatAllowedIds.length === 1 ? "" : "s"} selected
                        </p>
                        <div className="max-h-56 overflow-y-auto rounded-2xl border border-gray-100 divide-y divide-gray-50">
                          {users
                            .filter(u => u.id !== chatUser.id && u.status === "Active")
                            .filter(u => {
                              const q = chatSearch.trim().toLowerCase();
                              if (!q) return true;
                              return (
                                u.name.toLowerCase().includes(q) ||
                                u.email.toLowerCase().includes(q) ||
                                (u.csrCode ?? "").toLowerCase().includes(q) ||
                                (u.employeeCode ?? "").toLowerCase().includes(q) ||
                                u.role.toLowerCase().includes(q)
                              );
                            })
                            .map(u => {
                              const checked = chatAllowedIds.includes(u.id);
                              return (
                                <label
                                  key={u.id}
                                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setChatAllowedIds(prev =>
                                        checked ? prev.filter(id => id !== u.id) : [...prev, u.id],
                                      );
                                    }}
                                    className="h-4 w-4 rounded border-gray-300 text-[#1B6FE8] focus:ring-[#1B6FE8]"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                                    <p className="text-[11px] text-gray-400 truncate">
                                      {u.role}{u.csrCode ? ` · ${u.csrCode}` : ""} · {u.email}
                                    </p>
                                  </div>
                                </label>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    <div className="pt-4 border-t border-gray-100 space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                        Who can see this account in Messages?
                      </p>
                      <p className="text-[11px] text-gray-400">
                        This controls whose New DM/contact list will show {chatUser.name}.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setChatVisibilityMode("all")}
                          className={`rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
                            chatVisibilityMode === "all"
                              ? "border-cyan-600 bg-cyan-50 text-cyan-700 font-semibold"
                              : "border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          Visible to everyone
                          <span className="block text-[10px] font-normal text-gray-400 mt-0.5">All active users can find them</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setChatVisibilityMode("selected")}
                          className={`rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
                            chatVisibilityMode === "selected"
                              ? "border-cyan-600 bg-cyan-50 text-cyan-700 font-semibold"
                              : "border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          Visible to selected only
                          <span className="block text-[10px] font-normal text-gray-400 mt-0.5">Pick viewers below</span>
                        </button>
                      </div>
                    </div>

                    {chatVisibilityMode === "selected" && (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            value={chatVisibilitySearch}
                            onChange={e => setChatVisibilitySearch(e.target.value)}
                            placeholder="Search users who may see this account…"
                            className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-cyan-500"
                          />
                        </div>
                        <p className="text-[11px] text-gray-400">
                          Visible to {chatVisibleToIds.length} user{chatVisibleToIds.length === 1 ? "" : "s"}
                        </p>
                        <div className="max-h-56 overflow-y-auto rounded-2xl border border-gray-100 divide-y divide-gray-50">
                          {users
                            .filter(u => u.id !== chatUser.id && u.status === "Active")
                            .filter(u => {
                              const q = chatVisibilitySearch.trim().toLowerCase();
                              if (!q) return true;
                              return (
                                u.name.toLowerCase().includes(q) ||
                                u.email.toLowerCase().includes(q) ||
                                (u.csrCode ?? "").toLowerCase().includes(q) ||
                                (u.employeeCode ?? "").toLowerCase().includes(q) ||
                                u.role.toLowerCase().includes(q)
                              );
                            })
                            .map(u => {
                              const checked = chatVisibleToIds.includes(u.id);
                              return (
                                <label
                                  key={u.id}
                                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setChatVisibleToIds(prev =>
                                        checked ? prev.filter(id => id !== u.id) : [...prev, u.id],
                                      );
                                    }}
                                    className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-600"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                                    <p className="text-[11px] text-gray-400 truncate">
                                      {u.role}{u.csrCode ? ` · ${u.csrCode}` : ""} · {u.email}
                                    </p>
                                  </div>
                                </label>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="px-5 sm:px-6 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setChatUser(null)}
                  className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-2xl hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    savingChat ||
                    (
                      chatEnabledForm &&
                      (
                        (chatRestrictMode === "selected" && chatAllowedIds.length === 0) ||
                        (chatVisibilityMode === "selected" && chatVisibleToIds.length === 0)
                      )
                    )
                  }
                  onClick={() => void saveChatRestrictions()}
                  className="flex-1 bg-[#1B6FE8] text-white py-3 rounded-2xl hover:bg-[#a30f27] text-sm font-semibold disabled:opacity-50"
                >
                  {savingChat ? "Saving…" : "Save Restrictions"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CSR RESET MODAL */}
        {resetUser && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto">
            <div className="bg-white w-full rounded-3xl max-w-lg max-h-[90vh] flex flex-col overflow-hidden my-4 shadow-xl">
              <div className="p-6 pb-4 shrink-0 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800">Reset CSR Data</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Select pages and sub-pages to clear for <span className="font-semibold text-gray-800">{resetUser.name}</span>.
                  Account stays — only selected lead data is permanently deleted.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0 space-y-4">
                <label className="flex items-center gap-3 p-3 rounded-xl bg-[#F4F8FF] border border-[#1B6FE8]/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allResetScopesSelected}
                    onChange={toggleAllResetScopes}
                    className="w-4 h-4 rounded border-gray-300 text-[#1B6FE8] focus:ring-[#1B6FE8]"
                  />
                  <div>
                    <p className="text-sm font-bold text-[#1B6FE8]">Select All</p>
                    <p className="text-xs text-gray-500">Reset every page and sub-page (full wipe)</p>
                  </div>
                </label>

                {CSR_RESET_GROUPS.map(group => {
                  const groupChecked = isGroupFullySelected(group.id);
                  const groupPartial = isGroupPartiallySelected(group.id);
                  return (
                    <div key={group.id} className="rounded-xl border border-gray-100 overflow-hidden">
                      <label className="flex items-start gap-3 p-3 bg-[#F8F9FC] cursor-pointer border-b border-gray-100">
                        <input
                          type="checkbox"
                          checked={groupChecked}
                          ref={el => {
                            if (el) el.indeterminate = groupPartial;
                          }}
                          onChange={() => toggleResetGroup(group.id)}
                          className="w-4 h-4 mt-0.5 rounded border-gray-300 text-[#1B6FE8] focus:ring-[#1B6FE8]"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-800">{group.label}</p>
                          {group.description && (
                            <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>
                          )}
                        </div>
                      </label>

                      <div className="divide-y divide-gray-50">
                        {group.children.map(child => {
                          const checked = resetScopes.includes(child.id);
                          return (
                            <label
                              key={child.id}
                              className={`flex items-start gap-3 px-3 py-2.5 pl-8 cursor-pointer transition-colors ${
                                checked ? "bg-[#F4F8FF]" : "hover:bg-gray-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleResetScope(child.id)}
                                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-[#1B6FE8] focus:ring-[#1B6FE8]"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800">{child.label}</p>
                                <p className="text-[11px] text-gray-500 mt-0.5">{child.description}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-6 pt-4 shrink-0 border-t border-gray-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => !resettingCsr && setResetUser(null)}
                  disabled={resettingCsr}
                  className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-2xl hover:bg-gray-50 transition-all text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void runCsrReset()}
                  disabled={resettingCsr || resetScopes.length === 0}
                  className="flex-1 bg-[#1B6FE8] text-white py-3 rounded-2xl hover:bg-[#a30f27] transition-all text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {resettingCsr && <RotateCcw size={14} className="animate-spin" />}
                  {resettingCsr ? "Resetting…" : `Reset (${resetScopes.length})`}
                </button>
              </div>
            </div>
          </div>
        )}

        {openMenu && menuUser && createPortal(
          <div
            className="fixed w-56 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden z-[200] py-1"
            style={{ top: openMenu.top, right: openMenu.right }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { openPasswordModal(menuUser); setOpenMenu(null); }}
              className="w-full text-left px-3.5 py-2.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <KeyRound size={13} className="text-violet-500"/> Change Password
            </button>
            <button
              type="button"
              onClick={() => { openChatRestrictions(menuUser); setOpenMenu(null); }}
              className="w-full text-left px-3.5 py-2.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <MessageSquare size={13} className="text-cyan-600"/> Chat Restrictions
              {(menuUser.chatEnabled === false ||
                (menuUser.chatAllowedUserIds?.length ?? 0) > 0 ||
                (menuUser.chatVisibleToUserIds?.length ?? 0) > 0) && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-500" />
              )}
            </button>
            <button
              type="button"
              onClick={() => { handleLogoutAllDevices(menuUser); setOpenMenu(null); }}
              className="w-full text-left px-3.5 py-2.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <LogOut size={13} className="text-sky-600"/> Logout from all devices
            </button>
            <button
              type="button"
              onClick={() => { toggleStatus(menuUser); setOpenMenu(null); }}
              className="w-full text-left px-3.5 py-2.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <Ban size={13} className="text-amber-600"/>
              {menuUser.status === "Active" ? "Block User" : "Unblock User"}
            </button>
            {menuUser.role === "CSR" && (
              <button
                type="button"
                onClick={() => { handleResetCSR(menuUser); setOpenMenu(null); }}
                className="w-full text-left px-3.5 py-2.5 text-[12px] font-medium text-orange-600 hover:bg-orange-50 flex items-center gap-2"
              >
                <RotateCcw size={13}/> Reset Data
              </button>
            )}
            <div className="border-t border-gray-100 my-1" />
            <button
              type="button"
              onClick={() => { handleDelete(menuUser.id); setOpenMenu(null); }}
              className="w-full text-left px-3.5 py-2.5 text-[12px] font-medium text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <Trash2 size={13}/> Delete User
            </button>
          </div>,
          document.body,
        )}
      </main>
    </div>
  );
}
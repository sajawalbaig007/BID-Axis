"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import toast, { Toaster } from "react-hot-toast";
import {
  Save, Camera, ShieldAlert, KeyRound, ToggleLeft, ToggleRight,
  Globe, LogOut, X, Eye, EyeOff, ShieldCheck, Lock, Mail,
  User2, CalendarDays,
} from "lucide-react";

import DashboardSidebar from "../components/layout/Sidebar";
import DashboardNavbar  from "../components/layout/Navbar";
import API, { getApiBase } from "@/lib/api";
import { formatEstDateShort, formatEstDateTime } from "@/lib/estTime";
import { logoutSession } from "@/lib/session";
import { setAuthMeCache, invalidateAuthMeCache } from "@/lib/authMeCache";

function Skeleton({ w = "w-32", h = "h-5" }: { w?: string; h?: string }) {
  return <div className={`${h} ${w} bg-gray-100 rounded-lg animate-pulse`} />;
}

type AdminProfile = {
  id: string; name: string; email: string;
  role: string; twoFAEnabled: boolean; createdAt: string;
  profilePic?: string | null; cnic?: string | null;
};

const ADMIN_2FA_EMAIL = "mohsin.bemsolutions@gmail.com";

export default function AdminSettingsPage() {
  const [profile,         setProfile]         = useState<AdminProfile | null>(null);
  const [loadingProfile,  setLoadingProfile]   = useState(true);
  const [saving,          setSaving]           = useState(false);
  const [form,            setForm]             = useState({ name: "", email: "", cnic: "" });
  const [uploadingPic,    setUploadingPic]     = useState(false);

  const [pwForm,          setPwForm]           = useState({ current: "", next: "", confirm: "" });
  const [showCurrentPw,   setShowCurrentPw]    = useState(false);
  const [showNextPw,      setShowNextPw]       = useState(false);
  const [savingPw,        setSavingPw]         = useState(false);

  const [twoFactor,       setTwoFactor]        = useState(false);
  const [togglingTwoFa,   setTogglingTwoFa]    = useState(false);

  const [profileImage,    setProfileImage]     = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showLogoutModal, setShowLogoutModal]  = useState(false);
  const [loggingOutAll,   setLoggingOutAll]    = useState(false);
  const [auditLogs,       setAuditLogs]        = useState<{ action: string; email?: string; ip?: string; createdAt: string }[]>([]);
  const [auditFrom,       setAuditFrom]        = useState("");
  const [auditTo,         setAuditTo]          = useState("");

  const fetchAuditLogs = useCallback((from?: string, to?: string) => {
    const qs = new URLSearchParams({ limit: "50" });
    if (from) qs.set("fromDate", from);
    if (to) qs.set("toDate", to);
    API.get(`/auth/audit-logs?${qs}`)
      .then(res => setAuditLogs(res.data.logs ?? []))
      .catch(() => {});
  }, []);

  /* ── FETCH ── */
  const fetchProfile = useCallback(async () => {
    try {
      setLoadingProfile(true);
      const res  = await API.get("/auth/me");
      const data: AdminProfile = res.data.user ?? res.data;
      setProfile(data);
      setForm({ name: data.name ?? "", email: data.email ?? "", cnic: data.cnic ?? "" });
      setProfileImage(data.profilePic ?? null);
      setTwoFactor(data.twoFAEnabled ?? false);
    } catch {
      console.log("Profile fetch failed");
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => { await fetchProfile(); };
    load();
    fetchAuditLogs();
  }, [fetchProfile, fetchAuditLogs]);

  /* ── SAVE PROFILE ── */
  const handleSaveProfile = async () => {
    if (!form.name || !form.email) { toast.error("Name and email required."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error("Invalid email."); return; }
    setSaving(true);
    try {
      const res = await API.put("/auth/profile", {
        name: form.name,
        email: form.email,
        profilePic: profileImage,
        cnic: form.cnic.trim() || null,
      });
      const updated = res.data?.user;
      if (updated) setAuthMeCache(updated);
      else invalidateAuthMeCache();
      toast.success("Profile updated.");
      fetchProfile();
    } catch { toast.error("Failed to update profile."); }
    finally { setSaving(false); }
  };

  /* ── CHANGE PASSWORD ── */
  const handleChangePassword = async () => {
    if (!pwForm.current)               { toast.error("Enter current password."); return; }
    if (pwForm.next.length < 8)        { toast.error("Min. 8 characters with upper, lower, and number."); return; }
    if (pwForm.next !== pwForm.confirm) { toast.error("Passwords do not match."); return; }
    setSavingPw(true);
    try {
      const res = await API.put("/auth/change-password", { currentPassword: pwForm.current, newPassword: pwForm.next });
      toast.success(res.data?.message ?? "Password changed.");
      setPwForm({ current: "", next: "", confirm: "" });
      if (res.data?.requiresReLogin) {
        await logoutSession(async () => {});
        setTimeout(() => { window.location.href = "/"; }, 800);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Failed to change password.");
    } finally { setSavingPw(false); }
  };

  /* ── TOGGLE 2FA ── */
  const handleToggle2FA = async () => {
    setTogglingTwoFa(true);
    const newVal = !twoFactor;
    try {
      await API.put("/auth/toggle-2fa", { enabled: newVal });
      setTwoFactor(newVal);
      toast.success(newVal ? `2FA enabled — OTP to ${profile?.email ?? "your email"}` : "2FA disabled.");
    } catch { toast.error("Failed to toggle 2FA."); }
    finally { setTogglingTwoFa(false); }
  };

  const handleLogoutAll = async () => {
    setLoggingOutAll(true);
    try {
      const res = await API.post("/auth/logout-all");
      toast.success(res.data?.message ?? "Logged out from all devices.");
      await logoutSession(async () => {});
      setTimeout(() => { window.location.href = "/"; }, 800);
    } catch {
      toast.error("Failed to logout all devices.");
    } finally { setLoggingOutAll(false); }
  };

  /* ── LOGOUT ── */
  const handleLogout = async () => {
    setShowLogoutModal(false);
    await logoutSession(() => API.post("/auth/logout", {}, { withCredentials: true }));
    toast.success("Logged out.");
    setTimeout(() => { window.location.href = "/"; }, 600);
  };

  /* ── PROFILE IMAGE ── */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    setUploadingPic(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${getApiBase()}/users/upload-pic`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        toast.error(data.message || "Image upload failed.");
        return;
      }
      setProfileImage(data.url);
      /* Persist immediately so header updates without waiting for Save */
      const saveRes = await API.put("/auth/profile", {
        name: form.name || profile?.name,
        email: form.email || profile?.email,
        profilePic: data.url,
        cnic: form.cnic.trim() || null,
      });
      const updated = saveRes.data?.user;
      if (updated) setAuthMeCache(updated);
      else invalidateAuthMeCache();
      toast.success("Profile photo updated.");
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploadingPic(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const initial    = profile?.name?.charAt(0)?.toUpperCase() ?? "A";
  const joinedDate = profile?.createdAt
    ? formatEstDateShort(profile.createdAt)
    : "—";

  return (
    <div className="flex min-h-screen bg-[#F5F6FA]">
      <Toaster position="top-right" toastOptions={{
        style: { borderRadius: "16px", fontSize: "14px" },
        success: { iconTheme: { primary: "#027A48", secondary: "#fff" } },
        error:   { iconTheme: { primary: "#1B6FE8", secondary: "#fff" } },
      }} />

      <DashboardSidebar />

      <main className="flex-1 min-w-0 p-3 sm:p-4 md:p-5 lg:p-6 xl:p-7 2xl:p-8 overflow-x-hidden mt-[var(--app-header-h,64px)]">
        <DashboardNavbar />

        {/* ── HEADER ── */}
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-gray-800">Settings</h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-0.5 sm:mt-1">
            Manage your account, security and preferences.
          </p>
        </div>

        {/* ── PROFILE SUMMARY BANNER ── */}
        <div className="bg-white rounded-2xl sm:rounded-[28px] border border-gray-100 shadow-sm p-4 sm:p-5 mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
            {/* Avatar */}
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#EAF2FE] text-[#1B6FE8] flex items-center justify-center font-bold text-xl sm:text-2xl shrink-0">
              {loadingProfile ? "…" : initial}
            </div>

            {/* Info grid — 1 col mobile, 3 col sm+ */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {[
                {
                  Icon: User2, bg: "bg-[#EAF2FE]", color: "text-[#1B6FE8]",
                  label: "Full Name", value: profile?.name ?? "—", skw: "w-24",
                },
                {
                  Icon: Mail, bg: "bg-blue-50", color: "text-blue-500",
                  label: "Email", value: profile?.email ?? "—", skw: "w-36",
                },
                {
                  Icon: CalendarDays, bg: "bg-green-50", color: "text-green-600",
                  label: "Joined", value: joinedDate, skw: "w-20",
                },
              ].map(({ Icon, bg, color, label, value, skw }) => (
                <div key={label} className="flex items-center gap-2.5 sm:gap-3">
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl ${bg} ${color} flex items-center justify-center shrink-0`}>
                    <Icon size={14} className="sm:w-4 sm:h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] sm:text-xs text-gray-400">{label}</p>
                    {loadingProfile ? <Skeleton w={skw} /> : (
                      <p className="font-semibold text-gray-800 text-xs sm:text-sm truncate">{value}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Role badge */}
            <div className="shrink-0">
              {loadingProfile ? <Skeleton w="w-20" h="h-8" /> : (
                <span className="bg-[#EAF2FE] text-[#1B6FE8] px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold capitalize">
                  {profile?.role ?? "Admin"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        {/* 2-col mobile → 2-col sm → 4-col xl */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
          {/* Security Level */}
          <div className="bg-white rounded-2xl sm:rounded-[28px] border border-gray-100 p-3 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <p className="text-[11px] sm:text-sm text-gray-400">Security</p>
              <ShieldAlert size={16} className="text-[#1B6FE8] sm:w-5 sm:h-5" />
            </div>
            <p className={`font-bold text-base sm:text-lg ${twoFactor ? "text-[#027A48]" : "text-[#1B6FE8]"}`}>
              {twoFactor ? "Maximum" : "Standard"}
            </p>
            <div className="w-full h-1.5 sm:h-2 rounded-full bg-gray-100 mt-1.5 sm:mt-2 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${twoFactor ? "w-full bg-[#027A48]" : "w-[55%] bg-[#1B6FE8]"}`} />
            </div>
            <p className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-1.5">
              {twoFactor ? "2FA active" : "Enable 2FA"}
            </p>
          </div>

          {/* 2FA */}
          <div className="bg-white rounded-2xl sm:rounded-[28px] border border-gray-100 p-3 sm:p-5 shadow-sm">
            <p className="text-[11px] sm:text-sm text-gray-400 mb-2 sm:mb-3">Two Factor</p>
            <p className={`font-bold text-lg sm:text-xl ${twoFactor ? "text-[#027A48]" : "text-gray-400"}`}>
              {twoFactor ? "Enabled" : "Disabled"}
            </p>
            <div className="flex items-center gap-1 sm:gap-1.5 mt-1.5 sm:mt-2">
              <ShieldCheck size={11} className={`sm:w-[13px] sm:h-[13px] ${twoFactor ? "text-[#027A48]" : "text-gray-300"}`} />
              <span className="text-[10px] sm:text-xs text-gray-400">
                {twoFactor ? "OTP via email" : "Not configured"}
              </span>
            </div>
          </div>

          {/* Role */}
          <div className="bg-white rounded-2xl sm:rounded-[28px] border border-gray-100 p-3 sm:p-5 shadow-sm">
            <p className="text-[11px] sm:text-sm text-gray-400 mb-2 sm:mb-3">Role</p>
            {loadingProfile
              ? <Skeleton w="w-16 sm:w-20" h="h-6 sm:h-7" />
              : <p className="font-bold text-lg sm:text-xl text-[#1B6FE8] capitalize">{profile?.role ?? "Admin"}</p>
            }
            <p className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2">Full access</p>
          </div>

          {/* Session */}
          <div className="bg-white rounded-2xl sm:rounded-[28px] border border-gray-100 p-3 sm:p-5 shadow-sm">
            <p className="text-[11px] sm:text-sm text-gray-400 mb-2 sm:mb-3">Session</p>
            <p className="font-bold text-lg sm:text-xl text-gray-800">Active</p>
            <p className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2">Current device</p>
          </div>
        </div>

        {/* ── MAIN GRID ──
            Mobile/tablet: stacked
            xl+: Profile (1 col) | Security+Password+Danger (2 col) */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">

          {/* ── LEFT: Profile card ── */}
          <div className="xl:col-span-1">
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 p-4 sm:p-6 shadow-sm">
              {/* Avatar + info */}
              <div className="flex flex-col items-center text-center mb-4 sm:mb-6">
                <div className="relative">
                  <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-[#EAF2FE] flex items-center justify-center">
                    {profileImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[#1B6FE8] text-3xl sm:text-4xl font-bold">{initial}</span>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPic}
                    className="absolute bottom-0 right-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#1B6FE8] text-white flex items-center justify-center shadow-lg hover:bg-[#a30f27] transition-all disabled:opacity-60"
                  >
                    <Camera size={14} className="sm:w-4 sm:h-4" />
                  </button>
                </div>

                {loadingProfile ? (
                  <div className="mt-3 sm:mt-4 space-y-2 flex flex-col items-center">
                    <Skeleton w="w-28 sm:w-32" />
                    <Skeleton w="w-16 sm:w-20" />
                  </div>
                ) : (
                  <>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-800 mt-3 sm:mt-4">
                      {profile?.name ?? "Admin"}
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-400 mt-0.5 capitalize">{profile?.role ?? "Admin"}</p>
                    <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 truncate max-w-full px-2">
                      {profile?.email}
                    </p>
                  </>
                )}
              </div>

              {/* Form */}
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className="text-xs sm:text-sm text-gray-500 mb-1.5 sm:mb-2 block">Full Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Enter your name"
                    className="w-full border border-gray-200 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 outline-none focus:border-[#1B6FE8] text-sm transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs sm:text-sm text-gray-500 mb-1.5 sm:mb-2 block">Email Address</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="Enter email"
                    className="w-full border border-gray-200 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 outline-none focus:border-[#1B6FE8] text-sm transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs sm:text-sm text-gray-500 mb-1.5 sm:mb-2 block">CNIC</label>
                  <input
                    type="text"
                    value={form.cnic}
                    onChange={e => setForm({ ...form, cnic: e.target.value })}
                    placeholder="xxxxx-xxxxxxx-x"
                    className="w-full border border-gray-200 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 outline-none focus:border-[#1B6FE8] text-sm transition-all font-mono"
                  />
                </div>
                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className={`w-full py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-semibold flex items-center justify-center gap-2 text-sm transition-all ${
                    saving
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-[#1B6FE8] text-white hover:bg-[#a30f27]"
                  }`}
                >
                  <Save size={14} className="sm:w-4 sm:h-4" />
                  {saving ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Password + Security + Danger ── */}
          <div className="xl:col-span-2 space-y-4 sm:space-y-6">

            {/* Change Password */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 p-4 sm:p-6 shadow-sm">
              <div className="flex items-center gap-2.5 sm:gap-3 mb-4 sm:mb-6">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[#EAF2FE] text-[#1B6FE8] flex items-center justify-center shrink-0">
                  <Lock size={15} className="sm:w-[18px] sm:h-[18px]" />
                </div>
                <div>
                  <h2 className="text-base sm:text-xl font-semibold text-gray-800">Change Password</h2>
                  <p className="text-xs sm:text-sm text-gray-400">Update your account password securely</p>
                </div>
              </div>

              <div className="space-y-3 sm:space-y-4">
                {/* Current password */}
                <div>
                  <label className="text-xs sm:text-sm text-gray-500 mb-1.5 sm:mb-2 block">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPw ? "text" : "password"}
                      value={pwForm.current}
                      onChange={e => setPwForm({ ...pwForm, current: e.target.value })}
                      placeholder="Enter current password"
                      className="w-full border border-gray-200 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 pr-11 sm:pr-12 outline-none focus:border-[#1B6FE8] text-sm transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw(!showCurrentPw)}
                      className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPw ? <EyeOff size={15} className="sm:w-4 sm:h-4" /> : <Eye size={15} className="sm:w-4 sm:h-4" />}
                    </button>
                  </div>
                </div>

                {/* New + Confirm — side by side sm+ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="text-xs sm:text-sm text-gray-500 mb-1.5 sm:mb-2 block">New Password</label>
                    <div className="relative">
                      <input
                        type={showNextPw ? "text" : "password"}
                        value={pwForm.next}
                        onChange={e => setPwForm({ ...pwForm, next: e.target.value })}
                        placeholder="Min. 6 characters"
                        className="w-full border border-gray-200 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 pr-11 sm:pr-12 outline-none focus:border-[#1B6FE8] text-sm transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNextPw(!showNextPw)}
                        className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showNextPw ? <EyeOff size={15} className="sm:w-4 sm:h-4" /> : <Eye size={15} className="sm:w-4 sm:h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm text-gray-500 mb-1.5 sm:mb-2 block">Confirm Password</label>
                    <input
                      type="password"
                      value={pwForm.confirm}
                      onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })}
                      placeholder="Re-enter password"
                      className={`w-full border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 outline-none text-sm transition-all ${
                        pwForm.confirm && pwForm.next !== pwForm.confirm
                          ? "border-red-300 focus:border-red-400"
                          : "border-gray-200 focus:border-[#1B6FE8]"
                      }`}
                    />
                    {pwForm.confirm && pwForm.next !== pwForm.confirm && (
                      <p className="text-[10px] sm:text-xs text-red-500 mt-1">Passwords do not match</p>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleChangePassword}
                  disabled={savingPw}
                  className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-semibold text-sm flex items-center gap-2 transition-all ${
                    savingPw
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-[#111827] text-white hover:bg-black"
                  }`}
                >
                  <KeyRound size={14} className="sm:w-4 sm:h-4" />
                  {savingPw ? "Changing..." : "Change Password"}
                </button>
              </div>
            </div>

            {/* Security & Region */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 p-4 sm:p-6 shadow-sm">
              <h2 className="text-base sm:text-xl font-semibold text-gray-800 mb-4 sm:mb-5">
                Security & Region
              </h2>

              {/* 2FA row */}
              <div className="flex items-start justify-between gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAFAFA] border border-gray-100">
                <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 ${
                    twoFactor ? "bg-[#ECFDF3] text-[#027A48]" : "bg-[#EAF2FE] text-[#1B6FE8]"
                  }`}>
                    <ShieldCheck size={15} className="sm:w-[18px] sm:h-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-800 text-sm sm:text-base">Two Factor Auth</h3>
                    <p className="text-[11px] sm:text-sm text-gray-400 mt-0.5">OTP sent to your email on login</p>
                    <div className="flex items-center gap-1 sm:gap-1.5 mt-1.5 sm:mt-2 bg-white border border-gray-100 rounded-xl px-2.5 sm:px-3 py-1 sm:py-1.5 w-fit">
                      <Mail size={10} className="text-[#1B6FE8] sm:w-[11px] sm:h-[11px]" />
                      <span className="text-[10px] sm:text-xs font-medium text-gray-600 truncate max-w-[160px] sm:max-w-none">
                        {profile?.email ?? ADMIN_2FA_EMAIL}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleToggle2FA}
                  disabled={togglingTwoFa}
                  className={`shrink-0 transition-all ${togglingTwoFa ? "opacity-40 cursor-not-allowed" : "opacity-100"}`}
                >
                  {twoFactor
                    ? <ToggleRight size={40} className="text-[#027A48] sm:w-12 sm:h-12" />
                    : <ToggleLeft  size={40} className="text-gray-300 sm:w-12 sm:h-12" />
                  }
                </button>
              </div>

              <div className="h-px bg-gray-50 my-3 sm:my-4" />

              {/* Region */}
              <div className="flex items-center justify-between p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAFAFA] border border-gray-100">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                    <Globe size={15} className="sm:w-[18px] sm:h-[18px]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 text-sm sm:text-base">Region</h3>
                    <p className="text-[11px] sm:text-sm text-gray-400 mt-0.5">Pakistan (Urdu / EN)</p>
                  </div>
                </div>
                <span className="text-xl sm:text-2xl">🇵🇰</span>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-red-100 p-4 sm:p-6 shadow-sm space-y-3">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                  <LogOut size={15} className="sm:w-[18px] sm:h-[18px]" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-red-600">Session</h2>
                  <p className="text-xs sm:text-sm text-gray-400">Logout this device or all devices</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setShowLogoutModal(true)}
                  className="px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-all">
                  Logout
                </button>
                <button onClick={handleLogoutAll} disabled={loggingOutAll}
                  className="px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border-2 border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition-all">
                  {loggingOutAll ? "Logging out…" : "Logout all devices"}
                </button>
              </div>
            </div>

            {/* Audit log */}
            {auditLogs.length > 0 && (
              <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 p-4 sm:p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                  <h2 className="text-base sm:text-xl font-semibold text-gray-800">Security Activity</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="date" value={auditFrom} onChange={e => setAuditFrom(e.target.value)}
                      className="h-9 rounded-xl border border-gray-200 px-3 text-xs outline-none focus:border-[#1B6FE8]" />
                    <span className="text-gray-400 text-xs">→</span>
                    <input type="date" value={auditTo} onChange={e => setAuditTo(e.target.value)}
                      className="h-9 rounded-xl border border-gray-200 px-3 text-xs outline-none focus:border-[#1B6FE8]" />
                    <button type="button" onClick={() => fetchAuditLogs(auditFrom, auditTo)}
                      disabled={!auditFrom || !auditTo}
                      className="h-9 px-3 rounded-xl bg-[#1B6FE8] text-white text-xs font-semibold disabled:opacity-40">
                      Filter
                    </button>
                    <button type="button" onClick={() => { setAuditFrom(""); setAuditTo(""); fetchAuditLogs(); }}
                      className="h-9 px-3 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600">
                      Reset
                    </button>
                  </div>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {auditLogs.map((log, i) => (
                    <div key={i} className="text-xs text-gray-600 flex justify-between gap-2 border-b border-gray-50 pb-1.5">
                      <span className="font-medium capitalize">{log.action.replace(/_/g, " ")}</span>
                      <span className="text-gray-400 shrink-0">{formatEstDateTime(log.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── LOGOUT MODAL ── */}
        {showLogoutModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-[28px] p-5 sm:p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Confirm Logout</h2>
                <button
                  onClick={() => setShowLogoutModal(false)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                >
                  <X size={14} className="sm:w-4 sm:h-4" />
                </button>
              </div>
              <div className="bg-red-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 mb-4 sm:mb-5">
                <p className="text-xs sm:text-sm text-red-600">You will be logged out of this device.</p>
              </div>
              <div className="flex gap-2 sm:gap-3">
                <button
                  onClick={() => setShowLogoutModal(false)}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
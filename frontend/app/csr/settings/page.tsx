"use client";

import { useState, useEffect, useCallback } from "react";
import toast, { Toaster } from "react-hot-toast";
import { ShieldCheck, ToggleLeft, ToggleRight, Mail } from "lucide-react";
import TopNavbar from "../components/navigation/TopNavbar";
import { ZoomDialerDefaultCard } from "../components/dialer/ZoomDialerProvider";
import API from "@/lib/api";

type Profile = {
  id: string; name: string; email: string; role: string; twoFAEnabled: boolean;
};

export default function CSRSettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [twoFactor, setTwoFactor] = useState(false);
  const [toggling2fa, setToggling2fa] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await API.get("/auth/me");
      const u: Profile = res.data.user ?? res.data;
      setProfile(u);
      setTwoFactor(u.twoFAEnabled ?? false);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void fetchProfile(); }, [fetchProfile]);

  const handleToggle2FA = async () => {
    setToggling2fa(true);
    const next = !twoFactor;
    try {
      await API.put("/auth/toggle-2fa", { enabled: next });
      setTwoFactor(next);
      toast.success(next ? `2FA enabled — OTP to ${profile?.email}` : "2FA disabled.");
    } catch { toast.error("Failed to toggle 2FA."); }
    finally { setToggling2fa(false); }
  };

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      <Toaster position="top-right" />
      <TopNavbar />
      <main className="max-w-2xl mx-auto p-4 sm:p-6 mt-[72px] space-y-4">
        <h1 className="text-xl font-bold text-gray-800">Security Settings</h1>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ECFDF3] text-[#027A48] flex items-center justify-center">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h2 className="font-semibold text-gray-800">Two-Factor Authentication</h2>
                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                  <Mail size={10} /> OTP to {profile?.email ?? "your email"}
                </p>
              </div>
            </div>
            <button onClick={handleToggle2FA} disabled={toggling2fa} className="shrink-0">
              {twoFactor ? <ToggleRight size={40} className="text-[#027A48]" /> : <ToggleLeft size={40} className="text-gray-300" />}
            </button>
          </div>
        </div>

        <ZoomDialerDefaultCard />
      </main>
    </div>
  );
}

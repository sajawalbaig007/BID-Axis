"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Shield } from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage } from "@/lib/api";
import { PORTAL_LOGIN_COPY } from "@/lib/loginRole";
import {
  COMPANY_META,
  COMPANY_PORTAL_ROLES,
  clearCompanyGate,
  getCompanyGate,
  setCompanyGate,
  type PortalCompany,
} from "@/lib/companyGate";
import { LANDING_PORTALS } from "@/lib/landingPortals";
import DevToolsGuard from "@/app/components/DevToolsGuard";
import BrandLogo from "@/app/components/BrandLogo";
import BemWordmark from "@/app/components/BemWordmark";
import GpsLogo from "@/app/components/GpsLogo";
import GpsWordmark from "@/app/components/GpsWordmark";
import CompanyPortalChrome from "@/app/components/CompanyPortalChrome";
import LoginPeekCharacter from "@/app/components/LoginPeekCharacter";

const SLIDE_MS = 5200;
const CHIPS_PER_ROW = 2;

export default function CompanyAccessPage({ company }: { company: PortalCompany }) {
  const meta = COMPANY_META[company];
  const portals = useMemo(
    () => LANDING_PORTALS.filter(p => COMPANY_PORTAL_ROLES[company].includes(p.value)),
    [company],
  );

  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<"username" | "password" | null>(null);
  const [loading, setLoading] = useState(false);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const active = portals[index] ?? portals[0];
  const chipTrackRef = useRef<HTMLDivElement>(null);
  const chipBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [capsule, setCapsule] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    ready: false,
  });

  const go = useCallback((next: number) => {
    if (portals.length === 0) return;
    setIndex(((next % portals.length) + portals.length) % portals.length);
  }, [portals.length]);

  const measureCapsule = useCallback(() => {
    const btn = chipBtnRefs.current[index];
    if (!btn) return;
    setCapsule({
      left: btn.offsetLeft,
      top: btn.offsetTop,
      width: btn.offsetWidth,
      height: btn.offsetHeight,
      ready: true,
    });
  }, [index]);

  useLayoutEffect(() => {
    measureCapsule();
  }, [measureCapsule, unlocked]);

  useEffect(() => {
    const track = chipTrackRef.current;
    if (!track) return;
    const onResize = () => measureCapsule();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    ro?.observe(track);
    window.addEventListener("resize", onResize);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [measureCapsule, unlocked]);

  useEffect(() => {
    if (!unlocked || paused || portals.length < 2) return;
    const t = setInterval(() => go(index + 1), SLIDE_MS);
    return () => clearInterval(t);
  }, [index, paused, go, unlocked, portals.length]);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const gate = getCompanyGate();
      if (!gate || gate.company !== company) {
        if (gate && gate.company !== company) clearCompanyGate();
        if (!cancelled) {
          setUnlocked(false);
          setChecking(false);
        }
        return;
      }
      try {
        await API.post("/auth/company-session", { token: gate.token });
        if (!cancelled) setUnlocked(true);
      } catch {
        clearCompanyGate();
        if (!cancelled) setUnlocked(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [company]);

  async function handleCompanyLogin(e: { preventDefault(): void }) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await API.post("/auth/company-login", {
        company,
        username: username.trim(),
        password,
      });
      const token = String(res.data?.token ?? "");
      if (!token) {
        toast.error("Could not open company session.");
        return;
      }
      setCompanyGate(company, token);
      setUnlocked(true);
      setIndex(0);
      toast.success(`${meta.name} unlocked`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Invalid company username or password."));
    } finally {
      setLoading(false);
    }
  }

  function lockCompany() {
    clearCompanyGate();
    setUnlocked(false);
    setPassword("");
  }

  return (
    <>
      <DevToolsGuard />
      <CompanyPortalChrome company={company}>
        <div className="text-center mb-4 sm:mb-6 animate-[fadeUp_0.6s_ease-out] shrink-0">
          <div className="inline-flex items-center justify-center gap-3 sm:gap-4 mb-2.5">
            {company === "BEM" ? (
              <>
                <BrandLogo size="md" className="shrink-0" priority />
                <BemWordmark className="text-[20px] sm:text-[24px] md:text-[28px]" onDark />
              </>
            ) : (
              <>
                <div className="rounded-2xl bg-white p-2.5 shadow-lg">
                  <GpsLogo size="md" className="drop-shadow-none" priority />
                </div>
                <GpsWordmark onDark className="items-center" />
              </>
            )}
          </div>
          <p className="text-white/50 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] mb-1">
            {unlocked ? "Company portals" : "Company access"}
          </p>
          <p className="text-white/85 text-[12px] sm:text-[13px] max-w-sm mx-auto px-2 leading-relaxed">
            {unlocked
              ? `Pick a ${meta.name} dashboard and sign in.`
              : `Enter the shared ${meta.name} username and password.`}
          </p>
        </div>

        <div className="w-full max-w-[1080px] mx-auto">
          {checking ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">
              <div className="md:col-span-5 rounded-[1.75rem] border border-white/20 bg-white/[0.09] backdrop-blur-xl h-52 animate-pulse" />
              <div className="md:col-span-7 rounded-[1.75rem] border border-white/20 bg-white/[0.09] backdrop-blur-xl h-52 animate-pulse" />
            </div>
          ) : !unlocked ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 items-stretch">
              <div className="md:col-span-5 rounded-[1.5rem] sm:rounded-[1.85rem] border border-white/20 bg-white/[0.09] backdrop-blur-xl shadow-[0_24px_80px_-12px_rgba(0,0,0,0.5)] p-4 sm:p-5 flex flex-col items-center justify-end min-h-[280px] md:min-h-[460px]">
                <LoginPeekCharacter
                  accent={meta.accent}
                  username={username}
                  password={password}
                  showPassword={showPassword}
                  focusedField={focusedField}
                  className="h-[300px] w-[140px] sm:h-[360px] sm:w-[160px] md:h-[430px] md:w-[190px]"
                />
                <p className="mt-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">
                  {showPassword ? "Not looking…" : focusedField ? "Peeking" : "Watching"}
                </p>
              </div>

              <div className="md:col-span-7 rounded-[1.5rem] sm:rounded-[1.85rem] border border-white/20 bg-white/[0.09] backdrop-blur-xl shadow-[0_24px_80px_-12px_rgba(0,0,0,0.5)] p-5 sm:p-7 flex flex-col justify-center">
                <form onSubmit={handleCompanyLogin} className="space-y-4">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="inline-flex items-center gap-2">
                      <Shield size={13} className="text-white/70" />
                      <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
                        {meta.name} credentials
                      </p>
                    </div>
                    <Link
                      href="/"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/60 hover:text-white"
                    >
                      <ArrowLeft size={13} /> Companies
                    </Link>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-white/70 block mb-1.5">Username</label>
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      onFocus={() => setFocusedField("username")}
                      onBlur={() => setFocusedField(prev => (prev === "username" ? null : prev))}
                      placeholder={company}
                      className="w-full h-12 rounded-xl border border-white/20 bg-white/10 px-4 text-sm text-white placeholder:text-white/35 outline-none focus:border-white/50"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-white/70 block mb-1.5">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onFocus={() => setFocusedField("password")}
                        onBlur={() => setFocusedField(prev => (prev === "password" ? null : prev))}
                        placeholder="Password"
                        className="w-full h-12 rounded-xl border border-white/20 bg-white/10 px-4 pr-12 text-sm text-white placeholder:text-white/35 outline-none focus:border-white/50"
                      />
                      <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                      >
                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-xl text-white text-sm font-bold transition-all hover:brightness-110 disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{
                      background: `linear-gradient(135deg, ${meta.accent}, ${meta.accent}dd)`,
                      boxShadow: `0 8px 24px ${meta.accent}55`,
                    }}
                  >
                    {loading ? "Checking…" : `Unlock ${meta.name}`}
                    {!loading && <ArrowRight size={16} />}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div
              className="rounded-[1.35rem] sm:rounded-[1.75rem] border border-white/20 bg-white/[0.09] backdrop-blur-xl shadow-[0_24px_80px_-12px_rgba(0,0,0,0.5)] overflow-hidden flex-1 min-h-0 flex flex-col"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
              onFocusCapture={() => setPaused(true)}
              onBlurCapture={() => setPaused(false)}
            >
              <div className="relative p-4 sm:p-6 md:p-7 flex-1">
                <div className="flex items-center justify-between gap-2 mb-4 sm:mb-5">
                  <div className="inline-flex items-center gap-2">
                    <Shield size={13} className="text-white/70" />
                    <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
                      Dashboard preview
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={lockCompany}
                      className="text-[11px] font-semibold text-white/55 hover:text-white"
                    >
                      Lock
                    </button>
                    <Link href="/" className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/55 hover:text-white">
                      <ArrowLeft size={13} /> Companies
                    </Link>
                  </div>
                </div>

                <div className="relative overflow-hidden">
                  {portals.map((portal, i) => {
                    const PIcon = portal.icon;
                    const visible = i === index;
                    return (
                      <div
                        key={portal.value}
                        className={`transition-all duration-500 ease-out ${
                          visible
                            ? "relative opacity-100 translate-x-0"
                            : "absolute inset-0 opacity-0 translate-x-6 pointer-events-none"
                        }`}
                        aria-hidden={!visible}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
                          <div
                            className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0 transition-transform duration-500 overflow-hidden"
                            style={{
                              background: `linear-gradient(145deg, ${portal.accent}, ${portal.accent}cc)`,
                              boxShadow: `0 12px 32px ${portal.accent}55`,
                              transform: visible ? "scale(1)" : "scale(0.92)",
                            }}
                          >
                            <PIcon size={32} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5 drop-shadow-sm">
                              <span style={{ color: portal.accent }}>{PORTAL_LOGIN_COPY[portal.value].eyebrow}</span>
                            </p>
                            <h2 className="text-white text-xl sm:text-2xl md:text-[1.75rem] font-black tracking-tight leading-tight drop-shadow-sm">
                              {PORTAL_LOGIN_COPY[portal.value].slides[0]?.title ?? `${portal.label} Dashboard`}
                            </h2>
                            <p className="text-white/80 text-[12px] sm:text-[13px] mt-1.5 leading-relaxed max-w-md">
                              {portal.hint}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 sm:mt-6 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
                          <Link
                            href={`/login/${portal.value}`}
                            className="inline-flex items-center justify-center gap-2 h-11 sm:h-12 px-5 rounded-xl text-white text-sm font-bold transition-all hover:brightness-110 active:scale-[0.98]"
                            style={{
                              background: `linear-gradient(135deg, ${portal.accent}, ${portal.accent}dd)`,
                              boxShadow: `0 8px 24px ${portal.accent}55`,
                            }}
                          >
                            Continue to {portal.label}
                            <ArrowRight size={16} />
                          </Link>
                          <p className="text-[11px] text-white/65 sm:ml-1">
                            Staff sign-in · separate portal credentials
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {active && (
                <div className="border-t border-white/10 bg-black/25 px-2.5 sm:px-3 py-2 sm:py-2.5 shrink-0">
                  <div
                    ref={chipTrackRef}
                    className="relative grid gap-1 sm:gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${Math.min(CHIPS_PER_ROW, portals.length)}, minmax(0, 1fr))` }}
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute rounded-full border border-white/25 backdrop-blur-md transition-[transform,width,height,background-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[transform,width,height]"
                      style={{
                        width: capsule.width,
                        height: capsule.height,
                        transform: `translate(${capsule.left}px, ${capsule.top}px)`,
                        opacity: capsule.ready ? 1 : 0,
                        background: `linear-gradient(135deg, ${active.accent}ee, ${active.accent}99)`,
                        boxShadow: `0 4px 18px ${active.accent}55, inset 0 1px 0 rgba(255,255,255,0.25)`,
                      }}
                    />
                    {portals.map((portal, i) => {
                      const ChipIcon = portal.icon;
                      const on = i === index;
                      return (
                        <button
                          key={portal.value}
                          type="button"
                          ref={el => {
                            chipBtnRefs.current[i] = el;
                          }}
                          onClick={() => go(i)}
                          className={`relative z-[1] inline-flex w-full items-center justify-center gap-1 sm:gap-1.5 h-9 px-1.5 sm:px-2 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap transition-colors duration-300 min-w-0 ${
                            on ? "text-white" : "text-white/60 hover:text-white/95"
                          }`}
                        >
                          <ChipIcon size={13} className="shrink-0" />
                          <span className="truncate">{portal.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CompanyPortalChrome>
    </>
  );
}

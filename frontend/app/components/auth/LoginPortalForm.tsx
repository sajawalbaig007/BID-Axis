"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Eye, EyeOff, ShieldCheck, RefreshCw, AlertTriangle, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage, getClientAuthToken, setClientAuthToken } from "@/lib/api";
import { invalidateAuthMeCache } from "@/lib/authMeCache";
import { invalidateCsrDashboardCache } from "@/lib/csrDashboardCache";
import { invalidateAllCsrListCaches } from "@/lib/csrApiCache";
import { setFrontendSession, resolveLoginRole, dashboardPathForRole } from "@/lib/session";
import { PORTAL_LOGIN_COPY, PORTAL_OPTIONS, portalLabel, type PortalRole } from "@/lib/loginRole";
import { companyForPortal, setCompanyGate } from "@/lib/companyGate";
import DevToolsGuard from "@/app/components/DevToolsGuard";
import ThemeToggle from "@/app/components/ThemeToggle";

interface APIError {
  response?: { data?: { message?: string; code?: string; blocked?: boolean; attempts?: number; captchaRequired?: boolean } };
}
type Step = "credentials" | "otp";

const SLIDE_MS = 4500;

declare global {
  interface Window {
    crmTurnstileCb?: (token: string) => void;
  }
}

export default function LoginPortalForm({
  portal: loginPortal,
  onPortalChange,
}: {
  portal: PortalRole;
  onPortalChange?: (portal: PortalRole) => void;
}) {
  const copy = PORTAL_LOGIN_COPY[loginPortal];
  const loginSlides = copy.slides;
  const accent = "#1B6FE8";
  const portalCompany = companyForPortal(loginPortal);
  const [step, setStep] = useState<Step>("credentials");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [userId, setUserId] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState(2);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedMsg, setBlockedMsg] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaSiteKey, setCaptchaSiteKey] = useState("");
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<HTMLDivElement>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);
  const [slidePaused, setSlidePaused] = useState(false);

  useEffect(() => {
    if (slidePaused) return;
    const timer = setInterval(
      () => setActiveSlide(s => (s + 1) % loginSlides.length),
      SLIDE_MS,
    );
    return () => clearInterval(timer);
  }, [loginSlides.length, slidePaused, activeSlide]);

  useEffect(() => {
    API.get("/auth/captcha-config")
      .then(res => {
        setCaptchaEnabled(!!res.data?.enabled);
        setCaptchaSiteKey(res.data?.siteKey ?? "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!captchaEnabled || !showCaptcha) return;
    window.crmTurnstileCb = (token: string) => setCaptchaToken(token);
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      delete window.crmTurnstileCb;
      script.remove();
    };
  }, [captchaEnabled, showCaptcha]);

  useEffect(() => {
    const token = getClientAuthToken();
    if (token) {
      try {
        const part = token.split(".")[1];
        if (!part) {
          setClientAuthToken(null);
        } else {
          const payload = JSON.parse(
            atob(part.replace(/-/g, "+").replace(/_/g, "/")),
          ) as { exp?: number; sid?: string };
          if (!payload.sid || (payload.exp != null && payload.exp * 1000 < Date.now())) {
            setClientAuthToken(null);
          }
        }
      } catch {
        setClientAuthToken(null);
      }
    }
    setCompanyGate(portalCompany, "bidaxis");
  }, [portalCompany]);

  function hardRedirect(path: string) {
    window.location.href = path.startsWith("http") ? path : `${window.location.origin}${path}`;
  }

  async function completeLogin(
    data: { role?: string; user?: { role?: string }; token?: string },
    expectedPortal: PortalRole,
  ) {
    const role = resolveLoginRole(data);
    if (!role) {
      toast.error("Could not determine your role. Contact admin.");
      return;
    }
    if (role !== expectedPortal) {
      toast.error(`This account is not a ${portalLabel(expectedPortal)}. Use the correct portal on the home page.`);
      return;
    }
    const token = data.token?.trim();
    if (!token) {
      toast.error("Session could not be created. Redeploy backend and try again.");
      return;
    }
    const saved = await setFrontendSession(token);
    if (!saved) {
      toast.error("Failed to save login session. Please try again.");
      return;
    }
    invalidateAuthMeCache();
    invalidateCsrDashboardCache();
    invalidateAllCsrListCaches();
    void API.post("/chat/status", { online: true }).catch(() => {});
    hardRedirect(dashboardPathForRole(role));
  }

  const handleLogin = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await API.post("/auth/login", {
        email: email.trim().toLowerCase(),
        password,
        rememberMe,
        loginRole: loginPortal,
        captchaToken: captchaToken || undefined,
      }, { withCredentials: true });
      const data = res.data;
      if (data.requires2FA) {
        setUserId(data.userId);
        setAttemptsLeft(2);
        setIsBlocked(false);
        setOtp(["", "", "", "", "", ""]);
        setStep("otp");
        toast.success(data.message ?? "OTP sent to your email");
      } else {
        await completeLogin(data, loginPortal);
      }
    } catch (err: unknown) {
      const e = err as APIError;
      const data = e?.response?.data;
      if (data?.code === "ALREADY_LOGGED_IN") {
        toast.error(data.message ?? "Already logged in on another device.", { duration: 6000 });
      } else if (data?.captchaRequired || data?.code === "CAPTCHA_REQUIRED") {
        setShowCaptcha(true);
        toast.error(data?.message ?? "Please complete security verification.");
      } else if (data?.code === "CSR_SHIFT_CLOSED") {
        toast.error(data?.message ?? "You cannot log in before 6:00 PM PKT.", { duration: 8000 });
      } else if (data?.code === "PORTAL_ROLE_MISMATCH" || data?.code === "INVALID_LOGIN_ROLE") {
        toast.error(data?.message ?? `Only ${portalLabel(loginPortal)} accounts can sign in here.`, { duration: 6000 });
      } else if (typeof data?.message === "string" && data.message.includes("registered as")) {
        toast.error(data.message, { duration: 6000 });
      } else {
        toast.error(apiErrorMessage(err, "Login failed. Check email and password."));
        if (captchaEnabled) setShowCaptcha(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length < 6) {
      toast.error("Enter all 6 digits.");
      return;
    }
    setLoading(true);
    try {
      const res = await API.post("/auth/verify-otp", {
        userId,
        otp: code,
        rememberMe,
        loginRole: loginPortal,
      }, { withCredentials: true });
      await completeLogin(res.data, loginPortal);
    } catch (err: unknown) {
      const e = err as APIError;
      const data = e?.response?.data;
      if (data?.code === "ALREADY_LOGGED_IN") {
        toast.error(data.message ?? "Already logged in on another device.", { duration: 6000 });
        setStep("credentials");
      } else if (data?.code === "PORTAL_ROLE_MISMATCH" || (typeof data?.message === "string" && data.message.includes("registered as"))) {
        toast.error(data?.message ?? `Only ${portalLabel(loginPortal)} accounts can sign in here.`, { duration: 6000 });
        setStep("credentials");
      } else if (data?.blocked) {
        setIsBlocked(true);
        setBlockedMsg(data?.message ?? "Too many attempts.");
      } else {
        const left = data?.attempts !== undefined ? 2 - data.attempts : attemptsLeft - 1;
        setAttemptsLeft(Math.max(0, left));
        toast.error(apiErrorMessage(err, data?.message ?? "Incorrect OTP"));
        setOtp(["", "", "", "", "", ""]);
        otpRefs.current[0]?.focus();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await API.post("/auth/resend-otp", { userId });
      setAttemptsLeft(2);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
      toast.success(res.data.message ?? "OTP resent");
    } catch (err: unknown) {
      const e = err as APIError;
      const data = e?.response?.data;
      if (data?.blocked) {
        setIsBlocked(true);
        setBlockedMsg(data?.message ?? "Blocked.");
      } else {
        toast.error(data?.message ?? "Failed to resend OTP");
      }
    } finally {
      setResending(false);
    }
  };

  const handleOTPChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const updated = [...otp];
    updated[index] = value.slice(-1);
    setOtp(updated);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOTPKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleOTPPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(""));
      otpRefs.current[5]?.focus();
    }
  };

  const otpFilled = otp.join("").length === 6;
  const inputCls =
    "w-full h-[48px] sm:h-[52px] border border-crm-border bg-crm-surface rounded-xl px-4 text-sm text-crm-text placeholder:text-crm-text-faint outline-none transition-all focus:border-[#1B6FE8] focus:ring-4 focus:ring-[#1B6FE8]/8";

  return (
    <>
      <DevToolsGuard />
      <div className="h-[100dvh] relative flex items-center justify-center p-3 sm:p-4 md:p-5 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center scale-105"
          style={{
            backgroundImage: `linear-gradient(160deg, #071833 0%, #0E3A86 48%, #1B6FE8 100%)`,
          }}
        />
        <div className="absolute inset-0 backdrop-blur-[18px] bg-black/20 dark:bg-black/40" />

        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20">
          <ThemeToggle className="!w-9 !h-9 sm:!w-10 sm:!h-10 rounded-xl shadow-sm bg-white/10 border border-white/20 text-white" />
        </div>

        <div className="relative z-10 w-full max-w-[920px] max-h-[calc(100dvh-1.5rem)] bg-crm-surface/95 dark:bg-crm-surface/98 backdrop-blur-md rounded-2xl sm:rounded-[28px] overflow-hidden flex flex-col md:flex-row shadow-[0_24px_64px_rgba(0,0,0,0.35)] border border-white/10">
          <div
            className="flex md:w-[42%] relative flex-col items-center justify-center px-5 py-6 sm:px-8 sm:py-8 md:p-9 overflow-hidden select-none min-h-[180px] sm:min-h-[200px] md:min-h-0"
            style={{
              background: "linear-gradient(165deg, #071833 0%, #123A8C 46%, #1B6FE8 100%)",
            }}
            onMouseEnter={() => setSlidePaused(true)}
            onMouseLeave={() => setSlidePaused(false)}
          >
            <div className="absolute -top-16 -left-16 w-52 h-52 rounded-full bg-white/5" />
            <div className="absolute -bottom-20 -right-20 w-72 h-72 rounded-full bg-white/5" />
            <div className="relative z-10 text-center w-full max-w-[280px] flex flex-col items-center">
              <div className="mb-3 md:mb-4 flex items-center gap-2.5">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-[22px] font-black text-[#1B6FE8] shadow-lg">B</span>
                <span className="text-left leading-none">
                  <span className="block text-[18px] font-black tracking-tight text-white">BidAxis</span>
                  <span className="block text-[11px] font-semibold tracking-[0.18em] text-white/70">.CO</span>
                </span>
              </div>
              <div
                className="relative min-h-[100px] md:min-h-[110px] w-full cursor-pointer"
                onClick={() => setActiveSlide(s => (s + 1) % loginSlides.length)}
                role="presentation"
              >
                {loginSlides.map((slide, i) => (
                  <div
                    key={slide.title}
                    className={`absolute inset-x-0 top-0 transition-all duration-500 ${
                      i === activeSlide ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
                    }`}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/80 mb-2">
                      {copy.eyebrow}
                    </p>
                    <h1 className="text-white text-[22px] md:text-[26px] font-black leading-tight tracking-tight mb-2 drop-shadow-sm">
                      {slide.title}
                    </h1>
                    <p className="text-white/85 text-[12px] md:text-[13px] leading-relaxed mx-auto">{slide.subtitle}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center px-5 py-6 sm:px-8 sm:py-8 md:px-12 md:py-10 min-w-0 overflow-y-auto">
            {onPortalChange ? (
              <div className="mb-4 sm:mb-5">
                <p className="text-[11px] font-semibold text-crm-text-muted mb-2">BidAxis · choose your desk</p>
                <div className="flex flex-wrap gap-1.5">
                  {PORTAL_OPTIONS.map((opt) => {
                    const on = opt.value === loginPortal;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onPortalChange(opt.value)}
                        className={`h-8 px-2.5 rounded-full text-[11px] font-bold border transition-colors ${
                          on
                            ? "bg-[#1B6FE8] text-white border-[#1B6FE8]"
                            : "bg-white text-crm-text border-crm-border hover:border-[#1B6FE8]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-[12px] sm:text-[13px] font-semibold text-crm-text-muted hover:text-[#1B6FE8] mb-4 sm:mb-5 transition-colors w-fit"
            >
              <ArrowLeft size={14} /> BidAxis sign in
            </Link>
            )}

            {step === "credentials" && (
              <>
                <div className="mb-6 sm:mb-8">
                  <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: accent }}>{copy.eyebrow}</p>
                  <h2 className="text-[22px] sm:text-[28px] font-black text-crm-text tracking-tight leading-tight">{copy.heading}</h2>
                  <p className="text-crm-text-muted text-[12px] sm:text-[13px] mt-2">
                    {copy.subheading}
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-3.5 sm:space-y-4">
                  <div>
                    <label className="text-[11px] sm:text-[12px] font-semibold text-crm-text-muted block mb-1.5">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder={`${portalLabel(loginPortal)} email`}
                      className={inputCls}
                      autoComplete={`username ${loginPortal}`}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] sm:text-[12px] font-semibold text-crm-text-muted block mb-1.5">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Password"
                        className={`${inputCls} pr-12`}
                        autoComplete={`current-password ${loginPortal}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-crm-text-faint hover:text-crm-text-muted transition-colors"
                      >
                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>

                  {showCaptcha && captchaEnabled && captchaSiteKey && (
                    <div ref={captchaRef} key={String(showCaptcha)} className="cf-turnstile overflow-x-auto" data-sitekey={captchaSiteKey} data-callback="crmTurnstileCb" />
                  )}

                  <label className="flex items-center gap-2 text-xs sm:text-sm text-crm-text-secondary cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-crm-border text-[#1B6FE8] focus:ring-[#1B6FE8]"
                    />
                    Remember me for 7 days
                  </label>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-[48px] sm:h-[52px] rounded-xl text-white font-bold text-[13px] sm:text-[14px] tracking-wide transition-all disabled:opacity-60 flex items-center justify-center gap-2 active:scale-[0.99] hover:brightness-110"
                    style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)`, boxShadow: `0 6px 20px ${accent}66` }}
                  >
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Please wait…
                      </>
                    ) : (
                      "LOG IN"
                    )}
                  </button>
                </form>
              </>
            )}

            {step === "otp" && (
              <>
                {isBlocked ? (
                  <div className="text-center">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-red-500/10 dark:bg-red-500/15 flex items-center justify-center mx-auto mb-4">
                      <AlertTriangle size={26} className="text-red-500" />
                    </div>
                    <h2 className="text-[20px] sm:text-[22px] font-black text-crm-text">Access Blocked</h2>
                    <p className="text-crm-text-muted text-[12px] sm:text-[13px] mt-2 leading-6">{blockedMsg}</p>
                    <button
                      type="button"
                      onClick={() => { setStep("credentials"); setIsBlocked(false); setOtp(["", "", "", "", "", ""]); }}
                      className="mt-5 w-full h-11 sm:h-12 rounded-xl border border-crm-border text-crm-text-muted font-semibold text-[13px] hover:bg-crm-surface-muted transition-colors"
                    >
                      ← Back to Login
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mb-6 sm:mb-7">
                      <p className="text-[10px] sm:text-[11px] font-bold text-[#1B6FE8] uppercase tracking-[0.18em] mb-2">2-Factor Auth</p>
                      <h2 className="text-[22px] sm:text-[26px] font-black text-crm-text tracking-tight">Verify Identity</h2>
                      <p className="text-crm-text-muted text-[12px] sm:text-[13px] mt-2 leading-relaxed">6-digit code sent to your registered email</p>
                    </div>

                    <form onSubmit={handleVerifyOTP}>
                      <div className="flex gap-1.5 sm:gap-2.5" onPaste={handleOTPPaste}>
                        {otp.map((digit, i) => (
                          <input
                            key={i}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            ref={el => { otpRefs.current[i] = el; }}
                            onChange={e => handleOTPChange(i, e.target.value)}
                            onKeyDown={e => handleOTPKeyDown(i, e)}
                            className={`flex-1 min-w-0 h-[50px] sm:h-[58px] text-center text-[18px] sm:text-[22px] font-black rounded-xl border-2 outline-none transition-all ${
                              digit
                                ? "border-[#1B6FE8] bg-[#EAF2FE] dark:bg-[#1B6FE8]/15 text-[#1B6FE8] dark:text-[#ff6b85]"
                                : "border-crm-border bg-crm-surface text-crm-text focus:border-[#1B6FE8]"
                            }`}
                          />
                        ))}
                      </div>

                      <button
                        type="submit"
                        disabled={loading || !otpFilled}
                        className={`w-full h-[48px] sm:h-[52px] rounded-xl mt-4 sm:mt-5 font-bold text-[13px] sm:text-[14px] tracking-wide transition-all flex items-center justify-center gap-2 ${
                          otpFilled && !loading ? "text-white active:scale-[0.99] hover:brightness-110" : "bg-crm-muted text-crm-text-faint cursor-not-allowed"
                        }`}
                        style={otpFilled && !loading ? { background: "linear-gradient(135deg, #1B6FE8 0%, #8c0d22 100%)", boxShadow: "0 6px 20px rgba(184,17,45,0.4)" } : {}}
                      >
                        {loading ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verifying…
                          </>
                        ) : (
                          "VERIFY & SIGN IN"
                        )}
                      </button>

                      <div className="flex items-center justify-between mt-4 sm:mt-5 gap-2">
                        <button
                          type="button"
                          onClick={() => { setStep("credentials"); setOtp(["", "", "", "", "", ""]); setAttemptsLeft(2); }}
                          className="text-[12px] sm:text-[13px] text-crm-text-muted hover:text-crm-text-secondary font-medium transition-colors"
                        >
                          ← Back
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleResend()}
                          disabled={resending}
                          className="flex items-center gap-1.5 text-[12px] sm:text-[13px] text-[#1B6FE8] font-bold disabled:opacity-40 transition-colors"
                        >
                          <RefreshCw size={12} className={resending ? "animate-spin" : ""} />
                          {resending ? "Sending…" : "Resend OTP"}
                        </button>
                      </div>
                    </form>

                    <div className="mt-5 sm:mt-6 flex items-center gap-2 bg-crm-surface-muted border border-crm-border rounded-xl px-3 sm:px-4 py-2.5 sm:py-3">
                      <ShieldCheck size={14} className="text-[#1B6FE8] shrink-0" />
                      <p className="text-[10px] sm:text-[11px] text-crm-text-muted">Secured 2FA · Max 2 attempts · 5 min expiry</p>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

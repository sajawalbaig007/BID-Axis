"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";
import { PORTAL_LOGIN_COPY } from "@/lib/loginRole";
import { LANDING_PORTALS } from "@/lib/landingPortals";
import DevToolsGuard from "@/app/components/DevToolsGuard";
import ThemeToggle from "@/app/components/ThemeToggle";

const SLIDE_MS = 5200;

export default function BidAxisPortalPicker() {
  const portals = LANDING_PORTALS;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const active = portals[index] ?? portals[0];
  const chipTrackRef = useRef<HTMLDivElement>(null);
  const chipBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [capsule, setCapsule] = useState({ left: 0, top: 0, width: 0, height: 0, ready: false });

  const go = useCallback((next: number) => {
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
  }, [measureCapsule]);

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
  }, [measureCapsule]);

  useEffect(() => {
    if (paused || portals.length < 2) return;
    const t = setInterval(() => go(index + 1), SLIDE_MS);
    return () => clearInterval(t);
  }, [index, paused, go, portals.length]);

  return (
    <>
      <DevToolsGuard />
      <div className="h-[100dvh] relative flex items-center justify-center px-3 py-4 sm:px-6 overflow-hidden">
        <div
          className="absolute inset-0 scale-110 bg-cover bg-center"
          style={{
            backgroundImage:
              "linear-gradient(165deg, rgba(7,24,51,0.92) 0%, rgba(18,58,140,0.72) 46%, rgba(27,111,232,0.55) 100%)",
          }}
        />
        <div className="absolute inset-0 backdrop-blur-[22px] bg-[#071833]/35" />
        <div className="pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full bg-[#1B6FE8] opacity-40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -right-10 h-80 w-80 rounded-full bg-[#123A8C] opacity-50 blur-3xl" />

        <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-20">
          <ThemeToggle className="!h-10 !w-10 rounded-xl border border-white/25 bg-white/10 text-white shadow-lg backdrop-blur-sm sm:!h-11 sm:!w-11" />
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-[720px] flex-col">
          <div className="mb-4 shrink-0 text-center sm:mb-6">
            <div className="mb-3 inline-flex items-center justify-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-[22px] font-black text-[#1B6FE8] shadow-lg">
                B
              </span>
              <p className="text-left leading-none">
                <span className="block text-[22px] font-black tracking-tight text-white sm:text-[26px]">BidAxis</span>
                <span className="mt-1 block text-[11px] font-bold tracking-[0.22em] text-[#8EBEFF]">.CO</span>
              </p>
            </div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/55 sm:text-[11px]">
              Company portals
            </p>
            <p className="mx-auto max-w-sm px-2 text-[12px] leading-relaxed text-white/85 sm:text-[13px]">
              Pick a BidAxis dashboard and sign in.
            </p>
          </div>

          <div
            className="overflow-hidden rounded-[1.35rem] border border-white/20 bg-white/[0.08] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:rounded-[1.75rem]"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <div className="relative p-4 sm:p-6 md:p-7">
              <div className="mb-4 flex items-center justify-between gap-2 sm:mb-5">
                <div className="inline-flex items-center gap-2">
                  <Shield size={13} className="text-white/70" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70 sm:text-[11px]">
                    Dashboard preview
                  </p>
                </div>
              </div>

              <div className="relative overflow-hidden">
                {portals.map((portal, i) => {
                  const PIcon = portal.icon;
                  const visible = i === index;
                  const copy = PORTAL_LOGIN_COPY[portal.value];
                  return (
                    <div
                      key={portal.value}
                      className={`transition-all duration-500 ease-out ${
                        visible
                          ? "relative translate-x-0 opacity-100"
                          : "pointer-events-none absolute inset-0 translate-x-6 opacity-0"
                      }`}
                      aria-hidden={!visible}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                        <div
                          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg sm:h-20 sm:w-20"
                          style={{
                            background: `linear-gradient(145deg, ${portal.accent}, ${portal.accent}cc)`,
                            boxShadow: `0 12px 32px ${portal.accent}55`,
                          }}
                        >
                          <PIcon size={32} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: portal.accent }}>
                            {copy.eyebrow}
                          </p>
                          <h2 className="text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">
                            {copy.slides[0]?.title ?? `${portal.label} Dashboard`}
                          </h2>
                          <p className="mt-1.5 max-w-md text-[12px] leading-relaxed text-white/80 sm:text-[13px]">
                            {portal.hint}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-col gap-2.5 sm:mt-6 sm:flex-row sm:items-center sm:gap-3">
                        <Link
                          href={`/login/${portal.value}`}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white transition-all hover:brightness-110 active:scale-[0.98] sm:h-12"
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
              <div className="shrink-0 border-t border-white/10 bg-black/25 px-2.5 py-2 sm:px-3 sm:py-2.5">
                <div ref={chipTrackRef} className="relative grid grid-cols-2 gap-1 sm:gap-1.5">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute rounded-full border border-white/25 backdrop-blur-md transition-[transform,width,height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
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
                        ref={(el) => {
                          chipBtnRefs.current[i] = el;
                        }}
                        onClick={() => go(i)}
                        className={`relative z-[1] inline-flex h-9 w-full min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-[10px] font-bold whitespace-nowrap transition-colors duration-300 sm:text-xs ${
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
        </div>
      </div>
    </>
  );
}

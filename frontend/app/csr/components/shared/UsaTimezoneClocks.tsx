"use client";

import { useEffect, useState } from "react";
import { Globe, X } from "lucide-react";
import { useTheme } from "@/app/components/ThemeProvider";
import { useMounted } from "@/lib/useMounted";
import { CSR_PAGE_GUTTER } from "./csrTableStyles";
const US_ZONES = [
  { tz: "America/New_York",    label: "Eastern",  abbr: "ET", city: "New York",    accent: "#3B82F6" },
  { tz: "America/Chicago",     label: "Central",  abbr: "CT", city: "Chicago",     accent: "#10B981" },
  { tz: "America/Denver",      label: "Mountain", abbr: "MT", city: "Denver",      accent: "#F59E0B" },
  { tz: "America/Los_Angeles", label: "Pacific",  abbr: "PT", city: "Los Angeles", accent: "#8B5CF6" },
];

const CA_ZONES = [
  { tz: "America/Halifax",  label: "Atlantic",     abbr: "AT", city: "Halifax",    accent: "#06B6D4" },
  { tz: "America/St_Johns", label: "Newfoundland", abbr: "NT", city: "St. John's", accent: "#EC4899" },
];

const MAP_ZONES = [
  {
    abbr: "PT", label: "Pacific Time", hours: "UTC −8/−7",
    colorBg: "bg-purple-50", colorBorder: "border-purple-200",
    colorText: "text-purple-800", colorHeader: "bg-purple-100",
    states: ["WA","OR","CA","NV"],
    canada: ["BC","YT"],
  },
  {
    abbr: "MT", label: "Mountain Time", hours: "UTC −7/−6",
    colorBg: "bg-orange-50", colorBorder: "border-orange-200",
    colorText: "text-orange-800", colorHeader: "bg-orange-100",
    states: ["MT","ID","WY","CO","UT","NM","AZ*"],
    canada: ["AB","NT"],
    note: "* AZ = MST (no DST)",
  },
  {
    abbr: "CT", label: "Central Time", hours: "UTC −6/−5",
    colorBg: "bg-green-50", colorBorder: "border-green-200",
    colorText: "text-green-800", colorHeader: "bg-green-100",
    states: ["ND","SD","NE","KS","MN","IA","MO","WI","IL","AR","LA","OK","TX","MS","AL","TN"],
    canada: ["SK","MB"],
  },
  {
    abbr: "ET", label: "Eastern Time", hours: "UTC −5/−4",
    colorBg: "bg-blue-50", colorBorder: "border-blue-200",
    colorText: "text-blue-800", colorHeader: "bg-blue-100",
    states: ["ME","NH","VT","MA","RI","CT","NY","NJ","PA","DE","MD","DC","VA","WV","NC","SC","GA","FL","OH","MI","IN","KY"],
    canada: ["ON","QC","NB","NS","PE"],
  },
];

function getHandAngles(tz: string) {
  const now   = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? "0");
  const h = get("hour") % 12;
  const m = get("minute");
  const s = get("second");
  return {
    hour:   (h * 30)  + (m * 0.5),
    minute: m * 6,
    second: s * 6,
  };
}

function handPoint(cx: number, cy: number, angleDeg: number, length: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + length * Math.cos(rad), y: cy + length * Math.sin(rad) };
}

function AnalogClock({ tz, accent, dark }: { tz: string; accent: string; dark: boolean }) {
  const mounted = useMounted();
  const [angles, setAngles] = useState({ hour: 0, minute: 0, second: 0 });

  useEffect(() => {
    if (!mounted) return;
    const tick = () => setAngles(getHandAngles(tz));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tz, mounted]);

  const cx = 32; const cy = 32; const r = 28;
  const h = mounted ? handPoint(cx, cy, angles.hour,   14) : null;
  const m = mounted ? handPoint(cx, cy, angles.minute, 19) : null;
  const s = mounted ? handPoint(cx, cy, angles.second, 20) : null;
  const faceFill = dark ? "#1e2330" : "#ffffff";
  const tickMajor = dark ? "#9CA3AF" : "#6B7280";
  const tickMinor = dark ? "#4B5563" : "#D1D5DB";
  const hourHand = dark ? "#F3F4F6" : "#111827";
  const minuteHand = dark ? "#D1D5DB" : "#374151";

  if (!mounted) {
    return (
      <div
        className="relative shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center"
        style={{ boxShadow: `0 3px 10px ${accent}33`, background: `linear-gradient(145deg, ${accent}18, transparent)` }}
        aria-hidden
      >
        <div className="w-[85%] h-[85%] rounded-full border-2 opacity-60" style={{ borderColor: accent }} />
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center"
      style={{ boxShadow: `0 3px 10px ${accent}33`, background: `linear-gradient(145deg, ${accent}18, transparent)` }}
    >
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs>
          <radialGradient id={`face-${tz}`} cx="40%" cy="35%">
            <stop offset="0%" stopColor={dark ? "#2a3040" : "#ffffff"} />
            <stop offset="100%" stopColor={faceFill} />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke={accent} strokeWidth="2.5" opacity="0.85" />
        <circle cx={cx} cy={cy} r={r} fill={`url(#face-${tz})`} stroke={accent} strokeWidth="1.5" opacity="0.9" />
        {[...Array(12)].map((_, i) => {
          const a   = (i * 30 - 90) * (Math.PI / 180);
          const isQ = i % 3 === 0;
          const x1  = cx + (r - (isQ ? 7 : 5)) * Math.cos(a);
          const y1  = cy + (r - (isQ ? 7 : 5)) * Math.sin(a);
          const x2  = cx + (r - 1.5) * Math.cos(a);
          const y2  = cy + (r - 1.5) * Math.sin(a);
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={isQ ? tickMajor : tickMinor}
              strokeWidth={isQ ? 2.2 : 1}
              strokeLinecap="round"
            />
          );
        })}
        {h && m && s && (
          <>
            <line x1={cx} y1={cy} x2={h.x} y2={h.y} stroke={hourHand} strokeWidth="3" strokeLinecap="round" />
            <line x1={cx} y1={cy} x2={m.x} y2={m.y} stroke={minuteHand} strokeWidth="2.2" strokeLinecap="round" />
            <line x1={cx} y1={cy} x2={s.x} y2={s.y} stroke="#1B6FE8" strokeWidth="1.4" strokeLinecap="round" opacity="0.95" />
          </>
        )}
        <circle cx={cx} cy={cy} r={3} fill="#1B6FE8" />
        <circle cx={cx} cy={cy} r={1.2} fill={dark ? "#1e2330" : "#ffffff"} />
      </svg>
    </div>
  );
}

function DigitalTime({ tz }: { tz: string }) {
  const [str, setStr] = useState("");
  useEffect(() => {
    const fmt = () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
      }).format(new Date());
    setStr(fmt());
    const id = setInterval(() => setStr(fmt()), 1000);
    return () => clearInterval(id);
  }, [tz]);
  return <>{str}</>;
}

type Zone = (typeof US_ZONES)[number] | (typeof CA_ZONES)[number];

function RegionBadge({ flag, label }: { flag: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 shrink-0 min-w-[32px] px-1.5 py-1 rounded-lg bg-crm-muted border border-crm-border-subtle">
      <span className="text-sm leading-none">{flag}</span>
      <span className="text-[9px] font-bold text-crm-text-muted uppercase tracking-wide">{label}</span>
    </div>
  );
}

function ZoneClock({ zone, dark }: { zone: Zone; dark: boolean }) {
  return (
    <div
      className="flex items-center gap-2 shrink-0 px-2 py-1.5 rounded-xl border border-crm-border-subtle bg-crm-surface-raised hover:border-[#1B6FE8]/25 transition-all"
      style={{ boxShadow: "var(--crm-shadow)" }}
    >
      <AnalogClock tz={zone.tz} accent={zone.accent} dark={dark} />
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <p className="text-[10px] sm:text-[11px] font-bold text-crm-text leading-none truncate max-w-[72px] sm:max-w-none">
            {zone.city}
          </p>
          <span
            className="text-[8px] font-black px-1 py-px rounded text-white shrink-0"
            style={{ backgroundColor: zone.accent }}
          >
            {zone.abbr}
          </span>
        </div>
        <p className="text-[9px] text-crm-text-muted mt-0.5 whitespace-nowrap">{zone.label}</p>
        <p className="text-[9px] sm:text-[10px] font-mono font-bold text-[#1B6FE8] mt-0.5 whitespace-nowrap tabular-nums">
          <DigitalTime tz={zone.tz} />
        </p>
      </div>
    </div>
  );
}

function TimezoneMapModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-crm-surface rounded-2xl shadow-2xl w-full max-w-[860px] max-h-[88vh] flex flex-col overflow-hidden border border-crm-border-subtle">

        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-crm-border-subtle shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-500 flex items-center justify-center shrink-0">
              <Globe size={17} />
            </div>
            <div>
              <h2 className="text-base font-bold text-crm-text">US & Canada Timezone Map</h2>
              <p className="text-[11px] text-crm-text-muted">Reference for identifying which state is in which timezone</p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-xl bg-crm-muted hover:bg-crm-nav-pill flex items-center justify-center transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4">
          <div>
            <p className="text-[10px] font-semibold text-crm-text-faint uppercase tracking-wider mb-2">← West to East →</p>
            <div className="flex rounded-xl overflow-hidden border border-crm-border">
              {MAP_ZONES.map((z, i) => (
                <div
                  key={z.abbr}
                  className={`flex-1 ${z.colorHeader} flex flex-col items-center justify-center py-3 sm:py-4 ${i < MAP_ZONES.length - 1 ? "border-r border-crm-border" : ""}`}
                >
                  <span className={`text-lg sm:text-2xl font-black ${z.colorText}`}>{z.abbr}</span>
                  <span className={`text-[9px] sm:text-[10px] font-medium ${z.colorText} opacity-70 mt-0.5 hidden sm:block`}>{z.hours}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {MAP_ZONES.map(z => (
              <div key={z.abbr} className={`rounded-xl border ${z.colorBorder} ${z.colorBg} p-3 sm:p-3.5`}>
                <div className="flex items-baseline gap-1.5 mb-2.5">
                  <span className={`font-black text-sm ${z.colorText}`}>{z.abbr}</span>
                  <span className={`text-[10px] ${z.colorText} opacity-60 hidden sm:inline`}>{z.label}</span>
                </div>
                <p className={`text-[9px] font-semibold uppercase tracking-wide ${z.colorText} opacity-50 mb-1`}>US States</p>
                <div className="flex flex-wrap gap-1 mb-2.5">
                  {z.states.map(s => (
                    <span key={s} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-white/70 ${z.colorText}`}>{s}</span>
                  ))}
                </div>
                <p className={`text-[9px] font-semibold uppercase tracking-wide ${z.colorText} opacity-50 mb-1`}>Canada</p>
                <div className="flex flex-wrap gap-1">
                  {z.canada.map(s => (
                    <span key={s} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-white/40 ${z.colorText} opacity-80`}>{s}</span>
                  ))}
                </div>
                {z.note && (
                  <p className={`text-[9px] ${z.colorText} opacity-60 mt-2 italic`}>{z.note}</p>
                )}
              </div>
            ))}
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3">
            <p className="text-[11px] text-amber-800 dark:text-amber-200">
              <span className="font-bold">⚠ Arizona (AZ)</span> uses Mountain Standard Time (MST) year-round and does <span className="font-semibold">not</span> observe Daylight Saving Time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UsaTimezoneClocks() {
  const [showMap, setShowMap] = useState(false);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  return (
    <>
      <div className="bg-crm-surface border-b border-crm-border-subtle shadow-sm overflow-hidden">
        <div className={`${CSR_PAGE_GUTTER} py-2`}>
          <div className="flex items-center gap-2 overflow-x-auto flex-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <RegionBadge flag="🇺🇸" label="US" />
            {US_ZONES.map(zone => (
              <ZoneClock key={zone.tz} zone={zone} dark={dark} />
            ))}

            <span className="w-px h-10 bg-crm-border shrink-0" />

            <RegionBadge flag="🇨🇦" label="CA" />
            {CA_ZONES.map(zone => (
              <ZoneClock key={zone.tz} zone={zone} dark={dark} />
            ))}

            <button
              type="button"
              onClick={() => setShowMap(true)}
              className="ml-auto shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-semibold border border-blue-500/20 hover:bg-blue-500/15 transition-colors whitespace-nowrap"
              title="View US & Canada timezone map"
            >
              <Globe size={13} />
              <span className="hidden sm:inline">Timezone Map</span>
              <span className="sm:hidden">Map</span>
            </button>
          </div>
        </div>
      </div>

      {showMap && <TimezoneMapModal onClose={() => setShowMap(false)} />}
    </>
  );
}

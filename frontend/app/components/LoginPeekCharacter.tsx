"use client";

import { useEffect, useId, useRef, useState } from "react";

type Props = {
  accent: string;
  username: string;
  password: string;
  showPassword: boolean;
  focusedField: "username" | "password" | null;
  className?: string;
};

export default function LoginPeekCharacter({
  accent,
  username,
  password,
  showPassword,
  focusedField,
  className = "",
}: Props) {
  const uid = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: 0, y: 0 });
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);

  const skin = `skin-${uid}`;
  const hair = `hair-${uid}`;
  const coat = `coat-${uid}`;
  const pant = `pant-${uid}`;
  const iris = `iris-${uid}`;
  const shade = `shade-${uid}`;

  const shy = showPassword;
  const peeking = !shy && focusedField !== null;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (shy || peeking) return;
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.18;
      target.current = {
        x: Math.max(-1, Math.min(1, (e.clientX - cx) / 200)),
        y: Math.max(-1, Math.min(1, (e.clientY - cy) / 160)),
      };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [shy, peeking]);

  useEffect(() => {
    if (shy) {
      target.current = { x: -0.82, y: 0.06 };
      return;
    }
    if (!peeking) return;
    const text = focusedField === "password" ? password : username;
    const t = Math.min(text.length / 16, 1);
    target.current = { x: 0.34 + t * 0.48, y: 0.28 };
  }, [username, password, focusedField, shy, peeking]);

  useEffect(() => {
    let id = 0;
    const tick = () => {
      setLook(prev => ({
        x: prev.x + (target.current.x - prev.x) * 0.15,
        y: prev.y + (target.current.y - prev.y) * 0.15,
      }));
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    let wait = 0;
    let close = 0;
    const loop = () => {
      wait = window.setTimeout(() => {
        setBlink(true);
        close = window.setTimeout(() => {
          setBlink(false);
          loop();
        }, 120);
      }, 3000 + Math.random() * 2400);
    };
    loop();
    return () => {
      window.clearTimeout(wait);
      window.clearTimeout(close);
    };
  }, []);

  const bodyLean = shy ? -8 : peeking ? 6 : look.x * 3;
  const headTilt = shy ? -18 : peeking ? 10 + look.x * 6 : look.x * 12;
  const headNod = shy ? 3 : peeking ? 6 : look.y * 6;
  const px = shy ? -2.6 : look.x * 3.4;
  const py = shy ? 0.8 : peeking ? 2.2 + look.y * 0.6 : look.y * 2.4;
  const lid = blink && !shy ? 0.1 : shy ? 0.58 : 1;

  return (
    <div
      ref={wrapRef}
      className={`relative mx-auto select-none pointer-events-none ${className || "h-[420px] w-[180px]"}`}
      aria-hidden
      style={{ perspective: "1000px" }}
    >
      <div
        className="h-full w-full"
        style={{
          transform: `rotateY(${bodyLean}deg)`,
          transformStyle: "preserve-3d",
          transition: shy ? "transform 480ms cubic-bezier(0.22,1,0.36,1)" : "transform 90ms linear",
        }}
      >
        <svg viewBox="0 0 260 560" className="h-full w-full drop-shadow-[0_18px_32px_rgba(0,0,0,0.42)]">
          <defs>
            <linearGradient id={skin} x1="0.3" y1="0" x2="0.8" y2="1">
              <stop offset="0%" stopColor="#F7D7C4" />
              <stop offset="55%" stopColor="#E8B99A" />
              <stop offset="100%" stopColor="#D9A07E" />
            </linearGradient>
            <linearGradient id={hair} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2A241F" />
              <stop offset="50%" stopColor="#12100E" />
              <stop offset="100%" stopColor="#070605" />
            </linearGradient>
            <linearGradient id={coat} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1E222C" />
              <stop offset="100%" stopColor="#0B0D12" />
            </linearGradient>
            <linearGradient id={pant} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#161922" />
              <stop offset="100%" stopColor="#090A0E" />
            </linearGradient>
            <radialGradient id={iris} cx="38%" cy="32%" r="70%">
              <stop offset="0%" stopColor="#F3E7D2" />
              <stop offset="28%" stopColor={accent} />
              <stop offset="72%" stopColor="#3B0B14" />
              <stop offset="100%" stopColor="#120306" />
            </radialGradient>
            <linearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          <ellipse cx="130" cy="542" rx="52" ry="9" fill="rgba(0,0,0,0.28)" />

          {/* shoes */}
          <path d="M78 508c-8 6-10 18 8 22h36c4-8 2-18-6-22z" fill="#0A0C10" />
          <path d="M182 508c8 6 10 18-8 22h-36c-4-8-2-18 6-22z" fill="#0A0C10" />
          <path d="M82 516h34" stroke={accent} strokeWidth="2" opacity="0.7" />
          <path d="M144 516h34" stroke={accent} strokeWidth="2" opacity="0.7" />

          {/* legs */}
          <path d="M96 318c-4 54-8 140-6 190h32c4-62 6-140 4-190z" fill={`url(#${pant})`} />
          <path d="M164 318c4 54 8 140 6 190h-32c-4-62-6-140-4-190z" fill={`url(#${pant})`} />
          <path d="M96 318h68c2 8-4 16-34 16s-36-8-34-16z" fill="#0C0E14" />

          {/* idle / peeking arms behind coat when not shy */}
          {!shy && (
            <g>
              <path d="M78 188c-18 28-24 70-18 118 10 4 18 2 22-8 2-36 6-78 12-108-4-4-10-4-16-2z" fill={`url(#${coat})`} />
              <path d="M182 188c18 28 24 70 18 118-10 4-18 2-22-8-2-36-6-78-12-108 4-4 10-4 16-2z" fill={`url(#${coat})`} />
              <ellipse cx="64" cy="312" rx="11" ry="12" fill={`url(#${skin})`} />
              <ellipse cx="196" cy="312" rx="11" ry="12" fill={`url(#${skin})`} />
            </g>
          )}

          {/* torso / coat */}
          <path d="M78 176c8-18 24-28 52-28s44 10 52 28c10 36 8 86-4 122-6 10-28 18-48 18s-42-8-48-18c-12-36-14-86-4-122z" fill={`url(#${coat})`} />
          <path d="M96 168c10-12 20-16 34-16s24 4 34 16c-10 8-20 12-34 12s-24-4-34-12z" fill={accent} />
          <path d="M118 184c4 46 6 78 12 96 6-18 8-50 12-96-8-4-16-6-24-0z" fill="#0C0E14" />
          <path d="M86 230c18 8 40 12 44 12" fill="none" stroke="#2A3140" strokeWidth="1.4" />
          <path d="M174 230c-18 8-40 12-44 12" fill="none" stroke="#2A3140" strokeWidth="1.4" />

          {/* shy arms covering face */}
          {shy && (
            <g>
              <path d="M78 188c-22 8-34 40-22 78 18 22 40 36 58 28 4-18 2-40-8-58-10-18-20-32-28-48z" fill={`url(#${coat})`} />
              <path d="M182 188c22 8 34 40 22 78-18 22-40 36-58 28-4-18-2-40 8-58 10-18 20-32 28-48z" fill={`url(#${coat})`} />
            </g>
          )}

          {/* neck */}
          <path d="M114 148c4 16 10 24 16 24s12-8 16-24c-6-8-10-10-16-10s-10 2-16 10z" fill={`url(#${skin})`} />

          {/* HEAD */}
          <g
            style={{
              transformOrigin: "130px 108px",
              transform: `rotate(${headTilt * 0.35}deg) translate(${headTilt * 0.35}px, ${headNod * 0.4}px)`,
              transition: shy ? "transform 420ms cubic-bezier(0.22,1,0.36,1)" : "transform 80ms linear",
            }}
          >
            <path d="M96 108c-4 2-8 10-6 20 6 4 12 4 16 1 1-10-2-18-10-21z" fill={`url(#${skin})`} />
            <path d="M164 108c4 2 8 10 6 20-6 4-12 4-16 1-1-10 2-18 10-21z" fill={`url(#${skin})`} />
            <path d="M94 104c2-34 16-54 36-54s34 20 36 54c2 24-8 48-36 52s-38-28-36-52z" fill={`url(#${skin})`} />
            <path d="M102 136c8 16 16 22 28 24 12-2 20-8 28-24" fill={`url(#${shade})`} />

            <path d="M86 102c2-40 20-66 44-68 24 2 42 28 44 68-6-20-16-34-26-38-8 16-20 20-42 16-10 6-18 12-20 22z" fill={`url(#${hair})`} />
            <path d="M90 104c-2 14 0 28 6 38 1-12 2-24 1-36-1-2-4-3-7-2z" fill={`url(#${hair})`} />
            <path d="M170 104c2 14 0 28-6 38-1-12-2-24-1-36 1-2 4-3 7-2z" fill={`url(#${hair})`} />
            <path d="M98 62c12-12 26-16 38-12 6 12 2 24-6 30-12 2-24-4-32-18z" fill={`url(#${hair})`} />
            <path d="M128 52c12-2 24 4 34 14-6 14-16 20-28 18-6-8-8-20-6-32z" fill={`url(#${hair})`} />

            <path
              d={shy ? "M104 92c8-6 18-5 26 3" : peeking ? "M103 94c9-2 20-2 26 2" : "M103 93c9-5 20-5 26 1"}
              fill="none" stroke="#1A1410" strokeWidth="2.4" strokeLinecap="round"
            />
            <path
              d={shy ? "M156 91c-7 8-18 9-28 3" : peeking ? "M131 94c9-2 20-2 26 2" : "M131 93c9-5 20-5 26 1"}
              fill="none" stroke="#1A1410" strokeWidth="2.4" strokeLinecap="round"
            />

            <ellipse cx="114" cy="106" rx="11" ry={7.6 * lid} fill="#fff" />
            <ellipse cx="146" cy="106" rx="11" ry={7.6 * lid} fill="#fff" />
            {lid > 0.22 && (
              <>
                <ellipse cx={114 + px} cy={106.6 + py} rx="6.1" ry="6.2" fill={`url(#${iris})`} />
                <ellipse cx={146 + px * 0.92} cy={106.6 + py} rx="6.1" ry="6.2" fill={`url(#${iris})`} />
                <circle cx={114 + px} cy={106.6 + py} r="2.7" fill="#120806" />
                <circle cx={146 + px * 0.92} cy={106.6 + py} r="2.7" fill="#120806" />
                <circle cx={112 + px} cy={104.4 + py} r="1.5" fill="#fff" />
                <circle cx={144 + px * 0.92} cy={104.4 + py} r="1.5" fill="#fff" />
              </>
            )}
            <path d="M103 104c6-5 16-6 22-2" fill="none" stroke="#1A1410" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M135 104c6-5 16-6 22-2" fill="none" stroke="#1A1410" strokeWidth="1.6" strokeLinecap="round" />

            <path d="M128 114c1 6 2 9 1 12" fill="none" stroke="#C48B78" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M129 126c3 1 4 0 5-1" fill="none" stroke="#C48B78" strokeWidth="1.2" strokeLinecap="round" />

            {shy ? (
              <path d="M122 136c6 0 10-4 16 0" fill="none" stroke="#B56A62" strokeWidth="1.7" strokeLinecap="round" />
            ) : peeking ? (
              <path d="M123 135c4 4 10 5 15 1" fill="none" stroke="#B56A62" strokeWidth="1.8" strokeLinecap="round" />
            ) : (
              <path d="M124 136c4 3 9 3 13 0" fill="none" stroke="#B56A62" strokeWidth="1.6" strokeLinecap="round" />
            )}

            <ellipse cx="106" cy="122" rx="6" ry="3.2" fill="#E89A8A" opacity={shy ? 0.5 : 0.18} />
            <ellipse cx="154" cy="122" rx="6" ry="3.2" fill="#E89A8A" opacity={shy ? 0.5 : 0.18} />
            <path d="M92 84c10-18 24-24 34-14 4 10-2 18-10 20-10 0-18-2-24-6z" fill={`url(#${hair})`} />

            {shy && (
              <g>
                <ellipse cx="112" cy="108" rx="16" ry="12" fill={`url(#${skin})`} transform="rotate(-12 112 108)" />
                <ellipse cx="148" cy="108" rx="16" ry="12" fill={`url(#${skin})`} transform="rotate(12 148 108)" />
                <ellipse cx="104" cy="102" rx="3.4" ry="5.5" fill="#E3B090" transform="rotate(-18 104 102)" />
                <ellipse cx="112" cy="100" rx="3.4" ry="5.5" fill="#E8B99A" />
                <ellipse cx="120" cy="102" rx="3.4" ry="5.5" fill="#E3B090" transform="rotate(12 120 102)" />
                <ellipse cx="140" cy="102" rx="3.4" ry="5.5" fill="#E3B090" transform="rotate(-12 140 102)" />
                <ellipse cx="148" cy="100" rx="3.4" ry="5.5" fill="#E8B99A" />
                <ellipse cx="156" cy="102" rx="3.4" ry="5.5" fill="#E3B090" transform="rotate(18 156 102)" />
              </g>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}

"use client";

import Image from "next/image";

type GpsLogoProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  priority?: boolean;
};

const SIZE = {
  sm: { img: "h-7 w-7 sm:h-8 sm:w-8", w: 32, h: 32 },
  md: { img: "h-14 w-14 sm:h-16 sm:w-16", w: 64, h: 64 },
  lg: { img: "h-[4.5rem] w-[4.5rem] sm:h-20 sm:w-20", w: 80, h: 80 },
} as const;

/** GPS / Global Pre Construction mark for technical portal surfaces. */
export default function GpsLogo({
  size = "md",
  className = "",
  priority = false,
}: GpsLogoProps) {
  const s = SIZE[size];

  return (
    <Image
      src="/images/global-logo.png"
      alt="GPS"
      width={s.w}
      height={s.h}
      priority={priority}
      className={`object-contain ${s.img} drop-shadow-[0_4px_12px_rgba(0,0,0,0.25)] ${className}`}
    />
  );
}

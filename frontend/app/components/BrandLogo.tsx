"use client";

import Image from "next/image";

type BrandLogoProps = {
  /** Visual size preset — square cube mark */
  size?: "sm" | "md" | "lg";
  className?: string;
  priority?: boolean;
};

/** Cube is ~1:1; keep display sizes tight so it sits cleanly above the wordmark. */
const SIZE = {
  sm: { img: "h-11 w-11 sm:h-12 sm:w-12", w: 48, h: 48 },
  md: { img: "h-14 w-14 sm:h-16 sm:w-16", w: 64, h: 64 },
  lg: { img: "h-[4.25rem] w-[4.25rem] sm:h-[4.75rem] sm:w-[4.75rem]", w: 76, h: 76 },
} as const;

/**
 * Landing / login brand mark — transparent PNG, centered above BEM SOLUTIONS.
 */
export default function BrandLogo({
  size = "md",
  className = "",
  priority = false,
}: BrandLogoProps) {
  const s = SIZE[size];

  return (
    <Image
      src="/images/LOGO.png"
      alt="BEM Solutions"
      width={s.w}
      height={s.h}
      priority={priority}
      className={`block mx-auto object-contain ${s.img} drop-shadow-[0_8px_22px_rgba(0,0,0,0.4)] ${className}`}
    />
  );
}

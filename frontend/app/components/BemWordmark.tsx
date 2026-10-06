"use client";

type BemWordmarkProps = {
  className?: string;
  muted?: boolean;
  onDark?: boolean;
};

/**
 * Brand text — BEM white/navy + SOLUTIONS red, high contrast on dark backgrounds.
 */
export default function BemWordmark({ className = "", muted = false, onDark = false }: BemWordmarkProps) {
  const bemClass = onDark
    ? (muted ? "text-white/90" : "text-white")
    : (muted ? "text-[#1F2A44]/85 dark:text-white/80" : "text-[#1F2A44] dark:text-white");
  const solutionsClass = onDark
    ? (muted ? "text-[#ff6b85]/95" : "text-[#5B9BFF]")
    : (muted ? "text-[#1B6FE8]/90 dark:text-[#ff6b85]" : "text-[#1B6FE8]");

  return (
    <p
      className={`inline-flex items-baseline justify-center gap-1.5 uppercase tracking-[0.08em] font-bold ${className}`}
      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      <span className={bemClass}>BEM</span>
      <span className={solutionsClass}>SOLUTIONS</span>
    </p>
  );
}

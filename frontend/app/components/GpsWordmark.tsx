"use client";

type GpsWordmarkProps = {
  className?: string;
  onDark?: boolean;
};

export default function GpsWordmark({ className = "", onDark = false }: GpsWordmarkProps) {
  const gpsClass = onDark ? "text-white" : "text-[#0F398A] dark:text-white";
  const subClass = onDark ? "text-white/70" : "text-[#0F398A]/70 dark:text-white/70";

  return (
    <div className={`inline-flex flex-col leading-none ${className}`}>
      <p
        className={`uppercase tracking-[0.18em] font-black ${gpsClass}`}
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      >
        GPS
      </p>
      <p className={`mt-1 text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.16em] ${subClass}`}>
        Global Pre-Construction
      </p>
    </div>
  );
}

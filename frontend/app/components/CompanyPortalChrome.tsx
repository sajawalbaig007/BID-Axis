"use client";

import type { ReactNode } from "react";
import ThemeToggle from "@/app/components/ThemeToggle";
import type { PortalCompany } from "@/lib/companyGate";
import { COMPANY_META } from "@/lib/companyGate";

type Props = {
  company?: PortalCompany | "both";
  children: ReactNode;
};

export default function CompanyPortalChrome({ company = "both", children }: Props) {
  const bem = COMPANY_META.BEM;
  const gps = COMPANY_META.GPS;
  const single = company === "BEM" || company === "GPS" ? COMPANY_META[company] : null;
  const accent = single?.accent ?? bem.accent;

  return (
    <div className="h-[100dvh] relative flex items-center justify-center px-3 py-3 sm:px-6 sm:py-5 overflow-hidden">
      {company === "both" ? (
        <>
          <div className="absolute inset-0 flex">
            <div
              className="w-1/2 h-full bg-cover bg-center scale-110 origin-left"
              style={{
                backgroundImage: `linear-gradient(165deg, rgba(15,23,42,0.55) 0%, ${bem.accent}88 100%), url('${bem.logoSrc}')`,
              }}
            />
            <div
              className="w-1/2 h-full bg-cover bg-center scale-110 origin-right"
              style={{
                backgroundImage: `linear-gradient(165deg, rgba(15,23,42,0.55) 0%, ${gps.accent}88 100%), url('${gps.logoSrc}')`,
              }}
            />
          </div>
        </>
      ) : (
        <div
          className="absolute inset-0 bg-cover bg-center scale-110"
          style={{
            backgroundImage: `linear-gradient(165deg, rgba(15,23,42,0.9) 0%, ${accent}99 48%, rgba(15,23,42,0.78) 100%), url('${single!.logoSrc}')`,
          }}
        />
      )}
      <div className="absolute inset-0 backdrop-blur-[18px] sm:backdrop-blur-[22px] bg-[#0F172A]/40" />

      <div
        className="pointer-events-none absolute -top-24 -left-16 w-72 h-72 rounded-full blur-3xl opacity-40"
        style={{ background: company === "GPS" ? gps.accent : bem.accent }}
      />
      <div
        className="pointer-events-none absolute -bottom-28 -right-10 w-80 h-80 rounded-full blur-3xl opacity-25"
        style={{ background: company === "BEM" ? bem.accent : gps.accent }}
      />

      <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] sm:top-5 sm:right-5 z-20">
        <ThemeToggle className="!w-10 !h-10 sm:!w-11 sm:!h-11 rounded-xl shadow-lg bg-white/10 border border-white/25 text-white backdrop-blur-sm" />
      </div>

      <div className="relative z-10 w-full max-w-[1100px] mx-auto flex flex-col max-h-full">
        {children}
      </div>
    </div>
  );
}

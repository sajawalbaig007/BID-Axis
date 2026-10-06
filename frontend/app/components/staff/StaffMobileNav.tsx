"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

export type StaffNavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export default function StaffMobileNav({
  items,
  baseHref,
}: {
  items: StaffNavItem[];
  baseHref: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden w-9 h-9 rounded-[13px] flex items-center justify-center bg-crm-nav-pill text-crm-text-muted shrink-0"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      <nav
        className="hidden md:flex mx-auto w-fit max-w-full items-center gap-0.5 bg-crm-nav-pill rounded-[18px] p-1 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {items.map(({ title, href, icon: Icon }) => {
          const active = href === baseHref ? pathname === baseHref : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              className={`h-10 px-3 lg:px-4 rounded-[13px] flex items-center gap-2 text-[12px] lg:text-[13px] font-semibold whitespace-nowrap transition-all shrink-0 ${
                active
                  ? "bg-[#1B6FE8] text-white shadow-md shadow-[#1B6FE8]/20"
                  : "text-crm-text-secondary hover:bg-crm-surface hover:text-[#1B6FE8]"
              }`}
            >
              <Icon size={15} className="shrink-0" />
              <span className="hidden lg:inline">{title}</span>
            </Link>
          );
        })}
      </nav>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/45 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="fixed top-[64px] left-0 right-0 z-50 md:hidden bg-crm-surface border-b border-crm-border shadow-xl max-h-[calc(100vh-64px)] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-crm-border-subtle">
              <span className="text-sm font-bold text-crm-text">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-crm-text-muted"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {items.map(({ title, href, icon: Icon }) => {
                const active = href === baseHref ? pathname === baseHref : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    prefetch={false}
                    onClick={() => setOpen(false)}
                    className={`flex flex-col items-center justify-center gap-2 p-3 rounded-2xl text-center min-h-[88px] transition-all ${
                      active
                        ? "bg-[#1B6FE8] text-white shadow-md"
                        : "bg-crm-nav-pill text-crm-text-secondary hover:bg-crm-brand-soft hover:text-[#1B6FE8]"
                    }`}
                  >
                    <Icon size={20} />
                    <span className="text-[11px] sm:text-xs font-semibold leading-tight">{title}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}

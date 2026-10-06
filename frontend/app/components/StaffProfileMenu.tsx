"use client";

import { roleDisplayLabel } from "@/lib/roleDisplay";

export type StaffProfileUser = {
  name?: string | null;
  email?: string | null;
  role?: string | null;
  csrCode?: string | null;
  cnic?: string | null;
  profilePic?: string | null;
};

function codeLabel(role?: string | null) {
  const key = String(role ?? "").toLowerCase();
  if (key === "estimator") return "Estimator Code";
  if (key === "csr") return "CSR Code";
  return "Staff Code";
}

export function profileInitials(name?: string | null, fallback = "U") {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  return parts.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function ProfileAvatar({
  user,
  size = "sm",
  fallback = "U",
}: {
  user: StaffProfileUser | null | undefined;
  size?: "sm" | "md";
  fallback?: string;
}) {
  const dim = size === "md" ? "w-12 h-12 text-lg rounded-xl" : "w-8 h-8 text-xs rounded-[11px]";
  const src = user?.profilePic?.trim() || "";
  return (
    <div className={`${dim} bg-[#1B6FE8] text-white flex items-center justify-center font-bold shrink-0 overflow-hidden`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={user?.name ?? "Profile"} className="w-full h-full object-cover" />
      ) : (
        profileInitials(user?.name, fallback)
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-2 bg-[#F5F6FA] dark:bg-crm-muted rounded-xl">
      <span className="text-[10px] text-gray-400 font-medium shrink-0">{label}</span>
      <span
        className={`text-right truncate max-w-[140px] ${
          mono
            ? "font-mono text-[#1B6FE8] text-[11px] font-bold"
            : small
              ? "text-[10px] text-[#0F172A] dark:text-crm-text"
              : "text-[11px] font-semibold text-[#0F172A] dark:text-crm-text"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function ProfileInfoRows({ user }: { user: StaffProfileUser | null | undefined }) {
  const role = roleDisplayLabel(user?.role);
  return (
    <div className="p-3 space-y-1.5">
      <InfoRow label="Full Name" value={user?.name?.trim() || "—"} />
      <InfoRow label="Email" value={user?.email?.trim() || "—"} small />
      <InfoRow label="Role" value={role} />
      {user?.csrCode ? <InfoRow label={codeLabel(user.role)} value={user.csrCode} mono /> : null}
      {user?.cnic ? <InfoRow label="CNIC" value={user.cnic} mono /> : null}
    </div>
  );
}

import prisma from "../config/db";

export type ChatAccessProfile = {
  role: string;
  chatEnabled: boolean;
  chatAllowedUserIds: string[];
  chatVisibleToUserIds: string[];
};

/** GPS company chat pool */
export const GPS_CHAT_ROLES = ["technical_manager", "estimator", "bim_manager", "bim"] as const;
/** BEM company chat pool (admin is visible to both orgs) */
export const BEM_CHAT_ROLES = ["csr", "manager", "accounts", "admin"] as const;

/**
 * Who can see whom in Messages:
 * - Admin → everyone
 * - GPS (technical_manager, estimator) → GPS + admin + accounts
 * - Accounts → BEM + GPS + admin (bridge both orgs)
 * - BEM (csr, manager) → BEM employees (+ admin)
 */
export function canSeeRoleByOrg(viewerRole: string, targetRole: string): boolean {
  const viewer = String(viewerRole || "").toLowerCase();
  const target = String(targetRole || "").toLowerCase();
  if (!viewer || !target) return false;
  if (viewer === "admin") return true;
  if (viewer === "technical_manager" || viewer === "estimator") {
    return (
      target === "admin" ||
      target === "technical_manager" ||
      target === "estimator" ||
      target === "accounts"
    );
  }
  if (viewer === "bim_manager" || viewer === "bim") {
    return (
      target === "admin" ||
      target === "bim_manager" ||
      target === "bim" ||
      target === "accounts"
    );
  }
  if (viewer === "accounts") {
    return (
      target === "admin" ||
      target === "csr" ||
      target === "manager" ||
      target === "accounts" ||
      target === "technical_manager" ||
      target === "estimator" ||
      target === "bim_manager" ||
      target === "bim"
    );
  }
  // BEM pool (csr, manager)
  return target === "admin" || target === "csr" || target === "manager" || target === "accounts";
}

export async function getChatAccess(userId: string): Promise<ChatAccessProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, chatEnabled: true, chatAllowedUserIds: true, chatVisibleToUserIds: true },
  });
  if (!user) return null;
  return {
    role: String(user.role),
    chatEnabled: user.chatEnabled !== false,
    chatAllowedUserIds: Array.isArray(user.chatAllowedUserIds) ? user.chatAllowedUserIds : [],
    chatVisibleToUserIds: Array.isArray(user.chatVisibleToUserIds) ? user.chatVisibleToUserIds : [],
  };
}

/** True when this user may use chat at all. */
export function isChatEnabled(access: ChatAccessProfile | null | undefined): boolean {
  return !!access && access.chatEnabled !== false;
}

/**
 * Can `me` start/message `target`?
 * - chat must be enabled for me
 * - empty allowlist = unrestricted
 * - otherwise target must be in allowlist
 */
export function canMessageUser(
  access: ChatAccessProfile | null | undefined,
  targetUserId: string,
): boolean {
  if (!isChatEnabled(access)) return false;
  const list = access!.chatAllowedUserIds;
  if (!list.length) return true;
  return list.includes(targetUserId);
}

/** Whether `viewerUserId` is allowed to discover/message this target account. */
export function isVisibleToUser(
  targetAccess: Pick<ChatAccessProfile, "chatEnabled" | "chatVisibleToUserIds"> | null | undefined,
  viewerUserId: string,
): boolean {
  if (!targetAccess || targetAccess.chatEnabled === false) return false;
  const list = targetAccess.chatVisibleToUserIds ?? [];
  return !list.length || list.includes(viewerUserId);
}

export async function assertSenderCanChat(userId: string): Promise<
  { ok: true; access: ChatAccessProfile } | { ok: false; status: number; message: string }
> {
  const access = await getChatAccess(userId);
  if (!access) return { ok: false, status: 401, message: "Unauthorized" };
  if (!isChatEnabled(access)) {
    return { ok: false, status: 403, message: "Chat is disabled for your account. Contact admin." };
  }
  return { ok: true, access };
}

export async function assertCanMessageTarget(
  meId: string,
  targetId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const gate = await assertSenderCanChat(meId);
  if (!gate.ok) return gate;
  if (!canMessageUser(gate.access, targetId)) {
    return { ok: false, status: 403, message: "You are not allowed to message this user." };
  }
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      role: true,
      chatEnabled: true,
      chatAllowedUserIds: true,
      chatVisibleToUserIds: true,
      isActive: true,
    },
  });
  if (!target?.isActive) {
    return { ok: false, status: 404, message: "User not found." };
  }
  if (target.chatEnabled === false) {
    return { ok: false, status: 403, message: "This user cannot receive messages." };
  }
  if (!canSeeRoleByOrg(gate.access.role, String(target.role))) {
    return { ok: false, status: 403, message: "You can only message people in your company." };
  }
  if (!isVisibleToUser(target, meId)) {
    return { ok: false, status: 403, message: "This user is hidden from your messages." };
  }
  return { ok: true };
}

const ROLE_DISPLAY: Record<string, string> = {
  admin: "CEO",
  csr: "CSR",
  manager: "Admin",
  technical_manager: "Chief Estimator",
  estimator: "Estimator",
  bim_manager: "BIM Manager",
  bim: "BIM",
  accounts: "Accounts",
};

/** Never show literal "Unknown" — prefer name, then email, then role label. */
export function chatDisplayName(user: {
  name?: string | null;
  email?: string | null;
  role?: string | null;
  csrCode?: string | null;
} | null | undefined): string {
  const name = String(user?.name ?? "").trim();
  if (name && name.toLowerCase() !== "unknown") return name;
  const email = String(user?.email ?? "").trim();
  if (email) return email.includes("@") ? email.split("@")[0]! : email;
  const code = String(user?.csrCode ?? "").trim();
  if (code) return code;
  const role = String(user?.role ?? "").toLowerCase();
  if (role && ROLE_DISPLAY[role]) return ROLE_DISPLAY[role];
  if (role) return role.replace(/_/g, " ");
  return "User";
}

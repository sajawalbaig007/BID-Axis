import API from "./api";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  csrCode?: string | null;
  cnic?: string | null;
  profilePic?: string | null;
  twoFAEnabled?: boolean;
  createdAt?: string;
  chatEnabled?: boolean;
  chatAllowedUserIds?: string[];
  chatVisibleToUserIds?: string[];
};

const STORAGE_KEY = "crm_auth_me_v1";
let cached: { user: AuthUser; at: number } | null = null;
let inflight: Promise<AuthUser | null> | null = null;
const TTL_MS = 60_000;

function readStorage(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (parsed?.id && parsed?.name) return parsed;
  } catch { /* ignore */ }
  return null;
}

function writeStorage(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  try {
    if (user) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

function remember(user: AuthUser) {
  cached = { user, at: Date.now() };
  writeStorage(user);
}

/** Sync snapshot for first paint — no network. Avoids AD/Admin flash on navigation. */
export function peekAuthMe(): AuthUser | null {
  if (cached?.user) return cached.user;
  const fromStore = readStorage();
  if (fromStore) {
    /* at: 0 so getAuthMe() still hits the network and picks up profilePic / codes */
    cached = { user: fromStore, at: 0 };
    return fromStore;
  }
  return null;
}

export function invalidateAuthMeCache() {
  cached = null;
  writeStorage(null);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("crm-auth-me-updated"));
  }
}

/** Push a fresh user into the client cache (e.g. after profile save). */
export function setAuthMeCache(user: AuthUser) {
  remember(user);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("crm-auth-me-updated"));
  }
}

export async function getAuthMe(force = false): Promise<AuthUser | null> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) {
    return cached.user;
  }
  if (!force && !cached) {
    const fromStore = readStorage();
    if (fromStore) {
      cached = { user: fromStore, at: 0 };
      /* still refresh in background below if stale — but return instantly via cache hit next */
    }
  }
  if (inflight) return inflight;

  inflight = API.get("/auth/me")
    .then(res => {
      const user: AuthUser | null = res.data?.user ?? null;
      if (user) remember(user);
      return user;
    })
    .catch(() => peekAuthMe())
    .finally(() => { inflight = null; });

  return inflight;
}

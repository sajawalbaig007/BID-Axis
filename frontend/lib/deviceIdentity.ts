const DEVICE_KEY = "crm_device_mac_like_id";

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dev-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function getClientDeviceMacLikeId(): string {
  if (typeof window === "undefined") return "";
  try {
    let v = localStorage.getItem(DEVICE_KEY);
    if (!v) {
      v = makeId();
      localStorage.setItem(DEVICE_KEY, v);
    }
    return v;
  } catch {
    return "";
  }
}

const MOBILE_UA =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk|Kindle|Windows Phone|CriOS|FxiOS|EdgiOS|PlayBook|BB10/i;

const DESKTOP_UA = /Windows NT|Macintosh|Mac OS X|Linux|CrOS|X11/i;

/** Attendance punch pages stay available on phones. */
const PUBLIC_PREFIXES = [
  "/attendance",
  "/dev",
  "/office-boy",
  "/hr",
  "/bim-modeler",
  "/staff-time",
  "/desktop-only",
];

export function isPublicDevicePath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** True when the browser says this device is a phone, including Chrome desktop site. */
export function isMobileClientHint(headers: {
  get(name: string): string | null;
}): boolean {
  const bare = (name: string) => (headers.get(name) ?? "").replace(/"/g, "").trim();
  if (bare("sec-ch-ua-mobile") === "?1") return true;
  if (/^(android|ios)$/i.test(bare("sec-ch-ua-platform"))) return true;
  if (bare("sec-ch-ua-model")) return true;
  return false;
}
export function isDesktopOsUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  if (!ua || MOBILE_UA.test(ua)) return false;
  return DESKTOP_UA.test(ua);
}

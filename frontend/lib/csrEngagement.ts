import { noteRealAction } from "@/lib/realActivityWatch";

/** No click, Zoom dial, or status update for this long → inactive. */
export const CSR_IDLE_MS = 60 * 1000;

type Kind = "click" | "move" | "zoom" | "status";

let lastSignalAt = Date.now();
let inactiveSince: number | null = null;
let sliceCursor = Date.now();
let pendingActive = 0;
let pendingInactive = 0;
let started = false;

function engagedNow(now = Date.now()) {
  return inactiveSince == null && now - lastSignalAt < CSR_IDLE_MS;
}

function roll(now = Date.now()) {
  if (inactiveSince == null && now - lastSignalAt >= CSR_IDLE_MS) {
    inactiveSince = lastSignalAt + CSR_IDLE_MS;
  }
  const delta = Math.max(0, now - sliceCursor);
  if (delta === 0) return;
  const inactiveStart = inactiveSince;
  if (inactiveStart != null && inactiveStart > sliceCursor) {
    pendingActive += inactiveStart - sliceCursor;
    pendingInactive += now - inactiveStart;
  } else if (inactiveStart != null) {
    pendingInactive += delta;
  } else {
    pendingActive += delta;
  }
  sliceCursor = now;
}

function signal(kind: Kind) {
  const now = Date.now();
  roll(now);
  if (kind === "move" && inactiveSince == null && now - lastSignalAt < CSR_IDLE_MS) {
    lastSignalAt = now;
    noteRealAction();
    return;
  }
  inactiveSince = null;
  lastSignalAt = now;
  noteRealAction();
}

export function noteCsrZoomDial() {
  signal("zoom");
}

export function noteCsrStatusUpdate() {
  signal("status");
}

export function startCsrEngagementWatch(): () => void {
  if (typeof window === "undefined") return () => {};
  if (started) return () => {};
  started = true;
  lastSignalAt = Date.now();
  sliceCursor = lastSignalAt;
  noteRealAction();

  const onClick = (event: Event) => {
    if (event.isTrusted === false) return;
    signal("click");
  };
  let moveAt = 0;
  const onMove = (event: Event) => {
    if (event.isTrusted === false) return;
    const now = Date.now();
    if (now - moveAt < 400) return;
    moveAt = now;
    signal("move");
  };
  const onCustom = (event: Event) => {
    const kind = (event as CustomEvent<{ kind?: Kind }>).detail?.kind;
    if (kind === "zoom") signal("zoom");
    else if (kind === "status") signal("status");
    else signal("click");
  };

  window.addEventListener("pointerdown", onClick, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("csr-engagement", onCustom);

  return () => {
    started = false;
    window.removeEventListener("pointerdown", onClick, true);
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("mousemove", onMove, true);
    window.removeEventListener("csr-engagement", onCustom);
  };
}

export function takeEngagementSlice(): { activeMs: number; inactiveMs: number; engaged: boolean } {
  roll();
  const activeMs = pendingActive;
  const inactiveMs = pendingInactive;
  pendingActive = 0;
  pendingInactive = 0;
  return { activeMs, inactiveMs, engaged: engagedNow() };
}

export function engagementSnapshot() {
  const now = Date.now();
  roll(now);
  const inactiveFor = inactiveSince != null ? Math.max(0, now - inactiveSince) : 0;
  return {
    engaged: engagedNow(now),
    inactiveFor,
  };
}

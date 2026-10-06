/** How long the CRM can sit in the background before the warning. */
export const REAL_ACTION_MS = 5 * 60 * 1000;
/** Extra time on the warning before checkout. */
export const CONFIRM_MS = 30 * 1000;

let latestActionAt: string | null = null;

function presenceKey(storageKey: string) {
  return `${storageKey}:desk`;
}

export function peekLastActionAt() {
  return latestActionAt;
}

export function clearRealAction(storageKey: string) {
  latestActionAt = null;
  try {
    sessionStorage.removeItem(storageKey);
    localStorage.removeItem(presenceKey(storageKey));
  } catch {
    /* ignore */
  }
}

function readAction(storageKey: string): number | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? null : ms;
  } catch {
    return null;
  }
}

function writeAction(storageKey: string, ms: number) {
  const iso = new Date(ms).toISOString();
  latestActionAt = iso;
  try {
    sessionStorage.setItem(storageKey, iso);
  } catch {
    /* ignore */
  }
}

/** Mouse, Zoom dial, or status update — used for active / inactive time. */
export function noteRealAction(storageKey = "csr_last_real_action") {
  writeAction(storageKey, Date.now());
}

function readPresence(storageKey: string): number {
  try {
    const n = Number(localStorage.getItem(presenceKey(storageKey)));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writePresence(storageKey: string, ms = Date.now()) {
  try {
    localStorage.setItem(presenceKey(storageKey), String(ms));
  } catch {
    /* ignore */
  }
}

/** The CRM window is the one the person is using. */
export function deskIsOpen(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

/**
 * Stay checked in while any CRM tab is open in front.
 * A click, key, or scroll also counts, including from another tab.
 */
export function actionIsRecent(storageKey: string, withinMs = REAL_ACTION_MS): boolean {
  if (typeof document !== "undefined" && deskIsOpen()) return true;
  const seen = readPresence(storageKey);
  return seen > 0 && Date.now() - seen < withinMs;
}

export function watchRealActivity(handlers: {
  onCheckout: () => void;
  confirmEvent: string;
  promptEvent: string;
  storageKey: string;
}): () => void {
  let promptedAt: number | null = null;
  let stopped = false;
  writePresence(handlers.storageKey);
  const storedAction = readAction(handlers.storageKey);
  if (storedAction != null) latestActionAt = new Date(storedAction).toISOString();

  const hidePrompt = () => {
    window.dispatchEvent(new CustomEvent(handlers.promptEvent, { detail: { show: false } }));
  };
  const showPrompt = () => {
    window.dispatchEvent(new CustomEvent(handlers.promptEvent, { detail: { show: true } }));
  };
  const markHere = () => {
    writePresence(handlers.storageKey);
    if (promptedAt != null) {
      promptedAt = null;
      hidePrompt();
    }
  };
  const bump = (event: Event) => {
    if (stopped || event.isTrusted === false) return;
    writeAction(handlers.storageKey, Date.now());
    markHere();
  };

  const names = ["pointerdown", "mousedown", "click", "keydown", "keyup", "wheel"] as const;
  for (const name of names) window.addEventListener(name, bump, true);
  window.addEventListener("scroll", bump, true);
  const onFocus = () => {
    if (stopped || !deskIsOpen()) return;
    markHere();
  };
  const onConfirm = () => {
    if (!stopped) markHere();
  };
  window.addEventListener(handlers.confirmEvent, onConfirm);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onFocus);

  const timer = window.setInterval(() => {
    if (stopped) return;
    if (deskIsOpen()) {
      markHere();
      return;
    }
    const away = Date.now() - readPresence(handlers.storageKey);
    if (away < REAL_ACTION_MS) {
      if (promptedAt != null) {
        promptedAt = null;
        hidePrompt();
      }
      return;
    }
    if (document.visibilityState !== "visible") {
      if (!actionIsRecent(handlers.storageKey)) handlers.onCheckout();
      return;
    }
    const now = Date.now();
    if (promptedAt == null) {
      promptedAt = now;
      showPrompt();
      return;
    }
    if (now - promptedAt >= CONFIRM_MS && !actionIsRecent(handlers.storageKey)) {
      promptedAt = null;
      hidePrompt();
    }
  }, 1000);

  return () => {
    stopped = true;
    window.clearInterval(timer);
    hidePrompt();
    for (const name of names) window.removeEventListener(name, bump, true);
    window.removeEventListener("scroll", bump, true);
    window.removeEventListener(handlers.confirmEvent, onConfirm);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onFocus);
  };
}

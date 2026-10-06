let audioCtx: AudioContext | null = null;

/** Unlock sound and the desktop notification during Check In (needs a click). */
export function armCheckoutAlert(): void {
  if (typeof window === "undefined") return;
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    /* ignore */
  }
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission().catch(() => {});
  }
}

function playPing(): void {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const start = ctx.currentTime + 0.02;
    [0, 0.22].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = offset === 0 ? 880 : 1175;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = start + offset;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch {
    /* ignore */
  }
}

/** Sound plus a system notification, so it shows even if the CRM is in the background. */
export function alertCheckedOut(): void {
  playPing();
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const note = new Notification("You have to check in again", {
      body: "You were checked out. Open the CRM and check in.",
      requireInteraction: true,
      silent: false,
    });
    note.onclick = () => {
      window.focus();
      note.close();
    };
  } catch {
    /* ignore */
  }
}

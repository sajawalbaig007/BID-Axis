let audioCtx: AudioContext | null = null;
let lastPlayedAt = 0;
let primed = false;

/** Call after login / first dashboard paint so later pings can play (browser autoplay rules). */
export function primeChatSound(): void {
  if (typeof window === "undefined" || primed) return;
  primed = true;
  const resume = () => {
    try {
      audioCtx ??= new AudioContext();
      if (audioCtx.state === "suspended") void audioCtx.resume();
    } catch { /* ignore */ }
  };
  resume();
  window.addEventListener("pointerdown", resume, { once: true, passive: true });
  window.addEventListener("keydown", resume, { once: true });
}

/** Short notification beep for new chat messages (debounced to avoid double pings). */
export function playChatSound(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastPlayedAt < 1_200) return;
  lastPlayedAt = now;
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* ignore */ }
}

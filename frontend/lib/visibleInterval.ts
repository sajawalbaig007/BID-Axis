/**
 * Like setInterval, but automatically pauses when the browser tab is hidden
 * and resumes (with an immediate call) when it becomes visible again.
 * Returns a cleanup function — drop it straight into useEffect's return.
 */
export function visibleInterval(fn: () => void, ms: number): () => void {
  if (typeof document === "undefined") return () => {};   // SSR guard

  let timer: ReturnType<typeof setInterval> | null = null;

  const start = () => { if (!timer) timer = setInterval(fn, ms); };
  const stop  = () => { if (timer) { clearInterval(timer); timer = null; } };

  const onVisibility = () => {
    if (document.hidden) {
      stop();
    } else {
      fn();     // immediate call on tab focus
      start();
    }
  };

  if (!document.hidden) start();
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

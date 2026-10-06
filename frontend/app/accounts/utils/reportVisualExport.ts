import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export type ReportShot = { dataUrl: string; width: number; height: number };

const COLOR_PROPS = [
  "color",
  "background-color",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "fill",
  "stroke",
  "box-shadow",
] as const;

function isModernColor(v: string) {
  return /oklch|oklab|lab\(|lch\(|color\(/.test(v);
}

function clampByte(n: number) {
  return Math.round(Math.min(255, Math.max(0, n)));
}

function linearToSrgb(c: number) {
  const abs = Math.abs(c);
  const encoded =
    abs <= 0.0031308 ? 12.92 * c : Math.sign(c) * (1.055 * Math.pow(abs, 1 / 2.4) - 0.055);
  return clampByte(encoded * 255);
}

function oklabToRgb(L: number, a: number, b: number, alpha = 1): string {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const r = linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return alpha < 1 ? `rgba(${r}, ${g}, ${bl}, ${alpha})` : `rgb(${r}, ${g}, ${bl})`;
}

function parseAlpha(raw?: string) {
  if (!raw) return 1;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return 1;
  return raw.includes("%") ? n / 100 : n;
}

function parseLightness(raw: string) {
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return 0;
  if (raw.includes("%")) return n / 100;
  return n > 1 ? n / 100 : n;
}

function oklchFunctionToRgb(fn: string): string | null {
  const m = fn.match(
    /oklch\(\s*([0-9.]+%?)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)(?:deg)?(?:\s*\/\s*([0-9.]+%?))?\s*\)/i,
  );
  if (!m) return null;
  const L = parseLightness(m[1]);
  const C = parseFloat(m[2]);
  const H = (parseFloat(m[3]) * Math.PI) / 180;
  return oklabToRgb(L, C * Math.cos(H), C * Math.sin(H), parseAlpha(m[4]));
}

function oklabFunctionToRgb(fn: string): string | null {
  const m = fn.match(
    /oklab\(\s*([0-9.]+%?)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)(?:\s*\/\s*([0-9.]+%?))?\s*\)/i,
  );
  if (!m) return null;
  return oklabToRgb(parseLightness(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseAlpha(m[4]));
}

function srgbFunctionToRgb(fn: string): string | null {
  const m = fn.match(
    /color\(\s*srgb\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)(?:\s*\/\s*([0-9.]+%?))?\s*\)/i,
  );
  if (!m) return null;
  const r = clampByte(parseFloat(m[1]) * 255);
  const g = clampByte(parseFloat(m[2]) * 255);
  const b = clampByte(parseFloat(m[3]) * 255);
  const a = parseAlpha(m[4]);
  return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
}

function rewriteModernColors(value: string): string {
  if (!isModernColor(value)) return value;
  return value
    .replace(/oklch\([^()]*\)/gi, fn => oklchFunctionToRgb(fn) ?? fn)
    .replace(/oklab\([^()]*\)/gi, fn => oklabFunctionToRgb(fn) ?? fn)
    .replace(/color\(\s*srgb[^()]*\)/gi, fn => srgbFunctionToRgb(fn) ?? fn);
}

function inlineSafeColors(orig: Element, clone: Element) {
  const cs = getComputedStyle(orig);
  if (clone instanceof HTMLElement || clone instanceof SVGElement) {
    for (const prop of COLOR_PROPS) {
      const val = cs.getPropertyValue(prop);
      if (!val) continue;
      const safe = rewriteModernColors(val);
      if (safe && !isModernColor(safe)) {
        (clone as HTMLElement).style.setProperty(prop, safe);
      }
    }
    for (const prop of ["background", "background-image", "border", "outline", "text-shadow"] as const) {
      const val = cs.getPropertyValue(prop);
      if (!val || !isModernColor(val)) continue;
      const safe = rewriteModernColors(val);
      if (!isModernColor(safe)) (clone as HTMLElement).style.setProperty(prop, safe);
    }
    const bg = rewriteModernColors(cs.backgroundColor);
    if (bg && !isModernColor(bg)) (clone as HTMLElement).style.backgroundColor = bg;
    const fg = rewriteModernColors(cs.color);
    if (fg && !isModernColor(fg)) (clone as HTMLElement).style.color = fg;
  }
  const oc = orig.children;
  const cc = clone.children;
  for (let i = 0; i < oc.length && i < cc.length; i++) {
    inlineSafeColors(oc[i], cc[i]);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      v => {
        window.clearTimeout(t);
        resolve(v);
      },
      e => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function restoreExportButtons() {
  document.querySelectorAll<HTMLElement>("[data-export-hide]").forEach(el => {
    el.style.display = "";
    el.style.visibility = "";
  });
}

async function captureOne(el: HTMLElement, scale = 2): Promise<ReportShot> {
  const width = Math.max(el.scrollWidth, el.offsetWidth, 1);
  const height = Math.max(el.scrollHeight, el.offsetHeight, 1);
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-export-hide]").forEach(n => n.remove());
  inlineSafeColors(el, clone);
  clone.style.position = "fixed";
  clone.style.left = "-12000px";
  clone.style.top = "0";
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.zIndex = "-1";
  clone.style.pointerEvents = "none";
  clone.style.background = "#ffffff";
  document.body.appendChild(clone);
  try {
    const canvas = await withTimeout(
      html2canvas(clone, {
        backgroundColor: "#ffffff",
        scale,
        logging: false,
        useCORS: true,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        onclone: clonedDoc => {
          clonedDoc.querySelectorAll("[data-export-hide]").forEach(n => n.remove());
        },
      }),
      15000,
      "section capture",
    );
    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.92),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    clone.remove();
  }
}

/** One screenshot per report card — same look as the earlier Word/PDF export. */
function collectCaptureBlocks(root: HTMLElement): HTMLElement[] {
  const nested = Array.from(root.querySelectorAll<HTMLElement>("[data-report-block]")).filter(
    el => !el.hasAttribute("data-export-skip") && !el.parentElement?.closest("[data-report-block]"),
  );
  if (nested.length) return nested;
  if (root.matches("[data-report-block]") && !root.hasAttribute("data-export-skip")) return [root];
  return [];
}

export async function captureReportBlocks(root: HTMLElement): Promise<ReportShot[]> {
  restoreExportButtons();
  const blocks = collectCaptureBlocks(root);
  const shots: ReportShot[] = [];
  for (const el of blocks) {
    try {
      shots.push(await captureOne(el));
    } catch {
      try {
        shots.push(await captureOne(el, 1));
      } catch (err) {
        console.warn("Report section capture skipped", err);
      }
    }
  }
  restoreExportButtons();
  return shots;
}

/** Pack cards onto A4 — a card is not split; it scales if taller than the page. */
export function shotsToPdfDoc(shots: ReportShot[]): jsPDF {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const gap = 4;
  const maxW = pageW - margin * 2;
  const pageInnerH = pageH - margin * 2;
  let y = margin;
  let used = false;

  for (const shot of shots) {
    const ratio = shot.height / Math.max(shot.width, 1);
    let w = maxW;
    let h = w * ratio;
    if (h > pageInnerH) {
      h = pageInnerH;
      w = h / ratio;
    }

    const remaining = pageH - margin - y;
    if (used && h > remaining) {
      pdf.addPage();
      y = margin;
    }

    pdf.addImage(shot.dataUrl, "JPEG", margin, y, w, h, undefined, "FAST");
    y += h + gap;
    used = true;
  }

  return pdf;
}

export function shotsToPdfBlob(shots: ReportShot[]): Blob {
  return shotsToPdfDoc(shots).output("blob");
}

export function shotsToWordHtml(shots: ReportShot[], title: string): string {
  const imgs = shots
    .map(s => `<div class="block"><img src="${s.dataUrl}" width="100%" /></div>`)
    .join("");
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Calibri, Arial, sans-serif; margin: 0; background: #fff; }
  .block { page-break-inside: avoid; break-inside: avoid; margin: 0 0 10px; }
  .block img { width: 100%; height: auto; display: block; max-height: 250mm; object-fit: contain; }
</style></head>
<body>${imgs}</body></html>`;
}

export function triggerLocalDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Slice a tall canvas into A4 PDF pages (no card splitting gaps). */
function canvasToMultiPagePdf(canvas: HTMLCanvasElement): Blob {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;
  const pxPerMm = canvas.width / usableW;
  const pageHeightPx = Math.max(1, Math.floor(usableH * pxPerMm));
  let srcY = 0;
  let page = 0;
  while (srcY < canvas.height) {
    const sliceH = Math.min(pageHeightPx, canvas.height - srcY);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceH;
    const ctx = pageCanvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
    const data = pageCanvas.toDataURL("image/jpeg", 0.9);
    const hMm = sliceH / pxPerMm;
    if (page > 0) pdf.addPage();
    pdf.addImage(data, "JPEG", margin, margin, usableW, hMm, undefined, "FAST");
    page += 1;
    srcY += sliceH;
  }
  return pdf.output("blob");
}

/**
 * Build a multi-page PDF from the same HTML used for Word export.
 * One capture of the full document (fast + accurate) instead of per-card screenshots.
 */
export async function htmlDocumentToPdfBlob(html: string): Promise<Blob> {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const host = document.createElement("div");
  host.setAttribute("data-report-pdf-export", "");
  host.style.cssText =
    "position:fixed;left:-16000px;top:0;width:794px;padding:16px 20px;background:#fff;z-index:-1;pointer-events:none;box-sizing:border-box;";

  const styleEl = parsed.querySelector("style");
  if (styleEl) {
    const s = document.createElement("style");
    s.textContent = `${styleEl.textContent ?? ""}
      body, div[data-report-pdf-export] { font-family: Calibri, Arial, sans-serif; color: #0F172A; }
      table { max-width: 100%; }
      img { max-width: 100%; height: auto; }`;
    host.appendChild(s);
  }

  const body = parsed.body;
  while (body.firstChild) {
    host.appendChild(body.firstChild);
  }
  document.body.appendChild(host);

  try {
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const width = Math.max(host.scrollWidth, 794);
    const height = Math.max(host.scrollHeight, 1);
    const canvas = await withTimeout(
      html2canvas(host, {
        backgroundColor: "#ffffff",
        scale: 1.25,
        logging: false,
        useCORS: true,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
      }),
      60000,
      "report pdf capture",
    );
    return canvasToMultiPagePdf(canvas);
  } finally {
    host.remove();
  }
}

function waitFrames(n = 2): Promise<void> {
  return new Promise(resolve => {
    const step = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

function hideExportUi(): () => void {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-export-hide]"));
  const prev = els.map(el => ({ el, display: el.style.display }));
  els.forEach(el => {
    el.style.display = "none";
  });
  return () => {
    prev.forEach(({ el, display }) => {
      el.style.display = display;
    });
  };
}

function showCaptureOverlay(text: string): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.setAttribute("data-report-pdf-overlay", "");
  overlay.style.cssText =
    "position:fixed;bottom:20px;right:20px;z-index:2147483646;background:#0B1220;color:#fff;padding:12px 16px;border-radius:14px;font-family:system-ui,Segoe UI,sans-serif;box-shadow:0 10px 30px rgba(15,23,42,.35);max-width:280px;";
  overlay.innerHTML = `<div data-pdf-overlay-title style="font-weight:800;font-size:13px">${text}</div>
      <div style="margin-top:4px;font-size:11px;opacity:.75">Capturing charts as they appear on this page</div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function installCaptureCss(root: HTMLElement): () => void {
  root.setAttribute("data-pdf-capturing", "");
  const s = document.createElement("style");
  s.setAttribute("data-report-pdf-style", "");
  s.textContent = `
    [data-pdf-capturing], [data-pdf-capturing] * {
      scrollbar-width: none !important;
    }
    [data-pdf-capturing]::-webkit-scrollbar,
    [data-pdf-capturing] *::-webkit-scrollbar {
      width: 0 !important;
      height: 0 !important;
      display: none !important;
    }
    [data-pdf-capturing] .recharts-tooltip-wrapper,
    [data-pdf-capturing] .recharts-default-tooltip {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
    }
    [data-pdf-capturing] [data-pdf-pair] {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
      align-items: stretch !important;
      min-width: 1080px !important;
    }
    [data-pdf-capturing] [data-pdf-pair] > * {
      min-width: 0 !important;
      height: 100% !important;
    }
  `;
  document.head.appendChild(s);
  return () => {
    root.removeAttribute("data-pdf-capturing");
    s.remove();
  };
}

function trimCanvasWhitespace(canvas: HTMLCanvasElement, pad = 6): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width, height } = canvas;
  if (width < 4 || height < 4) return canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const isEmpty = (i: number) => {
    const a = data[i + 3];
    if (a < 8) return true;
    return data[i] >= 248 && data[i + 1] >= 248 && data[i + 2] >= 248;
  };
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;
  outerTop: for (; top < height; top++) {
    for (let x = 0; x < width; x++) if (!isEmpty((top * width + x) * 4)) break outerTop;
  }
  outerBottom: for (; bottom > top; bottom--) {
    for (let x = 0; x < width; x++) if (!isEmpty((bottom * width + x) * 4)) break outerBottom;
  }
  outerLeft: for (; left < width; left++) {
    for (let y = top; y <= bottom; y++) if (!isEmpty((y * width + left) * 4)) break outerLeft;
  }
  outerRight: for (; right > left; right--) {
    for (let y = top; y <= bottom; y++) if (!isEmpty((y * width + right) * 4)) break outerRight;
  }
  top = Math.max(0, top - pad);
  left = Math.max(0, left - pad);
  bottom = Math.min(height - 1, bottom + pad);
  right = Math.min(width - 1, right + pad);
  const w = right - left + 1;
  const h = bottom - top + 1;
  if (w < 2 || h < 2 || (w === width && h === height)) return canvas;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return canvas;
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, w, h);
  octx.drawImage(canvas, left, top, w, h, 0, 0, w, h);
  return out;
}

function inlineRgbColors(root: HTMLElement): () => void {
  const backups: { el: HTMLElement | SVGElement; style: string | null }[] = [];
  const extra = ["background", "background-image", "border", "outline", "text-shadow"] as const;
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement | SVGElement>("*"))];
  for (const node of nodes) {
    const cs = getComputedStyle(node);
    const patches: [string, string][] = [];
    for (const prop of [...COLOR_PROPS, ...extra]) {
      const val = cs.getPropertyValue(prop);
      if (!val || !isModernColor(val)) continue;
      const safe = rewriteModernColors(val);
      if (safe && !isModernColor(safe)) patches.push([prop, safe]);
    }
    if (!patches.length) continue;
    backups.push({ el: node, style: node.getAttribute("style") });
    for (const [prop, safe] of patches) node.style.setProperty(prop, safe);
  }
  return () => {
    for (const b of backups) {
      if (b.style) b.el.setAttribute("style", b.style);
      else b.el.removeAttribute("style");
    }
  };
}

async function waitForCharts(root: HTMLElement) {
  for (let i = 0; i < 60; i++) {
    const svgs = Array.from(root.querySelectorAll<SVGElement>(".recharts-surface, .recharts-wrapper svg")).filter(
      s => !s.closest("[data-export-skip], [data-export-hide]"),
    );
    if (svgs.length === 0) {
      if (i >= 10) return;
    } else if (
      svgs.every(s => {
        const r = s.getBoundingClientRect();
        return r.width > 8 && r.height > 8;
      })
    ) {
      return;
    }
    await new Promise<void>(r => window.setTimeout(r, 100));
  }
}

function chartSvgToDataUrl(svg: SVGElement): string | null {
  const rect = svg.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width || svg.clientWidth));
  const h = Math.max(1, Math.round(rect.height || svg.clientHeight));
  if (w < 2 || h < 2) return null;
  const copy = svg.cloneNode(true) as SVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(w));
  copy.setAttribute("height", String(h));
  if (!copy.getAttribute("viewBox")) copy.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const orig = [svg, ...Array.from(svg.querySelectorAll("*"))];
  const dest = [copy, ...Array.from(copy.querySelectorAll("*"))];
  for (let i = 0; i < orig.length && i < dest.length; i++) {
    const cs = getComputedStyle(orig[i]);
    const el = dest[i] as SVGElement;
    const fill = rewriteModernColors(cs.fill);
    const stroke = rewriteModernColors(cs.stroke);
    if (fill && fill !== "none" && !isModernColor(fill)) el.setAttribute("fill", fill);
    if (stroke && stroke !== "none" && !isModernColor(stroke)) el.setAttribute("stroke", stroke);
    if (/^text|tspan$/i.test(el.tagName)) {
      el.setAttribute("font-size", cs.fontSize);
      el.setAttribute("font-family", cs.fontFamily);
      el.setAttribute("font-weight", cs.fontWeight);
    }
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
}

/** Pin Recharts to <img> so html-to-image cannot drop SVG paths. Does not replace React nodes. */
function freezeChartsAsImages(root: HTMLElement): () => void {
  const restorers: (() => void)[] = [];
  const svgs = Array.from(root.querySelectorAll<SVGElement>(".recharts-surface"));
  for (const svg of svgs) {
    const url = chartSvgToDataUrl(svg);
    const rect = svg.getBoundingClientRect();
    if (!url || rect.width < 2) continue;
    const parent = svg.parentElement;
    if (!parent) continue;
    const prevPos = parent.style.position;
    const prevOpacity = svg.style.opacity;
    if (!prevPos) parent.style.position = "relative";
    const parentRect = parent.getBoundingClientRect();
    const img = document.createElement("img");
    img.setAttribute("data-report-chart-freeze", "");
    img.alt = "";
    img.src = url;
    img.style.cssText = `position:absolute;left:${rect.left - parentRect.left}px;top:${rect.top - parentRect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:2;display:block;`;
    svg.style.opacity = "0";
    parent.appendChild(img);
    restorers.push(() => {
      img.remove();
      svg.style.opacity = prevOpacity;
      parent.style.position = prevPos;
    });
  }
  return () => {
    restorers.reverse().forEach(fn => fn());
  };
}

/** Live-DOM snapshot (html-to-image). html2canvas crashes on Tailwind v4 oklch and blanks Recharts. */
async function captureLiveBlock(el: HTMLElement, pixelRatio: number): Promise<HTMLCanvasElement> {
  const { toCanvas } = await import("html-to-image");
  const restoreColors = inlineRgbColors(el);
  const restoreCharts = freezeChartsAsImages(el);
  try {
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    await waitFrames(2);
    const raw = await withTimeout(
      toCanvas(el, {
        pixelRatio,
        backgroundColor: "#ffffff",
        cacheBust: false,
        skipFonts: true,
        skipAutoScale: true,
        style: { margin: "0", transform: "none" },
        filter: node => {
          if (!(node instanceof Element)) return true;
          if (node.hasAttribute("data-export-hide") || node.closest("[data-export-hide]")) return false;
          if (node.hasAttribute("data-report-pdf-overlay")) return false;
          if (node.classList?.contains("recharts-tooltip-wrapper")) return false;
          return true;
        },
      }),
      30000,
      "section capture",
    );
    return trimCanvasWhitespace(raw, 4);
  } finally {
    restoreCharts();
    restoreColors();
  }
}

function canvasesToVisualPdf(canvases: HTMLCanvasElement[], footer: string): Blob {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const footerH = 7;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2 - footerH;
  const gap = 3.5;
  let y = margin;
  let used = false;

  const addSlice = (source: HTMLCanvasElement, srcY: number, slicePx: number, destY: number) => {
    const slice = document.createElement("canvas");
    slice.width = source.width;
    slice.height = Math.max(1, slicePx);
    const ctx = slice.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(source, 0, srcY, source.width, slicePx, 0, 0, source.width, slicePx);
    const hMm = (slicePx / source.width) * usableW;
    pdf.addImage(slice.toDataURL("image/jpeg", 0.93), "JPEG", margin, destY, usableW, hMm, undefined, "FAST");
    return hMm;
  };

  for (const canvas of canvases) {
    if (canvas.width < 2 || canvas.height < 2) continue;
    const fullH = (canvas.height / canvas.width) * usableW;
    const pxPerMm = canvas.width / usableW;

    if (fullH <= usableH) {
      if (used && y + fullH > margin + usableH) {
        pdf.addPage();
        y = margin;
      }
      const hMm = addSlice(canvas, 0, canvas.height, y);
      y += hMm + gap;
      used = true;
      continue;
    }

    if (used && y > margin + 1) {
      pdf.addPage();
      y = margin;
    }

    let srcY = 0;
    while (srcY < canvas.height) {
      const roomMm = margin + usableH - y;
      const roomPx = Math.max(1, Math.floor(roomMm * pxPerMm));
      const slicePx = Math.min(canvas.height - srcY, roomPx);
      const hMm = addSlice(canvas, srcY, slicePx, y);
      srcY += slicePx;
      if (srcY < canvas.height) {
        pdf.addPage();
        y = margin;
      } else {
        y += hMm + gap;
      }
      used = true;
    }
  }

  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7);
    pdf.setTextColor(148, 163, 184);
    pdf.text(`${footer} · Page ${i} of ${pageCount}`, margin, pageH - 5);
  }

  return pdf.output("blob");
}

export type VisualPdfProgress = (done: number, total: number) => void;

/**
 * Pixel-accurate PDF of the Reports page: same cards, tables, and Recharts
 * (every bar / slice / label) by snapshotting the live DOM.
 */
export async function captureReportVisualPdf(
  root: HTMLElement,
  options?: { footer?: string; onProgress?: VisualPdfProgress },
): Promise<Blob> {
  const restoreUi = hideExportUi();
  const restoreCss = installCaptureCss(root);
  const overlay = showCaptureOverlay("Capturing report for PDF…");
  const html = document.documentElement;
  const hadDark = html.classList.contains("dark");
  if (hadDark) html.classList.remove("dark");

  try {
    await document.fonts?.ready.catch(() => undefined);
    await waitFrames(2);
    if (hadDark) await new Promise<void>(r => window.setTimeout(r, 120));
    await new Promise<void>(r => window.setTimeout(r, 180));
    await waitForCharts(root);

    const blocks = collectCaptureBlocks(root);
    if (!blocks.length) throw new Error("Nothing on the report page to capture.");

    const canvases: HTMLCanvasElement[] = [];
    for (let i = 0; i < blocks.length; i++) {
      options?.onProgress?.(i + 1, blocks.length);
      const titleEl = overlay.querySelector("[data-pdf-overlay-title]");
      if (titleEl) titleEl.textContent = `Capturing report ${i + 1} / ${blocks.length}`;
      try {
        canvases.push(await captureLiveBlock(blocks[i], 2));
      } catch {
        canvases.push(await captureLiveBlock(blocks[i], 1));
      }
      await waitFrames(1);
    }

    if (!canvases.length) throw new Error("Report capture produced no pages.");
    return canvasesToVisualPdf(
      canvases,
      options?.footer ?? "BEM Solutions CRM · Accounts Report",
    );
  } finally {
    if (hadDark) html.classList.add("dark");
    overlay.remove();
    restoreCss();
    restoreUi();
    restoreExportButtons();
  }
}

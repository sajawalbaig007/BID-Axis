"use client";

import { useState } from "react";
import { X } from "lucide-react";

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export function MentionText({ text, className, tone = "other" }: { text: string; className?: string; tone?: "own" | "other" }) {
  const parts = text.split(/(@[A-Za-z][\w.-]*(?:\s+[A-Za-z][\w.-]*){0,2})/g);
  const mentionCls =
    tone === "own"
      ? "font-extrabold text-yellow-200 bg-black/35 px-1 rounded underline decoration-yellow-200/90"
      : "font-extrabold text-[#1B6FE8] bg-[#1B6FE8]/15 px-1 rounded dark:text-yellow-300 dark:bg-yellow-400/25 dark:underline decoration-[#1B6FE8] dark:decoration-yellow-300";
  return (
    <p className={className}>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className={mentionCls}>{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

export function autoGrowTextarea(el: HTMLTextAreaElement | null, maxPx = 208) {
  if (!el) return;
  const minPx = 56;
  el.style.height = "0px";
  const next = el.value.trim() ? el.scrollHeight : minPx;
  el.style.height = `${Math.min(Math.max(next, minPx), maxPx)}px`;
}

export function PdfPreview({ url, fileName }: { url: string; fileName: string }) {
  const [open, setOpen] = useState(false);
  const embedSrc =
    url.includes("/raw/upload/") || (/\.pdf(\?|$)/i.test(url) && !url.includes("/image/upload/"))
      ? `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`
      : url.includes("/image/upload/") && /\.pdf(\?|$)/i.test(url)
        ? url
        : url;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white p-2 text-left hover:bg-gray-50 transition-colors max-w-[220px]"
      >
        <span className="text-xs font-semibold truncate">{fileName}</span>
        <span className="text-[10px] text-[#1B6FE8] font-semibold">Preview PDF</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
              <span className="text-sm font-semibold truncate">{fileName}</span>
              <div className="flex items-center gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-[#1B6FE8] hover:underline px-2"
                >
                  Open file
                </a>
                <button type="button" onClick={() => setOpen(false)} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"><X size={14} /></button>
              </div>
            </div>
            <iframe src={embedSrc} title={fileName} className="flex-1 w-full border-0" />
          </div>
        </div>
      )}
    </>
  );
}

interface ReactionBarProps {
  reactions: Record<string, string[]>;
  myId?: string;
  onToggle: (emoji: string) => void;
}

export function ReactionBar({ reactions, myId, onToggle }: ReactionBarProps) {
  const entries = Object.entries(reactions).filter(([, ids]) => ids.length > 0);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {entries.map(([emoji, ids]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggle(emoji)}
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${
            myId && ids.includes(myId)
              ? "bg-[#EAF2FE] border-[#1B6FE8]/30 text-[#1B6FE8]"
              : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span>{emoji}</span>
          <span className="font-bold">{ids.length}</span>
        </button>
      ))}
    </div>
  );
}

export function ReactionPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="flex gap-0.5 px-2 py-1">
      {REACTION_EMOJIS.map(e => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className="w-7 h-7 rounded-lg hover:bg-gray-100 text-base leading-none transition-colors"
        >
          {e}
        </button>
      ))}
    </div>
  );
}

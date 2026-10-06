"use client";

import {
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type TextareaHTMLAttributes,
} from "react";
import { Bold, Italic, Underline } from "lucide-react";

/** Lightweight markers stored in note text (plain string, safe). */
export const NOTE_MARK = {
  bold: { open: "**", close: "**" },
  italic: { open: "*", close: "*" },
  underline: { open: "__", close: "__" },
} as const;

export type NoteFormatKind = keyof typeof NOTE_MARK;

export function wrapTextareaSelection(
  el: HTMLTextAreaElement,
  open: string,
  close: string,
): { next: string; start: number; end: number } {
  const value = el.value;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const selected = value.slice(start, end);
  const body = selected.length ? selected : "text";
  const next = value.slice(0, start) + open + body + close + value.slice(end);
  const innerStart = start + open.length;
  const innerEnd = innerStart + body.length;
  return { next, start: innerStart, end: innerEnd };
}

/** Escape then render **bold**, __underline__, *italic* as React nodes. */
export function parseNoteRichText(raw: string): ReactNode[] {
  const text = String(raw ?? "");
  if (!text) return [];

  type Token = { type: "text" | "bold" | "italic" | "underline"; value: string };
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const close = text.indexOf("**", i + 2);
      if (close !== -1) {
        tokens.push({ type: "bold", value: text.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
    }
    if (text.startsWith("__", i)) {
      const close = text.indexOf("__", i + 2);
      if (close !== -1) {
        tokens.push({ type: "underline", value: text.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
    }
    if (text[i] === "*" && text[i + 1] !== "*") {
      const close = text.indexOf("*", i + 1);
      if (close !== -1 && text[close + 1] !== "*") {
        tokens.push({ type: "italic", value: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }
    let j = i + 1;
    while (j < text.length) {
      if (text.startsWith("**", j) || text.startsWith("__", j)) break;
      if (text[j] === "*" && text[j + 1] !== "*") break;
      j += 1;
    }
    tokens.push({ type: "text", value: text.slice(i, j) });
    i = j;
  }

  return tokens.map((t, idx) => {
    if (t.type === "bold") {
      return (
        <strong key={idx} className="font-bold">
          {t.value}
        </strong>
      );
    }
    if (t.type === "italic") {
      return (
        <em key={idx} className="italic">
          {t.value}
        </em>
      );
    }
    if (t.type === "underline") {
      return (
        <span key={idx} className="underline underline-offset-2">
          {t.value}
        </span>
      );
    }
    return <span key={idx}>{t.value}</span>;
  });
}

export function NoteRichText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {parseNoteRichText(text)}
    </span>
  );
}

export function NoteFormatToolbar({
  textareaRef,
  value,
  onChange,
  className = "",
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const apply = (kind: NoteFormatKind) => {
    const el = textareaRef.current;
    const mark = NOTE_MARK[kind];
    if (!el) {
      onChange(`${value}${mark.open}text${mark.close}`);
      return;
    }
    const { next, start, end } = wrapTextareaSelection(el, mark.open, mark.close);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, end);
    });
  };

  const btn =
    "w-7 h-7 rounded-md inline-flex items-center justify-center text-amber-800 hover:bg-amber-100 border border-transparent hover:border-amber-200 transition-colors";

  return (
    <div className={`flex items-center gap-0.5 ${className}`} role="toolbar" aria-label="Note formatting">
      <button type="button" className={btn} title="Bold (Ctrl+B)" onClick={() => apply("bold")}>
        <Bold size={12} strokeWidth={2.5} />
      </button>
      <button type="button" className={btn} title="Italic (Ctrl+I)" onClick={() => apply("italic")}>
        <Italic size={12} />
      </button>
      <button type="button" className={btn} title="Underline (Ctrl+U)" onClick={() => apply("underline")}>
        <Underline size={12} />
      </button>
    </div>
  );
}

/** Textarea with B/I/U toolbar + Ctrl shortcuts. */
export function NoteComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  rows = 2,
  disabled,
  className = "",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
} & Pick<TextareaHTMLAttributes<HTMLTextAreaElement>, never>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === "b" || key === "i" || key === "u") {
        e.preventDefault();
        const kind: NoteFormatKind = key === "b" ? "bold" : key === "i" ? "italic" : "underline";
        const el = ref.current;
        if (!el) return;
        const mark = NOTE_MARK[kind];
        const { next, start, end } = wrapTextareaSelection(el, mark.open, mark.close);
        onChange(next);
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(start, end);
        });
        return;
      }
      if (key === "enter" && onSubmit) {
        e.preventDefault();
        onSubmit();
      }
    }
  };

  return (
    <div className={`rounded-xl border border-amber-200 !bg-[#FFFBEB] overflow-hidden focus-within:border-amber-400 ${className}`}>
      <div className="flex items-center justify-between px-2 py-1 border-b border-amber-100 !bg-amber-50/90">
        <NoteFormatToolbar textareaRef={ref} value={value} onChange={onChange} />
        <span className="text-[9px] text-amber-700/60 font-medium pr-1 hidden sm:inline">Ctrl+B / I / U</span>
      </div>
      <textarea
        ref={ref}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full text-[12px] px-3 py-2 outline-none resize-none !text-amber-950 placeholder:text-amber-400 !bg-transparent disabled:opacity-50"
      />
    </div>
  );
}

"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";

/** Parse a non-negative number from free-typed input (blocks negatives). */
export function parseNonNegativeAmount(raw: string): number {
  const cleaned = String(raw ?? "").replace(/[^\d.]/g, "");
  if (!cleaned || cleaned === ".") return 0;
  // keep only first decimal point
  const parts = cleaned.split(".");
  const normalized = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("")}` : parts[0];
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

type AmountInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "min"
> & {
  value: number;
  onChange: (n: number) => void;
  /** Allow decimals (default true). */
  allowDecimal?: boolean;
};

/**
 * Amount field that:
 * - clears the sticky leading "0" while typing
 * - rejects negative values (-1, -2, …)
 * - commits 0 on blur when empty
 */
export default function AmountInput({
  value,
  onChange,
  allowDecimal = true,
  className = "",
  onFocus,
  onBlur,
  ...rest
}: AmountInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!focused) setDraft(Number(value) === 0 ? "" : String(value));
  }, [value, focused]);

  return (
    <input
      {...rest}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      min={0}
      value={focused ? draft : Number(value) === 0 ? "0" : String(value)}
      className={className}
      onFocus={e => {
        setFocused(true);
        setDraft(Number(value) === 0 ? "" : String(value));
        onFocus?.(e);
        // Replace sticky 0 on first keystroke
        requestAnimationFrame(() => e.target.select());
      }}
      onBlur={e => {
        setFocused(false);
        const next = parseNonNegativeAmount(draft);
        onChange(next);
        setDraft(next === 0 ? "" : String(next));
        onBlur?.(e);
      }}
      onChange={e => {
        let raw = e.target.value;
        if (!allowDecimal) raw = raw.replace(/\./g, "");
        // Strip minus / scientific notation / letters
        raw = raw.replace(/[^\d.]/g, "");
        const parts = raw.split(".");
        if (parts.length > 2) raw = `${parts[0]}.${parts.slice(1).join("")}`;
        setDraft(raw);
        if (raw === "" || raw === ".") {
          onChange(0);
          return;
        }
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) onChange(n);
      }}
      onKeyDown={e => {
        if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") {
          e.preventDefault();
        }
      }}
    />
  );
}

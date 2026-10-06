import { currency } from "../../types";

export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="block text-[10px] font-bold uppercase tracking-wide text-crm-text-muted">
      {children}
      {hint && <span className="block mt-0.5 text-[9px] font-normal normal-case tracking-normal text-crm-text-faint">{hint}</span>}
    </span>
  );
}

export function MockInput({
  label,
  value,
  hint,
  type = "number",
  readOnly,
  placeholder,
}: {
  label: string;
  value: string | number;
  hint?: string;
  type?: string;
  readOnly?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <input
        type={type}
        defaultValue={value}
        readOnly={readOnly}
        placeholder={placeholder}
        className={`mt-1 h-9 w-full rounded-lg border px-2.5 text-sm tabular-nums outline-none transition-colors ${
          readOnly
            ? "border-crm-border-subtle bg-[#F8FAFC] text-crm-text-secondary cursor-default"
            : "border-crm-border bg-crm-surface focus:border-[#1B6FE8] focus:ring-2 focus:ring-[#1B6FE8]/15"
        }`}
      />
    </label>
  );
}

export function MockReadout({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-crm-border-subtle bg-[#F8FAFC] px-2.5 py-2">
      <FieldLabel>{label}</FieldLabel>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${accent ?? "text-crm-text"}`}>{value}</p>
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  accent: "blue" | "emerald" | "amber" | "violet" | "orange" | "teal" | "rose" | "indigo";
  children: React.ReactNode;
}) {
  const styles = {
    blue: "border-blue-100 bg-blue-50/40 text-blue-800",
    emerald: "border-emerald-100 bg-emerald-50/40 text-emerald-800",
    amber: "border-amber-100 bg-amber-50/40 text-amber-900",
    violet: "border-violet-100 bg-violet-50/40 text-violet-800",
    orange: "border-orange-100 bg-orange-50/40 text-orange-800",
    teal: "border-teal-100 bg-teal-50/40 text-teal-800",
    rose: "border-rose-100 bg-rose-50/40 text-rose-800",
    indigo: "border-indigo-100 bg-indigo-50/40 text-indigo-800",
  }[accent];

  return (
    <div className={`rounded-xl border p-3 sm:p-4 space-y-3 ${styles.split(" ").slice(1).join(" ")} border-current/10`}>
      <div>
        <p className={`text-[11px] font-extrabold uppercase tracking-wide ${styles.split(" ").pop()}`}>{title}</p>
        {subtitle && <p className="text-[10px] text-crm-text-secondary/90 mt-0.5 leading-relaxed">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function fmt(n: number) {
  return currency(n);
}

export function daySalary(basic: number, _allowance?: number) {
  return (Number(basic) || 0) / 30;
}

export function pfAmount(basic: number) {
  return basic * 0.08;
}

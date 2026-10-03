"use client";

import { useId, useState, type ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function Panel({
  children,
  className,
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "aside" | "article";
  "aria-labelledby"?: string;
  "aria-label"?: string;
}) {
  return (
    <Tag className={cx("rounded-lg border border-line bg-panel", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function Eyebrow({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="font-mono text-[0.72rem] font-medium uppercase tracking-[0.12em] text-muted">
      {children}
    </h2>
  );
}

export function FieldLabel({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-[0.8rem] font-medium text-muted">
        {children}
      </label>
      {hint !== undefined && <span className="font-mono text-[0.75rem] text-faint">{hint}</span>}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  className,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  className?: string;
}) {
  const id = useId();
  // Typing is kept as a draft and committed on blur or Enter, so typing "300" does not pass through
  // "3" (clamped to the minimum) and does not rebuild the index on every keystroke. Spinner and
  // arrow-key steps commit immediately.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    setDraft(null);
    const n = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
  };
  return (
    <div className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        className="field font-mono"
        value={draft ?? value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Math.abs(Math.abs(n - value) - step) < 1e-9) commit(e.target.value);
          else setDraft(e.target.value);
        }}
        onBlur={(e) => draft !== null && commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
        }}
      />
    </div>
  );
}

export function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format = (v) => String(v),
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div>
      <FieldLabel htmlFor={id} hint={format(value)}>
        {label}
      </FieldLabel>
      <input
        id={id}
        type="range"
        className="w-full"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** A radio group styled as a segmented control. Arrow keys move between options natively. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1 text-[0.8rem] font-medium text-muted">{label}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-md border border-line-strong bg-bg p-0.5">
        {options.map((o) => (
          <label
            key={o.value}
            className={cx(
              "relative cursor-pointer rounded-[5px] px-2 py-1.5 text-center text-[0.8rem] font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-strong",
              o.value === value ? "bg-accent text-accent-fg" : "text-muted hover:bg-raised hover:text-fg",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0"
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <div>
        <label htmlFor={id} className="text-[0.85rem] font-medium text-fg">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-[0.78rem] leading-snug text-muted">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "lex" | "vec" | "danger" | "ok";
  title?: string;
}) {
  const tones = {
    neutral: "border-line-strong text-muted",
    accent: "border-accent/50 text-accent-strong bg-accent-soft",
    lex: "border-lex/50 text-lex",
    vec: "border-vec/50 text-vec",
    danger: "border-danger/50 text-danger",
    ok: "border-ok/50 text-ok",
  } as const;
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center rounded border px-1.5 py-px font-mono text-[0.7rem] leading-5 whitespace-nowrap",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className,
  ...aria
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  "aria-label"?: string;
}) {
  const variants = {
    primary: "bg-accent text-accent-fg hover:bg-accent-strong disabled:bg-raised disabled:text-faint",
    secondary: "border border-line-strong bg-raised text-fg hover:border-faint disabled:text-faint",
    ghost: "text-muted hover:text-fg hover:bg-raised",
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      {...aria}
      className={cx(
        "inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3.5 text-[0.85rem] font-medium transition-colors disabled:cursor-not-allowed",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Notice({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <p
      role={tone === "danger" ? "alert" : undefined}
      className={cx(
        "rounded-md border px-3 py-2 text-[0.85rem] leading-relaxed",
        tone === "danger" ? "border-danger/40 text-danger" : "border-line text-muted",
      )}
    >
      {children}
    </p>
  );
}

export function PageIntro({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="mb-6 max-w-3xl">
      <h1 className="text-[1.6rem] font-semibold tracking-tight text-fg sm:text-[1.85rem]">{title}</h1>
      <p className="mt-2 text-[0.98rem] leading-relaxed text-muted">{lead}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-raised", className)} />;
}

export const fmt3 = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? "–" : n.toFixed(3));

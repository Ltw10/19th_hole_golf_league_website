"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

function clamp(n: number, min?: number, max?: number): number {
  let x = n;
  if (min !== undefined) x = Math.max(min, x);
  if (max !== undefined) x = Math.min(max, x);
  return x;
}

function formatNumber(v: number, allowDecimal: boolean): string {
  if (!Number.isFinite(v)) return "";
  if (!allowDecimal) return String(Math.round(v));
  return String(v);
}

type Base = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "inputMode" | "onValueChange"
>;

export type LooseNumberInputProps = Base & {
  value: number;
  onValueChange: (n: number) => void;
  min?: number;
  max?: number;
  /** When true, allows a single decimal point (e.g. match points). */
  allowDecimal?: boolean;
};

/**
 * Text + numeric keypad input. While focused you can clear the field to type a new value.
 * On blur, empty or invalid text reverts the display to the last committed `value` (no `onValueChange`).
 * Valid numbers commit on blur (clamped to min/max when set).
 */
export function LooseNumberInput({
  value,
  onValueChange,
  min,
  max,
  allowDecimal = false,
  className,
  disabled,
  onBlur,
  onFocus,
  ...rest
}: LooseNumberInputProps) {
  const [text, setText] = useState(() => formatNumber(value, allowDecimal));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync display when `value` prop updates from parent while not editing
      setText(formatNumber(value, allowDecimal));
    }
  }, [value, allowDecimal]);

  function parseRaw(raw: string): number | null {
    const t = raw.trim();
    if (t === "" || t === ".") return null;
    const n = allowDecimal ? parseFloat(t) : parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      autoComplete="off"
      disabled={disabled}
      className={className}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        setText(formatNumber(value, allowDecimal));
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        const parsed = parseRaw(text);
        if (parsed == null) {
          setText(formatNumber(value, allowDecimal));
          onBlur?.(e);
          return;
        }
        const next = clamp(parsed, min, max);
        onValueChange(next);
        setText(formatNumber(next, allowDecimal));
        onBlur?.(e);
      }}
      onChange={(e) => {
        const v = e.target.value;
        if (allowDecimal) {
          if (v === "" || /^\d*\.?\d*$/.test(v)) setText(v);
        } else {
          if (v === "" || /^\d+$/.test(v)) setText(v);
        }
      }}
    />
  );
}

export type LooseNullableIntInputProps = Omit<
  LooseNumberInputProps,
  "value" | "onValueChange" | "allowDecimal"
> & {
  value: number | null;
  onValueChange: (n: number | null) => void;
  /** When true, allows leading +/− (for plus handicaps and signed ints). */
  allowSigned?: boolean;
  /** Format committed value for display (e.g. league +N for plus handicaps). */
  formatValue?: (n: number) => string;
  /** Parse typed text; return null for empty/invalid. */
  parseValue?: (raw: string) => number | null;
};

/** Integer input that can be cleared to mean “no value” (null). */
export function LooseNullableIntInput({
  value,
  onValueChange,
  min,
  max,
  allowSigned = false,
  formatValue,
  parseValue,
  className,
  disabled,
  onBlur,
  onFocus,
  ...rest
}: LooseNullableIntInputProps) {
  const display = (n: number | null) => {
    if (n == null) return "";
    return formatValue ? formatValue(n) : String(n);
  };
  const [text, setText] = useState(() => display(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync display when `value` prop updates from parent while not editing
      setText(display(value));
    }
  }, [value, formatValue]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      className={className}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        setText(display(value));
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        if (text.trim() === "") {
          onValueChange(null);
          setText("");
          onBlur?.(e);
          return;
        }
        const parsed = parseValue
          ? parseValue(text)
          : (() => {
              const n = parseInt(text.trim(), 10);
              return Number.isFinite(n) ? n : null;
            })();
        if (parsed == null) {
          setText(display(value));
          onBlur?.(e);
          return;
        }
        const next = clamp(parsed, min, max);
        onValueChange(next);
        setText(display(next));
        onBlur?.(e);
      }}
      onChange={(e) => {
        const v = e.target.value;
        if (allowSigned || parseValue) {
          if (v === "" || /^[+-]?\d*$/.test(v)) setText(v);
        } else if (v === "" || /^\d+$/.test(v)) {
          setText(v);
        }
      }}
    />
  );
}

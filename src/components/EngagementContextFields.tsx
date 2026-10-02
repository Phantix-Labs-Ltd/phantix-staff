import React from "react";
import {
  EngagementContext,
  TESTING_MODES,
  TestingMode,
  fieldsForMode,
} from "../lib/testingMode";

/** Segmented testing-mode control. */
export function TestingModePicker({
  value,
  onChange,
  disabled,
}: {
  value: TestingMode;
  onChange: (mode: TestingMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {TESTING_MODES.map((m) => {
        const active = m.id === value;
        return (
          <button
            key={m.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m.id)}
            className={
              "rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-60 " +
              (active
                ? "border-gold-400/50 bg-gold-400/10"
                : "border-phantix-700/50 bg-phantix-950/60 hover:border-phantix-600")
            }
          >
            <span className="block text-[13px] font-semibold text-slate-200">{m.label}</span>
            <span className="block text-[11px] leading-4 text-slate-500">{m.short}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Mode-filtered context fields (answers the agent's operator questions up front). */
export function EngagementContextFields({
  mode,
  values,
  onChange,
  disabled,
  fieldClass = "input",
}: {
  mode: TestingMode;
  values: EngagementContext;
  onChange: (next: EngagementContext) => void;
  disabled?: boolean;
  fieldClass?: string;
}) {
  const set = (key: keyof EngagementContext, value: string | boolean) =>
    onChange({ ...values, [key]: value });
  return (
    <div className="space-y-3">
      {fieldsForMode(mode).map((f) => (
        <div key={String(f.key)}>
          <label className="mb-1 block text-[13px] font-semibold text-slate-400">{f.label}</label>
          {f.type === "toggle" ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => set(f.key, !(values[f.key] as boolean))}
              className={
                "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left disabled:opacity-60 " +
                (values[f.key]
                  ? "border-gold-400/50 bg-gold-400/10"
                  : "border-phantix-700/50 bg-phantix-950/60")
              }
            >
              <span className="text-[13px] text-slate-300">{values[f.key] ? "Yes" : "No"}</span>
              <span className="text-[11px] text-slate-500">{values[f.key] ? "authorized" : "not authorized"}</span>
            </button>
          ) : f.type === "textarea" ? (
            <textarea
              value={(values[f.key] as string) || ""}
              disabled={disabled}
              placeholder={f.placeholder}
              onChange={(e) => set(f.key, e.target.value)}
              rows={3}
              className={fieldClass + " font-mono text-[13px]"}
            />
          ) : (
            <input
              value={(values[f.key] as string) || ""}
              disabled={disabled}
              placeholder={f.placeholder}
              onChange={(e) => set(f.key, e.target.value)}
              className={fieldClass}
            />
          )}
          {f.hint && <span className="mt-1 block text-[11px] leading-4 text-slate-500">{f.hint}</span>}
        </div>
      ))}
    </div>
  );
}

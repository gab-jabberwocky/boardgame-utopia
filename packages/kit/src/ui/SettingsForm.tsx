import { z } from "zod";

interface FieldMeta {
  title?: string;
  description?: string;
  optionLabels?: Record<string, string>;
}

export interface SettingsFormProps {
  /** A z.object whose fields have defaults. Supported: enum, boolean, number. */
  schema: z.ZodType;
  value: Record<string, unknown>;
  onChange(value: Record<string, unknown>): void;
}

/** Read the defaults of a settings schema. */
export function defaultSettings(schema: z.ZodType): Record<string, unknown> {
  return schema.parse({}) as Record<string, unknown>;
}

const chip = (selected: boolean) =>
  `min-h-11 rounded-lg px-3 text-sm font-medium ${
    selected ? "bg-amber-400 text-slate-900" : "bg-slate-700 text-slate-100"
  }`;

/** Settings form generated from a Zod object schema. */
export function SettingsForm({ schema, value, onChange }: SettingsFormProps) {
  if (!(schema instanceof z.ZodObject)) return <p>Unsupported settings schema.</p>;
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(schema.shape as Record<string, z.ZodType>).map(([key, field]) => {
        const meta = (field.meta() ?? {}) as FieldMeta;
        const inner = field instanceof z.ZodDefault ? (field.unwrap() as z.ZodType) : field;
        const current = value[key];
        let control;
        if (inner instanceof z.ZodEnum) {
          control = (
            <div className="flex flex-wrap gap-2">
              {(inner.options as string[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={chip(current === opt)}
                  onClick={() => set(key, opt)}
                >
                  {meta.optionLabels?.[opt] ?? opt}
                </button>
              ))}
            </div>
          );
        } else if (inner instanceof z.ZodBoolean) {
          control = (
            <div className="flex gap-2">
              {[true, false].map((b) => (
                <button
                  key={String(b)}
                  type="button"
                  className={chip(current === b)}
                  onClick={() => set(key, b)}
                >
                  {b ? "On" : "Off"}
                </button>
              ))}
            </div>
          );
        } else if (inner instanceof z.ZodNumber) {
          const min = inner.minValue ?? 0;
          const max = inner.maxValue ?? min + 100;
          control =
            inner.isInt && max - min <= 8 ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`${chip(current === n)} w-11`}
                    onClick={() => set(key, n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="number"
                min={min}
                max={max}
                value={Number(current)}
                onChange={(e) => set(key, Number(e.target.value))}
                className="min-h-11 w-28 rounded-lg bg-slate-700 px-3 text-white"
              />
            );
        } else {
          control = <p className="text-sm text-red-400">Unsupported setting type.</p>;
        }
        return (
          <fieldset key={key}>
            <legend className="mb-1 font-semibold text-slate-100">{meta.title ?? key}</legend>
            {meta.description && <p className="mb-2 text-sm text-slate-400">{meta.description}</p>}
            {control}
          </fieldset>
        );
      })}
    </div>
  );
}

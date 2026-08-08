export const VARIANT_COLOR_PRESETS = ["red", "orange", "amber", "lime", "emerald", "teal", "sky", "indigo", "violet", "pink", "slate"] as const;

export type VariantColorPreset = (typeof VARIANT_COLOR_PRESETS)[number];

const COLOR_STYLES: Record<VariantColorPreset, { dot: string; chipBg: string; chipText: string }> = {
  red: { dot: "bg-red-500", chipBg: "bg-red-50", chipText: "text-red-700" },
  orange: { dot: "bg-orange-500", chipBg: "bg-orange-50", chipText: "text-orange-700" },
  amber: { dot: "bg-amber-500", chipBg: "bg-amber-50", chipText: "text-amber-700" },
  lime: { dot: "bg-lime-500", chipBg: "bg-lime-50", chipText: "text-lime-700" },
  emerald: { dot: "bg-emerald-500", chipBg: "bg-emerald-50", chipText: "text-emerald-700" },
  teal: { dot: "bg-teal-500", chipBg: "bg-teal-50", chipText: "text-teal-700" },
  sky: { dot: "bg-sky-500", chipBg: "bg-sky-50", chipText: "text-sky-700" },
  indigo: { dot: "bg-indigo-500", chipBg: "bg-indigo-50", chipText: "text-indigo-700" },
  violet: { dot: "bg-violet-500", chipBg: "bg-violet-50", chipText: "text-violet-700" },
  pink: { dot: "bg-pink-500", chipBg: "bg-pink-50", chipText: "text-pink-700" },
  slate: { dot: "bg-slate-400", chipBg: "bg-slate-100", chipText: "text-slate-700" },
};

export function isVariantColorPreset(value: string): value is VariantColorPreset {
  return (VARIANT_COLOR_PRESETS as readonly string[]).includes(value);
}

export function variantColorStyles(color: string | undefined) {
  return COLOR_STYLES[isVariantColorPreset(color ?? "") ? (color as VariantColorPreset) : "slate"];
}

export function defaultVariantColor(variantType: string, variantValue: string): VariantColorPreset {
  const key = `${variantType}:${variantValue}`;
  let hash = 0;
  for (let index = 0; index < key.length; index++) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return VARIANT_COLOR_PRESETS[hash % VARIANT_COLOR_PRESETS.length];
}

export function variantColorKey(variantType: string, variantValue: string) {
  return `${variantType}:${variantValue}`;
}

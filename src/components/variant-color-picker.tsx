"use client";

import { useState, useTransition } from "react";
import { setVariantValueColor } from "@/app/dashboard/inventory/actions";
import { VARIANT_COLOR_PRESETS, variantColorStyles, type VariantColorPreset } from "@/lib/variant-colors";

export function VariantColorPicker({ variantType, variantValue, color }: { variantType: string; variantValue: string; color: VariantColorPreset }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const styles = variantColorStyles(color);

  function choose(preset: VariantColorPreset) {
    setOpen(false);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("variantType", variantType);
      formData.set("variantValue", variantValue);
      formData.set("color", preset);
      const result = await setVariantValueColor({}, formData);
      setError(result.error ?? null);
    });
  }

  return (
    <span className="relative inline-flex shrink-0">
      <button
        aria-label={`Change color for ${variantValue}`}
        className={`h-2.5 w-2.5 rounded-full ${styles.dot} ${pending ? "opacity-50" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        type="button"
      />
      {open && (
        <>
          <button aria-hidden className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} tabIndex={-1} type="button" />
          <div className="absolute left-0 top-full z-50 mt-2 grid grid-cols-4 gap-1.5 rounded-xl border border-[#e6ebe8] bg-white p-2.5 shadow-lg" onClick={(event) => event.stopPropagation()}>
            {VARIANT_COLOR_PRESETS.map((preset) => (
              <button
                aria-label={preset}
                className={`h-5 w-5 rounded-full ${variantColorStyles(preset).dot} ${preset === color ? "ring-2 ring-offset-1 ring-[#0f6b4f]" : ""}`}
                key={preset}
                onClick={() => choose(preset)}
                title={preset}
                type="button"
              />
            ))}
          </div>
        </>
      )}
      {error && <span className="absolute left-0 top-full z-50 mt-2 w-40 rounded-lg bg-red-600 px-2 py-1 text-[10px] font-semibold text-white shadow-lg">{error}</span>}
    </span>
  );
}

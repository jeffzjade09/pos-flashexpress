"use client";

import { VariantColorPicker } from "@/components/variant-color-picker";
import { variantColorStyles, type VariantColorPreset } from "@/lib/variant-colors";

export function VariantAttributeChip({ type, value, color }: { type: string; value: string; color: VariantColorPreset }) {
  const styles = variantColorStyles(color);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ${styles.chipBg} ${styles.chipText}`}>
      <VariantColorPicker color={color} variantType={type} variantValue={value} />
      {value}
    </span>
  );
}

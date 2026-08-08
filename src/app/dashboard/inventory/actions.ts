"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ProductActionState = {
  error?: string;
  success?: string;
};

type VariantAttributeInput = { type: string; value: string };

type CombinationInput = {
  sku: string;
  barcode: string;
  cost_per_piece: number;
  piece_price: number;
  pieces_per_box: number;
  box_price: number;
  opening_boxes: number;
  opening_loose_pieces: number;
  low_stock_threshold: number;
  variant_attributes: VariantAttributeInput[];
};

function numberValue(formData: FormData, name: string, fallback = 0) {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseVariantAttributes(raw: unknown): VariantAttributeInput[] | null {
  if (!Array.isArray(raw)) return null;
  const attributes: VariantAttributeInput[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const type = String((entry as Record<string, unknown>).type ?? "").trim();
    const value = String((entry as Record<string, unknown>).value ?? "").trim();
    if (!type || !value) return null;
    attributes.push({ type, value });
  }
  return attributes;
}

function parseCombination(raw: unknown): CombinationInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const sku = String(record.sku ?? "").trim();
  const barcode = String(record.barcode ?? "").trim();
  const costPerPiece = Number(record.cost_per_piece);
  const piecePrice = Number(record.piece_price);
  const piecesPerBox = Number(record.pieces_per_box);
  const boxPrice = Number(record.box_price);
  const openingBoxes = Number(record.opening_boxes);
  const openingLoosePieces = Number(record.opening_loose_pieces);
  const lowStockThreshold = Number(record.low_stock_threshold);
  const variantAttributes = parseVariantAttributes(record.variant_attributes ?? []);

  if (!sku) return null;
  if ([costPerPiece, piecePrice, piecesPerBox, boxPrice, openingBoxes, openingLoosePieces, lowStockThreshold].some((value) => !Number.isFinite(value))) return null;
  if (costPerPiece < 0 || piecePrice < 0 || boxPrice < 0) return null;
  if (!Number.isInteger(piecesPerBox) || piecesPerBox < 1) return null;
  if (![openingBoxes, openingLoosePieces, lowStockThreshold].every((value) => Number.isInteger(value) && value >= 0)) return null;
  if (piecesPerBox > 1 && boxPrice <= 0) return null;
  if (variantAttributes === null) return null;

  return {
    sku: sku.toUpperCase(),
    barcode,
    cost_per_piece: costPerPiece,
    piece_price: piecePrice,
    pieces_per_box: piecesPerBox,
    box_price: boxPrice,
    opening_boxes: openingBoxes,
    opening_loose_pieces: openingLoosePieces,
    low_stock_threshold: lowStockThreshold,
    variant_attributes: variantAttributes,
  };
}

export async function createProductFamily(
  _: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  await requireUser();

  const familyName = String(formData.get("familyName") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const rawCombinations = String(formData.get("combinations") ?? "[]");

  if (familyName.length < 2) return { error: "Enter a product name." };

  let parsedCombinations: unknown;
  try {
    parsedCombinations = JSON.parse(rawCombinations);
  } catch {
    return { error: "The variant combinations could not be read. Please rebuild them." };
  }
  if (!Array.isArray(parsedCombinations) || parsedCombinations.length === 0) {
    return { error: "Add at least one variant combination." };
  }

  const combinations: CombinationInput[] = [];
  for (const raw of parsedCombinations) {
    const combination = parseCombination(raw);
    if (!combination) return { error: "Check the SKU, price, and quantity fields for every combination." };
    combinations.push(combination);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_product_family_batch", {
    p_category_name: category,
    p_family_name: familyName,
    p_combinations: combinations,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: error.message.includes("barcode") ? "That barcode is already assigned to another product." : "That SKU already exists." };
    }
    if (error.code === "PGRST202" || error.message.includes("create_product_family_batch")) {
      return { error: "The product variants database update has not been installed yet. Run the latest Supabase migration." };
    }
    return { error: error.message || "Could not create the product." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/purchases");
  return { success: `${familyName} was added to inventory.` };
}

export async function addProductVariant(
  _: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  await requireUser();

  const familyId = String(formData.get("familyId") ?? "").trim();
  const rawCombination = String(formData.get("combination") ?? "{}");

  if (!familyId) return { error: "Product is missing." };

  let parsedCombination: unknown;
  try {
    parsedCombination = JSON.parse(rawCombination);
  } catch {
    return { error: "The variant details could not be read. Please try again." };
  }
  const combination = parseCombination(parsedCombination);
  if (!combination) return { error: "Check the SKU, price, and quantity fields." };
  if (combination.variant_attributes.length === 0) return { error: "Give this combination at least one variant attribute." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_product_variant", {
    p_family_id: familyId,
    p_sku: combination.sku,
    p_barcode: combination.barcode,
    p_cost_per_piece: combination.cost_per_piece,
    p_piece_price: combination.piece_price,
    p_pieces_per_box: combination.pieces_per_box,
    p_box_price: combination.box_price,
    p_opening_boxes: combination.opening_boxes,
    p_opening_loose_pieces: combination.opening_loose_pieces,
    p_low_stock_threshold: combination.low_stock_threshold,
    p_variant_attributes: combination.variant_attributes,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: error.message.includes("barcode") ? "That barcode is already assigned to another product." : "That SKU already exists." };
    }
    if (error.code === "PGRST202" || error.message.includes("add_product_variant")) {
      return { error: "The product variants database update has not been installed yet. Run the latest Supabase migration." };
    }
    return { error: error.message || "Could not add the variant." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/purchases");
  return { success: "New variant was added to inventory." };
}

export async function updateProduct(
  _: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  await requireSuperAdmin();

  const productId = String(formData.get("productId") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const barcode = String(formData.get("barcode") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const costPerPiece = numberValue(formData, "costPerPiece");
  const piecePrice = numberValue(formData, "piecePrice");
  const piecesPerBox = numberValue(formData, "piecesPerBox", 1);
  const boxPrice = numberValue(formData, "boxPrice");
  const lowStockThreshold = numberValue(formData, "lowStockThreshold");
  const rawVariantAttributes = String(formData.get("variantAttributes") ?? "[]");

  if (!productId) return { error: "Product is missing." };
  if (!sku) return { error: "Enter a unique SKU." };
  if ([costPerPiece, piecePrice, piecesPerBox, boxPrice, lowStockThreshold].some(Number.isNaN)) {
    return { error: "Check the price, packaging, and stock-alert fields." };
  }
  if (costPerPiece < 0 || piecePrice < 0 || boxPrice < 0) return { error: "Prices cannot be negative." };
  if (!Number.isInteger(piecesPerBox) || piecesPerBox < 1) return { error: "Pieces per box must be a whole number of at least 1." };
  if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) return { error: "The low-stock alert must be a non-negative whole number." };
  if (piecesPerBox > 1 && boxPrice <= 0) return { error: "Enter a box selling price." };

  let parsedAttributes: unknown;
  try {
    parsedAttributes = JSON.parse(rawVariantAttributes);
  } catch {
    return { error: "The variant details could not be read. Please try again." };
  }
  const variantAttributes = parseVariantAttributes(parsedAttributes);
  if (variantAttributes === null) return { error: "Each variant attribute needs a type and a value." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_inventory_product_v2", {
    p_product_id: productId,
    p_sku: sku,
    p_barcode: barcode,
    p_category_name: category,
    p_cost_per_piece: costPerPiece,
    p_piece_price: piecePrice,
    p_pieces_per_box: piecesPerBox,
    p_box_price: boxPrice,
    p_low_stock_threshold: lowStockThreshold,
    p_variant_attributes: variantAttributes,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: error.message.includes("barcode") ? "That barcode is already assigned to another product." : "That SKU already exists." };
    }
    if (error.code === "PGRST202" || error.message.includes("update_inventory_product_v2")) {
      return { error: "The product-editing database update has not been installed yet. Run the latest Supabase migration." };
    }
    return { error: error.message || "Could not update the product." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/reports");
  return { success: "Product was updated." };
}

export async function renameProductFamily(
  _: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  await requireSuperAdmin();

  const familyId = String(formData.get("familyId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  if (!familyId) return { error: "Product is missing." };
  if (name.length < 2) return { error: "Enter a product name." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_product_family", { p_family_id: familyId, p_name: name });

  if (error) {
    if (error.code === "PGRST202" || error.message.includes("rename_product_family")) {
      return { error: "The product variants database update has not been installed yet. Run the latest Supabase migration." };
    }
    return { error: error.message || "Could not rename the product." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/reports");
  return { success: `Renamed to ${name}.` };
}

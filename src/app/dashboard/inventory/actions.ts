"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ProductActionState = {
  error?: string;
  success?: string;
};

function numberValue(formData: FormData, name: string, fallback = 0) {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function createProduct(
  _: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const variant = String(formData.get("variant") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const barcode = String(formData.get("barcode") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const costPerPiece = numberValue(formData, "costPerPiece");
  const piecePrice = numberValue(formData, "piecePrice");
  const piecesPerBox = numberValue(formData, "piecesPerBox", 1);
  const boxPrice = numberValue(formData, "boxPrice");
  const openingBoxes = numberValue(formData, "openingBoxes");
  const openingLoosePieces = numberValue(formData, "openingLoosePieces");
  const lowStockThreshold = numberValue(formData, "lowStockThreshold");

  if (name.length < 2) return { error: "Enter a product name." };
  if (!sku) return { error: "Enter a unique SKU." };
  if ([costPerPiece, piecePrice, piecesPerBox, boxPrice, openingBoxes, openingLoosePieces, lowStockThreshold].some(Number.isNaN)) {
    return { error: "Check the price and quantity fields." };
  }
  if (costPerPiece < 0 || piecePrice < 0 || boxPrice < 0) return { error: "Prices cannot be negative." };
  if (!Number.isInteger(piecesPerBox) || piecesPerBox < 1) return { error: "Pieces per box must be a whole number of at least 1." };
  if (![openingBoxes, openingLoosePieces, lowStockThreshold].every((value) => Number.isInteger(value) && value >= 0)) {
    return { error: "Stock quantities must be whole numbers and cannot be negative." };
  }
  if (piecesPerBox > 1 && boxPrice <= 0) return { error: "Enter a box selling price." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_inventory_product_v2", {
    p_name: name,
    p_variant: variant,
    p_sku: sku,
    p_barcode: barcode,
    p_category_name: category,
    p_cost_per_piece: costPerPiece,
    p_piece_price: piecePrice,
    p_pieces_per_box: piecesPerBox,
    p_box_price: boxPrice,
    p_opening_boxes: openingBoxes,
    p_opening_loose_pieces: openingLoosePieces,
    p_low_stock_threshold: lowStockThreshold,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: error.message.includes("barcode") ? "That barcode is already assigned to another product." : "That SKU already exists." };
    }
    if (error.code === "PGRST202" || error.message.includes("create_inventory_product_v2")) {
      return { error: "The product database update has not been installed yet. Run the latest Supabase migration." };
    }
    return { error: error.message || "Could not create the product." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/purchases");
  return { success: `${name} was added to inventory.` };
}

export async function updateProduct(
  _: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  await requireSuperAdmin();

  const productId = String(formData.get("productId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const variant = String(formData.get("variant") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const barcode = String(formData.get("barcode") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const costPerPiece = numberValue(formData, "costPerPiece");
  const piecePrice = numberValue(formData, "piecePrice");
  const piecesPerBox = numberValue(formData, "piecesPerBox", 1);
  const boxPrice = numberValue(formData, "boxPrice");
  const lowStockThreshold = numberValue(formData, "lowStockThreshold");

  if (!productId) return { error: "Product is missing." };
  if (name.length < 2) return { error: "Enter a product name." };
  if (!sku) return { error: "Enter a unique SKU." };
  if ([costPerPiece, piecePrice, piecesPerBox, boxPrice, lowStockThreshold].some(Number.isNaN)) {
    return { error: "Check the price, packaging, and stock-alert fields." };
  }
  if (costPerPiece < 0 || piecePrice < 0 || boxPrice < 0) return { error: "Prices cannot be negative." };
  if (!Number.isInteger(piecesPerBox) || piecesPerBox < 1) return { error: "Pieces per box must be a whole number of at least 1." };
  if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) return { error: "The low-stock alert must be a non-negative whole number." };
  if (piecesPerBox > 1 && boxPrice <= 0) return { error: "Enter a box selling price." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_inventory_product", {
    p_product_id: productId,
    p_name: name,
    p_variant: variant,
    p_sku: sku,
    p_barcode: barcode,
    p_category_name: category,
    p_cost_per_piece: costPerPiece,
    p_piece_price: piecePrice,
    p_pieces_per_box: piecesPerBox,
    p_box_price: boxPrice,
    p_low_stock_threshold: lowStockThreshold,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: error.message.includes("barcode") ? "That barcode is already assigned to another product." : "That SKU already exists." };
    }
    if (error.code === "PGRST202" || error.message.includes("update_inventory_product")) {
      return { error: "The product-editing database update has not been installed yet. Run the latest Supabase migration." };
    }
    return { error: error.message || "Could not update the product." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/reports");
  return { success: `${name}${variant ? ` — ${variant}` : ""} was updated.` };
}

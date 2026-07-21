export const expenseCategories = [
  "electricity",
  "manpower_labor",
  "packaging_materials",
  "rent",
  "tax_3_percent",
  "gas_delivery",
  "other",
] as const;

export type ExpenseCategory = (typeof expenseCategories)[number];

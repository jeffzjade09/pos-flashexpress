"use client";

import { Printer } from "lucide-react";

export function PrintReceiptButton() {
  return <button className="btn-primary print:hidden" onClick={() => window.print()} type="button"><Printer size={16} />Print receipt</button>;
}

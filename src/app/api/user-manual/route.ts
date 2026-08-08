import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireUser } from "@/lib/auth";

const MANUAL_PATH = path.join(process.cwd(), "docs", "FlashPOS-User-Manual.docx");

export async function GET() {
  await requireUser();

  let file: Blob;
  try {
    file = new Blob([await readFile(MANUAL_PATH)]);
  } catch {
    return new Response("User manual is unavailable.", { status: 404 });
  }

  return new Response(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": 'inline; filename="FlashPOS-User-Manual.docx"',
      "Cache-Control": "private, no-store",
    },
  });
}

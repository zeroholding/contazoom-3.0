import { NextRequest, NextResponse } from "next/server";
import { POST as syncHandler } from "@/app/api/meli/vendas/sync/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  console.log("[Cron Trigger] Calling sync handler directly...");
  return syncHandler(req);
}

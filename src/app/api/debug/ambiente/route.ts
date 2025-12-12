import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    environment: process.env.NODE_ENV || "development",
    backendProvider: process.env.RENDER_BACKEND_URL ? "render" : "local",
    vercelEnv: process.env.VERCEL_ENV,
    vercelRegion: process.env.VERCEL_REGION,
    timestamp: new Date().toISOString(),
  });
}

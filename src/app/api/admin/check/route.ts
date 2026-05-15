import { NextRequest, NextResponse } from "next/server";
import { tryVerifySessionToken, checkIsAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return NextResponse.json({ isAdmin: false });

  const isAdmin = await checkIsAdmin(session.email, session.sub);
  return NextResponse.json({ isAdmin });
}

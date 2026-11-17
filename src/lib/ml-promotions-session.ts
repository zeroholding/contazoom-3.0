import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { tryVerifySessionToken } from "@/lib/auth";

export async function promotionUser() {
  const session = await tryVerifySessionToken((await cookies()).get("session")?.value);
  return session?.sub ?? null;
}

export async function requirePromotionUser() {
  const userId = await promotionUser();
  if (!userId) redirect("/login");
  return userId;
}

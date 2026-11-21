import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { tryVerifySessionToken } from "@/lib/auth";
import { diaSP } from "@/lib/sku-custo-periodo";
import { EstoqueSku } from "./estoque.client";

export const metadata: Metadata = { title: "Controle de estoque por SKU | ContaZoom" };

export default async function EstoqueSkuPage() {
  const session = await tryVerifySessionToken((await cookies()).get("session")?.value);
  if (!session?.sub) redirect("/login");
  return <EstoqueSku hoje={diaSP(new Date())} />;
}

import type { ReactNode } from "react";
import { MolduraTela } from "@/app/components/views/comum/shell";

export default function PromocoesLayout({ children }: { children: ReactNode }) {
  return <MolduraTela>{children}</MolduraTela>;
}

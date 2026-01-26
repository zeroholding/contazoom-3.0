"use client"
import { useVendasV2 } from "@/hooks/v2/useVendas";
import { createContext, useContext } from "react";

type VendasContextType = ReturnType<typeof useVendasV2>;

export const VendasContext = createContext<VendasContextType | null>(null);

export function VendasProvider({
  children,
  platform,
}: {
  children: React.ReactNode;
  platform?: string;
}) {
  const vendasState = useVendasV2(platform, {
    autoConnectSSE: true,
  });

  return (
    <VendasContext.Provider value={vendasState}>
      {children}
    </VendasContext.Provider>
  );
}

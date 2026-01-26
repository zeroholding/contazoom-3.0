import { VendasContext } from "@/contexts/VendasContext";
import { useContext } from "react";

export function useVendasContext() {
  const context = useContext(VendasContext);

  if (!context) {
    throw new Error("useVendas deve ser usado dentro de VendasProvider");
  }

  return context;
}
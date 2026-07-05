"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export default function PageTransitionFramer({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  // Transição leve e SEM `mode="wait"`: a página nova monta imediatamente
  // (sem esperar a antiga fazer fade-out), com um fade-in curto. Antes o
  // `mode="wait"` serializava saída (150ms) + entrada (150ms) = ~300ms de
  // tela "morta" a cada navegação, mesmo antes de carregar dados.
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: 0.1,
          ease: "easeOut",
        }}
        style={{
          width: "100%",
          minHeight: "100vh",
          backgroundColor: "transparent",
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

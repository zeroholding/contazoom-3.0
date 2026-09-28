"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function PageTransitionFramer({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <>
      <div key={pathname} className="route-fade-in">
        {children}
      </div>
      <style jsx>{`
        .route-fade-in {
          width: 100%;
          min-height: 100vh;
          background-color: transparent;
          animation: route-fade-in 100ms ease-out both;
        }

        @keyframes route-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .route-fade-in {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { travarRolagem } from "@/lib/trava-rolagem";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  showCloseButton?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "lg",
  showCloseButton = true,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    } else {
      setIsAnimating(false);
      const timeout = setTimeout(() => {
        setShouldRender(false);
      }, 350);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (!isOpen) return;

    document.addEventListener("keydown", handleEscape);
    // Trava a rolagem da página pela trava COMPARTILHADA (contador), e não com
    // `body.style.overflow = "unset"` na saída: aquilo apagava a trava de uma
    // gaveta ou folha de filtros que estivesse aberta ao mesmo tempo.
    const soltarRolagem = travarRolagem();

    return () => {
      document.removeEventListener("keydown", handleEscape);
      soltarRolagem();
    };
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!shouldRender) return null;

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    full: "max-w-[calc(100vw-2rem)]",
  };
  const isFullSize = size === "full";

  const modalContent = (
    <>
      {/* Backdrop com blur progressivo */}
      <div
        className={`fixed inset-0 z-[9998] transition-all duration-300 ease-out ${
          isAnimating
            ? "backdrop-blur-md bg-black/40"
            : "backdrop-blur-none bg-black/0"
        }`}
        style={{
          backdropFilter: isAnimating ? "blur(8px)" : "blur(0px)",
          WebkitBackdropFilter: isAnimating ? "blur(8px)" : "blur(0px)",
        }}
        onClick={handleBackdropClick}
      />

      {/* Container do modal */}
      {/* Celular: o modal vira FOLHA INFERIOR. Encosta na borda de baixo, sobe
          deslizando (em vez de "pular" com escala) e tem o canto arredondado só em
          cima. Um cartão flutuando no meio de uma tela de 390px desperdiça largura
          e deixa 16px de cada lado para ninguém usar. */}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none max-md:items-end max-md:p-0"
        onClick={handleBackdropClick}
      >
        <div
          ref={modalRef}
          className={`relative w-full ${sizeClasses[size]} max-md:max-w-none ${isFullSize ? "h-[calc(100vh-2rem)] max-md:h-[94dvh]" : ""} pointer-events-auto transition-all duration-350 ease-out ${
            isAnimating
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-90 translate-y-8 max-md:opacity-100 max-md:scale-100 max-md:translate-y-full"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Card do modal com glassmorphism */}
          <div className={`bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-[var(--cz-hairline)]/50 overflow-hidden max-md:flex max-md:max-h-[92dvh] max-md:flex-col max-md:rounded-b-none max-md:border-b-0 ${isFullSize ? "h-full flex flex-col" : ""}`}>
            {/* Alça da folha (só o desenho; o fechamento é o X e o toque fora) */}
            <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--cz-hairline-forte)] md:hidden" />
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 max-md:px-5 max-md:py-2 border-b border-[var(--cz-hairline)]/70 bg-gradient-to-r from-gray-50/50 to-white/50 max-md:shrink-0">
              <h2 className="text-xl max-md:text-[18px] font-semibold text-gray-900 tracking-tight">
                {title}
              </h2>
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="group p-2 max-md:flex max-md:h-11 max-md:w-11 max-md:items-center max-md:justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100/80 transition-all duration-200 active:scale-95"
                  aria-label="Fechar modal"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-transform group-hover:rotate-90 duration-200"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            {/* Content */}
            <div className={`px-6 py-5 max-md:px-5 max-md:pt-4 max-md:pb-[calc(1.25rem_+_env(safe-area-inset-bottom,0px))] max-md:overscroll-contain custom-scrollbar ${isFullSize ? "min-h-0 flex-1 overflow-auto" : "max-h-[calc(100vh-200px)] max-md:min-h-0 max-md:max-h-none max-md:flex-1 overflow-y-auto"}`}>
              {children}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e0 #f7fafc;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f7fafc;
          border-radius: 8px;
          margin: 4px 0;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #cbd5e0 0%, #a0aec0 100%);
          border-radius: 8px;
          border: 2px solid #f7fafc;
          transition: background 0.2s ease;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #a0aec0 0%, #718096 100%);
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:active {
          background: #718096;
        }
      `}</style>
    </>
  );

  return createPortal(modalContent, document.body);
}

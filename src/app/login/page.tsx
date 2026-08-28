"use client";

import { Suspense } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import Login from "../components/views/Login";

/**
 * Estado do limite de Suspense.
 *
 * Espelha o estado de "verificando sessão" do próprio `Login`: mesma marca,
 * mesmo fundo, mesmo laranja. Antes eram dois desenhos diferentes (spinner preto
 * em fundo cinza aqui, outro lá dentro), e a troca entre os dois piscava como
 * se a página tivesse recarregado sozinha.
 */
function LoginFallback() {
  return (
    <div className="cz-auth flex min-h-screen items-center justify-center bg-white px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Image
          src="/logopng.webp"
          alt="ContaZoom"
          width={150}
          height={34}
          className="h-8 w-auto object-contain"
          priority
        />
        <p className="flex items-center gap-2 text-[13px] font-medium text-[#6B7280]">
          <Loader2
            className="h-4 w-4 animate-spin text-[#F26212]"
            aria-hidden="true"
          />
          Carregando
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <Login />
    </Suspense>
  );
}

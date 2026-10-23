"use client";

import { useAuthContext } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LoadingScreen from "./LoadingScreen";

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function ProtectedRoute({ 
  children, 
  fallback 
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuthContext();
  const router = useRouter();
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    // Adicionar um pequeno delay para evitar redirecionamento prematuro
    const timer = setTimeout(() => {
      if (!isLoading && !isAuthenticated && !hasRedirected) {
        setHasRedirected(true);
        // Leva junto a tela pedida: quem chega pelo link do e-mail (um documento
        // novo, por exemplo) volta para ela depois de entrar.
        const destino = `${window.location.pathname}${window.location.search}`;
        router.push(destino && destino !== "/" ? `/login?redirect=${encodeURIComponent(destino)}` : "/login");
      }
    }, 100); // 100ms de delay

    return () => clearTimeout(timer);
  }, [isLoading, isAuthenticated, router, hasRedirected]);

  // Reset do estado quando autenticado
  useEffect(() => {
    if (isAuthenticated) {
      setHasRedirected(false);
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return fallback || <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return fallback || <LoadingScreen />; // Mostrar loading enquanto redireciona
  }

  return <>{children}</>;
}

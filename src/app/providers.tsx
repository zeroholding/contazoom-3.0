"use client";

import { ToasterProvider } from "./components/views/ui/toaster";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { SyncAllProvider } from "@/contexts/SyncAllContext";
import PageTransitionFramer from "@/components/PageTransitionFramer";
import { installExternalApiClients } from "@/lib/install-api-fetch";

// Garante que chamadas para /api usem o backend externo na Vercel
installExternalApiClients();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SyncAllProvider>
        <NotificationProvider>
          <ToasterProvider>
            <PageTransitionFramer>{children}</PageTransitionFramer>
          </ToasterProvider>
        </NotificationProvider>
      </SyncAllProvider>
    </AuthProvider>
  );
}

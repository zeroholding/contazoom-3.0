import { NextRequest, NextResponse } from "next/server";
import { assertSessionToken } from "@/lib/auth";
import { addUserConnection } from "@/lib/sse-progress";

export const runtime = "nodejs";
// Prevent Next.js from buffering the response
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const backendUrl =
    process.env.RENDER_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    "";

  // Se não há backend configurado ou é localhost, usar SSE local
  const isLocalMode = !backendUrl || backendUrl.includes("localhost") || backendUrl.includes("127.0.0.1");

  if (isLocalMode) {
    console.log(`[SSE Local] Usando SSE local para progresso de sincronização`);

    // Autenticar usuário
    const sessionCookie = req.cookies.get("session")?.value;
    if (!sessionCookie) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    let userId: string;
    try {
      const session = await assertSessionToken(sessionCookie);
      userId = session.sub;
    } catch {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Criar ReadableStream para SSE
    const stream = new ReadableStream({
      start(controller) {
        // Adicionar conexão ao mapa global
        const cleanup = addUserConnection(userId, controller);

        // Enviar evento de conexão estabelecida
        const encoder = new TextEncoder();
        const connectMessage = `data: ${JSON.stringify({
          type: "connected",
          message: "Conexão SSE estabelecida",
          timestamp: new Date().toISOString()
        })}\n\n`;
        controller.enqueue(encoder.encode(connectMessage));

        // Configurar heartbeat a cada 30 segundos para manter conexão viva
        const heartbeatInterval = setInterval(() => {
          try {
            const heartbeatMessage = `data: ${JSON.stringify({
              type: "heartbeat",
              timestamp: new Date().toISOString()
            })}\n\n`;
            controller.enqueue(encoder.encode(heartbeatMessage));
          } catch (error) {
            console.warn("[SSE Local] Erro ao enviar heartbeat:", error);
            clearInterval(heartbeatInterval);
            cleanup();
          }
        }, 30000);

        // Limpar intervalo quando conexão fechar
        req.signal.addEventListener('abort', () => {
          clearInterval(heartbeatInterval);
          cleanup();
        });
      },
      cancel() {
        console.log(`[SSE Local] Conexão SSE cancelada para usuário`);
      }
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
        "Access-Control-Allow-Credentials": "true"
      },
    });
  }

  // Modo proxy para backend remoto
  const cleanBackendUrl = backendUrl.replace(/\/$/, "");
  const targetUrl = `${cleanBackendUrl}/api/meli/vendas/sync-progress`;

  console.log(`[SSE Proxy] Connecting to: ${targetUrl}`);

  const sessionCookie = req.cookies.get("session")?.value;
  const tokenParam = req.nextUrl.searchParams.get("token");

  const headers = new Headers();
  if (sessionCookie) {
    headers.set("Cookie", `session=${sessionCookie}`);
  }

  const targetUrlObj = new URL(targetUrl);
  if (tokenParam) {
      targetUrlObj.searchParams.set("token", tokenParam);
  } else if (sessionCookie) {
      targetUrlObj.searchParams.set("token", sessionCookie);
  }

  headers.set("Accept", "text/event-stream");

  try {
    const response = await fetch(targetUrlObj.toString(), {
      headers,
      method: "GET",
      cache: "no-store",
      keepalive: true,
    });

    if (!response.ok) {
      console.error(`[SSE Proxy] Backend error: ${response.status} ${response.statusText}`);
      return new NextResponse(`Backend Error: ${response.statusText}`, {
        status: response.status,
      });
    }

    if (!response.body) {
        return new NextResponse("No content", { status: 204 });
    }

    // Forward the stream with appropriate headers
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
        "Access-Control-Allow-Credentials": "true"
      },
    });
  } catch (error) {
    console.error("[SSE Proxy] Connection error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

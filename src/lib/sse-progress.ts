type ProgressPayload = {
  type: string;
  message: string;
  current?: number;
  total?: number;
  fetched?: number;
  expected?: number;
  accountId?: string;
  accountNickname?: string;
  [key: string]: any;
};

// Mapa para armazenar controladores de SSE ativos por usuário
const activeConnections = new Map<string, Set<ReadableStreamDefaultController>>();

/**
 * Adiciona uma nova conexão SSE para um usuário
 */
export function addUserConnection(userId: string, controller: ReadableStreamDefaultController) {
  if (!activeConnections.has(userId)) {
    activeConnections.set(userId, new Set());
  }
  
  const userConnections = activeConnections.get(userId)!;
  userConnections.add(controller);
  
  console.log(`[SSE] Nova conexão para usuário ${userId}. Total: ${userConnections.size}`);
  
  return () => {
    userConnections.delete(controller);
    if (userConnections.size === 0) {
      activeConnections.delete(userId);
    }
    console.log(`[SSE] Conexão fechada para usuário ${userId}. Restantes: ${userConnections.size}`);
  };
}

/**
 * Envia progresso para todas as conexões ativas de um usuário
 */
export function sendProgressToUser(userId: string, payload: ProgressPayload) {
  const userConnections = activeConnections.get(userId);
  
  if (!userConnections || userConnections.size === 0) {
    // Debug: descomentar se necessário, mas pode gerar muito log
    // console.log(`[SSE] Nenhuma conexão ativa para usuário ${userId}`);
    return;
  }

  const message = `data: ${JSON.stringify({
    ...payload,
    timestamp: new Date().toISOString()
  })}\n\n`;
  
  const encoder = new TextEncoder();
  const encodedMessage = encoder.encode(message);
  
  userConnections.forEach(controller => {
    try {
      controller.enqueue(encodedMessage);
    } catch (error) {
      console.error(`[SSE] Erro ao enviar para controller:`, error);
      userConnections.delete(controller);
    }
  });
}

/**
 * Fecha todas as conexões de um usuário (útil em logout ou erros fatais)
 */
export function closeUserConnections(userId: string) {
  const userConnections = activeConnections.get(userId);
  if (userConnections) {
    userConnections.forEach(controller => {
      try {
        controller.close();
      } catch {} 
    });
    activeConnections.delete(userId);
  }
}

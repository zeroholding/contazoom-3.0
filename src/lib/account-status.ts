
import prisma from "@/lib/prisma";

export type AccountPlatform = 'meli' | 'shopee' | 'bling';

/**
 * Limpa a marcação de inválido de uma conta
 * Remove o timestamp de refresh_token_invalid_until
 */
export async function clearAccountInvalidMark(
  accountId: string,
  platform: AccountPlatform
): Promise<void> {
  try {
    switch (platform) {
      case 'meli':
        await prisma.meliAccount.update({
          where: { id: accountId },
          data: { refresh_token_invalid_until: null }
        });
        break;
      case 'shopee':
        await prisma.shopeeAccount.update({
          where: { id: accountId },
          data: { refresh_token_invalid_until: null }
        });
        break;
      case 'bling':
        await prisma.blingAccount.update({
          where: { id: accountId },
          data: { refresh_token_invalid_until: null }
        });
        break;
    }
  } catch (error) {
    console.error(`[account-status] Erro ao limpar marcação inválida para ${platform}/${accountId}:`, error);
    // Não lançar erro para não interromper fluxos principais
  }
}

/**
 * Marca uma conta como inválida (precisando de reconexão)
 */
export async function markAccountAsInvalid(
  accountId: string,
  platform: AccountPlatform
): Promise<void> {
  try {
    // Define invalid until como data futura distante (ex: ano 3000)
    // ou apenas uma data atual para indicar que a partir de agora é inválido
    const invalidUntil = new Date(); 
    
    switch (platform) {
      case 'meli':
        await prisma.meliAccount.update({
          where: { id: accountId },
          data: { refresh_token_invalid_until: invalidUntil }
        });
        break;
      case 'shopee':
        await prisma.shopeeAccount.update({
          where: { id: accountId },
          data: { refresh_token_invalid_until: invalidUntil }
        });
        break;
      case 'bling':
        await prisma.blingAccount.update({
          where: { id: accountId },
          data: { refresh_token_invalid_until: invalidUntil }
        });
        break;
    }
  } catch (error) {
    console.error(`[account-status] Erro ao marcar conta como inválida ${platform}/${accountId}:`, error);
  }
}

// Vendas Status utilities for frontend

export function isStatusCancelado(status: string, plataforma?: string): boolean {
  if (!status) return false;
  const statusLower = status.toLowerCase();
  
  if (plataforma?.toLowerCase().includes('shopee') || plataforma === 'SP') {
    return statusLower === 'cancelled' || statusLower === 'in_cancel';
  }
  
  return statusLower.includes('cancelad') ||
         statusLower.includes('cancel') ||
         statusLower === 'cancelled';
}

export function isStatusPago(status: string, plataforma?: string): boolean {
  if (!status) return false;
  const statusLower = status.toLowerCase();
  
  if (plataforma?.toLowerCase().includes('shopee') || plataforma === 'SP') {
    return ['ready_to_ship', 'processed', 'shipped', 'to_confirm_receive', 'completed'].includes(statusLower);
  }
  
  return statusLower.includes('pag') ||
         statusLower.includes('paid') ||
         statusLower === 'completed';
}

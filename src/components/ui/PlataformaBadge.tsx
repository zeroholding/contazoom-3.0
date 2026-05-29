import React from 'react';
import { IconML } from '../icons/IconML';
import { IconShopee } from '../icons/IconShopee';

interface PlataformaBadgeProps {
  plataforma: string;
  size?: number;
  className?: string;
  showText?: boolean;
}

export function PlataformaBadge({ plataforma, size = 32, className = '', showText = false }: PlataformaBadgeProps) {
  const p = plataforma?.toLowerCase() || '';
  const isShopee = p.includes('shopee') || p === 'sp';
  const isML = p.includes('mercado') || p === 'ml' || p.includes('livre');

  if (isShopee) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <IconShopee size={size} />
        {showText && <span className="text-sm font-medium">Shopee</span>}
      </div>
    );
  }

  if (isML) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <IconML size={size} />
        {showText && <span className="text-sm font-medium">Mercado Livre</span>}
      </div>
    );
  }

  return (
    <div className={`text-sm font-medium ${className}`}>
      {plataforma || '-'}
    </div>
  );
}

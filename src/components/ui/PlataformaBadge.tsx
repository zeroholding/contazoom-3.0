import React from 'react';
import { IconML } from '../icons/IconML';
import { IconShopee } from '../icons/IconShopee';
import { LogoTikTok } from '@/app/components/views/comum/logos';

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
  const isTikTok = p.includes('tiktok') || p.includes('tik tok') || p === 'tt';

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

  // Não existe ícone de TikTok na família `components/icons` (a legada, que recebe
  // `size` em pixel). Em vez de desenhar um SVG novo só para este badge, reusa o
  // `LogoTikTok` de `comum/logos.tsx`, que é a fonte canônica dos logos. Ele dimensiona
  // por classe e não por prop, então a caixa é que carrega o `size` — assim os três
  // badges saem do mesmo tamanho.
  if (isTikTok) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
          <LogoTikTok className="h-full w-full" />
        </span>
        {showText && <span className="text-sm font-medium">TikTok Shop</span>}
      </div>
    );
  }

  return (
    <div className={`text-sm font-medium ${className}`}>
      {plataforma || '-'}
    </div>
  );
}

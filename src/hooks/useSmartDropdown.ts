import { useEffect, useRef, useState, useCallback } from 'react';

export interface DropdownPosition {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  transform?: string;
  /** Só no celular: altura máxima quando o painel não cabe inteiro nem acima nem abaixo. */
  maxHeight?: number;
}

/** Mesmo corte do resto do produto (`md:` do Tailwind). */
const LARGURA_CELULAR = 768;

/**
 * Quantos pixels do rodapé da janela pertencem à barra de abas do celular.
 *
 * `--cz-bottom-offset` é um `calc(...)` com `env()`, e uma variável CSS guarda
 * esse texto sem resolver — ler o valor direto devolve a string. A sonda abaixo
 * deixa o navegador fazer a conta: um elemento invisível com `height` igual à
 * variável mede, em pixels, exatamente o que a barra ocupa (0 fora do celular).
 */
function alturaReservadaEmbaixo(): number {
  const sonda = document.createElement("div");
  sonda.style.cssText =
    "position:fixed;left:0;bottom:0;width:0;visibility:hidden;pointer-events:none;height:var(--cz-bottom-offset,0px)";
  document.body.appendChild(sonda);
  const altura = sonda.getBoundingClientRect().height;
  sonda.remove();
  return altura;
}

export interface SmartDropdownOptions {
  isOpen: boolean;
  onClose: () => void;
  preferredPosition?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  offset?: number;
  minDistanceFromEdge?: number;
}

export function useSmartDropdown<T extends HTMLElement = HTMLElement>({
  isOpen,
  onClose,
  preferredPosition = 'bottom-left',
  offset = 8,
  minDistanceFromEdge = 16
}: SmartDropdownOptions) {
  const triggerRef = useRef<T>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<DropdownPosition>({});
  const [isVisible, setIsVisible] = useState(false);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !dropdownRef.current) return;

    const trigger = triggerRef.current.getBoundingClientRect();
    const dropdown = dropdownRef.current.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    const newPosition: DropdownPosition = {};

    // Celular: a barra de abas fixa no rodapé tira espaço da janela, e o painel não
    // pode abrir por baixo dela. Fora do celular `reservado` vale 0 e a conta é a
    // de sempre.
    const celular = viewport.width < LARGURA_CELULAR;
    const reservado = celular ? alturaReservadaEmbaixo() : 0;

    // Determinar posição vertical (absoluta na tela com position:fixed)
    const spaceBelow = viewport.height - reservado - trigger.bottom - offset;
    const spaceAbove = trigger.top - offset;
    
    const shouldShowAbove = (preferredPosition.includes('top') || spaceBelow < dropdown.height) 
                          && spaceAbove >= dropdown.height;

    if (shouldShowAbove) {
      // Posicionar acima do trigger (coordenada absoluta)
      newPosition.top = trigger.top - dropdown.height - offset;
    } else {
      // Posicionar abaixo do trigger (coordenada absoluta)
      newPosition.top = trigger.bottom + offset;
    }

    // Celular, lista maior que a tela: nem acima nem abaixo cabe inteiro. Fica no
    // lado com mais espaço e limita a altura — o CSS (`.smart-dropdown`) rola por
    // dentro. Sem isto a parte de baixo da lista saía da janela, sem como alcançar.
    if (celular && spaceBelow < dropdown.height && spaceAbove < dropdown.height) {
      if (spaceAbove > spaceBelow) {
        const altura = Math.max(120, spaceAbove - minDistanceFromEdge);
        newPosition.maxHeight = altura;
        newPosition.top = trigger.top - altura - offset;
      } else {
        newPosition.maxHeight = Math.max(120, spaceBelow - minDistanceFromEdge / 2);
      }
    }

    // Determinar posição horizontal (absoluta na tela com position:fixed)
    const shouldAlignRight = preferredPosition.includes('right');
    
    if (shouldAlignRight) {
      // Alinhar pela direita do trigger
      const rightPosition = trigger.right;
      // Verificar se cabe na tela
      if (rightPosition - dropdown.width < minDistanceFromEdge) {
        // Não cabe pela direita, alinhar pela esquerda
        newPosition.left = trigger.left;
      } else {
        newPosition.left = rightPosition - dropdown.width;
      }
    } else {
      // Alinhar pela esquerda do trigger
      const leftPosition = trigger.left;
      // Verificar se cabe na tela
      if (leftPosition + dropdown.width > viewport.width - minDistanceFromEdge) {
        // Não cabe pela esquerda, alinhar pela direita
        newPosition.left = trigger.right - dropdown.width;
      } else {
        newPosition.left = leftPosition;
      }
    }

    // Celular: mantém o painel dentro da janela, com a margem mínima dos dois lados.
    // Antes o CSS somava `margin: 0 16px` ao `left` calculado aqui, e um painel
    // alinhado à direita de um botão perto da borda saía 16px da tela.
    if (celular && newPosition.left !== undefined) {
      const maisEsquerda = minDistanceFromEdge;
      const maisDireita = viewport.width - dropdown.width - minDistanceFromEdge;
      newPosition.left = Math.max(maisEsquerda, Math.min(newPosition.left, maisDireita));
    }

    setPosition(newPosition);
  }, [preferredPosition, offset, minDistanceFromEdge]);

  // Recalcular posição quando necessário
  useEffect(() => {
    if (isOpen) {
      // Pequeno delay para garantir que o dropdown está renderizado
      const timer = setTimeout(calculatePosition, 10);
      return () => clearTimeout(timer);
    }
  }, [isOpen, calculatePosition]);

  // Recalcular posição no resize da janela e scroll
  useEffect(() => {
    if (!isOpen) return;
    
    const handleResize = () => calculatePosition();
    const handleScroll = () => calculatePosition();
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true); // true = capture phase para pegar todos os scrolls
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, calculatePosition]);

  // Controlar visibilidade com animação
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      // Delay para permitir animação de saída
      const timer = setTimeout(() => setIsVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Fechar ao clicar fora
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(event.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  return {
    triggerRef,
    dropdownRef,
    position,
    isVisible,
    isOpen
  };
}

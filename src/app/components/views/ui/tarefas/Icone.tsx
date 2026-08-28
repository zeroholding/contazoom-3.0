"use client";

/**
 * Resolve nome de ícone (string) para componente lucide.
 *
 * As tabelas de domínio (`STATUS_COR.icone`, `PAPEL_ICONE`, `iconePrazo`) guardam
 * o ícone como texto porque rodam também no servidor, onde importar componente
 * React não faz sentido. Este é o único lugar que faz a ponte.
 *
 * O mapa é explícito de propósito. `lucide-react[nome]` funcionaria, mas impede
 * o tree-shaking e puxa a biblioteca inteira para o bundle.
 *
 * Regra do projeto: ícone SVG sempre, emoji nunca.
 */

import {
  AlarmClock,
  AlertTriangle,
  ArrowLeft,
  Ban,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarOff,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  ClipboardCheck,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  Handshake,
  History,
  Hourglass,
  Info,
  Landmark,
  LayoutGrid,
  Link2,
  List,
  Loader,
  Lock,
  LucideProps,
  MinusCircle,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ScrollText,
  Search,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Timer,
  TrendingUp,
  Unlock,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";

const MAPA: Record<string, React.ComponentType<LucideProps>> = {
  // Status de entrega
  Clock,
  Loader,
  Search,
  Send,
  AlertTriangle,
  CheckCircle2,
  Circle,
  // Prazo
  AlarmClock,
  Timer,
  CalendarCheck,
  CalendarOff,
  Calendar,
  CalendarPlus,
  Hourglass,
  // Papel
  ShieldCheck,
  Handshake,
  Calculator,
  ClipboardList,
  User,
  Users,
  UserPlus,
  Shield,
  // Etapa e fluxo
  MinusCircle,
  Ban,
  CircleDot,
  ClipboardCheck,
  Play,
  RotateCcw,
  Unlock,
  Lock,
  History,
  ScrollText,
  // Navegação e ação
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  Filter,
  RefreshCw,
  LayoutGrid,
  List,
  Pencil,
  Save,
  X,
  ExternalLink,
  Link2,
  Info,
  Settings,
  TrendingUp,
  // Entidades
  Building2,
  Briefcase,
  Landmark,
  FileText,
};

type IconeProps = LucideProps & {
  /** Nome lucide vindo da tabela de domínio. Desconhecido cai em `Circle`. */
  nome: string;
};

export default function Icone({ nome, ...props }: IconeProps) {
  const Componente = MAPA[nome] ?? Circle;
  return <Componente aria-hidden="true" {...props} />;
}

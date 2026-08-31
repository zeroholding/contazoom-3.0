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
  ArrowRight,
  BadgeCheck,
  Ban,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarDays,
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
  Contact,
  Download,
  ExternalLink,
  File,
  FileCheck2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Filter,
  Handshake,
  Hash,
  History,
  Hourglass,
  House,
  IdCard,
  Info,
  Landmark,
  Layers,
  LayoutGrid,
  Link2,
  List,
  Loader,
  Lock,
  LucideProps,
  Mail,
  MapPin,
  MinusCircle,
  Paperclip,
  PauseCircle,
  Pencil,
  Percent,
  Phone,
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
  Store,
  Tag,
  Timer,
  Trash2,
  TrendingUp,
  Unlock,
  Upload,
  User,
  UserCog,
  UserPlus,
  Users,
  Wallet,
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
  CalendarDays,
  Hourglass,
  // Papel
  ShieldCheck,
  Handshake,
  Calculator,
  ClipboardList,
  User,
  Users,
  UserPlus,
  UserCog,
  Contact,
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
  Upload,
  Download,
  Trash2,
  // Entidades
  Building2,
  Briefcase,
  Landmark,
  FileText,
  // Plano interno
  BadgeCheck,
  PauseCircle,
  Tag,
  // Cadastro e endereço
  MapPin,
  Hash,
  Layers,
  Mail,
  // Anexos
  Paperclip,
  File,
  FileImage,
  FileSpreadsheet,
  // Formulário público de abertura de CNPJ (/formulario).
  // `House` e não `Home`: no lucide 0.544 `Home` não existe mais, e importar o
  // nome antigo quebra o build.
  ArrowRight,
  FileCheck2,
  House,
  IdCard,
  Percent,
  Phone,
  Store,
  Wallet,
};

type IconeProps = LucideProps & {
  /** Nome lucide vindo da tabela de domínio. Desconhecido cai em `Circle`. */
  nome: string;
};

export default function Icone({ nome, ...props }: IconeProps) {
  const Componente = MAPA[nome] ?? Circle;
  return <Componente aria-hidden="true" {...props} />;
}

import { Building2, Landmark, TrendingUp, Users } from "lucide-react";

export const DOCUMENT_CATEGORIES = [
  { id: "01_INSTITUCIONAIS", name: "01. DOCUMENTOS INSTITUCIONAIS", hasYears: false, icon: Building2 },
  { id: "02_IMPOSTOS", name: "02. IMPOSTOS E OBRIGAÇÕES", hasYears: true, icon: Landmark },
  { id: "03_FATURAMENTO", name: "03. FATURAMENTO E RELATÓRIOS", hasYears: false, icon: TrendingUp },
  { id: "04_FOLHA", name: "04. FOLHA E FUNCIONÁRIOS", hasYears: false, icon: Users },
];

export const DOCUMENT_MONTHS = [
  "01 - Janeiro", "02 - Fevereiro", "03 - Março", "04 - Abril", 
  "05 - Maio", "06 - Junho", "07 - Julho", "08 - Agosto", 
  "09 - Setembro", "10 - Outubro", "11 - Novembro", "12 - Dezembro"
];

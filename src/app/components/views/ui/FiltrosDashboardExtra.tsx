"use client";

import { useState } from "react";
import { useSmartDropdown } from "../../../../hooks/useSmartDropdown";

export type FiltroCanal = string;
export type FiltroStatus = string;
export type FiltroTipoAnuncio = string;
export type FiltroModalidadeEnvio = string;

interface FiltrosDashboardExtraProps {
  canalAtivo: FiltroCanal;
  onCanalChange: (v: FiltroCanal) => void;
  statusAtivo: FiltroStatus;
  onStatusChange: (v: FiltroStatus) => void;
  tipoAnuncioAtivo: FiltroTipoAnuncio;
  onTipoAnuncioChange: (v: FiltroTipoAnuncio) => void;
  modalidadeEnvioAtiva: FiltroModalidadeEnvio;
  onModalidadeEnvioChange: (v: FiltroModalidadeEnvio) => void;
}

type Option = {
  id: string;
  label: string;
};

const canalOptions: Option[] = [
  { id: "todos", label: "Todos os Canais" },
  { id: "mercado_livre", label: "Mercado Livre" },
  { id: "shopee", label: "Shopee" },
];

const statusOptions: Option[] = [
  { id: "todos", label: "Todos" },
  { id: "pagos", label: "Pagos" },
  { id: "cancelados", label: "Cancelados" },
];

const tipoAnuncioOptions: Option[] = [
  { id: "todos", label: "Todos" },
  { id: "catalogo", label: "Catálogo" },
  { id: "proprio", label: "Próprio" },
];

const modalidadeOptions: Option[] = [
  { id: "todos", label: "Todos" },
  { id: "me", label: "Mercado Envios" },
  { id: "full", label: "Full" },
  { id: "flex", label: "Flex" },
];

function getRealOptionIds(options: Option[]) {
  return options.filter((option) => option.id !== "todos").map((option) => option.id);
}

function parseValue(value: string) {
  if (!value || value === "todos" || value === "todas") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeValue(values: string[], options: Option[]) {
  const realIds = getRealOptionIds(options);
  const uniqueValues = Array.from(new Set(values.filter((value) => realIds.includes(value))));

  if (uniqueValues.length === 0 || uniqueValues.length === realIds.length) {
    return "todos";
  }

  return uniqueValues.join(",");
}

function toggleValue(currentValue: string, optionId: string, options: Option[]) {
  if (optionId === "todos") return "todos";

  const currentValues = parseValue(currentValue);
  const nextValues = currentValues.includes(optionId)
    ? currentValues.filter((value) => value !== optionId)
    : [...currentValues, optionId];

  return normalizeValue(nextValues, options);
}

function getSelectedLabel(value: string, options: Option[], fallback: string) {
  const selected = parseValue(value);
  if (selected.length === 0) return fallback;
  if (selected.length === 1) {
    return options.find((option) => option.id === selected[0])?.label || fallback;
  }
  return `${selected.length} selecionados`;
}

function isOptionSelected(value: string, optionId: string) {
  if (optionId === "todos") {
    return !value || value === "todos" || value === "todas";
  }
  return parseValue(value).includes(optionId);
}

function FilterIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h18" />
      <path d="M6 12h12" />
      <path d="M10 19h4" />
    </svg>
  );
}

function CheckMark({ checked }: { checked: boolean }) {
  return (
    <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-orange-500 bg-orange-500 text-white" : "border-gray-300 bg-white"}`}>
      {checked && (
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}

export default function FiltrosDashboardExtra({
  canalAtivo,
  onCanalChange,
  statusAtivo,
  onStatusChange,
  tipoAnuncioAtivo,
  onTipoAnuncioChange,
  modalidadeEnvioAtiva,
  onModalidadeEnvioChange,
}: FiltrosDashboardExtraProps) {
  const [showCanalDropdown, setShowCanalDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showTipoAnuncioDropdown, setShowTipoAnuncioDropdown] = useState(false);
  const [showModalidadeEnvioDropdown, setShowModalidadeEnvioDropdown] = useState(false);

  const canalDropdown = useSmartDropdown<HTMLButtonElement>({
    isOpen: showCanalDropdown,
    onClose: () => setShowCanalDropdown(false),
    preferredPosition: "bottom-right",
    offset: 8,
    minDistanceFromEdge: 16,
  });

  const statusDropdown = useSmartDropdown<HTMLButtonElement>({
    isOpen: showStatusDropdown,
    onClose: () => setShowStatusDropdown(false),
    preferredPosition: "bottom-right",
    offset: 8,
    minDistanceFromEdge: 16,
  });

  const tipoAnuncioDropdown = useSmartDropdown<HTMLButtonElement>({
    isOpen: showTipoAnuncioDropdown,
    onClose: () => setShowTipoAnuncioDropdown(false),
    preferredPosition: "bottom-right",
    offset: 8,
    minDistanceFromEdge: 16,
  });

  const modalidadeEnvioDropdown = useSmartDropdown<HTMLButtonElement>({
    isOpen: showModalidadeEnvioDropdown,
    onClose: () => setShowModalidadeEnvioDropdown(false),
    preferredPosition: "bottom-right",
    offset: 8,
    minDistanceFromEdge: 16,
  });

  const renderDropdown = ({
    label,
    value,
    options,
    dropdown,
    isOpen,
    setIsOpen,
    onChange,
    width = "w-56",
  }: {
    label: string;
    value: string;
    options: Option[];
    dropdown: ReturnType<typeof useSmartDropdown<HTMLButtonElement>>;
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    onChange: (value: string) => void;
    width?: string;
  }) => (
    <div className="relative">
      <button
        ref={dropdown.triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-all duration-200 ${
          isOpen
            ? "border-gray-400 bg-gray-50 text-gray-900"
            : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400"
        }`}
      >
        <FilterIcon />
        <span>{label}: {getSelectedLabel(value, options, options[0].label)}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>

      {/* Select nativo para mobile */}
      <select
        className="sm:hidden absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        value={parseValue(value).length > 0 ? parseValue(value) : ["todos"]}
        multiple
        onChange={(e) => {
          const selected = Array.from(e.target.selectedOptions).map(o => o.value);
          onChange(normalizeValue(selected, options));
        }}
      >
        {options.map(opt => (
          <option key={opt.id} value={opt.id}>{opt.label}</option>
        ))}
      </select>

      {dropdown.isVisible && (
        <div
          ref={dropdown.dropdownRef}
          className={`smart-dropdown ${width} ${dropdown.isOpen ? "dropdown-enter" : "dropdown-exit"}`}
          style={dropdown.position}
        >
          <div className="p-2">
            <div className="space-y-1">
              {options.map((option) => {
                const checked = isOptionSelected(value, option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onChange(toggleValue(value, option.id, options))}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      checked
                        ? "bg-orange-50 text-gray-900 font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <CheckMark checked={checked} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
      {renderDropdown({
        label: "Canal",
        value: canalAtivo,
        options: canalOptions,
        dropdown: canalDropdown,
        isOpen: showCanalDropdown,
        setIsOpen: setShowCanalDropdown,
        onChange: onCanalChange,
        width: "w-56",
      })}

      {renderDropdown({
        label: "Status",
        value: statusAtivo,
        options: statusOptions,
        dropdown: statusDropdown,
        isOpen: showStatusDropdown,
        setIsOpen: setShowStatusDropdown,
        onChange: onStatusChange,
        width: "w-48",
      })}

      {renderDropdown({
        label: "Tipo",
        value: tipoAnuncioAtivo,
        options: tipoAnuncioOptions,
        dropdown: tipoAnuncioDropdown,
        isOpen: showTipoAnuncioDropdown,
        setIsOpen: setShowTipoAnuncioDropdown,
        onChange: onTipoAnuncioChange,
        width: "w-48",
      })}

      {renderDropdown({
        label: "Envio",
        value: modalidadeEnvioAtiva,
        options: modalidadeOptions,
        dropdown: modalidadeEnvioDropdown,
        isOpen: showModalidadeEnvioDropdown,
        setIsOpen: setShowModalidadeEnvioDropdown,
        onChange: onModalidadeEnvioChange,
        width: "w-56",
      })}
    </div>
  );
}

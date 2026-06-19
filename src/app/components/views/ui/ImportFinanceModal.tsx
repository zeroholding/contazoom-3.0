import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import { useToast } from './toaster';

type FinanceTab = 'contas_pagar' | 'contas_receber' | 'categorias' | 'formas_pagamento';
type PreviewAction = 'create' | 'skip' | 'error';

interface ImportFinanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: FinanceTab;
  onImportSuccess?: () => void;
}

interface FinancePreviewRow {
  id: string;
  rowNumber: number;
  title: string;
  action: PreviewAction;
  selectable: boolean;
  selectedByDefault: boolean;
  details: string[];
  warnings: string[];
  errors: string[];
}

interface FinanceImportPreview {
  total: number;
  creates: number;
  skips: number;
  errors: number;
  selectable: number;
  rows: FinancePreviewRow[];
}

interface FinanceImportResults {
  totalRows: number;
  processedRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  errorDetails: Array<{ row: number; message: string }>;
  createdCategories: number;
  createdPaymentMethods: number;
}

const actionConfig: Record<PreviewAction, { label: string; className: string; description: string }> = {
  create: {
    label: 'Criar',
    className: 'bg-green-100 text-green-800 border-green-200',
    description: 'Será gravado',
  },
  skip: {
    label: 'Duplicado',
    className: 'bg-gray-100 text-gray-700 border-gray-200',
    description: 'Nada será gravado',
  },
  error: {
    label: 'Erro',
    className: 'bg-red-100 text-red-800 border-red-200',
    description: 'Corrija a linha',
  },
};

function validateSpreadsheetFile(file: File): string | null {
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
  ];
  const lowerFileName = file.name.toLowerCase();
  const isValidExtension =
    lowerFileName.endsWith('.xlsx') ||
    lowerFileName.endsWith('.xls') ||
    lowerFileName.endsWith('.csv');

  if (!validTypes.includes(file.type) && !isValidExtension) {
    return 'Por favor, selecione um arquivo Excel (.xlsx, .xls) ou CSV (.csv).';
  }
  if (file.size > 10 * 1024 * 1024) {
    return 'O arquivo deve ter no máximo 10MB.';
  }
  return null;
}

export function ImportFinanceModal({
  isOpen,
  onClose,
  activeTab,
  onImportSuccess,
}: ImportFinanceModalProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<FinanceImportPreview | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [importResults, setImportResults] = useState<FinanceImportResults | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const isBusy = isAnalyzing || isApplying;
  const selectableRows = useMemo(
    () => preview?.rows.filter((row) => row.selectable) ?? [],
    [preview],
  );

  useEffect(() => {
    if (!isOpen) {
      setPreview(null);
      setSelectedRows(new Set());
      setSelectedFile(null);
      setImportResults(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [isOpen]);

  useEffect(() => {
    setPreview(null);
    setSelectedRows(new Set());
    setSelectedFile(null);
    setImportResults(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [activeTab]);

  const getTitle = () => {
    switch (activeTab) {
      case 'contas_pagar':
        return 'Contas a Pagar';
      case 'contas_receber':
        return 'Contas a Receber';
      case 'categorias':
        return 'Categorias';
      case 'formas_pagamento':
        return 'Formas de Pagamento';
      default:
        return 'Finanças';
    }
  };

  const requestPreview = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', activeTab);
    formData.append('mode', 'preview');

    const response = await fetch('/api/financeiro/import-excel', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Erro no servidor (${response.status}).`);
    }
    if (!payload?.preview) {
      throw new Error('O servidor não retornou a prévia da importação.');
    }
    return payload.preview as FinanceImportPreview;
  };

  const handleFile = async (file: File) => {
    const validationError = validateSpreadsheetFile(file);
    if (validationError) {
      toast({
        variant: 'error',
        title: 'Arquivo inválido',
        description: validationError,
      });
      return;
    }

    setIsAnalyzing(true);
    setSelectedFile(null);
    setPreview(null);
    setImportResults(null);
    setSelectedRows(new Set());

    try {
      const nextPreview = await requestPreview(file);
      setSelectedFile(file);
      setPreview(nextPreview);
      setSelectedRows(
        new Set(
          nextPreview.rows
            .filter((row) => row.selectedByDefault && row.selectable)
            .map((row) => row.id),
        ),
      );
      toast({
        variant: nextPreview.errors > 0 ? 'warning' : 'success',
        title: 'Planilha analisada',
        description: `${nextPreview.creates} registro(s) para criar, ${nextPreview.skips} duplicado(s) e ${nextPreview.errors} erro(s).`,
        duration: 7000,
      });
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Erro ao analisar',
        description: error instanceof Error ? error.message : 'Erro ao analisar planilha.',
      });
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleApply = async () => {
    if (!selectedFile || !preview) return;
    if (selectedRows.size === 0) {
      toast({
        variant: 'info',
        title: 'Nada selecionado',
        description: 'Selecione pelo menos uma linha para aplicar.',
      });
      return;
    }

    setIsApplying(true);
    setImportResults(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('type', activeTab);
      formData.append('mode', 'commit');
      formData.append('selectedRows', JSON.stringify([...selectedRows]));

      const response = await fetch('/api/financeiro/import-excel', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Erro no servidor (${response.status}).`);
      }
      if (!payload?.results) {
        throw new Error('O servidor não retornou o resultado da aplicação.');
      }

      const results = payload.results as FinanceImportResults;
      setImportResults(results);
      if (results.importedRows > 0) onImportSuccess?.();
      toast({
        variant: results.errorRows > 0 ? 'warning' : 'success',
        title: 'Aplicação concluída',
        description: `${results.importedRows} importado(s), ${results.skippedRows} ignorado(s) e ${results.errorRows} erro(s).`,
        duration: 8000,
      });
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Erro ao aplicar',
        description: error instanceof Error ? error.message : 'Erro ao aplicar a importação.',
      });
    } finally {
      setIsApplying(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await fetch(`/api/financeiro/download-template?type=${activeTab}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Erro ao baixar modelo');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `modelo_${activeTab}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        variant: 'success',
        title: 'Modelo baixado',
        description: 'O arquivo modelo foi baixado com sucesso.',
      });
    } catch {
      toast({
        variant: 'error',
        title: 'Erro ao baixar',
        description: 'Erro ao baixar o modelo. Tente novamente.',
      });
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const setAllSelectable = (checked: boolean) => {
    setSelectedRows(checked ? new Set(selectableRows.map((row) => row.id)) : new Set());
  };

  const toggleRow = (rowId: string) => {
    setSelectedRows((previous) => {
      const next = new Set(previous);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isBusy ? () => undefined : onClose}
      title={`Importar ${getTitle()} por planilha`}
      size="full"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            O sistema analisa duplicados, erros e cadastros auxiliares antes de gravar qualquer linha.
          </div>
          <button
            onClick={downloadTemplate}
            disabled={isBusy}
            className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            Baixar modelo
          </button>
        </div>

        <div
          className={`relative rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
            dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              if (event.target.files?.[0]) handleFile(event.target.files[0]);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            disabled={isBusy}
          />
          <div className="space-y-1">
            <div className="text-sm font-semibold text-gray-900">
              {isAnalyzing ? 'Analisando planilha...' : selectedFile?.name || 'Clique ou arraste a planilha aqui'}
            </div>
            <div className="text-xs text-gray-500">XLSX, XLS ou CSV até 10MB</div>
          </div>
        </div>

        {preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {[
                ['Linhas', preview.total, 'bg-gray-100 text-gray-800'],
                ['Criar', preview.creates, 'bg-green-50 text-green-800'],
                ['Duplicados', preview.skips, 'bg-gray-50 text-gray-700'],
                ['Erros', preview.errors, 'bg-red-50 text-red-800'],
                ['Selecionados', selectedRows.size, 'bg-orange-50 text-orange-800'],
              ].map(([label, value, color]) => (
                <div key={String(label)} className={`rounded-lg p-3 ${color}`}>
                  <div className="text-xs font-medium">{label}</div>
                  <div className="mt-1 text-xl font-bold">{value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectableRows.length > 0 && selectedRows.size === selectableRows.length}
                  onChange={(event) => setAllSelectable(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Selecionar todas aplicáveis
                <span className="text-gray-500">({selectableRows.length} linha(s))</span>
              </label>
              <button
                onClick={handleApply}
                disabled={isBusy || selectedRows.size === 0}
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isApplying ? 'Aplicando...' : `Aplicar ${selectedRows.size} linha(s)`}
              </button>
            </div>

            <div className="overflow-hidden rounded-lg border border-gray-200">
              <div className="max-h-[52vh] overflow-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-50">
                    <tr>
                      <th className="w-10 px-3 py-3 text-left"></th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Linha</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Registro</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Ação</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {preview.rows.map((row) => {
                      const config = actionConfig[row.action];
                      return (
                        <tr key={row.id} className={selectedRows.has(row.id) ? 'bg-orange-50/40' : ''}>
                          <td className="px-3 py-3 align-top">
                            <input
                              type="checkbox"
                              checked={selectedRows.has(row.id)}
                              disabled={!row.selectable || isBusy}
                              onChange={() => toggleRow(row.id)}
                              className="h-4 w-4 rounded border-gray-300 disabled:opacity-40"
                            />
                          </td>
                          <td className="px-3 py-3 align-top text-gray-600">{row.rowNumber}</td>
                          <td className="max-w-[340px] px-3 py-3 align-top font-semibold text-gray-900">
                            <div className="truncate" title={row.title}>{row.title}</div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${config.className}`}>
                              {config.label}
                            </span>
                            <div className="mt-1 text-xs text-gray-500">{config.description}</div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="space-y-2">
                              {row.details.map((detail, index) => (
                                <div key={`d-${index}`} className="text-xs text-gray-700">{detail}</div>
                              ))}
                              {row.warnings.map((warning, index) => (
                                <div key={`w-${index}`} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                                  {warning}
                                </div>
                              ))}
                              {row.errors.map((error, index) => (
                                <div key={`e-${index}`} className="rounded bg-red-50 px-2 py-1 text-xs text-red-800">
                                  {error}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {importResults && (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Resultado aplicado</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {[
                ['Importados', importResults.importedRows, 'bg-green-50 text-green-800'],
                ['Ignorados', importResults.skippedRows, 'bg-gray-100 text-gray-700'],
                ['Erros', importResults.errorRows, 'bg-red-50 text-red-800'],
                ['Categorias', importResults.createdCategories, 'bg-blue-50 text-blue-800'],
                ['Formas Pgto.', importResults.createdPaymentMethods, 'bg-purple-50 text-purple-800'],
              ].map(([label, value, color]) => (
                <div key={String(label)} className={`rounded-lg p-3 ${color}`}>
                  <div className="text-xs font-medium">{label}</div>
                  <div className="mt-1 text-xl font-bold">{value}</div>
                </div>
              ))}
            </div>

            {importResults.errorDetails.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded border border-red-200 bg-white">
                {importResults.errorDetails.map((detail, index) => (
                  <div key={index} className="border-b border-red-100 px-3 py-2 text-xs text-red-800">
                    <strong>Linha {detail.row}:</strong> {detail.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

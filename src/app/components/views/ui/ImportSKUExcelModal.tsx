import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import { useToast } from './toaster';

interface ImportSKUExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

type PreviewAction = 'create' | 'update' | 'skip' | 'error';

interface SKUPreviewChange {
  field: string;
  label: string;
  current: string;
  incoming: string;
}

interface SKUPreviewRow {
  id: string;
  rowNumber: number;
  sku: string;
  produto: string;
  action: PreviewAction;
  selectable: boolean;
  selectedByDefault: boolean;
  changes: SKUPreviewChange[];
  warnings: string[];
  errors: string[];
}

interface SKUImportPreview {
  total: number;
  creates: number;
  updates: number;
  skips: number;
  errors: number;
  selectable: number;
  rows: SKUPreviewRow[];
}

interface SKUImportResults {
  total: number;
  success: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  warnings: number;
  errorDetails: Array<{ row: number; message: string }>;
  warningDetails: Array<{ row: number; message: string }>;
}

const actionConfig: Record<
  PreviewAction,
  { label: string; className: string; description: string }
> = {
  create: {
    label: 'Novo',
    className: 'bg-green-100 text-green-800 border-green-200',
    description: 'Será cadastrado',
  },
  update: {
    label: 'Atualizar',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'Existe e tem alterações',
  },
  skip: {
    label: 'Sem ação',
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
    return 'Por favor, selecione um arquivo Excel ou CSV (.xlsx, .xls ou .csv).';
  }
  if (file.size > 10 * 1024 * 1024) {
    return 'O arquivo deve ter no máximo 10MB.';
  }
  return null;
}

export function ImportSKUExcelModal({
  isOpen,
  onClose,
  onImportComplete,
}: ImportSKUExcelModalProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SKUImportPreview | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [importResults, setImportResults] = useState<SKUImportResults | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const isBusy = isAnalyzing || isApplying;
  const selectedCount = selectedRows.size;
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

  const requestPreview = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', 'preview');

    const response = await fetch('/api/sku/import', {
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
    return payload.preview as SKUImportPreview;
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
        description: `${nextPreview.creates} novo(s), ${nextPreview.updates} atualização(ões), ${nextPreview.skips} sem ação e ${nextPreview.errors} erro(s).`,
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
      formData.append('mode', 'commit');
      formData.append('selectedRows', JSON.stringify([...selectedRows]));

      const response = await fetch('/api/sku/import', {
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

      const results = payload.results as SKUImportResults;
      setImportResults(results);
      if (results.success > 0) onImportComplete?.();
      toast({
        variant: results.errors > 0 || results.warnings > 0 ? 'warning' : 'success',
        title: 'Aplicação concluída',
        description: `${results.created} criado(s), ${results.updated} atualizado(s), ${results.skipped} ignorado(s), ${results.errors} erro(s) e ${results.warnings} aviso(s).`,
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
      const response = await fetch('/api/sku/template', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Erro ao baixar template');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'template_skus.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        variant: 'success',
        title: 'Template baixado',
        description: 'O arquivo modelo foi baixado com sucesso.',
      });
    } catch {
      toast({
        variant: 'error',
        title: 'Erro ao baixar',
        description: 'Erro ao baixar o template. Tente novamente.',
      });
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
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
      title="Importar SKUs por planilha"
      size="full"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            Analise a planilha, confira cada alteração e aplique somente o que estiver selecionado.
          </div>
          <button
            onClick={downloadTemplate}
            disabled={isBusy}
            className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            Baixar template
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              {[
                ['Linhas', preview.total, 'bg-gray-100 text-gray-800'],
                ['Novos', preview.creates, 'bg-green-50 text-green-800'],
                ['Atualizações', preview.updates, 'bg-blue-50 text-blue-800'],
                ['Sem ação', preview.skips, 'bg-gray-50 text-gray-700'],
                ['Erros', preview.errors, 'bg-red-50 text-red-800'],
                ['Selecionados', selectedCount, 'bg-orange-50 text-orange-800'],
              ].map(([label, value, color]) => (
                <div key={String(label)} className={`rounded-lg p-3 ${color}`}>
                  <div className="text-xs font-medium">{label}</div>
                  <div className="mt-1 text-xl font-bold">{value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectableRows.length > 0 && selectedRows.size === selectableRows.length}
                    onChange={(event) => setAllSelectable(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Selecionar todas aplicáveis
                </label>
                <span className="text-gray-500">
                  {selectableRows.length} linha(s) podem ser aplicadas
                </span>
              </div>
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
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">SKU</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Ação</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Produto</th>
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
                          <td className="px-3 py-3 align-top font-mono text-xs font-semibold text-gray-900">
                            {row.sku}
                          </td>
                          <td className="px-3 py-3 align-top">
                            <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${config.className}`}>
                              {config.label}
                            </span>
                            <div className="mt-1 text-xs text-gray-500">{config.description}</div>
                          </td>
                          <td className="max-w-[260px] px-3 py-3 align-top text-gray-800">
                            <div className="truncate" title={row.produto}>{row.produto}</div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="space-y-2">
                              {row.changes.length > 0 && (
                                <div className="space-y-1">
                                  {row.changes.map((change) => (
                                    <div key={`${row.id}-${change.field}`} className="text-xs text-gray-700">
                                      <span className="font-semibold">{change.label}:</span>{' '}
                                      <span className="text-gray-500">{change.current}</span>
                                      <span className="mx-1 text-gray-400">→</span>
                                      <span className="font-semibold text-gray-900">{change.incoming}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
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
                              {row.changes.length === 0 && row.warnings.length === 0 && row.errors.length === 0 && (
                                <span className="text-xs text-gray-500">Nenhuma diferença encontrada.</span>
                              )}
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
                ['Criados', importResults.created, 'bg-green-50 text-green-800'],
                ['Atualizados', importResults.updated, 'bg-blue-50 text-blue-800'],
                ['Ignorados', importResults.skipped, 'bg-gray-100 text-gray-700'],
                ['Erros', importResults.errors, 'bg-red-50 text-red-800'],
                ['Avisos', importResults.warnings, 'bg-amber-50 text-amber-800'],
              ].map(([label, value, color]) => (
                <div key={String(label)} className={`rounded-lg p-3 ${color}`}>
                  <div className="text-xs font-medium">{label}</div>
                  <div className="mt-1 text-xl font-bold">{value}</div>
                </div>
              ))}
            </div>
            {(importResults.errorDetails.length > 0 || importResults.warningDetails.length > 0) && (
              <div className="max-h-40 overflow-y-auto rounded border border-gray-200 bg-white">
                {importResults.errorDetails.map((detail, index) => (
                  <div key={`error-${index}`} className="border-b border-red-100 px-3 py-2 text-xs text-red-800">
                    <strong>Linha {detail.row}:</strong> {detail.message}
                  </div>
                ))}
                {importResults.warningDetails.map((detail, index) => (
                  <div key={`warning-${index}`} className="border-b border-amber-100 px-3 py-2 text-xs text-amber-800">
                    <strong>{detail.row > 0 ? `Linha ${detail.row}` : 'Aviso'}:</strong> {detail.message}
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

import React, { useEffect, useState, useRef } from 'react';
import Modal from './Modal';
import { useToast } from './toaster';

interface ImportSKUExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

interface SKUImportResults {
  total: number;
  success: number;
  skipped: number;
  errors: number;
  warnings: number;
  errorDetails: Array<{ row: number; message: string }>;
  warningDetails: Array<{ row: number; message: string }>;
}

export function ImportSKUExcelModal({
  isOpen,
  onClose,
  onImportComplete
}: ImportSKUExcelModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [importResults, setImportResults] = useState<SKUImportResults | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) setImportResults(null);
  }, [isOpen]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
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

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    // Validar tipo de arquivo
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
    ];

    const lowerFileName = file.name.toLowerCase();
    const isValidExtension =
      lowerFileName.endsWith('.xlsx') ||
      lowerFileName.endsWith('.xls') ||
      lowerFileName.endsWith('.csv');

    if (!validTypes.includes(file.type) && !isValidExtension) {
      toast({
        variant: "error",
        title: "Arquivo inválido",
        description: "Por favor, selecione um arquivo Excel ou CSV (.xlsx, .xls ou .csv).",
      });
      return;
    }

    // Validar tamanho (máximo 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: "error",
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 10MB.",
      });
      return;
    }

    setIsUploading(true);
    setImportResults(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/sku/import', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        // Tratar timeout específico
        if (response.status === 504) {
          throw new Error('A importação demorou muito tempo. Tente com um arquivo menor ou divida em múltiplos arquivos.');
        }

        const errorText = await response.text();
        let errorMessage = `Erro no servidor (${response.status}). Tente novamente.`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          if (errorText.trim()) errorMessage = errorText;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      const results = result.results as SKUImportResults | undefined;
      if (!results) {
        throw new Error('O servidor não retornou o resultado da importação.');
      }
      setImportResults(results);

      const summary = `${results.success} importado(s), ${results.skipped} ignorado(s), ${results.errors} erro(s) e ${results.warnings} aviso(s).`;
      if (results.success === 0 && results.errors > 0) {
        toast({
          variant: "error",
          title: "Nenhum SKU foi importado",
          description: summary,
          duration: 7000,
        });
      } else if (results.errors > 0 || results.warnings > 0) {
        toast({
          variant: "warning",
          title: "Importação concluída com pendências",
          description: summary,
          duration: 7000,
        });
        if (results.success > 0) onImportComplete?.();
      } else if (results.success > 0) {
        toast({
          variant: "success",
          title: "Importação concluída",
          description: summary,
        });
        onImportComplete?.();
        onClose();
      } else {
        toast({
          variant: "info",
          title: "Nenhuma alteração necessária",
          description: summary,
        });
      }
    } catch (error) {
      console.error('Erro ao importar:', error);
      toast({
        variant: "error",
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Erro ao processar arquivo. Tente novamente.",
      });
    } finally {
      setIsUploading(false);
      // Limpar input para permitir re-upload do mesmo arquivo
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await fetch('/api/sku/template', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erro ao baixar template');
      }

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
        variant: "success",
        title: "Template baixado!",
        description: "O arquivo modelo foi baixado com sucesso.",
      });
    } catch (error) {
      console.error('Erro ao baixar template:', error);
      toast({
        variant: "error",
        title: "Erro ao baixar",
        description: "Erro ao baixar o template. Tente novamente.",
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isUploading ? () => undefined : onClose}
      title="Importar SKUs por planilha"
      size="xl"
    >
      <div className="space-y-6">
        {/* Seção de Download do Template */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-blue-900">
                Baixe o template Excel
              </h3>
              <p className="text-sm text-blue-700 mt-1">
                Use o modelo para garantir que seus dados estejam no formato correto.
              </p>
              <button
                onClick={downloadTemplate}
                className="mt-3 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3" />
                </svg>
                Baixar Template
              </button>
            </div>
          </div>
        </div>

        {/* Seção de Upload */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-2">
              Upload do Arquivo
            </h3>
            <div
              className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragActive
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
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
                onChange={handleFileInput}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isUploading}
              />

              {isUploading ? (
                <div className="space-y-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-sm text-gray-600">Processando arquivo...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="text-sm text-gray-600">
                    <p className="font-medium">Clique para selecionar ou arraste o arquivo aqui</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Formatos aceitos: .xlsx, .xls, .csv (máximo 10MB)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {importResults && (
          <div className="space-y-3 border-t border-gray-200 pt-5">
            <h3 className="text-sm font-semibold text-gray-900">Resultado da importação</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Importados", importResults.success, "bg-green-50 text-green-800"],
                ["Ignorados", importResults.skipped, "bg-gray-100 text-gray-700"],
                ["Erros", importResults.errors, "bg-red-50 text-red-800"],
                ["Avisos", importResults.warnings, "bg-amber-50 text-amber-800"],
              ].map(([label, value, color]) => (
                <div key={String(label)} className={`rounded-lg p-3 ${color}`}>
                  <div className="text-xs font-medium">{label}</div>
                  <div className="mt-1 text-xl font-bold">{value}</div>
                </div>
              ))}
            </div>

            {(importResults.errorDetails.length > 0 || importResults.warningDetails.length > 0) && (
              <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200">
                {importResults.errorDetails.map((detail, index) => (
                  <div
                    key={`error-${detail.row}-${index}`}
                    className="border-b border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800 last:border-b-0"
                  >
                    <strong>Linha {detail.row}:</strong> {detail.message}
                  </div>
                ))}
                {importResults.warningDetails.map((detail, index) => (
                  <div
                    key={`warning-${detail.row}-${index}`}
                    className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800 last:border-b-0"
                  >
                    <strong>Linha {detail.row}:</strong> {detail.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Campos do Template */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">
            Campos do Template
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            {[
              'SKU (obrigatório)',
              'Produto (obrigatório)',
              'Tipo',
              'SKU Pai',
              'Custo Unitário',
              'Quantidade',
              'Hierarquia 1',
              'Hierarquia 2',
              'Ativo',
              'Tem Estoque',
              'SKUs Filhos',
              'Observações',
              'Tags'
            ].map((field, index) => (
              <div key={index} className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                <span>{field}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Instruções */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-yellow-800">
                Instruções Importantes
              </h4>
              <ul className="text-sm text-yellow-700 mt-1 space-y-1">
                <li>• Use o template baixado para garantir o formato correto</li>
                <li>• A primeira linha deve conter os cabeçalhos das colunas</li>
                <li>• Campos obrigatórios: SKU e Produto</li>
                <li>• Tipo pode ser &quot;Individual&quot; ou &quot;Kit&quot;</li>
                <li>• Valores monetários aceitam vírgula ou ponto como separador decimal</li>
                <li>• SKUs duplicados serão ignorados automaticamente</li>
                <li>• Para Kits, separe os SKUs Filhos por vírgula</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
